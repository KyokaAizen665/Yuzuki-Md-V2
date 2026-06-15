/**
 * Plugin: claude
 * Category: ai
 *
 * Uses Pollinations.AI "openai-large" model (free, no API key).
 * Response is delivered in an interactive copy-button card.
 */

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { generateWAMessageFromContent } = _require('socketon');

import { polliText } from '../../lib/pollinations.js';

export default {
  name:        'claude',
  aliases:     ['claude3', 'sonnet'],
  category:    'ai',
  description: 'Chat with a large AI model via Pollinations.AI (free, no key needed)',
  usage:       '.claude <message>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid  = msg.key.remoteJid;
    const text = args.join(' ').trim();
    if (!text) { await reply(`Usage: .claude <message>`); return; }

    await sock.sendMessage(jid, { react: { text: '🧠', key: msg.key } }).catch(() => {});

    try {
      const res  = await polliText([{ role: 'user', content: text }], 'openai-large');
      const msgx = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
          message: {
            messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
            interactiveMessage: {
              body:   { text: `🧠 *Claude:*\n${res}` },
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
      await reply(`❌ Claude: ${e.message}`);
    }
  },
};
