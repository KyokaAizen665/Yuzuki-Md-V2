/**
 * Game Store — persistent leaderboard & player stats
 *
 * Stores game scores to data/game-scores.json using synchronous FS operations
 * (same pattern as lib/database.js) so no async complexity is needed at startup.
 *
 * Data shape:
 *   {
 *     players: {
 *       [jid]: {
 *         name: string,
 *         games: {
 *           [gameId]: { wins: number, losses: number, draws: number, plays: number }
 *         }
 *       }
 *     }
 *   }
 *
 * All functions are synchronous and safe to call from async execute() handlers.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, '../../data/game-scores.json');

// ─── Internal helpers ─────────────────────────────────────────────────────────

function loadStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return { players: {} };
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch { return { players: {} }; }
}

function saveStore(data) {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

function ensurePlayer(store, jid, name = '') {
  if (!store.players[jid]) {
    store.players[jid] = { name: name || jid.split('@')[0], games: {} };
  }
  return store.players[jid];
}

function ensureGame(player, gameId) {
  if (!player.games[gameId]) {
    player.games[gameId] = { wins: 0, losses: 0, draws: 0, plays: 0 };
  }
  return player.games[gameId];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a win for a player in a game.
 * @param {string} jid
 * @param {string} gameId
 * @param {string} [name] - Display name (optional, stored on first record)
 */
export function recordWin(jid, gameId, name = '') {
  const store  = loadStore();
  const player = ensurePlayer(store, jid, name);
  const game   = ensureGame(player, gameId);
  game.wins++;
  game.plays++;
  if (name) player.name = name;
  saveStore(store);
}

/**
 * Record a loss for a player in a game.
 */
export function recordLoss(jid, gameId, name = '') {
  const store  = loadStore();
  const player = ensurePlayer(store, jid, name);
  const game   = ensureGame(player, gameId);
  game.losses++;
  game.plays++;
  if (name) player.name = name;
  saveStore(store);
}

/**
 * Record a draw for a player in a game.
 */
export function recordDraw(jid, gameId, name = '') {
  const store  = loadStore();
  const player = ensurePlayer(store, jid, name);
  const game   = ensureGame(player, gameId);
  game.draws  = (game.draws ?? 0) + 1;
  game.plays++;
  if (name) player.name = name;
  saveStore(store);
}

/**
 * Get stats for a specific player across all games, or for one game.
 *
 * @param {string} jid
 * @param {string} [gameId] - If provided, return stats for one game only
 * @returns {object|null}
 */
export function getPlayerStats(jid, gameId = null) {
  const store  = loadStore();
  const player = store.players[jid];
  if (!player) return null;
  if (gameId)  return player.games[gameId] ?? null;
  return { name: player.name, games: player.games };
}

/**
 * Get the top N players for a game by wins.
 *
 * @param {string} gameId
 * @param {number} [limit=10]
 * @returns {Array<{ rank: number, name: string, jid: string, wins: number, losses: number, plays: number }>}
 */
export function getLeaderboard(gameId, limit = 10) {
  const store = loadStore();
  const rows  = [];

  for (const [jid, player] of Object.entries(store.players)) {
    const g = player.games[gameId];
    if (g && g.plays > 0) {
      rows.push({
        jid,
        name:   player.name || jid.split('@')[0],
        wins:   g.wins   ?? 0,
        losses: g.losses ?? 0,
        draws:  g.draws  ?? 0,
        plays:  g.plays  ?? 0,
      });
    }
  }

  return rows
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
    .slice(0, limit)
    .map((r, i) => ({ rank: i + 1, ...r }));
}

/**
 * Get a formatted leaderboard string for a game.
 *
 * @param {string} gameId
 * @param {string} [title]  - Display title for the game
 * @param {number} [limit=10]
 * @returns {string}
 */
export function formatLeaderboard(gameId, title = gameId.toUpperCase(), limit = 10) {
  const rows = getLeaderboard(gameId, limit);
  if (!rows.length) return `🏆 No leaderboard data yet for *${title}*.`;

  const medals = ['🥇', '🥈', '🥉'];
  const lines  = [`🏆 *${title} Leaderboard*\n`];
  for (const r of rows) {
    const m    = medals[r.rank - 1] ?? `${r.rank}.`;
    const rate = r.plays > 0 ? Math.round((r.wins / r.plays) * 100) : 0;
    lines.push(`${m} *${r.name}*  —  ${r.wins}W ${r.losses}L  _(${rate}% win)_`);
  }
  return lines.join('\n');
}
