/**
 * Plugin: song
 * Category: download
 *
 * Direct MP3 downloader — search by title, send audio file.
 * Alias of the "play" command; registered separately so the name
 * "song" resolves on its own without requiring the user to type "play".
 *
 * Costs 2 limit credits per use.
 */

import { searchSaavn, ytmp3 as ytDlMp3, ytSearch as ytSearchFn } from '../../lib/scrape/youtube.js';
import { initUserDB, getLimitCost, checkLimit, useLimit }         from '../../lib/database.js';
import { isOwner }                                                 from '../../settings.js';

export default {
  name:        'song',
  aliases:     ['mp3', 'ytmp3', 'dl'],
  category:    'download',
  description: 'Download a song as an MP3 audio file (JioSaavn → YouTube fallback)',
  usage:       '.song <song title or YouTube URL>',
  limit:       2,

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid  = msg.key.remoteJid;
    const text = args.join(' ').trim();
    if (!text) { await reply(`🎵 Usage: .song <song title>\nExample: .song Shape of You`); return; }

    initUserDB(sender, msg.pushName ?? 'User');
    const cost = getLimitCost('ytmp3', 2);
    const lim  = checkLimit(sender, isOwner(sender, settings));
    if (lim !== '∞' && lim < cost) {
      await reply(`❌ Not enough limit! Need *${cost}*, you have *${lim}*.`);
      return;
    }

    await sock.sendMessage(jid, { react: { text: '⏱️', key: msg.key } });
    try {
      // Attempt 1: JioSaavn (free 320 kbps, title search)
      if (!/youtu/.test(text)) {
        try {
          const results = await searchSaavn(text, 1);
          if (results.length && results[0].url) {
            const top = results[0];
            await sock.sendMessage(jid, {
              audio:    { url: top.url },
              mimetype: 'audio/mpeg',
              contextInfo: { externalAdReply: {
                title:        top.title,
                body:         `${top.artists}${top.album ? ' • ' + top.album : ''}`,
                thumbnailUrl: top.thumbnail || '',
                mediaType:    1,
              }},
            }, { quoted: msg });
            useLimit(sender, cost, isOwner(sender, settings));
            await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
            return;
          }
        } catch {}
      }

      // Attempt 2: YouTube (URL or title → search → ytDlMp3)
      let url = text;
      if (!/youtu/.test(text)) {
        const ytRes = await ytSearchFn(text, 1);
        if (!ytRes.length) throw new Error('No results found.');
        url = ytRes[0].url;
      }
      const dl = await ytDlMp3(url);
      await sock.sendMessage(jid, {
        audio:    { url: dl.downloadUrl },
        mimetype: 'audio/mp4',
        contextInfo: { externalAdReply: {
          title:        dl.title,
          thumbnailUrl: dl.thumbnail || '',
          mediaType:    1,
        }},
      }, { quoted: msg });

      useLimit(sender, cost, isOwner(sender, settings));
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await reply(`❌ Song download failed: ${e.message}`);
    }
  },
};
