/**
 * Games Database
 *
 * Persistent storage for all game-specific state:
 * inventory, farming slots, cooldowns, achievements, quests, stats.
 *
 * Stored separately from the main database.json to keep the main
 * user record lean and game data self-contained.
 *
 * File: data/games.json
 *
 * ─── Default user game record ─────────────────────────────────────────────────
 * {
 *   inventory: { [itemId]: qty },
 *   farming:   [ null | { crop, plantedAt, wateredAt }, ... ]  (4 slots)
 *   stats:     { fishCount, huntCount, mineCount, harvestCount,
 *                battlesWon, battlesLost, totalEarned, questsDone, dailysClaimed }
 *   cooldowns: { fish, hunt, mine, battle }  (ms timestamps)
 *   lastDaily: ms timestamp,
 *   dailyStreak: number,
 *   achievements: string[],
 *   quests: { date, progress: { [stat]: n }, claimed: string[] }
 * }
 *
 * ─── Exports ──────────────────────────────────────────────────────────────────
 *   getGU(jid)                         → game user object (auto-init)
 *   saveGU(jid, gu)
 *   addItem(jid, itemId, qty?)         → void
 *   removeItem(jid, itemId, qty?)      → boolean (false = insufficient)
 *   hasItem(jid, itemId, qty?)         → boolean
 *   getInventory(jid)                  → { [itemId]: qty }
 *   updateStat(jid, stat, by?)         → new value
 *   updateQuestProgress(jid, stat, by?)
 *   getCooldownRemaining(jid, key, durMs) → ms remaining (0 = ready)
 *   refreshCooldown(jid, key)
 *   getFarmSlots(jid)                  → array[4]
 *   setFarmSlot(jid, idx, data|null)
 *   getLastDaily(jid)                  → { lastDaily, dailyStreak }
 *   setDailyData(jid, { lastDaily, dailyStreak })
 *   unlockAchievement(jid, achId)      → true if newly unlocked
 *   getAchievements(jid)               → string[]
 *   getQuestState(jid)                 → quest state (refreshed to today)
 *   setQuestState(jid, data)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE    = path.resolve(__dirname, '../../data/games.json');
const DATA_DIR   = path.dirname(DB_FILE);

// ── Internal ──────────────────────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadGames() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) return { users: {} };
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { users: {} }; }
}

function saveGames(db) {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const DEFAULT_STATS = () => ({
  fishCount: 0, huntCount: 0, mineCount: 0, harvestCount: 0,
  battlesWon: 0, battlesLost: 0, totalEarned: 0, questsDone: 0, dailysClaimed: 0,
});

function initGU() {
  return {
    inventory:    {},
    farming:      [null, null, null, null],
    stats:        DEFAULT_STATS(),
    cooldowns:    { fish: 0, hunt: 0, mine: 0, battle: 0 },
    lastDaily:    0,
    dailyStreak:  0,
    achievements: [],
    quests:       { date: '', progress: {}, claimed: [] },
  };
}

function ensureGU(raw) {
  const g = raw ?? {};
  if (!g.inventory)    g.inventory    = {};
  if (!Array.isArray(g.farming)) g.farming = [null, null, null, null];
  while (g.farming.length < 4) g.farming.push(null);
  if (!g.stats)        g.stats        = DEFAULT_STATS();
  else {
    const d = DEFAULT_STATS();
    for (const k of Object.keys(d)) {
      if (typeof g.stats[k] !== 'number') g.stats[k] = 0;
    }
  }
  if (!g.cooldowns)    g.cooldowns    = { fish: 0, hunt: 0, mine: 0, battle: 0 };
  if (typeof g.lastDaily  !== 'number') g.lastDaily  = 0;
  if (typeof g.dailyStreak !== 'number') g.dailyStreak = 0;
  if (!Array.isArray(g.achievements))   g.achievements = [];
  if (!g.quests) g.quests = { date: '', progress: {}, claimed: [] };
  return g;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getGU(jid) {
  const db = loadGames();
  db.users[jid] = ensureGU(db.users[jid]);
  return db.users[jid];
}

export function saveGU(jid, gu) {
  const db = loadGames();
  db.users[jid] = gu;
  saveGames(db);
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export function addItem(jid, itemId, qty = 1) {
  const gu = getGU(jid);
  gu.inventory[itemId] = (gu.inventory[itemId] ?? 0) + qty;
  saveGU(jid, gu);
}

export function removeItem(jid, itemId, qty = 1) {
  const gu  = getGU(jid);
  const cur = gu.inventory[itemId] ?? 0;
  if (cur < qty) return false;
  gu.inventory[itemId] = cur - qty;
  if (gu.inventory[itemId] <= 0) delete gu.inventory[itemId];
  saveGU(jid, gu);
  return true;
}

export function hasItem(jid, itemId, qty = 1) {
  const gu = getGU(jid);
  return (gu.inventory[itemId] ?? 0) >= qty;
}

export function getInventory(jid) {
  return getGU(jid).inventory;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function updateStat(jid, stat, by = 1) {
  const gu = getGU(jid);
  gu.stats[stat] = (gu.stats[stat] ?? 0) + by;
  saveGU(jid, gu);
  return gu.stats[stat];
}

// ── Quest progress ─────────────────────────────────────────────────────────────

export function updateQuestProgress(jid, stat, by = 1) {
  const gu    = getGU(jid);
  const today = new Date().toISOString().slice(0, 10);
  if (gu.quests.date !== today) {
    gu.quests = { date: today, progress: {}, claimed: [] };
  }
  gu.quests.progress[stat] = (gu.quests.progress[stat] ?? 0) + by;
  saveGU(jid, gu);
}

// ── Cooldowns ─────────────────────────────────────────────────────────────────

export function getCooldownRemaining(jid, key, durMs) {
  const gu   = getGU(jid);
  const last = gu.cooldowns[key] ?? 0;
  return Math.max(0, last + durMs - Date.now());
}

export function refreshCooldown(jid, key) {
  const gu = getGU(jid);
  gu.cooldowns[key] = Date.now();
  saveGU(jid, gu);
}

// ── Farming ───────────────────────────────────────────────────────────────────

export function getFarmSlots(jid) {
  return getGU(jid).farming;
}

export function setFarmSlot(jid, idx, data) {
  const gu = getGU(jid);
  gu.farming[idx] = data;
  saveGU(jid, gu);
}

// ── Daily ─────────────────────────────────────────────────────────────────────

export function getDailyData(jid) {
  const gu = getGU(jid);
  return { lastDaily: gu.lastDaily, dailyStreak: gu.dailyStreak };
}

export function setDailyData(jid, { lastDaily, dailyStreak }) {
  const gu       = getGU(jid);
  gu.lastDaily   = lastDaily;
  gu.dailyStreak = dailyStreak;
  saveGU(jid, gu);
}

// ── Achievements ──────────────────────────────────────────────────────────────

export function unlockAchievement(jid, achId) {
  const gu = getGU(jid);
  if (gu.achievements.includes(achId)) return false;
  gu.achievements.push(achId);
  saveGU(jid, gu);
  return true;
}

export function getAchievements(jid) {
  return getGU(jid).achievements;
}

// ── Quest state ───────────────────────────────────────────────────────────────

export function getQuestState(jid) {
  const gu    = getGU(jid);
  const today = new Date().toISOString().slice(0, 10);
  if (gu.quests.date !== today) {
    gu.quests = { date: today, progress: {}, claimed: [] };
    saveGU(jid, gu);
  }
  return gu.quests;
}

export function setQuestState(jid, data) {
  const gu    = getGU(jid);
  gu.quests   = data;
  saveGU(jid, gu);
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Format milliseconds into a human-readable countdown. */
export function fmtCooldown(ms) {
  if (ms <= 0) return 'Ready!';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return sec ? `${m}m ${sec}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Weighted random pick from an array of { weight, ...data }. */
export function weightedRandom(table) {
  const total = table.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const entry of table) {
    r -= entry.weight;
    if (r <= 0) return entry;
  }
  return table[table.length - 1];
}
