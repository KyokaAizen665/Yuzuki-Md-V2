/**
 * Agent Session Memory
 *
 * Per-JID key-value store with TTL-based expiry and conversation history.
 * Used by agent workflows to pass data between steps and preserve context
 * across interactions within the same chat.
 *
 * Design rules:
 *  - No external dependencies.
 *  - Sessions expire after TTL (default 30 min) of inactivity.
 *  - History is capped at 20 entries per JID.
 *  - GC runs every 5 minutes to reclaim memory from dead sessions.
 */

const DEFAULT_TTL     = 30 * 60 * 1000; // 30 minutes
const HISTORY_CAP     = 20;
const GC_INTERVAL_MS  = 5  * 60 * 1000; // 5 minutes

class SessionMemory {
  /**
   * @param {number} [ttl] - Inactivity timeout in ms before a session expires
   */
  constructor(ttl = DEFAULT_TTL) {
    /**
     * @type {Map<string, { vars: Map, history: Array, lastActive: number }>}
     */
    this._sessions = new Map();
    this._ttl      = ttl;

    // Periodic GC — keeps memory footprint bounded
    setInterval(() => this._gc(), GC_INTERVAL_MS).unref?.();
  }

  // ─── Per-JID variable store ─────────────────────────────────────────────────

  /**
   * Set a variable for a JID (creates session if needed, bumps lastActive).
   * @param {string} jid
   * @param {string} key
   * @param {*}      value
   */
  set(jid, key, value) {
    this._touch(jid).vars.set(key, value);
  }

  /**
   * Get a variable for a JID. Returns `undefined` if not set or session expired.
   * @param {string} jid
   * @param {string} key
   * @returns {*}
   */
  get(jid, key) {
    const session = this._getAlive(jid);
    if (!session) return undefined;
    return session.vars.get(key);
  }

  /**
   * Check whether a variable exists for a JID.
   * @param {string} jid
   * @param {string} key
   * @returns {boolean}
   */
  has(jid, key) {
    return this.get(jid, key) !== undefined;
  }

  /**
   * Delete a specific variable for a JID.
   * @param {string} jid
   * @param {string} key
   */
  delete(jid, key) {
    this._sessions.get(jid)?.vars.delete(key);
  }

  /**
   * Get all variable keys set for a JID.
   * @param {string} jid
   * @returns {string[]}
   */
  keys(jid) {
    const session = this._getAlive(jid);
    return session ? [...session.vars.keys()] : [];
  }

  /**
   * Clear all memory (vars + history) for a JID.
   * @param {string} jid
   */
  clear(jid) {
    this._sessions.delete(jid);
  }

  // ─── Conversation history ───────────────────────────────────────────────────

  /**
   * Append an entry to the conversation history for a JID.
   * History is capped at HISTORY_CAP entries (oldest dropped first).
   *
   * @param {string} jid
   * @param {object} entry - { command, result, ts? }
   */
  pushHistory(jid, { command, result, ts = Date.now() }) {
    const session = this._touch(jid);
    session.history.push({ command, result, ts });
    if (session.history.length > HISTORY_CAP) session.history.shift();
  }

  /**
   * Get conversation history for a JID.
   * @param {string} jid
   * @returns {Array<{ command: string, result: any, ts: number }>}
   */
  getHistory(jid) {
    return this._sessions.get(jid)?.history ?? [];
  }

  /**
   * Return the most recent history entry for a JID.
   * @param {string} jid
   * @returns {{ command: string, result: any, ts: number }|null}
   */
  lastHistory(jid) {
    const h = this.getHistory(jid);
    return h.length ? h[h.length - 1] : null;
  }

  // ─── Diagnostics ────────────────────────────────────────────────────────────

  /** Number of live (non-expired) sessions. */
  get sessionCount() {
    const now = Date.now();
    let count = 0;
    for (const [, s] of this._sessions) {
      if (now - s.lastActive <= this._ttl) count++;
    }
    return count;
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  /** Get or create a session, always bumping lastActive. */
  _touch(jid) {
    if (!this._sessions.has(jid)) {
      this._sessions.set(jid, { vars: new Map(), history: [], lastActive: Date.now() });
    }
    const s = this._sessions.get(jid);
    s.lastActive = Date.now();
    return s;
  }

  /** Get an existing session only if it hasn't expired. */
  _getAlive(jid) {
    const session = this._sessions.get(jid);
    if (!session) return null;
    if (Date.now() - session.lastActive > this._ttl) {
      this._sessions.delete(jid);
      return null;
    }
    return session;
  }

  /** Garbage-collect sessions that have been inactive beyond TTL. */
  _gc() {
    const now = Date.now();
    for (const [jid, session] of this._sessions) {
      if (now - session.lastActive > this._ttl) {
        this._sessions.delete(jid);
      }
    }
  }
}

export { SessionMemory };
export const sessionMemory = new SessionMemory();
