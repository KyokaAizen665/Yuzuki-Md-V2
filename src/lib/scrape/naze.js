import axios from "axios";

export async function searchSpotifyNaze(query) {
  // Requires NAZE_KEY environment variable (comma-separated keys)
  const keys = (process.env.NAZE_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!keys.length) throw new Error("NAZE_KEY not set in environment.");

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

  throw new Error("Spotify search failed. All keys exhausted or server down.");
}
