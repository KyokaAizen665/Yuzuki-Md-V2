import axios from "axios";

function extractTrackId(text) {
  if (!text) return null;
  const s = String(text);
  if (/^[a-zA-Z0-9]{22}$/.test(s)) return s;
  const m = s.match(/track\/([a-zA-Z0-9]{22})/);
  return m ? m[1] : null;
}

// ── Download Strategy 1: spotifydown.com (free, most reliable) ──────────────
async function fromSpotifyDown(trackId) {
  const { data } = await axios.get(
    `https://api.spotifydown.com/download/${trackId}`,
    {
      headers: {
        Origin: "https://spotifydown.com",
        Referer: "https://spotifydown.com/",
        "User-Agent": "Mozilla/5.0",
      },
      timeout: 25000,
    }
  );
  if (data?.success && data?.link) {
    return {
      title: data.metadata?.title || "Unknown",
      artists: data.metadata?.artists || "Unknown",
      thumbnail: data.metadata?.cover || "",
      duration: data.metadata?.duration || "-",
      downloadUrl: data.link,
    };
  }
  throw new Error("spotifydown: no link");
}

// ── Download Strategy 2: spotdown.org (original) ────────────────────────────
async function fromSpotDown(trackId) {
  const trackUrl = `https://open.spotify.com/track/${trackId}`;
  const headers = { origin: "https://spotdown.org", referer: "https://spotdown.org/", "user-agent": "Mozilla/5.0" };
  const { data: details } = await axios.get(
    `https://spotdown.org/api/song-details?url=${encodeURIComponent(trackUrl)}`,
    { headers, timeout: 20000 }
  );
  const dlRes = await axios.post(
    "https://spotdown.org/api/download",
    { url: trackUrl, title: details.title, artists: details.artists, cover: details.cover },
    { headers, timeout: 30000 }
  );
  const dlUrl = dlRes.data?.url || dlRes.data?.link;
  if (!dlUrl) throw new Error("spotdown: no link");
  return {
    title: details.title || "Unknown",
    artists: details.artists || "Unknown",
    thumbnail: details.cover || "",
    duration: details.duration || "-",
    downloadUrl: dlUrl,
  };
}

// ── Download Strategy 3: fabdl.com (free, no key) ───────────────────────────
async function fromFabdl(trackId) {
  const { data: info } = await axios.get(
    `https://api.fabdl.com/spotify/get?url=https://open.spotify.com/track/${trackId}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 20000 }
  );
  if (!info?.result?.gid) throw new Error("fabdl: no gid");
  const { data: conv } = await axios.get(
    `https://api.fabdl.com/spotify/mp3-convert-task/${info.result.gid}/${info.result.id}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 30000 }
  );
  const dlUrl = conv?.result?.download_url;
  if (!dlUrl) throw new Error("fabdl: no download_url");
  return {
    title: info.result?.name || "Unknown",
    artists: info.result?.artists || "Unknown",
    thumbnail: info.result?.cover || "",
    duration: info.result?.duration_ms
      ? `${Math.floor(info.result.duration_ms / 60000)}:${String(Math.floor((info.result.duration_ms % 60000) / 1000)).padStart(2, "0")}`
      : "-",
    downloadUrl: dlUrl,
  };
}

export async function spotifyScrape(input) {
  const trackId = extractTrackId(input);
  if (!trackId) throw new Error("Invalid Spotify track URL or ID.");
  for (const strategy of [fromSpotifyDown, fromSpotDown, fromFabdl]) {
    try {
      const result = await strategy(trackId);
      if (result?.downloadUrl) return result;
    } catch {}
  }
  throw new Error("Spotify download failed. Try again later.");
}

// ── Search: Deezer public API (free, no key needed) ──────────────────────────
export async function searchSpotify(query) {
  // Try Naze first if key is configured
  const nazeKeys = (process.env.NAZE_KEY || "").split(",").map((k) => k.trim()).filter(Boolean);
  if (nazeKeys.length) {
    for (const key of nazeKeys) {
      try {
        const { data } = await axios.get(
          `https://api.naze.biz.id/search/spotify?query=${encodeURIComponent(query)}&apikey=${key}`,
          { timeout: 15000 }
        );
        const tracks = data?.result || data?.data;
        if (Array.isArray(tracks) && tracks.length) {
          return tracks.slice(0, 20).map((t) => ({
            name: t.title || "Unknown",
            artists: t.artist || "Unknown",
            popularity: t.popularity || "N/A",
            link: t.url || "",
            thumbnail: t.thumbnail || null,
            duration: t.duration || null,
          }));
        }
      } catch {}
    }
  }

  // Fallback: Deezer free public API (no key needed)
  const { data } = await axios.get(
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=20`,
    { timeout: 15000 }
  );
  const tracks = data?.data || [];
  if (!tracks.length) throw new Error("No results found.");
  return tracks.map((t) => ({
    name: t.title || "Unknown",
    artists: t.artist?.name || "Unknown",
    popularity: t.rank ? Math.round(t.rank / 10000) : "N/A",
    link: t.link || "",
    thumbnail: t.album?.cover_medium || t.album?.cover || null,
    duration: t.duration
      ? `${Math.floor(t.duration / 60)}:${String(t.duration % 60).padStart(2, "0")}`
      : null,
  }));
}
