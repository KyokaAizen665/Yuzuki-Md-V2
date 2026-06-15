/**
 * Plugin: discover
 * Category: tools
 *
 * Workflow Experience Browser — help users discover features through
 * guided journeys rather than command memorisation.
 *
 * Usage:
 *   .discover              — open the Workflow Browser (all groups)
 *   .discover <id>         — open detail card for a specific workflow
 *   .discover list         — plain-text list of all group ids + names
 *
 * Examples:
 *   .discover              — see all workflows
 *   .discover music        — Music workflow (play, download, video)
 *   .discover ai           — AI Assistants workflow
 *   .discover games        — Mini-Games workflow
 *   .discover download     — Downloads workflow
 *   .discover sticker      — Sticker Tools workflow
 *   .discover group        — Group Management workflow
 *   .discover tools        — Bot Tools workflow
 *
 * Architecture note:
 *   Rows in the browser and detail cards use rowId values like
 *   ".discover music" or ".play" — the WhatsApp interactive router
 *   fires these as commands through the normal message handler,
 *   so no custom tap-routing code is needed here.
 */

import {
  experienceBrowserCard,
  experienceDetailCard,
} from '../../lib/experience-cards.js';

import {
  listExperienceGroups,
  getExperienceGroup,
} from '../../lib/experience-registry.js';

export default {
  name:        'discover',
  aliases:     ['browse', 'explore', 'journey', 'workflows'],
  category:    'tools',
  description: 'Browse all bot workflows and discover commands by feature area',
  usage:       '.discover [workflow-id]',

  async execute({ sock, msg, args, settings }) {
    const jid     = msg.key.remoteJid;
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';
    const opts    = { prefix, botName };

    const sub = args[0]?.toLowerCase().trim();

    // ── .discover list — plain-text index (useful in terminals / debugging) ──
    if (sub === 'list') {
      const groups = listExperienceGroups();
      const lines  = groups.map(g =>
        `${g.icon}  *${g.name}*  \`${prefix}discover ${g.id}\`\n   _${g.description}_`,
      );
      await sock.sendMessage(jid,
        { text: `🧭  *Workflows* (${groups.length})\n${'─'.repeat(22)}\n\n${lines.join('\n\n')}` },
        { quoted: msg });
      return;
    }

    // ── .discover <id> — detail card ─────────────────────────────────────────
    if (sub && sub !== 'list') {
      // Check if the id is valid before calling the card builder
      // (card builder handles unknown ids gracefully, but this gives a
      //  nicer suggestion message first)
      const group = getExperienceGroup(sub);
      if (!group) {
        const ids = listExperienceGroups().map(g => `\`${g.id}\``).join('  ');
        await sock.sendMessage(jid, {
          text:
            `❌  Unknown workflow *${sub}*\n\n` +
            `Available IDs:\n${ids}\n\n` +
            `_Use \`${prefix}discover\` to see them all._`,
        }, { quoted: msg });
        return;
      }
      await experienceDetailCard(sock, jid, msg, sub, opts);
      return;
    }

    // ── .discover — browser ───────────────────────────────────────────────────
    await experienceBrowserCard(sock, jid, msg, opts);
  },
};
