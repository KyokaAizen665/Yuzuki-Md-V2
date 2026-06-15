/**
 * Plugin: explain
 * Category: ai
 *
 * Explain any topic, word, concept, or quoted text in plain language.
 * Supports multiple explanation levels.
 *
 * Usage:
 *   .explain <topic or question>
 *   .explain --eli5 <topic>         — explain like I'm 5
 *   .explain --deep <topic>         — in-depth technical explanation
 *   .explain --quick <topic>        — one-paragraph quick answer
 *   Reply to any message + .explain — explain what the message means
 */

import { polliTextWith }               from '../../lib/pollinations.js';
import { sendInteractive, copyButton } from '../../lib/interactive.js';

const LEVELS = {
  normal: {
    flag:   null,
    label:  'Explain',
    system: `You are a knowledgeable and clear teacher. 
Explain the provided topic in plain, accessible language. 
Structure your answer with:
• A clear 1-sentence definition
• Main points or how it works
• A real-world example or analogy
Keep it informative but easy to understand.`,
  },
  eli5: {
    flag:   '--eli5',
    label:  'ELI5',
    system: `Explain this topic as if you're talking to a 5-year-old child.
Use very simple words, fun analogies, and no technical jargon. 
Make it engaging and easy to visualize.`,
  },
  deep: {
    flag:   '--deep',
    label:  'Deep Dive',
    system: `You are an expert. Give a thorough, in-depth technical explanation of this topic.
Cover: definition, history (if relevant), how it works in detail, use cases, 
pros/cons, and related concepts. Be comprehensive.`,
  },
  quick: {
    flag:   '--quick',
    label:  'Quick Answer',
    system: `Give a concise, 1-3 sentence explanation of this topic. 
Be direct and accurate. No padding.`,
  },
};

function parseLevel(args) {
  for (const [key, l] of Object.entries(LEVELS)) {
    if (!l.flag) continue;
    const idx = args.indexOf(l.flag);
    if (idx !== -1) {
      return { level: key, cleaned: args.filter((_, i) => i !== idx) };
    }
  }
  return { level: 'normal', cleaned: args };
}

function getQuotedText(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    ?.conversation
    ?? msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    ?.extendedTextMessage?.text
    ?? null;
}

export default {
  name:        'explain',
  aliases:     ['wtf', 'whatis', 'define', 'howdoes', 'eli5'],
  category:    'ai',
  description: 'Explain any topic clearly — normal, ELI5, deep dive, or quick answer modes',
  usage:       '.explain [--eli5|--deep|--quick] <topic>  or  reply to text + .explain',

  async execute({ sock, msg, reply, args, settings }) {
    const jid     = msg.key.remoteJid;
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';

    // Check for eli5 alias invocation
    const cmdText = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? '';
    const usedEli5 = cmdText.trim().startsWith(`${prefix}eli5`);

    let { level, cleaned } = parseLevel(args);
    if (usedEli5 && level === 'normal') level = 'eli5';

    let text = cleaned.join(' ').trim();
    if (!text) text = getQuotedText(msg) ?? '';

    if (!text) {
      await reply(
        `💡  *Explain Mode*\n\n` +
        `Usage: \`${prefix}explain <topic>\`\n\n` +
        `Levels:\n` +
        `• \`${prefix}explain --eli5\`  — Explain Like I'm 5\n` +
        `• \`${prefix}explain --deep\`  — In-depth technical\n` +
        `• \`${prefix}explain --quick\` — One paragraph\n\n` +
        `Or reply to any message with \`${prefix}explain\``,
      );
      return;
    }

    await sock.sendMessage(jid, { react: { text: '💡', key: msg.key } }).catch(() => {});

    try {
      const l      = LEVELS[level];
      const result = await polliTextWith(
        [{ role: 'user', content: `Explain: ${text}` }],
        { system: l.system },
      );

      const icon = level === 'eli5' ? '🧒' : level === 'deep' ? '🔬' : level === 'quick' ? '⚡' : '💡';
      const body = `${icon}  *${l.label}*\n${'─'.repeat(22)}\n\n*Topic:* _${text.slice(0, 80)}_\n\n${result}`;

      try {
        await sendInteractive(sock, jid, msg, {
          body,
          footer:  botName,
          buttons: [copyButton('📋 Copy Explanation', result)],
        });
      } catch {
        await sock.sendMessage(jid, { text: body }, { quoted: msg });
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  Explain failed: ${e.message}`);
    }
  },
};
