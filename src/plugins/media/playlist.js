/**
 * Plugin: playlist
 * Category: media
 *
 * Browse and download tracks from a Deezer playlist by URL or name search.
 *
 * • Pass a Deezer playlist URL  → show track list
 * • Pass a playlist name        → search Deezer playlists, show top result
 *
 * Each track row in the result fires .song to download that track.
 *
 * Usage:
 *   .playlist <deezer playlist url>
 *   .playlist <search query>
 *
 * Examples:
 *   .playlist https://www.deezer.com/playlist/1313621735
 *   .playlist Top Hits 2024
 */

import { sendInteractive, selectButtonSections, copyButton, urlButton }
  from '../../lib/interactive.js';

const DEEZER_PL_RE = /deezer\.com\/(?:[a-z]{2}\/)?playlist\/(\d+)/i;

/** Format seconds as m:ss */
function fmtD(s) {
  if (!s) return '?';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function trunc(str, n = 72) {
  return str?.length > n ? str.slice(0, n - 1) + '…' : (str ?? '');
}
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function apiFetch(url, ms = 12000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`Deezer API error: ${r.status}`);
  return r.json();
}

async function getPlaylistById(id) {
  const data = await apiFetch(`https://api.deezer.com/playlist/${id}`);
  if (!data.id) throw new Error('Playlist not found');
  return data;
}

async function searchPlaylist(query) {
  const data = await apiFetch(
    `https://api.deezer.com/search/playlist?q=${encodeURIComponent(query)}&limit=1`,
  );
  if (!data.data?.length) throw new Error(`No playlists found for: ${query}`);
  return data.data[0];
}

export default {
  name:        'playlist',
  aliases:     ['pl', 'deezerpl', 'dplaylist'],
  category:    'media',
  description: 'Browse a Deezer playlist by URL or search — tap any track to download',
  usage:       '.playlist <deezer url or search query>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid   = msg.key.remoteJid;
    const text  = args.join(' ').trim();
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';

    if (!text) {
      await reply(
        `🎧  *Playlist Browser*\n\n` +
        `*By URL:*     \`${prefix}playlist https://www.deezer.com/playlist/...\`\n` +
        `*By search:*  \`${prefix}playlist Top Hits 2024\`\n\n` +
        `Shows the playlist tracks — tap any to download as MP3.`,
      );
      return;
    }

    await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } }).catch(() => {});

    try {
      let pl;

      // URL mode
      const urlMatch = DEEZER_PL_RE.exec(text);
      if (urlMatch) {
        pl = await getPlaylistById(urlMatch[1]);
      } else {
        // Search mode — get first playlist result, then fetch full detail
        const stub = await searchPlaylist(text);
        pl         = await getPlaylistById(stub.id);
      }

      const tracks = (pl.tracks?.data ?? []).slice(0, 40);
      if (!tracks.length) throw new Error('Playlist has no tracks');

      // Build track rows (max 10 per section)
      const sections = chunk(tracks, 10).map((group, si) => ({
        title: si === 0 ? `🎵 ${trunc(pl.title, 30)} (1–10)` : `🎵 Tracks ${si * 10 + 1}–${si * 10 + group.length}`,
        rows:  group.map((t, i) => ({
          title:       trunc(`${si * 10 + i + 1}. ${t.title}`, 24),
          description: trunc(`${t.artist?.name ?? ''}  •  ${fmtD(t.duration)}`, 72),
          rowId:       `${prefix}song ${t.title} ${t.artist?.name ?? ''}`,
        })),
      }));

      const creator    = pl.creator?.name ?? 'Deezer';
      const trackCount = pl.nb_tracks     ?? tracks.length;
      const link       = pl.link          ?? `https://www.deezer.com/playlist/${pl.id}`;

      const body =
        `🎧  *${pl.title}*\n${'─'.repeat(22)}\n\n` +
        `Curator:  *${creator}*\n` +
        `Tracks:   *${trackCount}*\n` +
        (pl.description ? `\n_${trunc(pl.description, 120)}_\n` : '') +
        `\nFirst ${Math.min(tracks.length, 5)} tracks:\n` +
        tracks.slice(0, 5).map((t, i) =>
          `  ${i + 1}.  *${t.title}*  —  _${t.artist?.name ?? ''}_  (${fmtD(t.duration)})`,
        ).join('\n') +
        (trackCount > 5 ? `\n  _…and ${trackCount - 5} more_` : '') +
        '\n\n_Tap a track to download it as MP3._';

      const buttons = [
        selectButtonSections('🎵 Browse Tracks', sections),
        urlButton('🔗 Open Playlist', link),
        copyButton('📋 Copy Link', link),
      ];

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});

      try {
        await sendInteractive(sock, jid, msg, { body, footer: botName, buttons });
      } catch {
        const fallback =
          `🎧  *${pl.title}*  by  *${creator}*\n${'─'.repeat(22)}\n\n` +
          tracks.slice(0, 10).map((t, i) =>
            `${i + 1}.  *${t.title}*  —  ${t.artist?.name ?? ''}  (${fmtD(t.duration)})\n    \`${prefix}song ${t.title}\``,
          ).join('\n\n');
        await sock.sendMessage(jid, { text: fallback }, { quoted: msg });
      }
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  Playlist not found: ${e.message}`);
    }
  },
};
