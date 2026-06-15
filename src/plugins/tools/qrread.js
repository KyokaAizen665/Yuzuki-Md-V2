/**
 * Plugin: qrread
 * Category: tools
 *
 * Decode a QR code from a quoted image message.
 * Uses api.qrserver.com (free, no key).
 *
 * Usage:
 *   Quote an image + .readqr
 *   Quote an image + .scanqr
 */

import { createRequire }  from 'module';
const _require = createRequire(import.meta.url);
const { downloadMediaMessage } = _require('socketon');

import { sendInteractive, copyButton } from '../../lib/interactive.js';

export default {
  name:        'readqr',
  aliases:     ['scanqr', 'decodeqr', 'qrscan', 'qrdecode'],
  category:    'tools',
  description: 'Decode a QR code from a quoted image',
  usage:       '.readqr  (quote an image first)',

  async execute({ sock, msg, reply, settings, prefix }) {
    const jid = msg.key.remoteJid;

    // ── Find the image ────────────────────────────────────────────────────────
    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quoted  = ctxInfo?.quotedMessage;

    const hasQuotedImg = !!(quoted?.imageMessage);
    const hasDirImg    = !!(msg.message?.imageMessage);

    if (!hasQuotedImg && !hasDirImg) {
      await reply(
        `❌ No image found.\n\n` +
        `📌 *How to use:*\n` +
        `1. Send or forward a QR code image\n` +
        `2. Quote that image and reply with \`${prefix}readqr\``,
      );
      return;
    }

    try { await sock.sendPresenceUpdate('composing', jid); } catch {}

    // ── Download image ────────────────────────────────────────────────────────
    let buffer;
    try {
      let targetMsg;
      if (hasQuotedImg) {
        targetMsg = {
          key: {
            remoteJid:   jid,
            id:          ctxInfo.stanzaId,
            fromMe:      ctxInfo.fromMe ?? false,
            participant: ctxInfo.participant,
          },
          message: quoted,
        };
      } else {
        targetMsg = msg;
      }
      buffer = await downloadMediaMessage(targetMsg, 'buffer', {});
    } catch {
      await reply(`❌ Failed to download the image. Please try again.`);
      return;
    }

    // ── Decode via qrserver.com ───────────────────────────────────────────────
    let decoded;
    try {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: 'image/jpeg' }), 'qr.jpg');

      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 15000);

      const res = await fetch('https://api.qrserver.com/v1/read-qr-code/', {
        method: 'POST',
        body:   form,
        signal: ctrl.signal,
      });
      clearTimeout(tid);

      const data  = await res.json();
      const symbol = data?.[0]?.symbol?.[0];

      if (symbol?.error || !symbol?.data) {
        await reply(`❌ No QR code detected in the image.\nMake sure the image is clear and the QR code is visible.`);
        return;
      }
      decoded = symbol.data;
    } catch {
      await reply(`❌ QR decode service unavailable. Try again later.`);
      return;
    }

    try { await sock.sendPresenceUpdate('paused', jid); } catch {}

    // ── Detect type ───────────────────────────────────────────────────────────
    let typeLabel = '📄 Text';
    if (/^https?:\/\//i.test(decoded))                     typeLabel = '🔗 URL';
    else if (/^WIFI:/i.test(decoded))                       typeLabel = '📶 Wi-Fi';
    else if (/^BEGIN:VCARD/i.test(decoded))                 typeLabel = '👤 Contact (vCard)';
    else if (/^tel:/i.test(decoded) || /^\+?\d{7,}$/.test(decoded)) typeLabel = '📞 Phone number';
    else if (/^mailto:/i.test(decoded))                     typeLabel = '📧 Email';
    else if (/^smsto:/i.test(decoded) || /^sms:/i.test(decoded))    typeLabel = '💬 SMS';

    const card =
      `📷 *QR Code Decoded*\n${'─'.repeat(22)}\n\n` +
      `🏷️ *Type:* ${typeLabel}\n\n` +
      `📝 *Content:*\n${decoded}`;

    await sendInteractive(sock, jid, msg, {
      body:    card,
      footer:  settings?.botName ?? 'Yuzuki MD',
      buttons: [copyButton('📋 Copy Content', decoded)],
    }, card);
  },
};
