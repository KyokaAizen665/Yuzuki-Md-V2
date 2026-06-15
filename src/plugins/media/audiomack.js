/**
 * Plugin: audiomack
 * Category: media
 *
 * Download music from Audiomack, or search Audiomack and browse results.
 *
 * • Pass an Audiomack URL → download that track via Cobalt.tools
 * • Pass a search query  → show Audiomack search results as an interactive card
 *
 * Usage:
 *   .audiomack <url>              — download by URL
 *   .audiomack <search query>     — browse Audiomack results
 *
 * Examples:
 *   .audiomack https://audiomack.com/sarz/song/killin-dem
 *   .audiomack Burna Boy
 */

import { cobaltDownload, searchAudiomack } from '../../lib/scrape/mediahub.js';
import { audiomackResultsCard }            from '../../lib/media-hub-cards.js';

const AM_URL_RE = /audiomack\.com\//i;

export default {
  name:        'audiomack',
  aliases:     ['am', 'amack'],
  category:    'media',
  description: 'Download from Audiomack by URL, or search and browse Audiomack tracks',
  usage:       '.audiomack <url or search query>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid  = msg.key.remoteJid;
    const text = args.join(' ').trim();
    const opts = { prefix: settings?.prefix ?? '.', botName: settings?.botName ?? 'Yuzuki MD' };

    if (!text) {
      await reply(
        `🎵  *Audiomack*\n\n` +
        `*Download:*  \`${opts.prefix}audiomack <url>\`\n` +
        `*Search:*    \`${opts.prefix}audiomack <artist or song>\`\n\n` +
        `_Example:_  \`${opts.prefix}audiomack Burna Boy\`\n` +
        `_Example:_  \`${opts.prefix}audiomack https://audiomack.com/artist/song\``,
      );
      return;
    }

    // ── URL mode: download via Cobalt ─────────────────────────────────────────
    if (AM_URL_RE.test(text)) {
      await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } }).catch(() => {});
      try {
        const result = await cobaltDownload(text);

        let downloadUrl;
        if (result.status === 'stream' || result.status === 'redirect' || result.status === 'tunnel') {
          downloadUrl = result.url;
        } else if (result.status === 'picker' && result.picker?.length) {
          // Pick the first audio item from the picker
          const audio = result.picker.find(p => p.type === 'audio') ?? result.picker[0];
          downloadUrl = audio.url;
        } else {
          throw new Error('Unexpected Cobalt response status: ' + result.status);
        }

        await sock.sendMessage(jid, {
          audio:    { url: downloadUrl },
          mimetype: 'audio/mpeg',
          contextInfo: {
            externalAdReply: {
              title:     result.filename ?? 'Audiomack Track',
              body:      'Downloaded from Audiomack',
              mediaType: 1,
            },
          },
        }, { quoted: msg });

        await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
      } catch (e) {
        await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await reply(
          `❌  Audiomack download failed: ${e.message}\n\n` +
          `_Make sure the URL is a valid Audiomack track link._`,
        );
      }
      return;
    }

    // ── Search mode ───────────────────────────────────────────────────────────
    await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } }).catch(() => {});
    try {
      const tracks = await searchAudiomack(text, 10);
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
      await audiomackResultsCard(sock, jid, msg, tracks, text, opts);
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  Audiomack search failed: ${e.message}`);
    }
  },
};
