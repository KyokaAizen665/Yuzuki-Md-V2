import axios from "axios";

const BASE_URL = "https://hub.ytconvert.org/api/download";
const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: "https://media.ytmp3.gg",
  Referer: "https://media.ytmp3.gg/",
  "User-Agent": "Mozilla/5.0",
};

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

function buildThumbnail(url) {
  const id = extractVideoId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

async function requestConvert(payload) {
  const res = await axios.post(BASE_URL, payload, { headers: HEADERS });
  return res.data;
}

async function waitUntilReady(statusUrl) {
  for (let i = 0; i < 20; i++) {
    const { data } = await axios.get(statusUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (data.status === "completed" || data.downloadUrl) return data;
    if (data.status === "error") throw new Error("Conversion failed.");
    await delay(3000);
  }
  throw new Error("Conversion timed out.");
}

export async function ytmp3(url) {
  const convert = await requestConvert({
    url,
    os: "windows",
    output: { type: "audio", format: "mp3" },
  });
  const status = await waitUntilReady(convert.statusUrl);
  return {
    title: convert.title,
    thumbnail: buildThumbnail(url),
    downloadUrl: status.downloadUrl,
  };
}

export async function ytmp4(url, quality = "720") {
  const convert = await requestConvert({
    url,
    os: "windows",
    output: { type: "video", format: "mp4", quality: quality + "p" },
  });
  const status = await waitUntilReady(convert.statusUrl);
  return {
    title: convert.title,
    thumbnail: buildThumbnail(url),
    downloadUrl: status.downloadUrl,
  };
}
