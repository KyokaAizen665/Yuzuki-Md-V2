/**
 * Media Hub — Extended Music API Scrape Layer
 *
 * Free, key-less APIs only:
 *   Deezer       — artist info, album info, track search, related artists
 *   iTunes RSS   — trending / chart data
 *   Audiomack    — track search via public API
 *   Cobalt.tools — universal media download (SoundCloud, Audiomack, etc.)
 *   lyrics.ovh   — already in youtube.js, re-exported here for convenience
 *
 * ─── Exports ──────────────────────────────────────────────────────────────────
 *
 *   getDeezerArtist(query)           → ArtistResult
 *   getDeezerAlbum(query)            → AlbumResult
 *   getTrendingMusic(limit?,country?)→ TrendingTrack[]
 *   getRelatedArtists(query)         → RelatedArtist[]
 *   searchAudiomack(query, limit?)   → AudiomackTrack[]
 *   cobaltDownload(url)              → CobaltResult
 *   parseArtistTitle(text)           → { artist, title }
 *   fmtDuration(seconds)             → "m:ss"
 *
 * Re-exports from youtube.js (for convenience):
 *   searchDeezer, getLyrics, searchSaavn
 */

export { searchDeezer, getLyrics, searchSaavn } from './youtube.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format seconds as "m:ss".
 * @param {number} secs
 * @returns {string}
 */
export function fmtDuration(secs) {
  if (!secs || typeof secs !== 'number') return '?:??';
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Parse user input into artist + title.
 * Supports "artist - title" format; falls back to title-only.
 * @param {string} text
 * @returns {{ artist: string|null, title: string }}
 */
export function parseArtistTitle(text) {
  const sep = text.indexOf(' - ');
  if (sep > 0) {
    return {
      artist: text.slice(0, sep).trim(),
      title:  text.slice(sep + 3).trim(),
    };
  }
  return { artist: null, title: text.trim() };
}

/** Shared JSON fetch with timeout. */
async function apiFetch(url, opts = {}) {
  const { timeoutMs = 12000, ...fetchOpts } = opts;
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), ...fetchOpts });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).hostname}`);
  return r.json();
}

// ── Deezer artist ─────────────────────────────────────────────────────────────

/**
 * Search for an artist and return their top 10 tracks.
 *
 * @param {string} query
 * @returns {Promise<{
 *   id: number, name: string, picture: string, fans: number,
 *   link: string, topTracks: DeezerTrack[]
 * }>}
 */
export async function getDeezerArtist(query) {
  const search = await apiFetch(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=1`,
  );
  if (!search.data?.length) throw new Error(`Artist not found: ${query}`);

  const a = search.data[0];

  const top = await apiFetch(
    `https://api.deezer.com/artist/${a.id}/top?limit=10`,
  );

  const topTracks = (top.data ?? []).map(t => ({
    id:         t.id,
    title:      t.title,
    artists:    t.artist?.name ?? a.name,
    album:      t.album?.title ?? '',
    duration:   t.duration ?? 0,
    thumbnail:  t.album?.cover_medium ?? t.album?.cover ?? '',
    previewUrl: t.preview ?? null,
    link:       t.link ?? '',
  }));

  return {
    id:        a.id,
    name:      a.name,
    picture:   a.picture_big ?? a.picture_medium ?? a.picture ?? '',
    fans:      a.nb_fan ?? 0,
    link:      a.link ?? `https://www.deezer.com/artist/${a.id}`,
    topTracks,
  };
}

// ── Deezer album ──────────────────────────────────────────────────────────────

/**
 * Search for an album and return its track list.
 *
 * @param {string} query   — "artist album title" or just the album title
 * @returns {Promise<{
 *   id: number, title: string, artist: string, cover: string,
 *   releaseDate: string, trackCount: number, link: string,
 *   tracks: DeezerTrack[]
 * }>}
 */
export async function getDeezerAlbum(query) {
  const search = await apiFetch(
    `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=1`,
  );
  if (!search.data?.length) throw new Error(`Album not found: ${query}`);

  const a = search.data[0];

  const detail = await apiFetch(`https://api.deezer.com/album/${a.id}/tracks`);

  const tracks = (detail.data ?? []).map((t, i) => ({
    trackNum:   i + 1,
    id:         t.id,
    title:      t.title,
    artists:    t.artist?.name ?? a.artist?.name ?? '',
    duration:   t.duration ?? 0,
    previewUrl: t.preview ?? null,
    link:       t.link ?? '',
  }));

  return {
    id:           a.id,
    title:        a.title,
    artist:       a.artist?.name ?? 'Unknown',
    cover:        a.cover_big ?? a.cover_medium ?? a.cover ?? '',
    releaseDate:  a.release_date ?? '',
    trackCount:   detail.total ?? tracks.length,
    link:         a.link ?? `https://www.deezer.com/album/${a.id}`,
    tracks,
  };
}

