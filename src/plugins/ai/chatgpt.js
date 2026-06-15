/**
 * Plugin: chatgpt
 * Category: ai
 *
 * Uses Pollinations.AI (free, no API key) with the openai model.
 * Response is delivered in an interactive copy-button card.
 */

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { generateWAMessageFromContent } = _require('socketon');

import { polliText } from '../../lib/pollinations.js';

export default {
  name:        'chatgpt',
  aliases:     ['gpt', 'ai', 'ask'],
  category:    'ai',
  description: 'Chat with GPT-class AI via Pollinations.AI (free, no key needed)',
  usage:       '.chatgpt <message>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid  = msg.key.remoteJid;
    const text = args.join(' ').trim();
    if (!text) { await reply(`Usage: .chatgpt <message>`); return; }

    await sock.sendMessage(jid, { react: { text: '🤖', key: msg.key } }).catch(() => {});

    try {
      const res  = await polliText([{ role: 'user', content: text }], 'openai');
      const msgx = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
          message: {
            messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
            interactiveMessage: {
              body:   { text: `🤖 *ChatGPT:*\n${res}` },
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
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌ ChatGPT: ${e.message}`);
    }
  },
};
