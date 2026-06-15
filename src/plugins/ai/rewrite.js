/**
 * Plugin: rewrite
 * Category: ai
 *
 * Rewrite text to improve clarity, tone, or style using AI.
 * Supports multiple rewrite modes via flags.
 *
 * Usage:
 *   .rewrite <text>                — professional rewrite (default)
 *   .rewrite --casual <text>       — casual / conversational
 *   .rewrite --formal <text>       — formal / academic
 *   .rewrite --simple <text>       — simpler language
 *   .rewrite --creative <text>     — creative / expressive
 *   Reply to text + .rewrite [--mode]
 */

import { polliTextWith }               from '../../lib/pollinations.js';
import { sendInteractive, copyButton } from '../../lib/interactive.js';

const MODES = {
  professional: {
    flag:   '--professional',
    label:  'Professional',
    system: `Rewrite the provided text to be clear, professional, and polished. 
Maintain the original meaning. Return only the rewritten text.`,
  },
  casual: {
    flag:   '--casual',
    label:  'Casual',
    system: `Rewrite the provided text to sound natural, friendly, and conversational. 
Keep it easy to read. Return only the rewritten text.`,
  },
  formal: {
    flag:   '--formal',
    label:  'Formal',
    system: `Rewrite the provided text in formal, academic language. 
Use proper structure and avoid contractions. Return only the rewritten text.`,
  },
  simple: {
    flag:   '--simple',
    label:  'Simple',
    system: `Rewrite the provided text using simple, easy-to-understand language. 
Aim for a 6th-grade reading level. Return only the rewritten text.`,
  },
  creative: {
    flag:   '--creative',
    label:  'Creative',
    system: `Rewrite the provided text in a creative, vivid, and engaging way. 
Add imagery and expression while preserving the core meaning. Return only the rewritten text.`,
  },
};

function parseMode(args) {
  for (const [key, m] of Object.entries(MODES)) {
    const idx = args.indexOf(m.flag);
    if (idx !== -1) {
      return { mode: key, cleaned: args.filter((_, i) => i !== idx) };
    }
  }
  return { mode: 'professional', cleaned: args };
}

function getQuotedText(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    ?.conversation
    ?? msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    ?.extendedTextMessage?.text
    ?? null;
}

export default {
  name:        'rewrite',
  aliases:     ['rw', 'paraphrase', 'rephrase', 'improve'],
  category:    'ai',
  description: 'Rewrite text with AI — professional, casual, formal, simple, or creative modes',
  usage:       '.rewrite [--mode] <text>  or  reply to text + .rewrite [--mode]',

  async execute({ sock, msg, reply, args, settings }) {
    const jid     = msg.key.remoteJid;
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';

    const { mode, cleaned } = parseMode(args);
    let text = cleaned.join(' ').trim();
    if (!text) text = getQuotedText(msg) ?? '';

    if (!text) {
      const modeList = Object.values(MODES).map(m => `\`${m.flag}\``).join('  ');
      await reply(
        `✍️  *Text Rewriter*\n\n` +
        `Usage: \`${prefix}rewrite <text>\`\n\n` +
        `Modes: ${modeList}\n\n` +
        `_Example:_ \`${prefix}rewrite --formal Please help me out\``,
      );
      return;
    }

    await sock.sendMessage(jid, { react: { text: '✍️', key: msg.key } }).catch(() => {});

    try {
      const m       = MODES[mode];
      const rewrite = await polliTextWith(
        [{ role: 'user', content: text }],
        { system: m.system },
      );

      const body =
        `✍️  *Rewrite — ${m.label}*\n${'─'.repeat(22)}\n\n` +
        `*Original:*\n_${text.slice(0, 200)}${text.length > 200 ? '…' : ''}_\n\n` +
        `*Rewritten:*\n${rewrite}`;

      try {
        await sendInteractive(sock, jid, msg, {
          body,
          footer:  botName,
          buttons: [copyButton('📋 Copy Rewrite', rewrite)],
        });
      } catch {
        await sock.sendMessage(jid, { text: body }, { quoted: msg });
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  Rewrite failed: ${e.message}`);
    }
  },
};
