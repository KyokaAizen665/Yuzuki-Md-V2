/**
 * Plugin: artist
 * Category: media
 *
 * Show artist profile: fan count, top 10 tracks, and a link to Deezer.
 * Powered by the Deezer public API — no key required.
 *
 * Usage:
 *   .artist <artist name>
 *   .artist The Weeknd
 */

import { getDeezerArtist } from '../../lib/scrape/mediahub.js';
import { artistInfoCard }  from '../../lib/media-hub-cards.js';

export default {
  name:        'artist',
  aliases:     ['artistinfo', 'singer', 'band'],
  category:    'media',
  description: 'Show artist profile, fan count, and top 10 tracks from Deezer',
  usage:       '.artist <artist name>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid   = msg.key.remoteJid;
    const query = args.join(' ').trim();
    const opts  = { prefix: settings?.prefix ?? '.', botName: settings?.botName ?? 'Yuzuki MD' };

    if (!query) {
      await reply(
        `🎤  *Artist Info*\n\n` +
        `Usage: \`${opts.prefix}artist <name>\`\n` +
        `_Example:_ \`${opts.prefix}artist The Weeknd\``,
      );
      return;
    }

    await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } }).catch(() => {});

    try {
      const artist = await getDeezerArtist(query);
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
      await artistInfoCard(sock, jid, msg, artist, opts);
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  Artist not found: _${query}_\n\n_${e.message}_`);
    }
  },
};
