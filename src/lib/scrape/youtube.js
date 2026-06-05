import ytdl from "@distube/ytdl-core";
import axios from "axios";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    if (u.hostname.includes("youtu.be")) return u.pathname.split("/")[1];
    if (u.pathname.includes("/shorts/")) return u.pathname.split("/shorts/")[1];
    return null;
  } catch { return null; }
}

function buildThumbnail(url) {
  const id = extractVideoId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

// ── Fallback: cobalt.tools (free, no key) ───────────────────────────────────
async function cobaltFetch(url, isAudioOnly = false) {
  const { data } = await axios.post(
    "https://api.cobalt.tools/api/json",
    { url, isAudioOnly, aFormat: "mp3" },
    {
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      timeout: 20000,
    }
  );
  if ((data.status === "redirect" || data.status === "stream") && data.url) return data.url;
  throw new Error(`cobalt: ${data.status}`);
}

// ── Fallback: hub.ytconvert.org (original) ──────────────────────────────────
const HUB_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: "https://media.ytmp3.gg",
  Referer: "https://media.ytmp3.gg/",
  "User-Agent": "Mozilla/5.0",
};

async function hubFetch(url, type, format, quality) {
  const payload = { url, os: "windows", output: { type, format, ...(quality ? { quality } : {}) } };
  const { data: conv } = await axios.post("https://hub.ytconvert.org/api/download", payload, { headers: HUB_HEADERS });
  for (let i = 0; i < 20; i++) {
    const { data } = await axios.get(conv.statusUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (data.status === "completed" || data.downloadUrl) return { title: conv.title, downloadUrl: data.downloadUrl };
    if (data.status === "error") throw new Error("Conversion failed.");
    await delay(3000);
  }
  throw new Error("Conversion timed out.");
}

export async function ytmp3(url) {
  // Primary: ytdl-core (fastest, no third-party)
  try {
    const info = await ytdl.getInfo(url);
    const fmt = ytdl.chooseFormat(info.formats, { quality: "highestaudio", filter: "audioonly" });
    return { title: info.videoDetails.title, thumbnail: buildThumbnail(url), downloadUrl: fmt.url };
  } catch {}

  // Fallback 1: cobalt.tools
  try {
    const dlUrl = await cobaltFetch(url, true);
    return { title: "YouTube Audio", thumbnail: buildThumbnail(url), downloadUrl: dlUrl };
  } catch {}

  // Fallback 2: hub.ytconvert.org (original)
  try {
    const result = await hubFetch(url, "audio", "mp3");
    return { ...result, thumbnail: buildThumbnail(url) };
  } catch {}

  throw new Error("YouTube MP3 failed. Try again later.");
}

export async function ytmp4(url, quality = "720") {
  // Primary: ytdl-core
  try {
    const info = await ytdl.getInfo(url);
    const targetQ = parseInt(quality) || 720;
    const combined = info.formats
      .filter((f) => f.hasVideo && f.hasAudio && f.container === "mp4")
      .sort((a, b) => {
        const aq = parseInt(a.qualityLabel) || 0;
        const bq = parseInt(b.qualityLabel) || 0;
        return Math.abs(aq - targetQ) - Math.abs(bq - targetQ);
      });
    const fmt = combined[0] || ytdl.chooseFormat(info.formats, { quality: "highest" });
    return { title: info.videoDetails.title, thumbnail: buildThumbnail(url), downloadUrl: fmt.url };
  } catch {}

  // Fallback 1: cobalt.tools
  try {
    const dlUrl = await cobaltFetch(url, false);
    return { title: "YouTube Video", thumbnail: buildThumbnail(url), downloadUrl: dlUrl };
  } catch {}

  // Fallback 2: hub.ytconvert.org (original)
  try {
    const result = await hubFetch(url, "video", "mp4", quality + "p");
    return { ...result, thumbnail: buildThumbnail(url) };
  } catch {}

  throw new Error("YouTube MP4 failed. Try again later.");
}
