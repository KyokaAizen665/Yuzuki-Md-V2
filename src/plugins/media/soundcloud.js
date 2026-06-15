/**
 * Plugin: soundcloud
 * Category: media
 *
 * Download a track from SoundCloud by URL.
 * Uses Cobalt.tools as the download backend — free, no API key required.
 *
 * Usage:
 *   .soundcloud <soundcloud track url>
 *
 * Examples:
 *   .soundcloud https://soundcloud.com/artist/track-name
 */

import { cobaltDownload } from '../../lib/scrape/mediahub.js';

const SC_URL_RE = /soundcloud\.com\//i;

export default {
  name:        'soundcloud',
  aliases:     ['sc', 'scloud', 'scdl'],
  category:    'media',
  description: 'Download any SoundCloud track as audio by URL',
  usage:       '.soundcloud <soundcloud url>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid  = msg.key.remoteJid;
    const url  = args[0]?.trim();
    const opts = { prefix: settings?.prefix ?? '.', botName: settings?.botName ?? 'Yuzuki MD' };

    if (!url) {
      await reply(
        `🎵  *SoundCloud Downloader*\n\n` +
        `Usage: \`${opts.prefix}soundcloud <url>\`\n\n` +
        `_Example:_\n` +
        `\`${opts.prefix}soundcloud https://soundcloud.com/artist/track\`\n\n` +
        `_Paste the full SoundCloud track URL._`,
      );
      return;
    }

    if (!SC_URL_RE.test(url)) {
      await reply(
        `❌  That doesn't look like a SoundCloud URL.\n\n` +
        `URLs should start with: \`https://soundcloud.com/...\``,
      );
      return;
    }

    await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } }).catch(() => {});

    try {
      const result = await cobaltDownload(url);

      let downloadUrl;
      let filename = 'SoundCloud Track';

      if (result.status === 'stream' || result.status === 'redirect' || result.status === 'tunnel') {
        downloadUrl = result.url;
        filename    = result.filename ?? filename;
      } else if (result.status === 'picker' && result.picker?.length) {
        const audio = result.picker.find(p => p.type === 'audio') ?? result.picker[0];
        downloadUrl = audio.url;
      } else {
        throw new Error('Unexpected response from downloader: ' + result.status);
      }

      await sock.sendMessage(jid, {
        audio:    { url: downloadUrl },
        mimetype: 'audio/mpeg',
        contextInfo: {
          externalAdReply: {
            title:      filename,
            body:       'Downloaded from SoundCloud',
            sourceUrl:  url,
            mediaType:  1,
          },
        },
      }, { quoted: msg });

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(
        `❌  SoundCloud download failed: ${e.message}\n\n` +
        `Make sure the URL is a public SoundCloud track (not private/deleted).`,
      );
    }
  },
};
