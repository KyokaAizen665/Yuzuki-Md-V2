/**
 * Plugin: feloai
 * Category: ai
 * Migrated from commands.js case "felo" / "feloai"
 *
 * Felo AI — web-search-augmented AI (no API key needed via scraper).
 * Costs 2 limit credits per query.
 */

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { generateWAMessageFromContent } = _require('socketon');

import { FeloClient }                          from '../../lib/scrape/feloai.js';
import { initUserDB, getLimitCost, checkLimit, useLimit } from '../../lib/database.js';
import { isOwner }                             from '../../settings.js';

export default {
  name:        'feloai',
  aliases:     ['felo', 'felosearch'],
  category:    'ai',
  description: 'AI-powered web search via Felo AI (free)',
  usage:       '.feloai <question>',
  limit:       2,

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid  = msg.key.remoteJid;
    const text = args.join(' ').trim();
    if (!text) { await reply(`📌 Example: .feloai What is the latest AI news?`); return; }

    initUserDB(sender, msg.pushName ?? 'User');
    const cost = getLimitCost('felo', 2);
    const lim  = checkLimit(sender, isOwner(sender, settings));
    if (lim !== '∞' && lim < cost) {
      await reply(`❌ Not enough limit! Need *${cost}*, you have *${lim}*.`);
      return;
    }

    await sock.sendMessage(jid, { react: { text: '🌐', key: msg.key } });
    try {
      const client     = new FeloClient();
      const answer     = await client.search(text);
      const answerText = typeof answer === 'string' ? answer : JSON.stringify(answer, null, 2);
      const fullText   = `🌐 *Felo AI Search*\n\n*Q:* ${text}\n\n${answerText}`;

      const msxFelo = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
          message: {
            messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
            interactiveMessage: {
              body:   { text: fullText },
              footer: { text: settings.botName ?? 'Yuzuki MD' },
              nativeFlowMessage: {
                buttons: [{
                  name: 'cta_copy',
                  buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Answer', copy_code: answerText }),
                }],
              },
            },
          },
        },
      }, { quoted: msg });
      await sock.relayMessage(jid, msxFelo.message, { messageId: msxFelo.key.id });

      useLimit(sender, cost, isOwner(sender, settings));
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await reply(`❌ Felo AI error: ${e.message}`);
    }
  },
};
