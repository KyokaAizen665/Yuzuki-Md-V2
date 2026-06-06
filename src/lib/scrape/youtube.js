import axios from "axios";

// ── YouTube Internal API (no API key needed, replaces broken Invidious) ────
const YT_SEARCH_URL = "https://www.youtube.com/youtubei/v1/search?prettyPrint=false";
const YT_CLIENT = { clientName: "WEB", clientVersion: "2.20231219.01.00" };

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

// ── YouTube search via YouTube Internal API (no key, no Invidious) ─────────
export async function ytSearch(query, limit = 10) {
  const res = await axios.post(
    YT_SEARCH_URL,
    { context: { client: YT_CLIENT }, query },
    {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-YouTube-Client-Name": "1",
        "X-YouTube-Client-Version": YT_CLIENT.clientVersion,
      },
      timeout: 12000,
    }
  );

  const sections =
    res.data?.contents?.twoColumnSearchResultsRenderer
      ?.primaryContents?.sectionListRenderer?.contents || [];

  const videos = [];
  for (const section of sections) {
    const items = section?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const vr = item?.videoRenderer;
      if (vr?.videoId) {
        videos.push({
          id: vr.videoId,
          title: vr.title?.runs?.[0]?.text || "Unknown",
          author: vr.ownerText?.runs?.[0]?.text || "Unknown",
          duration: vr.lengthText?.simpleText || "0:00",
          views: vr.viewCountText?.simpleText || "0",
          thumbnail: buildThumbnail(vr.videoId),
          url: `https://youtu.be/${vr.videoId}`,
        });
        if (videos.length >= limit) break;
      }
    }
    if (videos.length >= limit) break;
  }

  if (!videos.length) throw new Error("YouTube search returned no results.");
  return videos;
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
