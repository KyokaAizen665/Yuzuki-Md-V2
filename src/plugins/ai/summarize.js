/**
 * Plugin: summarize
 * Category: ai
 *
 * Summarize long text into key points using AI.
 * Works on typed text or quoted messages.
 *
 * Usage:
 *   .summarize <long text>
 *   Reply to any message + .summarize
 *   .sum <text>
 */

import { polliTextWith }                      from '../../lib/pollinations.js';
import { sendInteractive, copyButton }        from '../../lib/interactive.js';

const SYSTEM = `You are a professional summarizer. 
Produce a concise, structured summary of the provided text.
Format your output as:
• A 1-2 sentence TL;DR at the top
• Then 3-7 key bullet points
Keep it clear, accurate, and free of unnecessary padding.`;

function getQuotedText(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    ?.conversation
    ?? msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    ?.extendedTextMessage?.text
    ?? null;
}

export default {
  name:        'summarize',
  aliases:     ['sum', 'summary', 'tldr', 'brief'],
  category:    'ai',
  description: 'Summarize any text into key points using AI',
  usage:       '.summarize <text>  or  reply to text + .summarize',

  async execute({ sock, msg, reply, args, settings }) {
    const jid     = msg.key.remoteJid;
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';

    let text = args.join(' ').trim();
    if (!text) text = getQuotedText(msg) ?? '';

    if (!text) {
      await reply(
        `📝  *Summarizer*\n\n` +
        `Usage: \`${prefix}summarize <text>\`\n` +
        `Or reply to any message with \`${prefix}summarize\``,
      );
      return;
    }

    if (text.length < 60) {
      await reply(`❌  Text is too short to summarize (min 60 characters).`);
      return;
    }

    await sock.sendMessage(jid, { react: { text: '📝', key: msg.key } }).catch(() => {});

    try {
      const summary = await polliTextWith(
        [{ role: 'user', content: `Summarize this:\n\n${text}` }],
        { system: SYSTEM },
      );

      const body = `📝  *Summary*\n${'─'.repeat(22)}\n\n${summary}`;

      try {
        await sendInteractive(sock, jid, msg, {
          body,
          footer:  botName,
          buttons: [copyButton('📋 Copy Summary', summary)],
        });
      } catch {
        await sock.sendMessage(jid, { text: body }, { quoted: msg });
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  Summarize failed: ${e.message}`);
    }
  },
};
