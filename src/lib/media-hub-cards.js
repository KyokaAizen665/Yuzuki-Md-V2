/**
 * Media Hub Cards — NativeFlow card builders for the Music / Media feature set
 *
 * All cards are built from live data; nothing is hardcoded beyond layout.
 * Each card sends an interactive NativeFlow message and falls back to plain
 * text if the interactive send fails.
 *
 * ─── Catalogue ────────────────────────────────────────────────────────────────
 *
 *   trackSearchCard(sock,jid,msg, tracks, query, opts)
 *     Deezer / Saavn search results — select list, each row fires .song
 *
 *   artistInfoCard(sock,jid,msg, artist, opts)
 *     Artist stats + top tracks select list
 *
 *   albumTracksCard(sock,jid,msg, album, opts)
 *     Album header + paginated track list
 *
 *   lyricsCard(sock,jid,msg, lyrics, meta, opts)
 *     Full lyrics (auto-chunked for long songs)
 *
 *   trendingCard(sock,jid,msg, tracks, opts)
 *     iTunes chart with numbered rows
 *
 *   recommendationsCard(sock,jid,msg, related, seedArtist, opts)
 *     Related artists as a browsable select list
 *
 *   audiomackResultsCard(sock,jid,msg, tracks, query, opts)
 *     Audiomack search results
 */

import {
  sendInteractive,
  copyButton,
  urlButton,
  selectButton,
  selectButtonSections,
} from './interactive.js';

import { fmtDuration } from './scrape/mediahub.js';

// ── Shared helpers ────────────────────────────────────────────────────────────

function resolveOpts({ prefix = '.', botName = 'Yuzuki MD' } = {}) {
  return { prefix, botName };
}

/** Truncate string at word boundary. */
function trunc(str, max = 72) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

/** Format fan/follower count as "1.2M" / "45K" / "999". */
function fmtFans(n) {
  if (!n) return '?';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/** Send with plain-text fallback on any failure. */
async function safeInteractive(sock, jid, msg, opts, fallback) {
  try {
    await sendInteractive(sock, jid, msg, opts);
    return { ok: true };
  } catch (error) {
    try { await sock.sendMessage(jid, { text: fallback }, { quoted: msg }); } catch {}
    return { ok: false, error };
  }
}

/** Split an array into chunks of size n. */
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ── Track search results ──────────────────────────────────────────────────────

/**
 * Show a track search result list.
 * Tapping a row fires `.song <title>` to download the selected track.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {object[]} tracks  — array of track objects with title, artists, duration
 * @param {string} query     — original search query
 * @param {object} [opts]
 */
export async function trackSearchCard(sock, jid, msg, tracks, query, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);
  if (!tracks.length) {
    await sock.sendMessage(jid, { text: `🔍 No results for _${query}_` }, { quoted: msg });
    return { ok: false };
  }

  // WhatsApp caps rows at 10 per section; split into sections of 10
  const sections = chunk(tracks.slice(0, 20), 10).map((group, si) => ({
    title: si === 0 ? `🎵 Results for "${trunc(query, 30)}"` : '🎵 More Results',
    rows:  group.map((t, i) => {
      const dur   = fmtDuration(t.duration);
      const idx   = si * 10 + i + 1;
      return {
        title:       trunc(`${idx}. ${t.title}`, 24),
        description: trunc(`${t.artists}  •  ${dur}${t.album ? '  •  ' + t.album : ''}`, 72),
        rowId:       `${prefix}song ${t.title} ${t.artists}`,
      };
    }),
  }));

  const body =
    `🎵  *Music Search*\n${'─'.repeat(22)}\n\n` +
    `Query: _${query}_\n` +
    `Found *${tracks.length}* result${tracks.length !== 1 ? 's' : ''} — tap to download as MP3.\n\n` +
    `_Powered by JioSaavn & Deezer_`;

  const fallback =
    `🎵  *Music Search — ${query}*\n${'─'.repeat(22)}\n\n` +
    tracks.slice(0, 10).map((t, i) =>
      `${i + 1}.  *${t.title}*  —  ${t.artists}  (${fmtDuration(t.duration)})\n    \`${prefix}song ${t.title}\``,
    ).join('\n\n');

  return safeInteractive(sock, jid, msg, {
    body,
    footer:  botName,
    buttons: [selectButtonSections('🎵 Pick a Track', sections)],
  }, fallback);
}

