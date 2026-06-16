/**
 * Plugin: engagement
 * Category: group
 *
 * Engagement metrics — hourly activity chart, peak times,
 * active member ratio, and message frequency.
 *
 * Usage:
 *   .engagement    — group engagement metrics
 *   .metrics       — alias
 *
 * VRS: heroType 'group' — ocean/coastal imagery
 */

import { getGroupStats }                               from '../../lib/group-db.js';
import { engagementCard }                              from '../../lib/group-cards.js';
import {
  computeEngagementRate, computePeakHour, computePeakDay,
  computeRetentionRate, fmtPercent, sparkline,
} from '../../lib/group-analytics.js';
import { sendHeroCard, copyButton }                    from '../../lib/visual-response.js';

export default {
  name:        'engagement',
  aliases:     ['metrics', 'groupmetrics', 'activitystats', 'engagementrate'],
  category:    'group',
  description: 'Group engagement metrics — hourly chart, peak times, active ratio',
  usage:       '.engagement',
  permissions: ['group'],

  async execute({ sock, msg, reply, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    let meta;
    try { meta = await sock.groupMetadata(jid); } catch { meta = { subject: 'Group', participants: [] }; }

    const stats       = getGroupStats(jid);
    const memberCount = meta.participants?.length ?? 0;
    const total       = stats.totalMessages ?? 0;
    const eng         = computeEngagementRate(total, memberCount, stats.createdAt);
    const peak        = computePeakHour(stats.hourActivity);
    const peakDay     = computePeakDay(stats.dayActivity);
    const ret7        = computeRetentionRate(stats.joinHistory, stats.leaveHistory, 7);
    const activeCount = Object.values(stats.members ?? {}).filter(m => (m.msgCount ?? 0) > 0).length;
    const activeRatio = memberCount > 0 ? Math.round((activeCount / memberCount) * 100) : 0;

    const dayVals  = Array.from({ length: 7 }, (_, i) => Number(stats.dayActivity?.[i] ?? 0));
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    const card = engagementCard(meta.subject ?? 'Group', stats);

    const summaryExtra = [
      ``,
      `${'─'.repeat(22)}`,
      `📈 *Engagement Rate:*  *${fmtPercent(eng)}*`,
      `👥 *Active Members:*   *${activeCount}/${memberCount}* _(${activeRatio}%)_`,
      `🔄 *7d Retention:*     *${fmtPercent(ret7)}*`,
      ``,
      `📅 *Daily Activity:*`,
      dayVals.map((v, i) => `  ${dayNames[i]}: ${'█'.repeat(Math.round((v / Math.max(...dayVals, 1)) * 8))}░`.padEnd(14) + ` ${v}`).join('\n'),
      ``,
      `📆 *Peak Day:*   *${peakDay.dayName}*  _(${peakDay.count} msgs)_`,
    ].join('\n');

    const body = card + summaryExtra;

    await sendHeroCard(sock, jid, msg, {
      body,
      footer:    settings?.botName ?? 'Yuzuki MD',
      heroType:  'group',
      settings,
      forceHero: true,
      buttons:   [copyButton('📋 Copy Metrics', body)],
      fallback:  body,
    });
  },
};
