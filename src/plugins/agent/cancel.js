/**
 * Plugin: cancel
 * Category: agent
 *
 * Cancel the most recent active background job in this chat.
 * Pass "all" to cancel every active job.
 *
 * Usage:
 *   .cancel        — cancel the latest job
 *   .cancel all    — cancel all jobs for this chat
 */

import { agentRouter } from '../../agent/index.js';

export default {
  name:        'cancel',
  aliases:     ['stop', 'abort'],
  category:    'agent',
  description: 'Cancel the latest (or all) background agent jobs in this chat',
  usage:       '.cancel [all]',

  async execute({ msg, args, reply }) {
    const jid = msg.key.remoteJid;

    if ((args[0] ?? '').toLowerCase() === 'all') {
      const count = agentRouter.cancelAll(jid);
      if (count === 0) {
        await reply(`📭 No active jobs to cancel.`);
      } else {
        await reply(`🚫 Cancelled ${count} job${count !== 1 ? 's' : ''}.`);
      }
      return;
    }

    const ok = agentRouter.cancelLatest(jid);
    await reply(ok
      ? `🚫 Latest job cancelled.`
      : `📭 No active job found to cancel.`,
    );
  },
};
