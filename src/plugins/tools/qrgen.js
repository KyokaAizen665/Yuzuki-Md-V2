/**
 * Plugin: qrgen
 * Category: tools
 *
 * Generate a QR code image for any text or URL.
 * Uses api.qrserver.com (free, no key) — returns a PNG.
 *
 * Usage:
 *   .qr <text or URL>
 *   .qr https://example.com
 *   .qr My contact: +1234567890
 */

import { httpGetBuffer }   from '../../lib/utility.js';

export default {
  name:        'qr',
  aliases:     ['qrcode', 'qrgen', 'genqr', 'makeqr'],
  category:    'tools',
  description: 'Generate a QR code image for any text, URL, or contact info',
  usage:       '.qr <text or URL>',

  async execute({ sock, msg, reply, args, settings, prefix }) {
    const jid  = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
      await reply(
        `❌ Usage: \`${prefix}qr <text or URL>\`\n\n` +
        `Examples:\n` +
        `• \`${prefix}qr https://google.com\`\n` +
        `• \`${prefix}qr Hello World\`\n` +
        `• \`${prefix}qr WIFI:T:WPA;S:MyNetwork;P:password;;\``,
      );
      return;
    }

    if (text.length > 2000) {
      await reply(`❌ Text too long. Maximum 2000 characters for QR generation.`);
      return;
    }

    try { await sock.sendPresenceUpdate('composing', jid); } catch {}

    let imageBuffer;
    try {
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=2&ecc=M&data=${encodeURIComponent(text)}`;
      imageBuffer = await httpGetBuffer(url);
    } catch {
      await reply(`❌ QR generation failed. The service may be temporarily unavailable.`);
      return;
    }

    try { await sock.sendPresenceUpdate('paused', jid); } catch {}

    const caption =
      `📱 *QR Code Generated*\n` +
      `${'─'.repeat(22)}\n\n` +
      `📝 Content: _${text.slice(0, 80)}${text.length > 80 ? '…' : ''}_\n\n` +
      `_Scan with any QR reader_`;

    await sock.sendMessage(jid, {
      image:   imageBuffer,
      caption,
      mimetype: 'image/png',
    }, { quoted: msg });
  },
};
