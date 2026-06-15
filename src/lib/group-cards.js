/**
 * Group Cards
 *
 * Text card builders for group management commands.
 * All functions are pure (no I/O) and return formatted strings.
 *
 * ─── Exports ──────────────────────────────────────────────────────────────────
 *   insightsCard(groupName, memberCount, stats, prefix)
 *   statsCard(groupName, memberCount, stats)
 *   engagementCard(groupName, stats)
 *   welcomeCard(groupName, stats)
 *   modRulesCard(groupName, gc, automod, prefix)
 *   activityLeaderCard(groupName, top)
 *   repLeaderCard(groupName, top)
 *   warningsCard(targetPhone, warns, threshold)
 *   memberProfileCard(phone, member, score, actLevel)
 */

import {
  computePeakHour, computePeakDay, computeEngagementRate,
  computeRetentionRate, computeActivityScore, getActivityLevel,
  textBarChart, sparkline, fmtDate, fmtDaysAgo, fmtPercent, msAgo, formatHourRange,
} from './group-analytics.js';

const SEP = '─'.repeat(22);
const MEDALS = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

function num(n) { return (n ?? 0).toLocaleString(); }
function pct(n) { return fmtPercent(n ?? 0); }

// ─── Insights ─────────────────────────────────────────────────────────────────

