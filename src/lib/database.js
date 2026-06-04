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

  // Daily limit reset
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
      lastmining: 0, lastdungeon: 0,
      name: pushName, registered: false, premium: false,
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
    if (!u.name) u.name = pushName;
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
  // Deduct from prem first, then free
  const fromPrem = Math.min(u.limitprem || 0, remaining);
  u.limitprem -= fromPrem;
  remaining -= fromPrem;
  const fromFree = Math.min(u.limitfree || 0, remaining);
  u.limitfree -= fromFree;

  saveDB(db);
}
