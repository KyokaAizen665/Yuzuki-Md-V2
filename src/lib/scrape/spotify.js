import axios from "axios";
import * as cheerio from "cheerio";

function extractTrackId(text) {
  if (!text) return null;
  const s = String(text);
  if (/^[a-zA-Z0-9]{22}$/.test(s)) return s;
  const m = s.match(/track\/([a-zA-Z0-9]{22})/);
  return m ? m[1] : null;
}

export async function spotifyScrape(input) {
  const trackId = extractTrackId(input);
  if (!trackId) throw new Error("Invalid Spotify track URL or ID.");

  const trackUrl = `https://open.spotify.com/track/${trackId}`;
  const headers = {
    origin: "https://spotdown.org",
    referer: "https://spotdown.org/",
    "user-agent": "Mozilla/5.0",
  };

  const { data: details } = await axios.get(
    `https://spotdown.org/api/song-details?url=${encodeURIComponent(trackUrl)}`,
    { headers, timeout: 20000 }
  );

  const dlRes = await axios.post(
    "https://spotdown.org/api/download",
    { url: trackUrl, title: details.title, artists: details.artists, cover: details.cover },
    { headers, timeout: 30000 }
  );

  return {
    title: details.title || "Unknown",
    artists: details.artists || "Unknown",
    thumbnail: details.cover || "",
    duration: details.duration || "-",
    downloadUrl: dlRes.data?.url || dlRes.data?.link || null,
  };
}

export async function searchSpotify(query) {
  // Uses Naze API keys if available (set NAZE_KEY env var, comma-separated)
  const keys = (process.env.NAZE_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!keys.length) throw new Error("NAZE_KEY not set in environment. Get one at https://naze.biz.id");

  for (const key of keys) {
    try {
      const url = `https://api.naze.biz.id/search/spotify?query=${encodeURIComponent(query)}&apikey=${key}`;
      const response = await axios.get(url, { timeout: 15000 });
      const data = response.data?.result || response.data?.data;
      if (data && Array.isArray(data) && data.length > 0) {
        return data.slice(0, 20).map((track) => ({
          name: track.title || "Unknown",
          artists: track.artist || "Unknown",
          popularity: track.popularity || "N/A",
          link: track.url || "",
          thumbnail: track.thumbnail || null,
          duration: track.duration || null,
        }));
      }
    } catch { continue; }
  }

  throw new Error("Spotify search failed. All API keys exhausted.");
}
