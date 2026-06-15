/**
 * Plugin: aimemory
 * Category: ai
 *
 * Manage your AI conversation memory.
 * Provides history viewing, clearing, and model preference setting.
 *
 * Commands:
 *   .aiclear              — clear your entire conversation history
 *   .aihistory            — view your recent conversation (last 10 msgs)
 *   .aimodel <model>      — set your preferred AI model
 *   .aimodel              — see your current model
 *
 * Aliases for .aiclear:  .clearchat .resetai .clearhistory
 * Aliases for .aihistory: .chathistory .ailog
 */

import {
  clearHistory, previewHistory, historySize,
  getModel, setModel, listUsers,
} from '../../lib/ai-memory.js';
import { isOwner }    from '../../settings.js';
import { toast, card } from '../../utils/ui.js';

const VALID_MODELS = {
  'openai':        'Llama 3.1 8B (fast)',
  'openai-large':  'Llama 3.3 70B (best quality)',
  'gemini':        'Gemma 2 9B (Google)',
  'mistral':       'Mixtral 8×7B',
};

export default {
  name:        'aimemory',
  aliases:     [
    'aiclear', 'clearchat', 'resetai', 'clearhistory',
    'aihistory', 'chathistory', 'ailog',
    'aimodel', 'setaimodel',
  ],
  category:    'ai',
  description: 'Manage AI conversation memory — clear history, view log, set model',
  usage:       '.aiclear | .aihistory | .aimodel <model>',

  async execute({ sock, msg, reply, sender, args, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';

    // Determine which sub-command was invoked via the matched alias
    const rawCmd  = (
      msg.message?.conversation ??
      msg.message?.extendedTextMessage?.text ?? ''
    ).trim().replace(/^\./, '').split(' ')[0].toLowerCase();

    // ── .aiclear — clear history ────────────────────────────────────────────
    if (['aiclear', 'clearchat', 'resetai', 'clearhistory'].includes(rawCmd)) {
      const before = historySize(sender);
      clearHistory(sender);
      await reply(
        toast('ok', 'Conversation Cleared',
          before ? `${before} messages removed` : 'History was already empty'),
      );
      return;
    }

    // ── .aihistory — view history ───────────────────────────────────────────
    if (['aihistory', 'chathistory', 'ailog'].includes(rawCmd)) {
      const size    = historySize(sender);
      const model   = getModel(sender);
      const preview = previewHistory(sender, 10);

      if (!size) {
        await reply(
          `📜  *AI History*\n${'─'.repeat(22)}\n\n` +
          `_No conversation history yet._\n\n` +
          `Start chatting with \`${prefix}aichat <message>\``,
        );
        return;
      }

      await sock.sendMessage(jid, {
        text:
          `📜  *Your AI Conversation*  _(${size} messages)_\n` +
          `${'─'.repeat(22)}\n\n` +
          preview +
          `\n\n_Model: ${VALID_MODELS[model] ?? model}_\n` +
          `_Use \`${prefix}aiclear\` to reset._`,
      }, { quoted: msg });
      return;
    }

    // ── .aimodel — set/view preferred model ─────────────────────────────────
    if (['aimodel', 'setaimodel'].includes(rawCmd)) {
      const newModel = args[0]?.toLowerCase().trim();
      const current  = getModel(sender);

      if (!newModel) {
        const list = Object.entries(VALID_MODELS)
          .map(([id, name]) => `  ${id === current ? '✅' : '  '}  \`${id}\`  —  ${name}`)
          .join('\n');
        await reply(
          `🤖  *AI Model Selection*\n${'─'.repeat(22)}\n\n` +
          `Current: *${VALID_MODELS[current] ?? current}*\n\n` +
          `Available models:\n${list}\n\n` +
          `_Use \`${prefix}aimodel <id>\` to switch._`,
        );
        return;
      }

      if (!VALID_MODELS[newModel]) {
        const ids = Object.keys(VALID_MODELS).map(id => `\`${id}\``).join('  ');
        await reply(toast('err', 'Unknown Model', `Available: ${ids}`));
        return;
      }

      setModel(sender, newModel);
      await reply(toast('ok', 'AI Model Updated', VALID_MODELS[newModel]));
      return;
    }

    // ── Fallback help ─────────────────────────────────────────────────────
    await reply(
      `🤖  *AI Memory Manager*\n${'─'.repeat(22)}\n\n` +
      `\`${prefix}aiclear\`   — clear your conversation history\n` +
      `\`${prefix}aihistory\` — view your recent messages\n` +
      `\`${prefix}aimodel\`   — set or view your preferred AI model`,
    );
  },
};
