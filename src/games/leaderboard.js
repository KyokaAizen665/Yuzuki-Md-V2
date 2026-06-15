/**
 * Games Leaderboard
 *
 * Wraps lib/game-store.js and adds:
 *   - recordOutcome()     — unified win/loss/draw recorder
 *   - getPlayerRank()     — 1-based rank in a specific game
 *   - getGlobalStats()    — totals across all games for one player
 *   - formatPlayerStats() — rich multi-game stats card
 *
 * All existing game-store exports are re-exported for convenience so callers
 * only need to import from this file.
 */

import {
  recordWin,
  recordLoss,
  recordDraw,
  getPlayerStats,
  getLeaderboard,
  formatLeaderboard,
} from '../lib/game-store.js';

// Re-export raw primitives
export { recordWin, recordLoss, recordDraw, getPlayerStats, getLeaderboard, formatLeaderboard };

// ─── Enhanced helpers ─────────────────────────────────────────────────────────

/**
 * Record a game outcome from a single call.
 *
 * @param {string} jid
 * @param {string} gameId
 * @param {'win'|'loss'|'draw'} outcome
 * @param {string} [name]  Display name, stored on first record
 */
export function recordOutcome(jid, gameId, outcome, name = '') {
  if (outcome === 'win')  { recordWin(jid,  gameId, name); return; }
  if (outcome === 'loss') { recordLoss(jid, gameId, name); return; }
  if (outcome === 'draw') { recordDraw(jid, gameId, name); return; }
}

/**
 * Get a player's 1-based rank in a specific game leaderboard.
 * Returns null if the player has not played.
 *
 * @param {string} jid
 * @param {string} gameId
 * @returns {number|null}
 */
export function getPlayerRank(jid, gameId) {
  const board = getLeaderboard(gameId, 9999);
  const entry = board.find(r => r.jid === jid);
  return entry ? entry.rank : null;
}

/**
 * Aggregate stats for one player across every game they have played.
 *
 * @param {string} jid
 * @returns {{
 *   name:        string,
 *   totalWins:   number,
 *   totalLosses: number,
 *   totalDraws:  number,
 *   totalPlays:  number,
 *   games:       object,
 * } | null}
 */
export function getGlobalStats(jid) {
  const raw = getPlayerStats(jid);
  if (!raw) return null;

  let totalWins = 0, totalLosses = 0, totalDraws = 0, totalPlays = 0;
  for (const g of Object.values(raw.games ?? {})) {
    totalWins   += g.wins   ?? 0;
    totalLosses += g.losses ?? 0;
    totalDraws  += g.draws  ?? 0;
    totalPlays  += g.plays  ?? 0;
  }

  return {
    name: raw.name,
    totalWins,
    totalLosses,
    totalDraws,
    totalPlays,
    games: raw.games ?? {},
  };
}

/**
 * Format a per-player multi-game stats card.
 *
 * @param {string} jid
 * @param {string} [displayName]
 * @returns {string}
 */
export function formatPlayerStats(jid, displayName = '') {
  const stats = getGlobalStats(jid);
  if (!stats) {
    return `📊 No stats found for *${displayName || jid.split('@')[0]}* yet.`;
  }

  const name = displayName || stats.name;
  const rate = stats.totalPlays > 0
    ? Math.round((stats.totalWins / stats.totalPlays) * 100)
    : 0;

  const lines = [
    `📊 *${name}'s Game Stats*\n`,
    `🏆 Total Wins:   *${stats.totalWins}*`,
    `💀 Total Losses: *${stats.totalLosses}*`,
    `🤝 Total Draws:  *${stats.totalDraws}*`,
    `🎮 Total Played: *${stats.totalPlays}*`,
    `📈 Win Rate:     *${rate}%*`,
  ];

  const gameEntries = Object.entries(stats.games);
  if (gameEntries.length) {
    lines.push('\n📋 *By Game:*');
    for (const [gameId, g] of gameEntries) {
      const gr = g.plays > 0 ? Math.round((g.wins / g.plays) * 100) : 0;
      lines.push(`  • *${gameId}* — ${g.wins}W ${g.losses}L ${g.draws ?? 0}D  _(${gr}% win)_`);
    }
  }

  return lines.join('\n');
}
