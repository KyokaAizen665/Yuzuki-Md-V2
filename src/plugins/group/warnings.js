/**
 * Plugin: warnings
 * Category: group
 *
 * View the full warning history for yourself or another member.
 *
 * Usage:
 *   .warnings          — view your own warnings
 *   .warnings @user    — view another user's warns (admin or self)
 *   .warns             — alias
 */

import { getWarns, getAutomod, isGroupAdmin } from '../../lib/group-db.js';
import { warningsCard }                       from '../../lib/group-cards.js';
import { fmtDaysAgo }                         from '../../lib/group-analytics.js';

export default {
  name:        'warnings',
  aliases:     ['warns', 'warnlist', 'warnhistory', 'checkwarns'],
  category:    'group',
  description: 'View full warning history for yourself or a group member',
  usage:       '.warnings [@user]',
  permissions: ['group'],

  async execute({ sock, msg, reply, args, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    const targetJid = mentioned[0] ?? sender;
    const phone     = targetJid.split('@')[0];

    // Only admins can view other members' warns
    if (targetJid !== sender) {
      const adminOk = await isGroupAdmin(sock, jid, sender);
      if (!adminOk) { await reply(`❌ Only admins can view another member's warnings.`); return; }
    }

    const warns     = getWarns(jid, targetJid);
    const automod   = getAutomod(jid);
    const threshold = automod?.warnThreshold ?? 3;
    const card      = warningsCard(phone, warns, threshold);

    if (!warns.length) {
      await reply(card);
      return;
    }

    // Build detailed history
    let detail = `⚠️ *Warning History — @${phone}*\n${'─'.repeat(22)}\n\n`;
    detail += `${warns.length}/${threshold} warnings\n\n`;
    warns.forEach((w, i) => {
      detail +=
        `${i + 1}. _${w.reason}_\n` +
        `   By: @${w.by?.split('@')[0] ?? 'system'}  ·  ${fmtDaysAgo(w.at)}\n\n`;
    });
    detail += `_Use \`${prefix}unwarn @${phone}\` to clear all._`;

    await sock.sendMessage(jid, { text: detail }, { quoted: msg });
  },
};