// ── Artist info ───────────────────────────────────────────────────────────────

/**
 * Artist info card: stats + top tracks select list.
 * Tapping a top-track row fires `.song <title artist>`.
 *
 * @param {object} artist  — result from getDeezerArtist()
 */
export async function artistInfoCard(sock, jid, msg, artist, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);

  const topRows = artist.topTracks.map((t, i) => ({
    title:       trunc(`${i + 1}. ${t.title}`, 24),
    description: trunc(`${fmtDuration(t.duration)}${t.album ? '  •  ' + t.album : ''}`, 72),
    rowId:       `${prefix}song ${t.title} ${artist.name}`,
  }));

  const body =
    `🎤  *${artist.name}*\n${'─'.repeat(22)}\n\n` +
    `👥  Fans:  *${fmtFans(artist.fans)}*\n\n` +
    `*Top Tracks:*\n` +
    artist.topTracks.slice(0, 5).map((t, i) =>
      `  ${i + 1}.  *${t.title}*  •  _${fmtDuration(t.duration)}_`,
    ).join('\n') +
    `\n\n_Tap a track to download it as MP3._`;

  const buttons = [
    selectButton(`🎵 All Top Tracks`, topRows, `${artist.name}'s Top Tracks`),
    urlButton('🔗 Open on Deezer', artist.link),
    copyButton(`📋 Copy Name`, artist.name),
  ];

  const fallback =
    `🎤  *${artist.name}*\n${'─'.repeat(22)}\n\n` +
    `Fans: ${fmtFans(artist.fans)}\n\n` +
    `Top Tracks:\n` +
    artist.topTracks.map((t, i) =>
      `${i + 1}.  *${t.title}*  (${fmtDuration(t.duration)})  —  \`${prefix}song ${t.title} ${artist.name}\``,
    ).join('\n');

  return safeInteractive(sock, jid, msg, { body, footer: botName, buttons }, fallback);
}

// ── Album tracks ──────────────────────────────────────────────────────────────

/**
 * Album card: cover info + track list.
 * Tapping a track row fires `.song <title artist>`.
 *
 * @param {object} album  — result from getDeezerAlbum()
 */
export async function albumTracksCard(sock, jid, msg, album, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);

  const trackRows = album.tracks.slice(0, 20).map(t => ({
    title:       trunc(`${t.trackNum}. ${t.title}`, 24),
    description: trunc(`${t.artists}  •  ${fmtDuration(t.duration)}`, 72),
    rowId:       `${prefix}song ${t.title} ${album.artist}`,
  }));

  const sections = chunk(trackRows, 10).map((rows, si) => ({
    title: si === 0 ? `${album.title}` : 'More Tracks',
    rows,
  }));

  const body =
    `💿  *${album.title}*\n${'─'.repeat(22)}\n\n` +
    `Artist:   *${album.artist}*\n` +
    `Tracks:   *${album.trackCount}*` +
    (album.releaseDate ? `\nReleased: *${album.releaseDate}*` : '') + '\n\n' +
    album.tracks.slice(0, 6).map(t =>
      `  ${t.trackNum}.  *${t.title}*  •  _${fmtDuration(t.duration)}_`,
    ).join('\n') +
    (album.tracks.length > 6 ? `\n  _…and ${album.tracks.length - 6} more_` : '') +
    '\n\n_Tap a track to download it as MP3._';

  const buttons = [
    selectButtonSections('🎵 All Tracks', sections),
    urlButton('🔗 Open on Deezer', album.link),
    copyButton('📋 Copy Title', album.title),
  ];

  const fallback =
    `💿  *${album.title}*  by  *${album.artist}*\n${'─'.repeat(22)}\n\n` +
    album.tracks.map(t =>
      `${t.trackNum}.  *${t.title}*  (${fmtDuration(t.duration)})  —  \`${prefix}song ${t.title}\``,
    ).join('\n');

  return safeInteractive(sock, jid, msg, { body, footer: botName, buttons }, fallback);
}

