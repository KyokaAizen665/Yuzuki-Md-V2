/**
 * Plugin: cancel
 * Category: tools
 *
 * Cancels the active workflow for the current chat.
 * Also aliased as .stop, .quit, .exit.
 *
 * The WorkflowManager will intercept these same keywords automatically
 * during an active workflow (no prefix required), but this plugin ensures
 * .cancel also works when typed as a full prefixed command.
 */

import { workflowManager } from '../../workflows/index.js';

export default {
  name:        'cancel',
  aliases:     ['stop', 'quit', 'exit'],
  category:    'tools',
  description: 'Cancel the active workflow in this chat',
  usage:       '.cancel',

  async execute({ sock, msg, reply }) {
    const jid = msg.key.remoteJid;

    if (!workflowManager.has(jid)) {
      await reply(`ℹ️ No active workflow in this chat.`);
      return;
    }

    const snap = workflowManager.get(jid);
    await workflowManager.cancel(jid, 'user', { sock, msg });

    await reply(
      `🚫 *Workflow cancelled.*\n` +
      `_Was:_ ${snap?.workflowName ?? 'unknown'} (step: ${snap?.currentStep ?? '?'})`,
    );
  },
};
