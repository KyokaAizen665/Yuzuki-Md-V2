/**
 * Plugin: chatexai
 * Category: ai
 * Migrated from commands.js case "chatex" / "chatexai"
 *
 * ChatEx AI — conversational AI via scraper (no API key needed).
 * Costs 1 limit credit per query.
 */

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { generateWAMessageFromContent } = _require('socketon');

import { chatex }                              from '../../lib/scrape/chatexai.js';
import { initUserDB, getLimitCost, checkLimit, useLimit } from '../../lib/database.js';
import { isOwner }                             from '../../settings.js';

export default {
  name:        'chatexai',
  aliases:     ['chatex', 'cx'],
  category:    'ai',
  description: 'Chat with ChatEx AI (free)',
  usage:       '.chatexai <message>',
  limit:       1,

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid  = msg.key.remoteJid;
    const text = args.join(' ').trim();
    if (!text) { await reply(`📌 Example: .chatex Hello, how are you?`); return; }

    initUserDB(sender, msg.pushName ?? 'User');
    const cost = getLimitCost('chatex', 1);
    const lim  = checkLimit(sender, isOwner(sender, settings));
    if (lim !== '∞' && lim < cost) {
      await reply(`❌ Not enough limit! Need *${cost}*, you have *${lim}*.`);
      return;
    }

    await sock.sendMessage(jid, { react: { text: '💬', key: msg.key } });
    try {
      const answer   = await chatex(text);
      const fullText = `💬 *ChatEx AI*\n\n*Q:* ${text}\n\n${answer}`;

      const msxCx = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
          message: {
            messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
            interactiveMessage: {
              body:   { text: fullText },
              footer: { text: settings.botName ?? 'Yuzuki MD' },
              nativeFlowMessage: {
                buttons: [{
                  name: 'cta_copy',
                  buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Response', copy_code: answer }),
                }],
              },
            },
          },
        },
      }, { quoted: msg });
      await sock.relayMessage(jid, msxCx.message, { messageId: msxCx.key.id });

      useLimit(sender, cost, isOwner(sender, settings));
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await reply(`❌ ChatEx error: ${e.message}`);
    }
  },
};
