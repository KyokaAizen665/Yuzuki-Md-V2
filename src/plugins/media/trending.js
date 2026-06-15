/**
 * Plugin: trending
 * Category: media
 *
 * Show the iTunes top songs chart.
 * Tapping a row fires .play to search and play that song.
 *
 * Usage:
 *   .trending           — top 20 songs (US charts)
 *   .trending 10        — top 10 songs
 *   .trending gb        — UK charts
 *   .trending 10 ng     — top 10, Nigeria
 *
 * Country codes: us, gb, ng, gh, za, au, ca, in, de, fr, jp, ...
 */

import { getTrendingMusic } from '../../lib/scrape/mediahub.js';
import { trendingCard }     from '../../lib/media-hub-cards.js';

export default {
  name:        'trending',
  aliases:     ['charts', 'topsongs', 'topmusic', 'hits'],
  category:    'media',
  description: 'Show the iTunes top songs chart for any country',
  usage:       '.trending [limit] [country-code]',

  async execute({ sock, msg, reply, args, settings }) {
    const jid  = msg.key.remoteJid;
    const opts = { prefix: settings?.prefix ?? '.', botName: settings?.botName ?? 'Yuzuki MD' };

    // Parse: .trending [limit] [country]
    let limit   = 20;
    let country = 'us';

    for (const arg of args) {
      const n = parseInt(arg, 10);
      if (!isNaN(n) && n > 0) { limit = Math.min(n, 50); }
      else if (/^[a-z]{2}$/i.test(arg)) { country = arg.toLowerCase(); }
    }

    await sock.sendMessage(jid, { react: { text: '📈', key: msg.key } }).catch(() => {});

    try {
      const tracks = await getTrendingMusic(limit, country);
      if (!tracks.length) {
        await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await reply(`❌  No trending data found for country code *${country.toUpperCase()}*.`);
        return;
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
      await trendingCard(sock, jid, msg, tracks, opts);
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  Could not fetch trending chart: ${e.message}`);
    }
  },
};
