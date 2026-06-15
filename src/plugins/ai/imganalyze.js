/**
 * Plugin: imganalyze
 * Category: ai
 *
 * Analyze an image using Pollinations.AI multimodal vision.
 * Reply to any image message and ask a question about it,
 * or send a custom prompt. Falls back to "Describe this image"
 * if no custom prompt is provided.
 *
 * Usage:
 *   Reply to an image + .analyze              — full description
 *   Reply to an image + .analyze what is this? — custom question
 *   Reply to an image + .ocr                  — extract text from image
 *
 * Aliases:
 *   .analyze .imgai .vision .describe .ocr (ocr preset)
 */

import { createRequire }      from 'module';
const _require = createRequire(import.meta.url);
const { downloadMediaMessage } = _require('socketon');

import { polliVision }        from '../../lib/pollinations.js';
import { sendInteractive, copyButton } from '../../lib/interactive.js';

const OCR_ALIASES = new Set(['ocr', 'readtext', 'extracttext']);

/** Extract the image message from current msg or quoted message. */
function resolveImageMsg(msg) {
  // Current message is an image
  if (msg.message?.imageMessage) return msg;
  // Quoted message is an image
  const ctx    = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (quoted?.imageMessage) {
    return {
      key: { remoteJid: msg.key.remoteJid, id: ctx.stanzaId, fromMe: ctx.participant === msg.key.remoteJid },
      message: quoted,
    };
  }
  // ViewOnce image
  if (msg.message?.viewOnceMessage?.message?.imageMessage) return msg;
  return null;
}

export default {
  name:        'imganalyze',
  aliases:     ['analyze', 'analyzeimg', 'imgai', 'vision', 'describe', 'ocr', 'readtext'],
  category:    'ai',
  description: 'Analyze or describe an image with AI vision — reply to any image',
  usage:       '.analyze [custom question]  (reply to an image)',

  async execute({ sock, msg, reply, args, settings }) {
    const jid      = msg.key.remoteJid;
    const cmdName  = msg.message?.extendedTextMessage?.text?.trim().split(' ')[0]?.replace(/^\./, '') ?? 'analyze';
    const prefix   = settings?.prefix  ?? '.';
    const botName  = settings?.botName ?? 'Yuzuki MD';

    // OCR preset
    const isOcr   = OCR_ALIASES.has(cmdName.toLowerCase());
    const customQ  = args.join(' ').trim();
    const prompt   = isOcr
      ? 'Extract all text visible in this image exactly as written. Format it clearly.'
      : (customQ || 'Describe this image in detail. Include objects, colors, mood, and any text visible.');

    const targetMsg = resolveImageMsg(msg);
    if (!targetMsg) {
      await reply(
        `🔍  *Image Analysis*\n\n` +
        `Reply to an image with \`${prefix}analyze\` to analyze it.\n\n` +
        `_Examples:_\n` +
        `• Reply to photo + \`${prefix}analyze\`\n` +
        `• Reply to photo + \`${prefix}analyze what breed is this dog?\`\n` +
        `• Reply to screenshot + \`${prefix}ocr\` to extract text`,
      );
      return;
    }

    await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } }).catch(() => {});

    try {
      const buf      = await downloadMediaMessage(targetMsg, 'buffer', {});
      const analysis = await polliVision(buf, prompt);

      const label = isOcr ? '📝  *OCR Result*' : '🔍  *Image Analysis*';
      const body  = `${label}\n${'─'.repeat(22)}\n\n${analysis}`;

      try {
        await sendInteractive(sock, jid, msg, {
          body,
          footer:  botName,
          buttons: [copyButton('📋 Copy Result', analysis)],
        });
      } catch {
        await sock.sendMessage(jid, { text: body }, { quoted: msg });
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(
        `❌  Could not analyze image: ${e.message}\n\n` +
        `_Make sure you're replying directly to an image message._`,
      );
    }
  },
};