// ── Deezer related artists ────────────────────────────────────────────────────

/**
 * Return artists similar to the given query.
 * Finds the artist first, then fetches related.
 *
 * @param {string} query
 * @returns {Promise<Array<{ id, name, picture, fans, link }>>}
 */
export async function getRelatedArtists(query) {
  // Step 1: resolve artist id
  const search = await apiFetch(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=1`,
  );
  if (!search.data?.length) throw new Error(`Artist not found: ${query}`);
  const artistId = search.data[0].id;

  // Step 2: related
  const rel = await apiFetch(
    `https://api.deezer.com/artist/${artistId}/related?limit=10`,
  );

  return (rel.data ?? []).map(a => ({
    id:      a.id,
    name:    a.name,
    picture: a.picture_medium ?? a.picture ?? '',
    fans:    a.nb_fan ?? 0,
    link:    a.link ?? `https://www.deezer.com/artist/${a.id}`,
  }));
}

// ── iTunes RSS — trending music ───────────────────────────────────────────────

/**
 * Fetch the iTunes top songs chart.
 *
 * @param {number} [limit=20]        — max 100
 * @param {string} [country='us']    — ISO 3166-1 alpha-2 country code
 * @returns {Promise<Array<{
 *   rank: number, title: string, artist: string,
 *   albumArt: string, trackViewUrl: string
 * }>>}
 */
export async function getTrendingMusic(limit = 20, country = 'us') {
  const cap  = Math.min(limit, 100);
  const data = await apiFetch(
    `https://itunes.apple.com/${country}/rss/topsongs/limit=${cap}/json`,
  );

  const entries = data?.feed?.entry ?? [];
  return entries.map((e, i) => ({
    rank:          i + 1,
    title:         e['im:name']?.label       ?? 'Unknown',
    artist:        e['im:artist']?.label     ?? 'Unknown',
    albumArt:      (e['im:image']?.[2]?.label ?? e['im:image']?.[0]?.label) ?? '',
    trackViewUrl:  e.link?.attributes?.href  ?? '',
  }));
}

// ── Audiomack search ──────────────────────────────────────────────────────────

/**
 * Search Audiomack for tracks (public API, no key required).
 *
 * @param {string} query
 * @param {number} [limit=10]
 * @returns {Promise<Array<{
 *   id: string, title: string, artist: string,
 *   cover: string, duration: number,
 *   pageUrl: string, audioLink: string|null
 * }>>}
 */
export async function searchAudiomack(query, limit = 10) {
  const data = await apiFetch(
    `https://api.audiomack.com/v1/music/search?q=${encodeURIComponent(query)}&limit=${limit}&format=json`,
  );

  const items = data?.results?.data ?? data?.data ?? [];
  if (!items.length) throw new Error(`No Audiomack results for: ${query}`);

  return items.map(t => {
    const artistSlug = t.uploader?.url_slug ?? t.artist?.replace(/\s+/g, '-').toLowerCase() ?? 'unknown';
    const songSlug   = t.url_slug ?? t.slug  ?? '';
    return {
      id:        String(t.id ?? ''),
      title:     t.title   ?? 'Unknown',
      artist:    t.artist  ?? t.uploader?.name ?? 'Unknown',
      cover:     t.hq_image ?? t.image ?? '',
      duration:  Number(t.duration ?? 0),
      pageUrl:   songSlug
        ? `https://audiomack.com/${artistSlug}/song/${songSlug}`
        : `https://audiomack.com/`,
      audioLink: t.audio_link ?? null,
    };
  });
}

// ── Cobalt.tools — universal downloader ───────────────────────────────────────

/**
 * Download media from any Cobalt-supported service
 * (SoundCloud, Audiomack, YouTube, TikTok, Instagram, etc.).
 *
 * @param {string} url   — Full media URL
 * @returns {Promise<{
 *   status:   'stream'|'redirect'|'picker'|'tunnel',
 *   url?:     string,
 *   filename?: string,
 *   picker?:  Array<{url:string, type:string, thumb?:string}>
 * }>}
 */
export async function cobaltDownload(url) {
  const r = await fetch('https://api.cobalt.tools/', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    },
    body:   JSON.stringify({ url }),
    signal: AbortSignal.timeout(30000),
  });

  if (!r.ok) throw new Error(`Cobalt API error: ${r.status}`);
  const data = await r.json();

  if (data.status === 'error') {
    const code = data.error?.code ?? 'unknown';
    throw new Error(`Cobalt: ${code}`);
  }

  return data;
}
