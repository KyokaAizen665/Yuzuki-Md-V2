/**
 * Game Session Manager
 *
 * Wraps the core GameEngine from lib/game-engine.js and adds:
 *   - Pause / Resume  — sessions remain alive but block move routing
 *   - hasAny / getAny — query including paused sessions
 *
 * One session per JID at a time. Paused sessions preserve all state.
 * Auto-expiry (10 min idle) is inherited from the underlying GameEngine.
 *
 * Usage:
 *   import { gameSessions, GameSession } from './sessions.js';
 *
 *   const session = gameSessions.create(jid, 'trivia', [sender], { question });
 *   gameSessions.pause(jid);
 *   gameSessions.resume(jid);
 *   gameSessions.end(jid);
 */

import { gameEngine, GameSession } from '../lib/game-engine.js';

// Re-export the GameSession class for type usage
export { GameSession };

// ─── Pause tracking ───────────────────────────────────────────────────────────

/** @type {Set<string>} JIDs whose sessions are currently paused */
const _paused = new Set();

// ─── Session Manager ─────────────────────────────────────────────────────────

/**
 * @namespace gameSessions
 * Thin wrapper around gameEngine that adds pause/resume semantics.
 */
const gameSessions = {

  // ── Create ───────────────────────────────────────────────────────────────────

  /**
   * Create a new game session.  Any existing session is replaced.
   *
   * @param {string}   jid
   * @param {string}   gameId
   * @param {string[]} players
   * @param {object}   [initialState]
   * @param {string}   [firstTurn]
   * @returns {GameSession}
   */
  create(jid, gameId, players, initialState = {}, firstTurn = null) {
    _paused.delete(jid);
    return gameEngine.create(jid, gameId, players, initialState, firstTurn);
  },

  // ── Lookup ───────────────────────────────────────────────────────────────────

  /**
   * Get the active (non-paused) session for a JID.
   * Returns undefined if no session exists OR if the session is paused.
   *
   * @param {string} jid
   * @returns {GameSession|undefined}
   */
  get(jid) {
    if (_paused.has(jid)) return undefined;
    return gameEngine.get(jid);
  },

  /**
   * Get the session regardless of pause state.
   * Returns undefined only if no session exists at all (or it expired).
   *
   * @param {string} jid
   * @returns {GameSession|undefined}
   */
  getAny(jid) {
    return gameEngine.get(jid);
  },

  /**
   * True if an active (non-paused, non-expired) session exists.
   * @param {string} jid
   */
  has(jid) {
    return !_paused.has(jid) && gameEngine.has(jid);
  },

  /**
   * True if a session exists, even if paused.
   * @param {string} jid
   */
  hasAny(jid) {
    return gameEngine.has(jid);
  },

  // ── Mutation ─────────────────────────────────────────────────────────────────

  /**
   * Merge a partial state update into the session.
   *
   * @param {string} jid
   * @param {object} patch
   * @returns {GameSession|undefined}
   */
  update(jid, patch) {
    return gameEngine.update(jid, patch);
  },

  /**
   * Advance the session's active turn to the next player (round-robin).
   *
   * @param {string} jid
   * @returns {string|undefined} Next player's JID/ID
   */
  nextTurn(jid) {
    return gameEngine.nextTurn(jid);
  },

  // ── Pause / Resume ───────────────────────────────────────────────────────────

  /**
   * Pause a session.  routeInput() will not deliver moves to a paused session.
   * State is fully preserved; the session is NOT removed.
   *
   * @param {string} jid
   * @returns {boolean} true if a session was found and paused
   */
  pause(jid) {
    if (!gameEngine.has(jid)) return false;
    _paused.add(jid);
    return true;
  },

  /**
   * Resume a paused session, re-enabling move delivery.
   *
   * @param {string} jid
   * @returns {boolean} true if a session was found and resumed
   */
  resume(jid) {
    if (!gameEngine.has(jid)) return false;
    _paused.delete(jid);
    return true;
  },

  /**
   * True if the JID's session is currently paused.
   * FIX: also verify the underlying session still exists — the gameEngine's
   * auto-expiry can silently remove the session while the JID stays in _paused,
   * causing a permanent "paused" ghost entry and blocking future games.
   * @param {string} jid
   */
  isPaused(jid) {
    if (!_paused.has(jid)) return false;
    if (!gameEngine.has(jid)) {
      _paused.delete(jid); // evict stale entry
      return false;
    }
    return true;
  },

  // ── End ──────────────────────────────────────────────────────────────────────

  /**
   * End and completely remove a session (paused or active).
   * @param {string} jid
   */
  end(jid) {
    _paused.delete(jid);
    gameEngine.end(jid);
  },

  // ── Aggregate queries ─────────────────────────────────────────────────────────

  /**
   * All active sessions (including paused ones).
   * @returns {GameSession[]}
   */
  all() {
    return gameEngine.all();
  },

  /**
   * Number of total sessions (active + paused).
   * @returns {number}
   */
  get size() {
    return gameEngine.size;
  },
};

export { gameSessions };
export default gameSessions;