// ── Lyrics ────────────────────────────────────────────────────────────────────

const LYRICS_CHUNK = 3000; // chars per message

/**
 * Display song lyrics.
 * Automatically chunks lyrics longer than LYRICS_CHUNK characters into
 * follow-up messages so WhatsApp doesn't drop any content.
 *
 * @param {string} lyrics
 * @param {{ title, artist, duration? }} meta
 */
export async function lyricsCard(sock, jid, msg, lyrics, meta, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);

  const header =
    `🎶  *${meta.title}*  —  ${meta.artist}\n` +
    `${'─'.repeat(22)}\n\n`;

  // If lyrics fit in one message, send as interactive card with copy button
  if ((header + lyrics).length <= LYRICS_CHUNK) {
    const body    = header + lyrics;
    const buttons = [
      copyButton('📋 Copy Lyrics', lyrics),
      copyButton('🔽 Download',    `${prefix}song ${meta.title} ${meta.artist}`),
    ];
    const fallback = body;
    return safeInteractive(sock, jid, msg, { body, footer: botName, buttons }, fallback);
  }

  // Send first chunk as interactive, rest as plain follow-ups
  try {
    const chunks    = [];
    let   remaining = lyrics;
    while (remaining.length > 0) {
      // Split at a newline near LYRICS_CHUNK to avoid mid-word cuts
      let end = LYRICS_CHUNK;
      if (remaining.length > LYRICS_CHUNK) {
        const nlIdx = remaining.lastIndexOf('\n', LYRICS_CHUNK);
        end = nlIdx > LYRICS_CHUNK * 0.6 ? nlIdx : LYRICS_CHUNK;
      }
      chunks.push(remaining.slice(0, end).trim());
      remaining = remaining.slice(end).trimStart();
    }

    // First chunk: interactive card
    const firstBody = header + `_(${chunks.length} parts)_\n\n` + chunks[0];
    await sendInteractive(sock, jid, msg, {
      body:    firstBody,
      footer:  botName,
      buttons: [copyButton('📋 Copy Part 1', chunks[0])],
    });

    // Remaining chunks: plain text follow-ups
    for (let i = 1; i < chunks.length; i++) {
      await sock.sendMessage(jid,
        { text: `🎶  _(Part ${i + 1}/${chunks.length})_\n\n${chunks[i]}` },
        { quoted: msg });
    }

    return { ok: true };
  } catch {
    // Fallback: send all lyrics as plain text (may truncate in WhatsApp)
    await sock.sendMessage(jid, { text: header + lyrics.slice(0, 4000) }, { quoted: msg });
    return { ok: false };
  }
}

// ── Trending chart ────────────────────────────────────────────────────────────

/**
 * iTunes top songs chart.
 * Tapping a row fires `.play <title artist>`.
 *
 * @param {object[]} tracks  — result from getTrendingMusic()
 */
export async function trendingCard(sock, jid, msg, tracks, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);

  const MEDAL = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

  const sections = chunk(tracks.slice(0, 20), 10).map((group, si) => ({
    title: si === 0 ? '📈 Top 10' : '📈 11–20',
    rows:  group.map((t, i) => {
      const rank = si * 10 + i;
      const icon = MEDAL[rank] ?? `${rank + 1}.`;
      return {
        title:       trunc(`${icon}  ${t.title}`, 24),
        description: trunc(t.artist, 72),
        rowId:       `${prefix}play ${t.title} ${t.artist}`,
      };
    }),
  }));

  const body =
    `📈  *Trending Music*\n${'─'.repeat(22)}\n\n` +
    `_iTunes Top ${tracks.length} Songs_\n\n` +
    tracks.slice(0, 5).map((t, i) =>
      `${MEDAL[i]}  *${t.title}*  —  _${t.artist}_`,
    ).join('\n') +
    (tracks.length > 5 ? `\n  _…and ${tracks.length - 5} more_` : '') +
    '\n\n_Tap a track to search and play it._';

  const buttons = [
    selectButtonSections('📈 Full Chart', sections),
    copyButton('📋 #1 Song', `${prefix}song ${tracks[0]?.title ?? ''} ${tracks[0]?.artist ?? ''}`),
  ];

  const fallback =
    `📈  *Trending Music*\n${'─'.repeat(22)}\n\n` +
    tracks.slice(0, 10).map((t, i) =>
      `${MEDAL[i] ?? (i + 1) + '.'  }  *${t.title}*  —  ${t.artist}\n    \`${prefix}song ${t.title}\``,
    ).join('\n\n');

  return safeInteractive(sock, jid, msg, { body, footer: botName, buttons }, fallback);
}

