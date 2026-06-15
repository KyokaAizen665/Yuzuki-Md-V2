/**
 * Plugin: jobs
 * Category: agent
 *
 * List all background agent jobs for the current chat.
 * Shows status, current step, and age of each job.
 *
 * Usage: .jobs
 */

import { agentRouter } from '../../agent/index.js';

export default {
  name:        'jobs',
  aliases:     ['tasks', 'queue'],
  category:    'agent',
  description: 'List all background agent jobs running in this chat',
  usage:       '.jobs',

  async execute({ msg, reply }) {
    const jid  = msg.key.remoteJid;
    const jobs = agentRouter.listJobs(jid);

    if (!jobs.length) {
      await reply(`📭 *No active jobs.*\n_Start one by sending a multi-step request in plain language._`);
      return;
    }

    const STATUS_ICON = {
      queued:    '⏳',
      running:   '🔄',
      done:      '✅',
      failed:    '❌',
      cancelled: '🚫',
    };

    const lines = [
      `📋 *Background Jobs — ${jid.split('@')[0]}*`,
      `━━━━━━━━━━━━━━━━━━━━`,
    ];

    for (const j of jobs) {
      const icon = STATUS_ICON[j.status] ?? '❓';
      const age  = j.ageS < 60
        ? `${j.ageS}s ago`
        : `${Math.round(j.ageS / 60)}m ago`;
      lines.push(
        `${icon} *${j.name}*\n` +
        `   ID: \`${j.id}\`  ·  Step ${j.step}/${j.total}  ·  ${j.status}  ·  ${age}`,
      );
    }

    lines.push(``, `_Use .cancel to stop the latest running job._`);
    await reply(lines.join('\n'));
  },
};
