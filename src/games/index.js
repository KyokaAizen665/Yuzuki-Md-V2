/**
 * Games Framework — Public API
 *
 * Single import point for everything in the Games Framework.
 * Plugins and commands should import from here rather than from individual modules.
 *
 * ─── Quick reference ──────────────────────────────────────────────────────────
 *
 *  ENGINE
 *    gamesEngine.registerGame(def)
 *    gamesEngine.startGame(jid, gameId, players, state, ctx)  → { ok, session?, error? }
 *    gamesEngine.pauseGame(jid, ctx)                          → { ok, error? }
 *    gamesEngine.resumeGame(jid, ctx)                         → { ok, error? }
 *    gamesEngine.endGame(jid, result, ctx)                    → { ok, error? }
 *    gamesEngine.routeInput(jid, input, ctx)                  → boolean
 *    gamesEngine.isActive(jid)
 *    gamesEngine.isPaused(jid)
 *    gamesEngine.getSession(jid)
 *    gamesEngine.listGames()
 *
 *  SESSIONS
 *    gameSessions.create(jid, gameId, players, state)
 *    gameSessions.get(jid)          active only (blocks paused)
 *    gameSessions.getAny(jid)       active or paused
 *    gameSessions.pause(jid)
 *    gameSessions.resume(jid)
 *    gameSessions.isPaused(jid)
 *    gameSessions.end(jid)
 *    gameSessions.all()
 *
 *  STORAGE (per-game persistent player data)
 *    getPlayerData(gameId, jid)     → object
 *    setPlayerData(gameId, jid, data)
 *    updatePlayerData(gameId, jid, patch)
 *    getGameData(gameId)            → Record<jid, object>
 *
 *  LEADERBOARD
 *    recordOutcome(jid, gameId, 'win'|'loss'|'draw', name?)
 *    getLeaderboard(gameId, limit?)   → ranked array
 *    formatLeaderboard(gameId, title?, limit?)  → formatted string
 *    getPlayerRank(jid, gameId)       → number|null
 *    getGlobalStats(jid)              → aggregated stats object
 *    formatPlayerStats(jid, name?)    → formatted string
 */

// ─── Engine ───────────────────────────────────────────────────────────────────
export { gamesEngine }       from './engine.js';
export { default as gamesEngine_ } from './engine.js';

// ─── Session Manager ──────────────────────────────────────────────────────────
export { gameSessions, GameSession } from './sessions.js';

// ─── Storage ──────────────────────────────────────────────────────────────────
export {
  getPlayerData,
  setPlayerData,
  updatePlayerData,
  getGameData,
  deletePlayerData,
  clearGameData,
} from './storage.js';

// ─── Leaderboard ──────────────────────────────────────────────────────────────
export {
  recordOutcome,
  recordWin,
  recordLoss,
  recordDraw,
  getLeaderboard,
  formatLeaderboard,
  getPlayerRank,
  getGlobalStats,
  formatPlayerStats,
} from './leaderboard.js';
