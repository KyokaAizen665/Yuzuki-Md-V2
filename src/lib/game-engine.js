/**
 * Game Engine — session manager + API
 *
 * Provides a centralized in-memory session store for all games.
 * Each WhatsApp chat room (jid) can have at most one active game session.
 *
 * Session lifecycle:
 *   gameEngine.create(jid, gameId, players, initialState) → GameSession
 *   gameEngine.get(jid)      → GameSession | undefined
 *   gameEngine.has(jid)      → boolean
 *   gameEngine.update(jid, statePatch) → GameSession | undefined
 *   gameEngine.end(jid)      → void
 *
 * Game plugins should import `gameEngine` and call its methods from execute().
 *
 * Session auto-expires after TIMEOUT_MS of inactivity (default 10 minutes).
 */

// ─── Session class ────────────────────────────────────────────────────────────

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export class GameSession {
  /**
   * @param {object} opts
   * @param {string}   opts.gameId    - Unique identifier for the game type
   * @param {string}   opts.jid       - Chat room JID
   * @param {string[]} opts.players   - Array of player JIDs/sender IDs
   * @param {object}   opts.state     - Initial game-specific state
   * @param {string}   [opts.turn]    - JID of player whose turn it is
   */
  constructor({ gameId, jid, players, state = {}, turn = null }) {
    this.gameId    = gameId;
    this.jid       = jid;
    this.players   = players;
    this.state     = state;
    this.turn      = turn ?? players[0] ?? null;
    this.startedAt = Date.now();
    this.updatedAt = Date.now();
    this.moveCount = 0;
  }

  /**
   * Merge a partial state update into the session.
   * @param {object} patch
   */
  update(patch) {
    this.state     = { ...this.state, ...patch };
    this.updatedAt = Date.now();
    this.moveCount++;
    return this;
  }

  /**
   * Advance turn to the next player (round-robin).
   */
  nextTurn() {
    const idx = this.players.indexOf(this.turn);
    this.turn = this.players[(idx + 1) % this.players.length] ?? this.players[0];
    this.updatedAt = Date.now();
    return this.turn;
  }

  /** Whether this session has been idle longer than TIMEOUT_MS */
  get expired() {
    return Date.now() - this.updatedAt > TIMEOUT_MS;
  }

  /** Elapsed time as a human string */
  get elapsed() {
    const sec = Math.floor((Date.now() - this.startedAt) / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    return `${min}m ${sec % 60}s`;
  }
}

// ─── GameEngine singleton ─────────────────────────────────────────────────────

class GameEngine {
  constructor() {
    /** @type {Map<string, GameSession>} jid → session */
    this._sessions = new Map();

    // Periodic cleanup of expired sessions (every 5 min)
    setInterval(() => this._cleanup(), 5 * 60 * 1000);
  }

  /**
   * Create a new game session for a chat room.
   * If a session already exists it is replaced.
   *
   * @param {string}   jid
   * @param {string}   gameId
   * @param {string[]} players
   * @param {object}   initialState
   * @param {string}   [firstTurn]
   * @returns {GameSession}
   */
  create(jid, gameId, players, initialState = {}, firstTurn = null) {
    const session = new GameSession({ gameId, jid, players, state: initialState, turn: firstTurn });
    this._sessions.set(jid, session);
    return session;
  }

  /**
   * Retrieve an active (non-expired) session.
   * Expired sessions are auto-removed on access.
   *
   * @param {string} jid
   * @returns {GameSession|undefined}
   */
  get(jid) {
    const s = this._sessions.get(jid);
    if (!s) return undefined;
    if (s.expired) { this._sessions.delete(jid); return undefined; }
    return s;
  }

  /** True if an active session exists for the jid */
  has(jid) { return !!this.get(jid); }

  /**
   * Apply a partial state update to an existing session.
   * @param {string} jid
   * @param {object} patch
   * @returns {GameSession|undefined}
   */
  update(jid, patch) {
    const s = this.get(jid);
    if (!s) return undefined;
    return s.update(patch);
  }

  /**
   * Advance the session's active turn.
   * @param {string} jid
   * @returns {string|undefined} Next player's JID/sender
   */
  nextTurn(jid) {
    return this.get(jid)?.nextTurn();
  }

  /**
   * End (remove) a game session.
   * @param {string} jid
   */
  end(jid) {
    this._sessions.delete(jid);
  }

  /** Remove all expired sessions */
  _cleanup() {
    for (const [jid, session] of this._sessions) {
      if (session.expired) this._sessions.delete(jid);
    }
  }

  /** Number of active sessions */
  get size() { return this._sessions.size; }

  /** All active sessions as an array */
  all() { return [...this._sessions.values()]; }
}

export const gameEngine = new GameEngine();
export default gameEngine;
