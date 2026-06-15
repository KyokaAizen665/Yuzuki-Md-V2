/**
 * Plugin: recommend
 * Category: media
 *
 * Discover artists similar to one you already love.
 * Powered by Deezer's related-artist graph — no API key required.
 * Tapping a result opens the full artist profile via .artist.
 *
 * Usage:
 *   .recommend <artist name>
 *   .recommend Drake
 */

import { getRelatedArtists }    from '../../lib/scrape/mediahub.js';
import { recommendationsCard }  from '../../lib/media-hub-cards.js';

export default {
  name:        'recommend',
  aliases:     ['similar', 'relatedartist', 'musicsuggest', 'likethis'],
  category:    'media',
  description: 'Find artists similar to one you love — powered by Deezer',
  usage:       '.recommend <artist name>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid   = msg.key.remoteJid;
    const query = args.join(' ').trim();
    const opts  = { prefix: settings?.prefix ?? '.', botName: settings?.botName ?? 'Yuzuki MD' };

    if (!query) {
      await reply(
        `💡  *Music Recommendations*\n\n` +
        `Usage: \`${opts.prefix}recommend <artist>\`\n` +
        `_Example:_ \`${opts.prefix}recommend Drake\`\n\n` +
        `Shows you similar artists you might enjoy.`,
      );
      return;
    }

    await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } }).catch(() => {});

    try {
      const related = await getRelatedArtists(query);
      if (!related.length) {
        await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await reply(`❌  No recommendations found for _${query}_`);
        return;
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
      await recommendationsCard(sock, jid, msg, related, query, opts);
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  Could not find recommendations: ${e.message}`);
    }
  },
};
