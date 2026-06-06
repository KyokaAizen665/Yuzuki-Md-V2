import axios from "axios";

// ── Invidious instances for YouTube search (no API key needed) ─────────────
const INVIDIOUS = [
  "https://iv.ggtyler.dev",
  "https://invidious.nerdvpn.de",
  "https://invidious.perennialte.ch",
  "https://inv.nadeko.net",
  "https://invidious.fdn.fr",
  "https://invidious.privacyredirect.com",
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    if (u.hostname.includes("youtu.be")) return u.pathname.split("/")[1];
    if (u.pathname.includes("/shorts/")) return u.pathname.split("/shorts/")[1];
    return null;
  } catch {
    return null;
  }
}

function buildThumbnail(videoId) {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

function isUrl(text) {
  return /^https?:\/\//i.test(text) || /youtu/.test(text);
}

// ── YouTube search via Invidious ──────────────────────────────────────────
export async function ytSearch(query, limit = 10) {
  for (const base of INVIDIOUS) {
    try {
      const r = await fetch(
        `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video&fields=videoId,title,author,lengthSeconds,viewCount`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!r.ok) continue;
      const data = await r.json();
      if (!Array.isArray(data) || !data.length) continue;
      return data.slice(0, limit).map((v) => ({
        id: v.videoId,
        title: v.title,
        author: v.author,
        duration: v.lengthSeconds,
        views: v.viewCount,
        thumbnail: buildThumbnail(v.videoId),
        url: `https://youtu.be/${v.videoId}`,
      }));
    } catch { continue; }
  }
  throw new Error("YouTube search failed. All Invidious instances are down.");
}

// ── Convert (hub.ytconvert.org) ───────────────────────────────────────────
const CONVERT_BASE = "https://hub.ytconvert.org/api/download";
const CONVERT_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: "https://media.ytmp3.gg",
  Referer: "https://media.ytmp3.gg/",
  "User-Agent": "Mozilla/5.0",
};

async function requestConvert(payload) {
  const res = await axios.post(CONVERT_BASE, payload, { headers: CONVERT_HEADERS, timeout: 20000 });
  return res.data;
}

async function waitUntilReady(statusUrl) {
  for (let i = 0; i < 20; i++) {
    const { data } = await axios.get(statusUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000,
    });
    if (data.status === "completed" || data.downloadUrl) return data;
    if (data.status === "error") throw new Error("Conversion failed.");
    await delay(3000);
  }
  throw new Error("Conversion timed out.");
}

export async function ytmp3(urlOrQuery) {
  const url = isUrl(urlOrQuery)
    ? urlOrQuery
    : (await ytSearch(urlOrQuery, 1))[0]?.url;
  if (!url) throw new Error("No YouTube result found for that query.");
  const videoId = extractVideoId(url);
  const convert = await requestConvert({
    url,
    os: "windows",
    output: { type: "audio", format: "mp3" },
  });
  const status = await waitUntilReady(convert.statusUrl);
  return {
    title: convert.title || "Unknown",
    thumbnail: buildThumbnail(videoId),
    downloadUrl: status.downloadUrl,
    url,
  };
}

export async function ytmp4(urlOrQuery, quality = "720") {
  const url = isUrl(urlOrQuery)
    ? urlOrQuery
    : (await ytSearch(urlOrQuery, 1))[0]?.url;
  if (!url) throw new Error("No YouTube result found for that query.");
  const videoId = extractVideoId(url);
  const convert = await requestConvert({
    url,
    os: "windows",
    output: { type: "video", format: "mp4", quality: quality + "p" },
  });
  const status = await waitUntilReady(convert.statusUrl);
  return {
    title: convert.title || "Unknown",
    thumbnail: buildThumbnail(videoId),
    downloadUrl: status.downloadUrl,
    url,
  };
}

// ── JioSaavn — free music search & 320kbps download (no API key) ──────────
export async function searchSaavn(query, limit = 10) {
  const r = await fetch(
    `https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`,
    { signal: AbortSignal.timeout(12000) }
  );
  if (!r.ok) throw new Error(`JioSaavn API error: ${r.status}`);
  const data = await r.json();
  if (!data.success || !data.data?.results?.length)
    throw new Error("No songs found on JioSaavn.");
  return data.data.results.map((s) => ({
    id: s.id,
    title: s.name,
    artists: s.artists?.primary?.map((a) => a.name).join(", ") || "Unknown",
    album: s.album?.name || "",
    duration: s.duration || 0,
    year: s.year || "",
    thumbnail:
      s.image?.find((i) => i.quality === "500x500")?.url ||
      s.image?.find((i) => i.quality === "150x150")?.url ||
      s.image?.[0]?.url || "",
    url:
      s.downloadUrl?.find((u) => u.quality === "320kbps")?.url ||
      s.downloadUrl?.find((u) => u.quality === "160kbps")?.url ||
      s.downloadUrl?.[0]?.url || null,
  }));
}

// ── Deezer — free search with 30s previews (no API key) ───────────────────
export async function searchDeezer(query, limit = 10) {
  const r = await fetch(
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}&output=json`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!r.ok) throw new Error(`Deezer API error: ${r.status}`);
  const data = await r.json();
  if (!data.data?.length) throw new Error("No songs found on Deezer.");
  return data.data.map((t) => ({
    id: t.id,
    title: t.title,
    artists: t.artist?.name || "Unknown",
    album: t.album?.title || "",
    duration: t.duration || 0,
    thumbnail: t.album?.cover_big || t.album?.cover_medium || "",
    previewUrl: t.preview || null,
    link: t.link || "",
  }));
}

// ── Lyrics (lyrics.ovh — completely free, no key) ────────────────────────
export async function getLyrics(artist, title) {
  const r = await fetch(
    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!r.ok) throw new Error("Lyrics not found.");
  const data = await r.json();
  if (data.error || !data.lyrics) throw new Error("Lyrics not found.");
  return data.lyrics.trim();
}
