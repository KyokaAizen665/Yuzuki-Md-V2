/**
 * Plugin: aichat
 * Category: ai
 *
 * Multi-turn AI chat with persistent per-user conversation memory.
 * Each user maintains their own conversation thread across any chat.
 * History is saved to disk and survives bot restarts.
 *
 * Usage:
 *   .aichat <message>            — chat (remembers context)
 *   .chat <message>              — alias
 *   .aichat --gpt <message>      — use ChatGPT model (default)
 *   .aichat --gemini <message>   — use Gemini model
 *   .aichat --large <message>    — use larger GPT model
 *
 * Memory management:
 *   .aiclear                     — clear your conversation history
 *   .aihistory                   — view your recent conversation
 *   .aimodel <model>             — set your preferred model
 *
 * Note: History is per-sender (not per-chat), max 20 messages.
 */

import { polliText }                   from '../../lib/pollinations.js';
import { sendInteractive, copyButton } from '../../lib/interactive.js';
import {
  getHistory, addMessage, historySize, getModel,
} from '../../lib/ai-memory.js';

const MODEL_FLAGS = {
  '--gpt':    'openai',
  '--gemini': 'gemini',
  '--large':  'openai-large',
  '--mistral':'mistral',
};

const MODEL_LABELS = {
  'openai':       'Llama 3.1 8B',
  'gemini':       'Gemma 2 9B',
  'openai-large': 'Llama 3.3 70B',
  'mistral':      'Mixtral 8×7B',
};

const SYSTEM_PROMPT = `You are Yuzuki, a helpful, friendly, and knowledgeable AI assistant on WhatsApp.
You have a great personality — you're helpful, witty when appropriate, and concise.
Keep responses focused and avoid unnecessary padding. Format with WhatsApp markdown:
*bold* for key terms, _italic_ for emphasis, \`mono\` for code.`;

export default {
  name:        'aichat',
  aliases:     ['chat', 'yuzuki', 'aiask', 'c'],
  category:    'ai',
  description: 'Multi-turn AI chat with memory — context is saved across messages',
  usage:       '.aichat <message> [--gpt|--gemini|--large]',

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid     = msg.key.remoteJid;
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';

    // Parse model flag
    let model    = null;
    const cleanArgs = args.filter(a => {
      const m = MODEL_FLAGS[a.toLowerCase()];
      if (m) { model = m; return false; }
      return true;
    });

    const text = cleanArgs.join(' ').trim();

    if (!text) {
      const size  = historySize(sender);
      const pref  = getModel(sender);
      const label = MODEL_LABELS[pref] ?? pref;
      await reply(
        `🤖  *AI Chat (with Memory)*\n\n` +
        `Usage: \`${prefix}aichat <message>\`\n\n` +
        `Models: \`--gpt\` (default)  \`--gemini\`  \`--large\`  \`--mistral\`\n\n` +
        `Your current session:\n` +
        `• Model: *${label}*\n` +
        `• Messages stored: *${size}*\n\n` +
        `_Use \`${prefix}aiclear\` to start fresh._`,
      );
      return;
    }

    // Resolve model: flag > user preference > 'openai'
    const activeModel = model ?? getModel(sender);

    await sock.sendMessage(jid, { react: { text: '🤔', key: msg.key } }).catch(() => {});

    try {
      // Build full conversation for the API
      const history = getHistory(sender);
      const messages = [
        { role: 'system',    content: SYSTEM_PROMPT },
        ...history,
        { role: 'user',      content: text },
      ];

      const response = await polliText(messages, activeModel);

      // Persist both turns
      addMessage(sender, 'user',      text);
      addMessage(sender, 'assistant', response);

      const label = MODEL_LABELS[activeModel] ?? activeModel;
      const size  = historySize(sender);
      const body  =
        `🤖  *${label}*  _(${size} msgs)_\n${'─'.repeat(22)}\n\n${response}`;

      try {
        await sendInteractive(sock, jid, msg, {
          body,
          footer:  botName,
          buttons: [copyButton('📋 Copy Response', response)],
        });
      } catch {
        await sock.sendMessage(jid, { text: body }, { quoted: msg });
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  AI Chat failed: ${e.message}`);
    }
  },
};