export function insightsCard(groupName, memberCount, stats, prefix = '.') {
  const total    = stats.totalMessages ?? 0;
  const created  = stats.createdAt ?? Date.now();
  const eng      = computeEngagementRate(total, memberCount, created);
  const peak     = computePeakHour(stats.hourActivity);
  const peakDay  = computePeakDay(stats.dayActivity);
  const ret      = computeRetentionRate(stats.joinHistory, stats.leaveHistory, 7);
  const members  = Object.values(stats.members ?? {});
  const topMember = members.sort((a, b) => (b.msgCount ?? 0) - (a.msgCount ?? 0))[0];
  const topJid   = topMember ? Object.entries(stats.members).find(([, m]) => m === topMember)?.[0] : null;

  const recentJoins  = (stats.joinHistory  ?? []).filter(e => Date.now() - e.at < 7 * 86400000).length;
  const recentLeaves = (stats.leaveHistory ?? []).filter(e => Date.now() - e.at < 7 * 86400000).length;

  const sparkArr = Object.values(stats.dayActivity ?? {}).map(Number);
  const spark    = sparkline(sparkArr);

  return [
    `💡 *Group Insights*`,
    `_${groupName}_`,
    SEP,
    ``,
    `👥 *Members:*       ${num(memberCount)}`,
    `💬 *Total Messages:* ${num(total)}`,
    `📅 *Created:*       ${fmtDaysAgo(created)}`,
    ``,
    `📈 *Engagement:*    ${pct(eng)} ${eng >= 50 ? '🔥' : eng >= 20 ? '⚡' : '😴'}`,
    `⏰ *Peak Hour:*     ${formatHourRange(peak.hour)}  _(${num(peak.count)} msgs)_`,
    `📆 *Peak Day:*      ${peakDay.dayName}  _(${num(peakDay.count)} msgs)_`,
    ``,
    `📊 *Weekly Activity:*  ${spark}`,
    ``,
    `📥 *Joined (7d):*   ${recentJoins}`,
    `📤 *Left (7d):*     ${recentLeaves}`,
    `🔄 *Retention:*     ${pct(ret)}`,
    ``,
    topJid ? `⭐ *Most Active:*   @${topJid.split('@')[0]} _(${num(topMember.msgCount)} msgs)_` : '',
    ``,
    SEP,
    `_\`${prefix}activity\` · \`${prefix}engagement\` · \`${prefix}welcoming\`_`,
  ].filter(l => l !== undefined).join('\n');
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export function statsCard(groupName, memberCount, stats) {
  const total   = stats.totalMessages ?? 0;
  const members = Object.values(stats.members ?? {});
  const active  = members.filter(m => (m.msgCount ?? 0) > 0).length;
  const avgMsgs = memberCount > 0 ? (total / memberCount).toFixed(1) : '0';

  const joinCount  = stats.joinHistory?.length  ?? 0;
  const leaveCount = stats.leaveHistory?.length ?? 0;

  return [
    `📊 *Group Statistics*`,
    `_${groupName}_`,
    SEP,
    ``,
    `👥 Members:          *${num(memberCount)}*`,
    `💬 Total Messages:   *${num(total)}*`,
    `👤 Active Members:   *${num(active)}*`,
    `📨 Avg Msgs/Member:  *${avgMsgs}*`,
    ``,
    `📥 Total Joins:      *${num(joinCount)}*`,
    `📤 Total Leaves:     *${num(leaveCount)}*`,
    ``,
    `📅 Tracking since:   *${fmtDaysAgo(stats.createdAt ?? Date.now())}*`,
  ].join('\n');
}

// ─── Engagement ───────────────────────────────────────────────────────────────

export function engagementCard(groupName, stats) {
  const total   = stats.totalMessages ?? 0;
  const members = Object.values(stats.members ?? {}).length;
  const peak    = computePeakHour(stats.hourActivity);
  const chart   = textBarChart(stats.hourActivity);

  return [
    `📈 *Engagement Metrics*`,
    `_${groupName}_`,
    SEP,
    ``,
    `💬 Total Messages: *${num(total)}*`,
    `👥 Tracked Members: *${num(members)}*`,
    `⏰ Peak Hour: *${formatHourRange(peak.hour)}*  _(${num(peak.count)} msgs)_`,
    ``,
    `*Hourly Activity Chart*`,
    `\`\`\``,
    chart,
    `\`\`\``,
  ].join('\n');
}

// ─── Welcome analytics ────────────────────────────────────────────────────────

export function welcomeCard(groupName, stats) {
  const joins7   = (stats.joinHistory  ?? []).filter(e => Date.now() - e.at < 7 * 86400000);
  const leaves7  = (stats.leaveHistory ?? []).filter(e => Date.now() - e.at < 7 * 86400000);
  const joins30  = (stats.joinHistory  ?? []).filter(e => Date.now() - e.at < 30 * 86400000);
  const leaves30 = (stats.leaveHistory ?? []).filter(e => Date.now() - e.at < 30 * 86400000);

  const ret7  = computeRetentionRate(stats.joinHistory, stats.leaveHistory, 7);
  const ret30 = computeRetentionRate(stats.joinHistory, stats.leaveHistory, 30);

  const last5Joins  = (stats.joinHistory  ?? []).slice(-5).reverse();
  const last5Leaves = (stats.leaveHistory ?? []).slice(-5).reverse();

  let text = [
    `👋 *Welcome Analytics*`,
    `_${groupName}_`,
    SEP,
    ``,
    `*Last 7 Days*`,
    `  📥 Joined:    *${joins7.length}*`,
    `  📤 Left:      *${leaves7.length}*`,
    `  🔄 Retention: *${pct(ret7)}*`,
    ``,
    `*Last 30 Days*`,
    `  📥 Joined:    *${joins30.length}*`,
    `  📤 Left:      *${leaves30.length}*`,
    `  🔄 Retention: *${pct(ret30)}*`,
  ].join('\n');

  if (last5Joins.length) {
    text += `\n\n*Recent Joins*\n` +
      last5Joins.map(e => `  📥 @${e.jid.split('@')[0]}  _${msAgo(e.at)}_`).join('\n');
  }
  if (last5Leaves.length) {
    text += `\n\n*Recent Leaves*\n` +
      last5Leaves.map(e => `  📤 @${e.jid.split('@')[0]}  _${msAgo(e.at)}_`).join('\n');
  }

  return text;
}

// ─── Moderation rules ────────────────────────────────────────────────────────

export function modRulesCard(groupName, gc, automod, prefix = '.') {
  const on  = '🟢 ON ';
  const off = '🔴 OFF';

  const alAny = gc?.antilink?.all ? on : off;
  const alGc  = gc?.antilink?.gc  ? on : off;

  return [
    `🛡️ *Moderation Rules*`,
    `_${groupName}_`,
    SEP,
    ``,
    `*Anti-Link*`,
    `  All Links:       ${alAny}`,
    `  WA Group Links:  ${alGc}`,
    `  Action:          *${gc?.antilinkAction ?? 'silent'}*`,
    `  Warn Limit:      *${gc?.antilinkWarnLimit ?? 3}*`,
    ``,
    `*Auto-Mod*`,
    `  Anti-Spam:       ${automod?.antispam ? on : off}  _(${automod?.spamLimit ?? 5} msgs/${(automod?.spamWindowMs ?? 5000) / 1000}s)_`,
    `  Lockdown:        ${automod?.lockdown  ? on : off}`,
    ``,
    `*Warn System*`,
    `  Threshold:       *${automod?.warnThreshold ?? 3} warns*`,
    `  Action:          *${automod?.warnAction ?? 'kick'}*`,
    ``,
    SEP,
    `_\`${prefix}antispam\` · \`${prefix}lockdown\` · \`${prefix}antilink\`_`,
  ].join('\n');
}

// ─── Activity leaderboard ─────────────────────────────────────────────────────

export function activityLeaderCard(groupName, top) {
  if (!top.length) return `📊 *Activity Board*\n_${groupName}_\n\nNo activity tracked yet. Messages will be counted automatically.`;

  const lines = top.map((m, i) => {
    const score = computeActivityScore(m);
    const level = getActivityLevel(score);
    return `${MEDALS[i] ?? `${i + 1}.`}  @${m.jid.split('@')[0]}  ${level.icon}\n    💬 ${num(m.msgCount)} msgs  ·  last active ${msAgo(m.lastSeen ?? 0)}`;
  });

  return [
    `📊 *Activity Leaderboard*`,
    `_${groupName}_`,
    SEP,
    ``,
    lines.join('\n\n'),
  ].join('\n');
}

// ─── Reputation leaderboard ───────────────────────────────────────────────────

export function repLeaderCard(groupName, top) {
  if (!top.length) return `⭐ *Reputation Board*\n_${groupName}_\n\nNo reputation given yet. Use \`.rep @user\` to give rep!`;

  const lines = top.map((m, i) =>
    `${MEDALS[i] ?? `${i + 1}.`}  @${m.jid.split('@')[0]}  ⭐ *${m.rep}*  _(${num(m.msgCount)} msgs)_`,
  );

  return [
    `⭐ *Reputation Leaderboard*`,
    `_${groupName}_`,
    SEP,
    ``,
    lines.join('\n'),
  ].join('\n');
}

// ─── Warnings card ────────────────────────────────────────────────────────────

export function warningsCard(targetPhone, warns, threshold = 3) {
  if (!warns.length) return `✅ @${targetPhone} has *no warnings*.`;

  const list = warns.map((w, i) => {
    const by = w.by ? `by @${w.by.split('@')[0]}` : '';
    return `  ${i + 1}. _${w.reason}_ ${by}  ·  ${fmtDaysAgo(w.at)}`;
  }).join('\n');

  return [
    `⚠️ *Warnings — @${targetPhone}*`,
    SEP,
    ``,
    `${warns.length}/${threshold} warnings:`,
    ``,
    list,
    ``,
    warns.length >= threshold
      ? `🚨 *At threshold!* Action: auto-kick on next warn.`
      : `_${threshold - warns.length} more warn${threshold - warns.length > 1 ? 's' : ''} before auto-action._`,
  ].join('\n');
}
