/**
 * Plugin: code
 * Category: ai
 *
 * AI coding assistant — write, debug, explain, or review code.
 * Powered by Pollinations.AI (GPT-4o class, free, no key).
 *
 * Usage:
 *   .code <description>             — write code
 *   .code --debug <code snippet>    — find and fix bugs
 *   .code --review <code>           — code review with suggestions
 *   .code --explain <code>          — explain what code does
 *   Reply to code + .code [--debug|--review|--explain]
 *
 * The bot auto-detects language when possible.
 */

import { polliTextWith }               from '../../lib/pollinations.js';
import { sendInteractive, copyButton } from '../../lib/interactive.js';

const MODES = {
  write: {
    flag:   null,
    label:  'Write Code',
    system: `You are an expert programmer and software engineer.
Write clean, efficient, well-commented code based on the user's description.
Always:
• Include language syntax highlighting markers (e.g. \`\`\`python)
• Add inline comments for clarity
• Briefly explain what the code does after the code block`,
  },
  debug: {
    flag:   '--debug',
    label:  'Debug',
    system: `You are an expert debugger.
Analyze the provided code, identify all bugs, errors, and issues.
Format your response as:
1. List of bugs found (with line references if possible)
2. Fixed code (full, corrected version in a code block)
3. Brief explanation of what was wrong`,
  },
  review: {
    flag:   '--review',
    label:  'Code Review',
    system: `You are a senior software engineer performing a code review.
Analyze the code for:
• Correctness and logic errors
• Performance and efficiency
• Security vulnerabilities
• Best practices and style
• Suggestions for improvement
Be specific and actionable.`,
  },
  explain: {
    flag:   '--explain',
    label:  'Explain',
    system: `You are a programming teacher.
Explain the provided code step-by-step in plain language.
• Describe what each section does
• Explain the logic and algorithms used
• Point out any important patterns or techniques
• Keep it clear for someone learning to code`,
  },
};

function parseMode(args) {
  for (const [key, m] of Object.entries(MODES)) {
    if (!m.flag) continue;
    const idx = args.indexOf(m.flag);
    if (idx !== -1) {
      return { mode: key, cleaned: args.filter((_, i) => i !== idx) };
    }
  }
  return { mode: 'write', cleaned: args };
}

function getQuotedText(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    ?.conversation
    ?? msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    ?.extendedTextMessage?.text
    ?? null;
}

export default {
  name:        'code',
  aliases:     ['coding', 'dev', 'program', 'script', 'codeai'],
  category:    'ai',
  description: 'AI coding assistant — write, debug, review, or explain code',
  usage:       '.code <description>  or  .code --debug|--review|--explain <code>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid     = msg.key.remoteJid;
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';

    const { mode, cleaned } = parseMode(args);
    let text = cleaned.join(' ').trim();
    if (!text) text = getQuotedText(msg) ?? '';

    if (!text) {
      await reply(
        `💻  *AI Coding Assistant*\n\n` +
        `*Write:*   \`${prefix}code <description>\`\n` +
        `*Debug:*   \`${prefix}code --debug <code>\`\n` +
        `*Review:*  \`${prefix}code --review <code>\`\n` +
        `*Explain:* \`${prefix}code --explain <code>\`\n\n` +
        `Or reply to any code message with \`${prefix}code [--mode]\``,
      );
      return;
    }

    await sock.sendMessage(jid, { react: { text: '💻', key: msg.key } }).catch(() => {});

    try {
      const m      = MODES[mode];
      const result = await polliTextWith(
        [{ role: 'user', content: text }],
        { system: m.system, model: 'openai-large' },
      );

      const body = `💻  *${m.label}*\n${'─'.repeat(22)}\n\n${result}`;

      try {
        await sendInteractive(sock, jid, msg, {
          body,
          footer:  botName,
          buttons: [copyButton('📋 Copy Code', result)],
        });
      } catch {
        await sock.sendMessage(jid, { text: body }, { quoted: msg });
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  Coding assistant failed: ${e.message}`);
    }
  },
};
