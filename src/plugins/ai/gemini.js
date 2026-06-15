/**
 * Plugin: gemini
 * Category: ai
 * Migrated from commands.js case "gemini"
 *
 * Uses Pollinations.AI "gemini" model (free, no API key).
 * Response is delivered in an interactive copy-button card.
 */

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { generateWAMessageFromContent } = _require('socketon');

import { polliText } from '../../lib/pollinations.js';

export default {
  name:        'gemini',
  aliases:     ['google', 'bard'],
  category:    'ai',
  description: 'Chat with Gemini (via Pollinations.AI)',
  usage:       '.gemini <message>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid  = msg.key.remoteJid;
    const text = args.join(' ').trim();
    if (!text) { await reply(`Usage: .gemini <message>`); return; }

    try {
      const res  = await polliText([{ role: 'user', content: text }], 'gemini');
      const msgx = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
          message: {
            messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
            interactiveMessage: {
              body:   { text: `✨ *Gemini:*\n${res}` },
              footer: { text: settings.botName ?? 'Yuzuki MD' },
              nativeFlowMessage: {
                buttons: [{
                  name: 'cta_copy',
                  buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Response', copy_code: res }),
                }],
              },
            },
          },
        },
      }, { quoted: msg });
      await sock.relayMessage(jid, msgx.message, { messageId: msgx.key.id });
    } catch (e) {
      await reply(`❌ Gemini: ${e.message}`);
    }
  },
};
