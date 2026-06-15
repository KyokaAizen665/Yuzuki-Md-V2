/**
 * Plugin: wfinfo
 * Category: tools
 *
 * Show details for a specific registered workflow.
 * Displays step names, per-step timeout, and the trigger command.
 *
 * Usage:
 *   .wfinfo <name>        — show workflow detail
 *   .wfinfo               — list all workflows
 */

import { workflowCard, workflowListCard } from '../../nativeflow/index.js';

export default {
  name:        'wfinfo',
  aliases:     ['workflowinfo', 'flowinfo'],
  category:    'tools',
  description: 'Show step details for a registered workflow',
  usage:       '.wfinfo <workflowName>',

  async execute({ sock, msg, args, settings }) {
    const jid          = msg.key.remoteJid;
    const prefix       = settings?.prefix  ?? '.';
    const botName      = settings?.botName ?? 'Yuzuki MD';
    const workflowName = args.join(' ').trim().toLowerCase();

    if (!workflowName) {
      await workflowListCard(sock, jid, msg, { prefix, botName });
      return;
    }

    await workflowCard(sock, jid, msg, workflowName, { prefix, botName });
  },
};
