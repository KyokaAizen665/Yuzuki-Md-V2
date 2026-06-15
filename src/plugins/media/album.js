/**
 * Plugin: album
 * Category: media
 *
 * Show album details and track list from Deezer.
 * Tap any track row to download it as MP3 via .song.
 *
 * Usage:
 *   .album <album title>
 *   .album <artist> <album>
 *
 * Examples:
 *   .album After Hours
 *   .album The Weeknd After Hours
 */

import { getDeezerAlbum }  from '../../lib/scrape/mediahub.js';
import { albumTracksCard } from '../../lib/media-hub-cards.js';

export default {
  name:        'album',
  aliases:     ['albuminfo', 'tracklist', 'tracks'],
  category:    'media',
  description: 'Show album details and track list — tap a track to download as MP3',
  usage:       '.album <album title>  or  .album <artist> <album>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid   = msg.key.remoteJid;
    const query = args.join(' ').trim();
    const opts  = { prefix: settings?.prefix ?? '.', botName: settings?.botName ?? 'Yuzuki MD' };

    if (!query) {
      await reply(
        `💿  *Album Info*\n\n` +
        `Usage: \`${opts.prefix}album <title>\`\n` +
        `_Example:_ \`${opts.prefix}album After Hours\`\n` +
        `_Example:_ \`${opts.prefix}album The Weeknd After Hours\``,
      );
      return;
    }

    await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } }).catch(() => {});

    try {
      const album = await getDeezerAlbum(query);
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
      await albumTracksCard(sock, jid, msg, album, opts);
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  Album not found: _${query}_\n\n_${e.message}_`);
    }
  },
};
