/**
 * Plugin: musicsearch
 * Category: media
 *
 * Rich music search powered by Deezer + JioSaavn.
 * Returns an interactive NativeFlow card where each row fires .song
 * to download the selected track as MP3.
 *
 * Usage:
 *   .musicsearch <song title or artist - title>
 *   .ms Blinding Lights
 *   .ms The Weeknd - Save Your Tears
 */

import { searchDeezer, searchSaavn } from '../../lib/scrape/mediahub.js';
import { trackSearchCard }           from '../../lib/media-hub-cards.js';

export default {
  name:        'musicsearch',
  aliases:     ['ms', 'searchmusic', 'findsong'],
  category:    'media',
  description: 'Search for music with rich results — artist, album, duration',
  usage:       '.musicsearch <song title or artist - title>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid   = msg.key.remoteJid;
    const query = args.join(' ').trim();
    const opts  = { prefix: settings?.prefix ?? '.', botName: settings?.botName ?? 'Yuzuki MD' };

    if (!query) {
      await reply(
        `🎵  *Music Search*\n\n` +
        `Usage: \`${opts.prefix}musicsearch <query>\`\n` +
        `_Example:_ \`${opts.prefix}ms Blinding Lights\`\n\n` +
        `Shows rich results with artist, album, and duration.\n` +
        `Tap any result to download it as an MP3.`,
      );
      return;
    }

    await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } }).catch(() => {});

    try {
      // Prefer Deezer for rich metadata; fall back to Saavn on failure
      let tracks = [];
      try {
        tracks = await searchDeezer(query, 15);
      } catch {
        const saavn = await searchSaavn(query, 10);
        tracks = saavn.map(s => ({
          id:         s.id,
          title:      s.title,
          artists:    s.artists,
          album:      s.album,
          duration:   s.duration,
          thumbnail:  s.thumbnail,
          previewUrl: null,
          link:       '',
        }));
      }

      if (!tracks.length) {
        await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await reply(`❌  No results found for _${query}_`);
        return;
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
      await trackSearchCard(sock, jid, msg, tracks, query, opts);
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  Music search failed: ${e.message}`);
    }
  },
};
