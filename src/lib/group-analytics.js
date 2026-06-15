/**
 * Group Analytics
 *
 * Pure computation helpers — no I/O, no side effects.
 * All functions take plain objects and return formatted data.
 *
 * ─── Exports ──────────────────────────────────────────────────────────────────
 *   computePeakHour(hourActivity)               → { hour, count }
 *   computePeakDay(dayActivity)                 → { day, dayName, count }
 *   computeEngagementRate(msgs, members, createdAt) → number (0–100)
 *   computeActivityScore(member)                → number
 *   getActivityLevel(score)                     → { label, icon }
 *   computeRetentionRate(joinHistory, leaveHistory, days?) → number
 *   textBarChart(hourActivity, width?)          → string
 *   sparkline(vals, width?)                     → string
 *   fmtDate(ts)                                 → string
 *   fmtDaysAgo(ts)                              → string
 *   fmtPercent(n)                               → string
 *   msAgo(ts)                                   → string
 */

const DAY_NAMES  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Core analytics ────────────────────────────────────────────────────────────

export function computePeakHour(hourActivity) {
  let maxH = 0, maxV = 0;
  for (const [h, v] of Object.entries(hourActivity ?? {})) {
    if (Number(v) > maxV) { maxV = Number(v); maxH = parseInt(h); }
  }
  return { hour: maxH, count: maxV };
}

export function computePeakDay(dayActivity) {
  let maxD = 0, maxV = 0;
  for (const [d, v] of Object.entries(dayActivity ?? {})) {
    if (Number(v) > maxV) { maxV = Number(v); maxD = parseInt(d); }
  }
  return { day: maxD, dayName: DAY_NAMES[maxD] ?? '?', count: maxV };
}

/**
 * Rough engagement rate: how active is the group relative to its size?
 * 10 msgs/member/day = 100%.
 */
export function computeEngagementRate(totalMessages, memberCount, createdAt) {
  if (!memberCount || !totalMessages) return 0;
  const daysSince  = Math.max(1, (Date.now() - (createdAt ?? Date.now())) / 86400000);
  const maxExpected = memberCount * daysSince * 10;
  return Math.min(100, Math.round((totalMessages / maxExpected) * 1000) / 10);
}

/**
 * Weighted activity score for a single member.
 */
export function computeActivityScore(member) {
  const msgs    = (member.msgCount   ?? 0) * 1;
  const media   = (member.mediaCount ?? 0) * 2;
  const rep     = (member.rep        ?? 0) * 5;
  const warns   = (member.warns?.length ?? 0) * -3;
  const recency = (Date.now() - (member.lastSeen ?? 0)) < 86400000 ? 20 : 0;
  return Math.max(0, msgs + media + rep + warns + recency);
}

export function getActivityLevel(score) {
  if (score >= 300) return { label: 'Very High', icon: '🔥' };
  if (score >= 100) return { label: 'High',      icon: '⚡' };
  if (score >= 25)  return { label: 'Medium',    icon: '💬' };
  return                   { label: 'Low',       icon: '😴' };
}

/**
 * Retention: what % of recent joiners stayed?
 */
export function computeRetentionRate(joinHistory, leaveHistory, days = 7) {
  const since  = Date.now() - days * 86400000;
  const joins  = (joinHistory  ?? []).filter(e => e.at >= since).length;
  const leaves = (leaveHistory ?? []).filter(e => e.at >= since).length;
  if (joins === 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((joins - leaves) / joins) * 100)));
}

// ── Visualizations ─────────────────────────────────────────────────────────────

/**
 * Horizontal text bar chart for 24-hour activity (every 2 hours).
 */
export function textBarChart(hourActivity, width = 10) {
  const vals = Array.from({ length: 24 }, (_, i) => Number(hourActivity?.[i] ?? 0));
  const max  = Math.max(...vals, 1);
  const lines = [];
  for (let h = 0; h < 24; h += 3) {
    const v    = vals[h] ?? 0;
    const fill = Math.round((v / max) * width);
    const bar  = '█'.repeat(fill) + '░'.repeat(width - fill);
    lines.push(`${String(h).padStart(2, '0')}h [${bar}] ${v}`);
  }
  return lines.join('\n');
}

/**
 * Single-line sparkline for daily activity.
 */
export function sparkline(vals) {
  const SPARKS = ' ▁▂▃▄▅▆▇█';
  const arr  = Array.isArray(vals) ? vals : Object.values(vals).map(Number);
  const max  = Math.max(...arr, 1);
  return arr.map(v => SPARKS[Math.round((v / max) * (SPARKS.length - 1))]).join('');
}

// ── Formatters ────────────────────────────────────────────────────────────────

export function fmtDate(ts) {
  const d = new Date(ts);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function fmtDaysAgo(ts) {
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0)  return 'today';
  if (days === 1)  return 'yesterday';
  if (days < 30)   return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8)   return `${weeks} weeks ago`;
  return fmtDate(ts);
}

export function fmtPercent(n) {
  return `${Number(n).toFixed(1)}%`;
}

export function msAgo(ts) {
  const diff = Date.now() - ts;
  const s    = Math.floor(diff / 1000);
  if (s < 60)         return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)         return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)         return `${h}h ago`;
  return fmtDaysAgo(ts);
}

export function formatHourRange(h) {
  return `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`;
}
