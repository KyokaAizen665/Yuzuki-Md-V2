/**
 * Game Storage — persistent per-game player data
 *
 * Flat-file JSON storage at data/game-storage.json (same pattern as database.js).
 * Schema: { [gameId]: { [jid]: { ...playerSpecificData } } }
 *
 * All operations are synchronous so they can be called safely from async execute().
 *
 * Usage:
 *   import { getPlayerData, setPlayerData, updatePlayerData } from '../../games/storage.js';
 *
 *   const data = getPlayerData('fishing', sender);
 *   updatePlayerData('fishing', sender, { lastFished: Date.now() });
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, '../../data/game-storage.json');

// ─── Internal I/O ─────────────────────────────────────────────────────────────

function load() {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch { return {}; }
}

function save(data) {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get player data for a specific game.
 * Returns an empty object if no data exists yet.
 *
 * @param {string} gameId
 * @param {string} jid
 * @returns {object}
 */
export function getPlayerData(gameId, jid) {
  const store = load();
  return store[gameId]?.[jid] ?? {};
}

/**
 * Replace (overwrite) player data for a game.
 *
 * @param {string} gameId
 * @param {string} jid
 * @param {object} data
 */
export function setPlayerData(gameId, jid, data) {
  const store = load();
  if (!store[gameId]) store[gameId] = {};
  store[gameId][jid] = data;
  save(store);
}

/**
 * Shallow-merge a patch object into existing player data.
 *
 * @param {string} gameId
 * @param {string} jid
 * @param {object} patch
 */
export function updatePlayerData(gameId, jid, patch) {
  const current = getPlayerData(gameId, jid);
  setPlayerData(gameId, jid, { ...current, ...patch });
}

/**
 * Get all player data records for a game (all players).
 *
 * @param {string} gameId
 * @returns {Record<string, object>}
 */
export function getGameData(gameId) {
  const store = load();
  return store[gameId] ?? {};
}

/**
 * Delete all stored data for one player in one game.
 *
 * @param {string} gameId
 * @param {string} jid
 */
export function deletePlayerData(gameId, jid) {
  const store = load();
  if (store[gameId]?.[jid]) {
    delete store[gameId][jid];
    save(store);
  }
}

/**
 * Wipe all stored data for an entire game.
 *
 * @param {string} gameId
 */
export function clearGameData(gameId) {
  const store = load();
  if (store[gameId]) {
    delete store[gameId];
    save(store);
  }
}

export default {
  getPlayerData,
  setPlayerData,
  updatePlayerData,
  getGameData,
  deletePlayerData,
  clearGameData,
};
