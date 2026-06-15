/**
 * Plugin: insights
 * Category: group
 *
 * Full group health dashboard — engagement, activity, retention, and moderation.
 * NativeFlow navigation to drill into each area.
 *
 * Usage:
 *   .insights    — full group health report
 *   .dashboard   — alias
 */

import { getGroupStats, getAutomod, getActivityLeaderboard } from '../../lib/group-db.js';
import { getGroupData }                                     from '../../lib/protect.js';
import { insightsCard }                                     from '../../lib/group-cards.js';
import {
  computeEngagementRate, computeRetentionRate, computePeakHour,
  getActivityLevel, computeActivityScore, fmtPercent,
} from '../../lib/group-analytics.js';
import { sendInteractive, selectButton, copyButton }        from '../../lib/interactive.js';

export default {
  name:        'insights',
  aliases:     ['dashboard', 'groupdash', 'grouphealth', 'gcinsights'],
  category:    'group',
  description: 'Full group health dashboard — engagement, retention, activity, and moderation',
  usage:       '.insights',
  permissions: ['group'],

  async execute({ sock, msg, reply, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    let meta;
    try { meta = await sock.groupMetadata(jid); }
    catch { await reply('❌ Could not fetch group information.'); return; }

    const stats       = getGroupStats(jid);
    const memberCount = meta.participants?.length ?? 0;
    const groupName   = meta.subject ?? 'Group';
    const card        = insightsCard(groupName, memberCount, stats, prefix);

    const automod   = getAutomod(jid);
    const gc        = getGroupData(jid);
    const eng       = computeEngagementRate(stats.totalMessages ?? 0, memberCount, stats.createdAt);
    const ret       = computeRetentionRate(stats.joinHistory, stats.leaveHistory, 7);
    const peak      = computePeakHour(stats.hourActivity);
    const top       = getActivityLeaderboard(jid, 1)[0];
    const topScore  = top ? computeActivityScore(top) : 0;
    const topLevel  = getActivityLevel(topScore);

    const rows = [
      { title: '📊 Activity Board', rowId: `${prefix}activity`,   description: `Top: @${top?.jid?.split('@')[0] ?? 'N/A'} · ${top?.msgCount ?? 0} msgs` },
      { title: '📈 Engagement',     rowId: `${prefix}engagement`, description: `Rate: ${fmtPercent(eng)}` },
      { title: '👋 Welcome Stats',  rowId: `${prefix}welcoming`,  description: `7d retention: ${fmtPercent(ret)}` },
      { title: '⭐ Rep Board',      rowId: `${prefix}toprep`,     description: 'Reputation leaderboard' },
      { title: '🛡️ Mod Rules',      rowId: `${prefix}modrules`,   description: `Spam: ${automod.antispam ? 'ON' : 'OFF'} · Lock: ${automod.lockdown ? 'ON' : 'OFF'}` },
      { title: '📊 Group Stats',    rowId: `${prefix}groupstats`, description: `${(stats.totalMessages ?? 0).toLocaleString()} total messages` },
    ];

    await sendInteractive(sock, jid, msg, {
      body:    card,
      footer:  settings?.botName ?? 'Yuzuki MD',
      buttons: [
        copyButton('📋 Copy Report', card),
        selectButton('🔍 Drill Down', rows, 'Sections'),
      ],
    }, card);
  },
};
