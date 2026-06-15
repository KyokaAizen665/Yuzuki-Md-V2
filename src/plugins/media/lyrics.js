/**
 * Plugin: lyrics
 * Category: media
 *
 * Fetch and display song lyrics.
 *
 * Pass "artist - title" for the best match, or just the song title and
 * the bot will auto-search Deezer to resolve the artist.
 *
 * Usage:
 *   .lyrics <artist - title>
 *   .lyrics <title>          — auto-resolves artist via Deezer
 *
 * Examples:
 *   .lyrics The Weeknd - Blinding Lights
 *   .lyrics Shape of You
 */

import { getLyrics, searchDeezer, parseArtistTitle } from '../../lib/scrape/mediahub.js';
import { lyricsCard }                                 from '../../lib/media-hub-cards.js';

export default {
  name:        'lyrics',
  aliases:     ['lyric', 'lrc', 'songlyrics'],
  category:    'media',
  description: 'Look up the full lyrics for any song',
  usage:       '.lyrics <artist - title>  or  .lyrics <title>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid   = msg.key.remoteJid;
    const text  = args.join(' ').trim();
    const opts  = { prefix: settings?.prefix ?? '.', botName: settings?.botName ?? 'Yuzuki MD' };

    if (!text) {
      await reply(
        `🎶  *Lyrics Lookup*\n\n` +
        `Usage:  \`${opts.prefix}lyrics <artist - title>\`\n` +
        `_Example:_  \`${opts.prefix}lyrics The Weeknd - Blinding Lights\`\n\n` +
        `Or just type the song name:\n` +
        `_Example:_  \`${opts.prefix}lyrics Shape of You\``,
      );
      return;
    }

    await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } }).catch(() => {});

    try {
      let { artist, title } = parseArtistTitle(text);

      // If no explicit artist, try resolving via Deezer search
      if (!artist) {
        try {
          const results = await searchDeezer(title, 1);
          if (results.length) {
            artist = results[0].artists;
            title  = results[0].title;
          }
        } catch { /* keep original title, let lyrics.ovh try */ }
      }

      // Use "Unknown" artist as last resort
      const resolvedArtist = artist || text;
      const resolvedTitle  = artist ? title : text;

      const lyrics = await getLyrics(resolvedArtist, resolvedTitle);

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
      await lyricsCard(sock, jid, msg, lyrics, {
        title:  resolvedTitle,
        artist: resolvedArtist,
      }, opts);
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(
        `❌  Lyrics not found for _${text}_\n\n` +
        `Try:\n` +
        `• \`${opts.prefix}lyrics ${text.includes(' - ') ? text : 'Artist - ' + text}\`\n` +
        `• Check the spelling of the song or artist name`,
      );
    }
  },
};
