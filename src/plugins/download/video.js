/**
 * Plugin: video
 * Category: download
 *
 * Downloads and sends a YouTube video by URL or search title.
 * Alias of ytmp4 with title/URL search support.
 * Costs 3 limit credits per use.
 */

import { ytmp4 as ytDlMp4, ytSearch as ytSearchFn } from '../../lib/scrape/youtube.js';
import { initUserDB, getLimitCost, checkLimit, useLimit } from '../../lib/database.js';
import { isOwner } from '../../settings.js';

export default {
  name:        'video',
  aliases:     ['mp4', 'ytmp4', 'ytv'],
  category:    'download',
  description: 'Download a YouTube video by URL or title',
  usage:       '.video <YouTube URL or title> [quality]',
  limit:       3,

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid     = msg.key.remoteJid;
    const quality = /^\d+p?$/.test(args[args.length - 1] ?? '') ? args.pop() : '720';
    const query   = args.join(' ').trim();
    if (!query) { await reply(`🎬 Usage: .video <YouTube URL or title>\nExample: .video Minecraft highlights`); return; }

    initUserDB(sender, msg.pushName ?? 'User');
    const cost = getLimitCost('ytmp4', 3);
    const lim  = checkLimit(sender, isOwner(sender, settings));
    if (lim !== '∞' && lim < cost) {
      await reply(`❌ Not enough limit! Need *${cost}*, you have *${lim}*.`);
      return;
    }

    await sock.sendMessage(jid, { react: { text: '⏱️', key: msg.key } });
    try {
      // If not a URL, search first
      let url = query;
      if (!/youtu/.test(query)) {
        const results = await ytSearchFn(query, 1);
        if (!results.length) throw new Error('No results found.');
        url = results[0].url;
      }
      const result = await ytDlMp4(url, quality);
      await sock.sendMessage(jid, {
        video:   { url: result.downloadUrl },
        caption: `🎬 *${result.title}*`,
      }, { quoted: msg });
      useLimit(sender, cost, isOwner(sender, settings));
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await reply(`❌ Video download failed: ${e.message}`);
    }
  },
};
