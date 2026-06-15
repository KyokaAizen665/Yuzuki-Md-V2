/**
 * Plugin: grammar
 * Category: ai
 *
 * Correct grammar, spelling, and punctuation errors in text.
 * Optionally shows a diff of changes made.
 *
 * Usage:
 *   .grammar <text>
 *   .grammar --explain <text>   — also explain each correction
 *   Reply to text + .grammar
 */

import { polliTextWith }               from '../../lib/pollinations.js';
import { sendInteractive, copyButton } from '../../lib/interactive.js';

const SYSTEM_BASIC = `You are a professional grammar checker. 
Correct all grammar, spelling, punctuation, and style errors in the provided text.
Return ONLY the corrected text with no additional commentary.`;

const SYSTEM_EXPLAIN = `You are a professional grammar teacher.
Correct all grammar, spelling, punctuation, and style errors in the provided text.
Format your response as:
1. CORRECTED TEXT:
<the fully corrected text>

2. CORRECTIONS MADE:
• [original] → [correction] — brief reason
(List every change made)`;

function getQuotedText(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    ?.conversation
    ?? msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    ?.extendedTextMessage?.text
    ?? null;
}

export default {
  name:        'grammar',
  aliases:     ['gc', 'grammarcheck', 'spellcheck', 'fixtext', 'correct'],
  category:    'ai',
  description: 'Fix grammar, spelling and punctuation errors in any text using AI',
  usage:       '.grammar <text>  or  reply to text + .grammar [--explain]',

  async execute({ sock, msg, reply, args, settings }) {
    const jid     = msg.key.remoteJid;
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';

    const explainIdx = args.indexOf('--explain');
    const explain    = explainIdx !== -1;
    const cleanArgs  = args.filter((_, i) => i !== explainIdx);

    let text = cleanArgs.join(' ').trim();
    if (!text) text = getQuotedText(msg) ?? '';

    if (!text) {
      await reply(
        `✅  *Grammar Check*\n\n` +
        `Usage: \`${prefix}grammar <text>\`\n` +
        `Or reply to any message with \`${prefix}grammar\`\n\n` +
        `Add \`--explain\` to see each correction listed.`,
      );
      return;
    }

    await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});

    try {
      const system   = explain ? SYSTEM_EXPLAIN : SYSTEM_BASIC;
      const result   = await polliTextWith(
        [{ role: 'user', content: text }],
        { system },
      );

      const body =
        `✅  *Grammar Check*\n${'─'.repeat(22)}\n\n` +
        (explain
          ? result
          : `*Original:*\n_${text.slice(0, 200)}${text.length > 200 ? '…' : ''}_\n\n*Corrected:*\n${result}`);

      // For copy button: extract just the corrected text
      const copyText = explain
        ? (result.match(/CORRECTED TEXT:\s*([\s\S]*?)(?:\n\n2\.|$)/)?.[1]?.trim() ?? result)
        : result;

      try {
        await sendInteractive(sock, jid, msg, {
          body,
          footer:  botName,
          buttons: [copyButton('📋 Copy Corrected', copyText)],
        });
      } catch {
        await sock.sendMessage(jid, { text: body }, { quoted: msg });
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  Grammar check failed: ${e.message}`);
    }
  },
};
