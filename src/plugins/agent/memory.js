/**
 * Plugin: memory
 * Category: agent
 *
 * Inspect or clear the agent's session memory for this chat.
 * Memory stores intermediate values between agent job steps
 * and conversation history.
 *
 * Usage:
 *   .memory         — show all memory keys + recent history
 *   .memory clear   — wipe all memory for this chat
 */

import { sessionMemory } from '../../agent/index.js';

export default {
  name:        'memory',
  aliases:     ['mem', 'context'],
  category:    'agent',
  description: "Inspect or clear the agent's session memory for this chat",
  usage:       '.memory [clear]',

  async execute({ msg, args, reply }) {
    const jid = msg.key.remoteJid;

    if ((args[0] ?? '').toLowerCase() === 'clear') {
      sessionMemory.clear(jid);
      await reply(`🗑️ Session memory cleared for this chat.`);
      return;
    }

    const keys    = sessionMemory.keys(jid);
    const history = sessionMemory.getHistory(jid);

    const lines = [
      `🧠 *Agent Memory — ${jid.split('@')[0]}*`,
      `━━━━━━━━━━━━━━━━━━━━`,
    ];

    if (!keys.length && !history.length) {
      lines.push(`_No memory stored for this chat yet._`);
    } else {
      if (keys.length) {
        lines.push(`*Variables (${keys.length}):*`);
        for (const k of keys) {
          const v = sessionMemory.get(jid, k);
          const preview = typeof v === 'object'
            ? JSON.stringify(v).slice(0, 60)
            : String(v).slice(0, 60);
          lines.push(`  • \`${k}\`: ${preview}`);
        }
      }
      if (history.length) {
        lines.push(``, `*Recent history (${history.length} entries):*`);
        history.slice(-5).forEach((h, i) => {
          const age = Math.round((Date.now() - h.ts) / 60000);
          lines.push(`  ${i + 1}. _${h.command.slice(0, 40)}_ (${age}m ago)`);
        });
      }
    }

    lines.push(``, `_Use .memory clear to wipe this session._`);
    await reply(lines.join('\n'));
  },
};
