/**
 * Plugin: wf
 * Category: tools
 *
 * List all registered interactive workflows.
 * Each workflow is a multi-step conversation built into the bot.
 * The list is generated from the live workflowManager registry.
 *
 * Usage:
 *   .wf                  — list all workflows
 *   .workflows           — alias
 */

import { workflowListCard } from '../../nativeflow/index.js';

export default {
  name:        'wf',
  aliases:     ['workflows', 'flowlist'],
  category:    'tools',
  description: 'List all registered interactive workflows',
  usage:       '.wf',

  async execute({ sock, msg, settings }) {
    const jid     = msg.key.remoteJid;
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';

    await workflowListCard(sock, jid, msg, { prefix, botName });
  },
};
