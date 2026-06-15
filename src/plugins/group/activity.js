/**
 * Plugin: activity
 * Category: group
 *
 * Show member message activity leaderboard for the current group.
 * Activity is tracked automatically on every message.
 *
 * Usage:
 *   .activity         — top 10 active members
 *   .actboard         — alias
 *   .activity @user   — view a specific member's activity
 */

import { getActivityLeaderboard, getMember, getGroupStats, shortJid } from '../../lib/group-db.js';
import { computeActivityScore, getActivityLevel, msAgo }              from '../../lib/group-analytics.js';
import { activityLeaderCard }                                          from '../../lib/group-cards.js';

const MEDALS = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

export default {
  name:        'activity',
  aliases:     ['actboard', 'activeboard', 'msgboard', 'msgcount'],
  category:    'group',
  description: 'Member message activity leaderboard — auto-tracked per group',
  usage:       '.activity  |  .activity @user',
  permissions: ['group'],

  async execute({ sock, msg, reply, args, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    const targetJid = mentioned[0];

    // ── Single member view ─────────────────────────────────────────────────
    if (targetJid) {
      const member = getMember(jid, targetJid);
      const score  = computeActivityScore(member);
      const level  = getActivityLevel(score);
      const phone  = targetJid.split('@')[0];

      const text =
        `📊 *Activity — @${phone}*\n${'─'.repeat(22)}\n\n` +
        `💬 Messages:   *${(member.msgCount ?? 0).toLocaleString()}*\n` +
        `🖼️  Media sent:  *${(member.mediaCount ?? 0).toLocaleString()}*\n` +
        `⭐ Rep score:  *${member.rep ?? 0}*\n` +
        `⚡ Activity:   *${level.icon} ${level.label}*\n` +
        `🕐 Last active: *${msAgo(member.lastSeen ?? 0)}*\n` +
        `📅 Joined:     *${msAgo(member.joinedAt ?? 0)}*`;

      await sock.sendMessage(jid, { text }, { quoted: msg });
      return;
    }

    // ── Leaderboard ─────────────────────────────────────────────────────────
    const top   = getActivityLeaderboard(jid, 10);
    const stats = getGroupStats(jid);
    let meta;
    try { meta = await sock.groupMetadata(jid); } catch { meta = { subject: 'Group' }; }

    const text = activityLeaderCard(meta.subject ?? 'Group', top) +
      `\n\n💬 *Total group messages:* ${(stats.totalMessages ?? 0).toLocaleString()}` +
      `\n_Activity is tracked automatically on every message._`;

    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
