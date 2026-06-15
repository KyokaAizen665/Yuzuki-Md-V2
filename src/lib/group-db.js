/**
 * Group Stats Database
 *
 * Persistent per-group, per-member tracking for activity, reputation,
 * warnings, and auto-moderation settings.
 *
 * File: data/group-stats.json
 *
 * ─── Group record ────────────────────────────────────────────────────────────
 * {
 *   members:      { [jid]: MemberRecord }
 *   hourActivity: { "0"–"23": count }
 *   dayActivity:  { "0"–"6":  count }
 *   totalMessages: number
 *   joinHistory:  [{ jid, at }]  (capped 200)
 *   leaveHistory: [{ jid, at }]  (capped 200)
 *   automod: { antispam, spamLimit, spamWindowMs, warnThreshold, warnAction }
 *   createdAt: ms
 * }
 *
 * ─── MemberRecord ─────────────────────────────────────────────────────────────
 * {
 *   msgCount, mediaCount, firstSeen, lastSeen, joinedAt,
 *   rep, repGivenBy: { [giverJid]: timestamp },
 *   warns: [{ reason, by, at }]
 * }
 *
 * ─── Exports ──────────────────────────────────────────────────────────────────
 *   trackMessage(groupJid, senderJid)    — call on every group message
 *   trackJoin(groupJid, senderJid)       — call on member add
 *   trackLeave(groupJid, senderJid)      — call on member remove
 *   getGroupStats(groupJid)              → group record
 *   getMember(groupJid, memberJid)       → member record
 *   getActivityLeaderboard(groupJid, n)  → sorted array
 *   addRep(groupJid, giverJid, targetJid)→ { ok, reason?, newRep?, remaining? }
 *   getRepLeaderboard(groupJid, n)       → sorted array
 *   addWarn(groupJid, senderJid, opts)   → { warnCount, threshold }
 *   removeWarn(groupJid, senderJid, idx) → remaining count
 *   getWarns(groupJid, senderJid)        → warn array
 *   getAutomod(groupJid)                 → automod config
 *   setAutomod(groupJid, patch)          → updated config
 *   checkGroupSpam(groupJid, senderJid)  → boolean
 *   isGroupAdmin(sock, groupJid, jid)    → Promise<boolean>
 *   isBotGroupAdmin(sock, groupJid)      → Promise<boolean>
 *   fmtDuration(ms)                      → human string
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE   = path.resolve(__dirname, '../../data/group-stats.json');
const DATA_DIR  = path.dirname(DB_FILE);

// In-memory anti-spam message-time windows
const _spamWindows = new Map();

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) return { groups: {} };
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { groups: {} }; }
}

function saveDB(db) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function defaultAutomod() {
  return { antispam: false, spamLimit: 5, spamWindowMs: 5000, warnThreshold: 3, warnAction: 'kick' };
}

function defaultGroup() {
  return {
    members:       {},
    hourActivity:  Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i, 0])),
    dayActivity:   Object.fromEntries(Array.from({ length: 7  }, (_, i) => [i, 0])),
    totalMessages: 0,
    joinHistory:   [],
    leaveHistory:  [],
    automod:       defaultAutomod(),
    createdAt:     Date.now(),
  };
}

function defaultMember() {
  return {
    msgCount:   0,
    mediaCount: 0,
    firstSeen:  Date.now(),
    lastSeen:   Date.now(),
    joinedAt:   Date.now(),
    rep:        0,
    repGivenBy: {},
    warns:      [],
  };
}

function getOrInit(db, groupJid) {
  if (!db.groups[groupJid]) db.groups[groupJid] = defaultGroup();
  const g = db.groups[groupJid];
  if (!g.members)      g.members      = {};
  if (!g.hourActivity) g.hourActivity = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i, 0]));
  if (!g.dayActivity)  g.dayActivity  = Object.fromEntries(Array.from({ length: 7  }, (_, i) => [i, 0]));
  if (!g.joinHistory)  g.joinHistory  = [];
  if (!g.leaveHistory) g.leaveHistory = [];
  if (!g.automod)      g.automod      = defaultAutomod();
  else {
    const d = defaultAutomod();
    for (const k of Object.keys(d)) if (g.automod[k] === undefined) g.automod[k] = d[k];
  }
  if (!g.createdAt) g.createdAt = Date.now();
  return g;
}

function initMember(group, jid) {
  if (!group.members[jid]) group.members[jid] = defaultMember();
  const m = group.members[jid];
  if (!m.warns)      m.warns      = [];
  if (!m.repGivenBy) m.repGivenBy = {};
  if (typeof m.rep !== 'number') m.rep = 0;
  return m;
}

// ── Activity tracking ─────────────────────────────────────────────────────────

export async function trackMessage(groupJid, senderJid) {
  try {
    const db = loadDB();
    const g  = getOrInit(db, groupJid);
    const m  = initMember(g, senderJid);
    m.msgCount++;
    m.lastSeen = Date.now();
    if (!m.firstSeen) m.firstSeen = Date.now();
    g.totalMessages = (g.totalMessages ?? 0) + 1;
    const now = new Date();
    g.hourActivity[now.getHours()] = (g.hourActivity[now.getHours()] ?? 0) + 1;
    g.dayActivity[now.getDay()]    = (g.dayActivity[now.getDay()]    ?? 0) + 1;
    saveDB(db);
  } catch {}
}

export function trackJoin(groupJid, senderJid) {
  try {
    const db = loadDB();
    const g  = getOrInit(db, groupJid);
    const m  = initMember(g, senderJid);
    m.joinedAt = Date.now();
    g.joinHistory.push({ jid: senderJid, at: Date.now() });
    if (g.joinHistory.length > 200) g.joinHistory = g.joinHistory.slice(-200);
    saveDB(db);
  } catch {}
}

export function trackLeave(groupJid, senderJid) {
  try {
    const db = loadDB();
    const g  = getOrInit(db, groupJid);
    g.leaveHistory.push({ jid: senderJid, at: Date.now() });
    if (g.leaveHistory.length > 200) g.leaveHistory = g.leaveHistory.slice(-200);
    saveDB(db);
  } catch {}
}

// ── Stats read ────────────────────────────────────────────────────────────────

export function getGroupStats(groupJid) {
  const db = loadDB();
  return getOrInit(db, groupJid);
}

export function getMember(groupJid, memberJid) {
  const db = loadDB();
  const g  = getOrInit(db, groupJid);
  return initMember(g, memberJid);
}

export function getActivityLeaderboard(groupJid, limit = 10) {
  const db = loadDB();
  const g  = getOrInit(db, groupJid);
  return Object.entries(g.members)
    .map(([jid, m]) => ({ jid, ...m }))
    .filter(e => (e.msgCount ?? 0) > 0)
    .sort((a, b) => (b.msgCount ?? 0) - (a.msgCount ?? 0))
    .slice(0, limit);
}

// ── Reputation ────────────────────────────────────────────────────────────────

export function addRep(groupJid, giverJid, targetJid) {
  if (giverJid === targetJid) return { ok: false, reason: 'self' };
  const db  = loadDB();
  const g   = getOrInit(db, groupJid);
  const m   = initMember(g, targetJid);
  const DAY = 24 * 60 * 60 * 1000;
  const last = m.repGivenBy[giverJid] ?? 0;
  if (Date.now() - last < DAY) return { ok: false, reason: 'cooldown', remaining: DAY - (Date.now() - last) };
  m.rep = (m.rep ?? 0) + 1;
  m.repGivenBy[giverJid] = Date.now();
  saveDB(db);
  return { ok: true, newRep: m.rep };
}

export function getRepLeaderboard(groupJid, limit = 10) {
  const db = loadDB();
  const g  = getOrInit(db, groupJid);
  return Object.entries(g.members)
    .map(([jid, m]) => ({ jid, rep: m.rep ?? 0, msgCount: m.msgCount ?? 0 }))
    .filter(e => e.rep > 0)
    .sort((a, b) => b.rep - a.rep)
    .slice(0, limit);
}

// ── Warn system ───────────────────────────────────────────────────────────────

export function addWarn(groupJid, senderJid, { reason = 'No reason given', by = '' } = {}) {
  const db = loadDB();
  const g  = getOrInit(db, groupJid);
  const m  = initMember(g, senderJid);
  m.warns.push({ reason, by, at: Date.now() });
  saveDB(db);
  return { warnCount: m.warns.length, threshold: g.automod?.warnThreshold ?? 3 };
}

export function removeWarn(groupJid, senderJid, idx = null) {
  const db = loadDB();
  const g  = getOrInit(db, groupJid);
  const m  = initMember(g, senderJid);
  if (idx === null) { m.warns = []; }
  else if (idx >= 0 && idx < m.warns.length) { m.warns.splice(idx, 1); }
  saveDB(db);
  return m.warns.length;
}

export function getWarns(groupJid, senderJid) {
  const db = loadDB();
  const g  = getOrInit(db, groupJid);
  return g.members[senderJid]?.warns ?? [];
}

// ── Automod ───────────────────────────────────────────────────────────────────

export function getAutomod(groupJid) {
  const db = loadDB();
  return getOrInit(db, groupJid).automod;
}

export function setAutomod(groupJid, patch) {
  const db = loadDB();
  const g  = getOrInit(db, groupJid);
  g.automod = { ...g.automod, ...patch };
  saveDB(db);
  return g.automod;
}

// ── Anti-spam ─────────────────────────────────────────────────────────────────

export function checkGroupSpam(groupJid, senderJid) {
  const db = loadDB();
  const g  = getOrInit(db, groupJid);
  if (!g.automod?.antispam) return false;
  const key      = `${groupJid}:${senderJid}`;
  const limit    = g.automod.spamLimit    ?? 5;
  const windowMs = g.automod.spamWindowMs ?? 5000;
  const now      = Date.now();
  const times    = (_spamWindows.get(key) ?? []).filter(t => now - t < windowMs);
  times.push(now);
  _spamWindows.set(key, times);
  return times.length >= limit;
}

// ── Admin helpers ─────────────────────────────────────────────────────────────

export async function isGroupAdmin(sock, groupJid, senderJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const p    = meta.participants.find(u => u.id === senderJid);
    return p?.admin === 'admin' || p?.admin === 'superadmin';
  } catch { return false; }
}

export async function isBotGroupAdmin(sock, groupJid) {
  try {
    const rawId = sock.user?.id ?? '';
    const botId = rawId.includes(':') ? rawId.replace(/:.*@/, '@') : rawId;
    const meta  = await sock.groupMetadata(groupJid);
    const p     = meta.participants.find(u =>
      u.id === botId ||
      u.id.split('@')[0] === botId.split('@')[0] ||
      u.id.split(':')[0] === botId.split('@')[0],
    );
    return p?.admin === 'admin' || p?.admin === 'superadmin';
  } catch { return false; }
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function fmtDuration(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60)   return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function shortJid(jid) {
  return '@' + (jid?.split('@')[0] ?? jid ?? '?');
}
