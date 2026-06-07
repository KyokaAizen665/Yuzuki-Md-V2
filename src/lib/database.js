import fs from "fs";
import path from "path";

const DB_PATH = "./data/database.json";
const DB_DIR = "./data";

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

export function loadDB() {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    const init = { users: {}, settings: { cmdLimit: {}, lastResetLimit: null } };
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2));
    return init;
  }
  try { return JSON.parse(fs.readFileSync(DB_PATH, "utf8")); }
  catch { return { users: {}, settings: { cmdLimit: {}, lastResetLimit: null } }; }
}

export function saveDB(db) {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function initUserDB(senderJid, pushName = "User") {
  const db = loadDB();
  const today = new Date().toISOString().slice(0, 10);

  if (!db.settings) db.settings = {};
  if (db.settings.lastResetLimit !== today) {
    for (const jid in db.users) {
      if (typeof db.users[jid] === "object") {
        db.users[jid].limitfree = 15;
        db.users[jid].limitprem = db.users[jid].premium ? 500 : 0;
      }
    }
    db.settings.lastResetLimit = today;
    saveDB(db);
  }

  if (!senderJid) return db;

  if (!db.users[senderJid] || typeof db.users[senderJid] !== "object") {
    db.users[senderJid] = {
      level: 0, exp: 0, money: 0, bank: 0, health: 100,
      limitfree: 15, limitprem: 0, limitbuy: 0,
      lastmining: 0, lastdungeon: 0, lastwork: 0, lastdaily: 0,
      name: pushName, registered: false, premium: false,
      bio: "", badges: [], msgCount: 0, redeemedKeys: [],
    };
  } else {
    const u = db.users[senderJid];
    if (typeof u.level !== "number") u.level = 0;
    if (typeof u.exp !== "number") u.exp = 0;
    if (typeof u.money !== "number") u.money = 0;
    if (typeof u.bank !== "number") u.bank = 0;
    if (typeof u.health !== "number") u.health = 100;
    if (typeof u.limitfree !== "number") u.limitfree = 15;
    if (typeof u.limitprem !== "number") u.limitprem = u.premium ? 500 : 0;
    if (typeof u.limitbuy !== "number") u.limitbuy = 0;
    if (typeof u.lastmining !== "number") u.lastmining = 0;
    if (typeof u.lastdungeon !== "number") u.lastdungeon = 0;
    if (typeof u.lastwork !== "number") u.lastwork = 0;
    if (typeof u.lastdaily !== "number") u.lastdaily = 0;
    if (!u.name) u.name = pushName;
    // New fields — backward compat
    if (typeof u.bio !== "string") u.bio = "";
    if (!Array.isArray(u.badges)) u.badges = [];
    if (typeof u.msgCount !== "number") u.msgCount = 0;
    if (!Array.isArray(u.redeemedKeys)) u.redeemedKeys = [];
  }

  saveDB(db);
  return db;
}

export function getLimitCost(command, defaultCost = 1) {
  const db = loadDB();
  const cmdLimit = db.settings?.cmdLimit || {};
  return cmdLimit[command] !== undefined ? cmdLimit[command] : defaultCost;
}

export function setLimitCost(command, cost) {
  const db = loadDB();
  if (!db.settings) db.settings = {};
  if (!db.settings.cmdLimit) db.settings.cmdLimit = {};
  db.settings.cmdLimit[command] = cost;
  saveDB(db);
}

export function checkLimit(senderJid, isOwner) {
  if (isOwner) return "∞";
  const db = loadDB();
  const u = db.users[senderJid];
  if (!u) return 0;
  return (u.limitfree || 0) + (u.limitprem || 0) + (u.limitbuy || 0);
}

export function useLimit(senderJid, cost, isOwner) {
  if (isOwner || cost <= 0) return;
  const db = loadDB();
  const u = db.users[senderJid];
  if (!u) return;
  let remaining = cost;
  const fromPrem = Math.min(u.limitprem || 0, remaining);
  u.limitprem -= fromPrem;
  remaining -= fromPrem;
  const fromFree = Math.min(u.limitfree || 0, remaining);
  u.limitfree -= fromFree;
  saveDB(db);
}

// ── XP / level / coin helpers ─────────────────────────────────────────────────

// XP required to advance from the given level to the next
function xpToNext(level) {
  return (level + 1) * 100;
}

function _checkBadges(u) {
  if (!Array.isArray(u.badges)) u.badges = [];
  const checks = [
    [u.level >= 5,                     "⭐ Rising Star"],
    [u.level >= 10,                    "🔥 Veteran"],
    [u.level >= 25,                    "💎 Elite"],
    [u.level >= 50,                    "👑 Legend"],
    [(u.money || 0) >= 1000,           "💰 Rich"],
    [(u.msgCount || 0) >= 100,         "💬 Chatterbox"],
    [(u.msgCount || 0) >= 500,         "📢 Loudmouth"],
    [u.registered === true && !u.badges.includes("🌱 Newcomer"), "🌱 Newcomer"],
  ];
  for (const [cond, badge] of checks) {
    if (cond && !u.badges.includes(badge)) u.badges.push(badge);
  }
}

/**
 * Award XP to a user. Handles level-ups and badge grants.
 * Returns { leveled: bool, oldLevel: number, newLevel: number, user: object }
 */
export function addXP(senderJid, amount, pushName = "User") {
  const db = loadDB();
  if (!db.users[senderJid] || typeof db.users[senderJid] !== "object") {
    db.users[senderJid] = {
      level: 0, exp: 0, money: 0, bank: 0, health: 100,
      limitfree: 15, limitprem: 0, limitbuy: 0,
      lastmining: 0, lastdungeon: 0,
      name: pushName, registered: false, premium: false,
      bio: "", badges: [], msgCount: 0, redeemedKeys: [],
    };
  }
  const u = db.users[senderJid];
  if (!Array.isArray(u.badges)) u.badges = [];
  if (typeof u.msgCount !== "number") u.msgCount = 0;

  u.exp = (u.exp || 0) + amount;
  u.msgCount += 1;
  u.name = pushName; // keep name fresh

  const oldLevel = u.level || 0;
  let leveled = false;
  while (u.exp >= xpToNext(u.level || 0)) {
    u.exp -= xpToNext(u.level || 0);
    u.level = (u.level || 0) + 1;
    leveled = true;
  }

  _checkBadges(u);
  saveDB(db);
  return { leveled, oldLevel, newLevel: u.level, user: u };
}

/**
 * Add coins to a user. Returns new balance.
 */
export function addCoins(senderJid, amount) {
  const db = loadDB();
  const u = db.users[senderJid];
  if (!u) return 0;
  u.money = (u.money || 0) + amount;
  _checkBadges(u);
  saveDB(db);
  return u.money;
}

/**
 * Spend coins. Returns true on success, false if insufficient funds.
 */
export function spendCoins(senderJid, amount) {
  const db = loadDB();
  const u = db.users[senderJid];
  if (!u || (u.money || 0) < amount) return false;
  u.money -= amount;
  saveDB(db);
  return true;
}

/**
 * Returns sorted leaderboard array [ { jid, ...userData } ]
 * sorted by level DESC then exp DESC.
 */
export function getLeaderboard(limit = 10) {
  const db = loadDB();
  return Object.entries(db.users)
    .filter(([, v]) => typeof v === "object" && v.registered)
    .map(([jid, v]) => ({ jid, ...v }))
    .sort((a, b) => (b.level || 0) - (a.level || 0) || (b.exp || 0) - (a.exp || 0))
    .slice(0, limit);
}

/**
 * Returns rank position (1-indexed) of a jid among registered users.
 */
export function getRankPosition(senderJid) {
  const db = loadDB();
  const sorted = Object.entries(db.users)
    .filter(([, v]) => typeof v === "object" && v.registered)
    .sort((a, b) => (b[1].level || 0) - (a[1].level || 0) || (b[1].exp || 0) - (a[1].exp || 0));
  const idx = sorted.findIndex(([k]) => k === senderJid);
  return idx === -1 ? null : idx + 1;
}