// ── Recommendations (related artists) ────────────────────────────────────────

/**
 * Show related artists as a select list.
 * Tapping a row fires `.artist <name>`.
 *
 * @param {object[]} related     — result from getRelatedArtists()
 * @param {string}   seedArtist  — the artist the user started from
 */
export async function recommendationsCard(sock, jid, msg, related, seedArtist, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);

  const rows = related.slice(0, 10).map(a => ({
    title:       trunc(a.name, 24),
    description: trunc(`👥 ${fmtFans(a.fans)} fans`, 72),
    rowId:       `${prefix}artist ${a.name}`,
  }));

  const body =
    `💡  *If you like ${seedArtist}...*\n${'─'.repeat(22)}\n\n` +
    `Similar artists you might enjoy:\n\n` +
    related.slice(0, 5).map((a, i) =>
      `  ${i + 1}.  *${a.name}*  —  👥 ${fmtFans(a.fans)} fans`,
    ).join('\n') +
    (related.length > 5 ? `\n  _…and ${related.length - 5} more_` : '') +
    '\n\n_Tap an artist to see their profile & top tracks._';

  const buttons = [
    selectButton('🎤 Explore Artists', rows, `Similar to ${seedArtist}`),
    copyButton('📋 Search Query', `${prefix}artist ${seedArtist}`),
  ];

  const fallback =
    `💡  *Similar to ${seedArtist}*\n${'─'.repeat(22)}\n\n` +
    related.map((a, i) =>
      `${i + 1}.  *${a.name}*  (${fmtFans(a.fans)} fans)  —  \`${prefix}artist ${a.name}\``,
    ).join('\n');

  return safeInteractive(sock, jid, msg, { body, footer: botName, buttons }, fallback);
}

// ── Audiomack search results ──────────────────────────────────────────────────

/**
 * Show Audiomack search results.
 * Tapping a row copies the Audiomack page URL.
 *
 * @param {object[]} tracks  — result from searchAudiomack()
 * @param {string}   query
 */
export async function audiomackResultsCard(sock, jid, msg, tracks, query, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);

  const rows = tracks.slice(0, 10).map((t, i) => ({
    title:       trunc(`${i + 1}. ${t.title}`, 24),
    description: trunc(`${t.artist}  •  ${fmtDuration(t.duration)}`, 72),
    rowId:       `${prefix}audiomack ${t.pageUrl}`,
  }));

  const body =
    `🎵  *Audiomack Search*\n${'─'.repeat(22)}\n\n` +
    `Query: _${query}_\n` +
    `Found *${tracks.length}* result${tracks.length !== 1 ? 's' : ''}\n\n` +
    tracks.slice(0, 5).map((t, i) =>
      `  ${i + 1}.  *${t.title}*  —  _${t.artist}_  (${fmtDuration(t.duration)})`,
    ).join('\n') +
    '\n\n_Tap a result to download it._';

  const buttons = [
    selectButton('🎵 Pick a Track', rows, 'Audiomack Results'),
    copyButton('🔍 Search Again', `${prefix}audiomack ${query}`),
  ];

  const fallback =
    `🎵  *Audiomack: ${query}*\n${'─'.repeat(22)}\n\n` +
    tracks.slice(0, 10).map((t, i) =>
      `${i + 1}.  *${t.title}*  —  ${t.artist}  (${fmtDuration(t.duration)})\n    \`${prefix}audiomack ${t.pageUrl}\``,
    ).join('\n\n');

  return safeInteractive(sock, jid, msg, { body, footer: botName, buttons }, fallback);
}
