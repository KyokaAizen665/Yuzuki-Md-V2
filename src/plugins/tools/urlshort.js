/**
 * Plugin: urlshort
 * Category: tools
 *
 * Shorten a URL with TinyURL (free, no API key).
 *
 * Usage:
 *   .short <url>
 *   .shorten https://very-long-url.example.com/path?query=value
 */

import { httpGetText }                             from '../../lib/utility.js';
import { sendInteractive, copyButton }             from '../../lib/interactive.js';

function isValidUrl(str) {
  try { new URL(str); return true; } catch { return false; }
}

export default {
  name:        'short',
  aliases:     ['shorten', 'tinyurl', 'shorturl', 'urlshort'],
  category:    'tools',
  description: 'Shorten any URL using TinyURL (free, no key)',
  usage:       '.short <url>',

  async execute({ sock, msg, reply, args, settings, prefix }) {
    const jid = msg.key.remoteJid;
    const raw = args.join('').trim();

    if (!raw) {
      await reply(
        `❌ Usage: \`${prefix}short <url>\`\n\n` +
        `Example:\n\`${prefix}short https://www.example.com/very/long/path\``,
      );
      return;
    }

    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    if (!isValidUrl(url)) {
      await reply(`❌ Invalid URL: \`${raw}\`\nMake sure it starts with http:// or https://`);
      return;
    }

    try { await sock.sendPresenceUpdate('composing', jid); } catch {}

    let short;
    try {
      short = await httpGetText(
        `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
        { timeout: 10000 },
      );
      short = short?.trim();
    } catch {
      await reply(`❌ URL shortener unavailable. Try again later.`);
      return;
    }

    if (!short?.startsWith('http')) {
      await reply(`❌ Failed to shorten URL. The service may have rejected it.`);
      return;
    }

    try { await sock.sendPresenceUpdate('paused', jid); } catch {}

    const display = url.length > 60 ? url.slice(0, 57) + '…' : url;
    const card =
      `🔗 *URL Shortened!*\n${'─'.repeat(22)}\n\n` +
      `📎 *Original:*\n${display}\n\n` +
      `✂️ *Short URL:*\n${short}`;

    await sendInteractive(sock, jid, msg, {
      body:    card,
      footer:  settings?.botName ?? 'Yuzuki MD',
      buttons: [
        copyButton('📋 Copy Short URL', short),
        copyButton('🔗 Copy Original',  url),
      ],
    }, card);
  },
};
