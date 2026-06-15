/**
 * Plugin: instagram
 * Category: download
 * Migrated from commands.js case "instagram" / "ig"
 *
 * Downloads photos and videos from an Instagram post URL.
 * Uses igDl scraper from lib/scrape/instagram.js.
 * Costs 2 limit credits per use.
 */

import { igdl as igDl }                                            from '../../lib/scrape/instagram.js';
import { initUserDB, getLimitCost, checkLimit, useLimit }          from '../../lib/database.js';
import { isOwner }                                                  from '../../settings.js';

export default {
  name:        'instagram',
  aliases:     ['ig', 'igdl', 'igdownload'],
  category:    'download',
  description: 'Download photos/videos from an Instagram post URL',
  usage:       '.instagram <Instagram URL>',
  limit:       2,

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid  = msg.key.remoteJid;
    const text = args[0]?.trim();
    if (!text) { await reply(`📌 Example: .instagram https://www.instagram.com/p/...`); return; }

    initUserDB(sender, msg.pushName ?? 'User');
    const cost = getLimitCost('igdl', 2);
    const lim  = checkLimit(sender, isOwner(sender, settings));
    if (lim !== '∞' && lim < cost) {
      await reply(`❌ Not enough limit! Need *${cost}*, you have *${lim}*.`);
      return;
    }

    await sock.sendMessage(jid, { react: { text: '⏱️', key: msg.key } });
    try {
      const items = await igDl(text);
      if (!items?.length) throw new Error('No media found.');

      for (let i = 0; i < Math.min(items.length, 10); i++) {
        const item    = items[i];
        const caption = i === 0
          ? `📸 *Instagram Downloader*\n\nMedia ${i + 1}/${items.length}`
          : `Media ${i + 1}/${items.length}`;
        const opts = item.type === 'video'
          ? { video: { url: item.url }, caption }
          : { image: { url: item.url }, caption };
        await sock.sendMessage(jid, opts, { quoted: msg });
      }

      useLimit(sender, cost, isOwner(sender, settings));
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await reply(`❌ Instagram download failed: ${e.message}`);
    }
  },
};
