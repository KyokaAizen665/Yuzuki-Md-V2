/**
 * Workflow Sessions
 *
 * WorkflowSession  — represents a single active workflow for one chat (JID).
 * SessionStore     — in-memory Map of jid → WorkflowSession, with timeout support.
 *
 * Design notes:
 *   • One active workflow per JID at a time (chat-scoped, not user-scoped).
 *   • Timeout is managed here (clearTimer / resetTimer) so the manager
 *     only needs to call session.resetTimer() after each step.
 *   • state is a plain object; the workflow handler owns its schema.
 */

// ─── WorkflowSession ──────────────────────────────────────────────────────────

export class WorkflowSession {
  /**
   * @param {object} opts
   * @param {string}   opts.jid           - Chat JID this workflow belongs to
   * @param {string}   opts.userJid       - JID of the user who started it
   * @param {string}   opts.workflowName  - Registered workflow name
   * @param {object}   [opts.state]       - Initial shared state payload
   * @param {number}   [opts.timeout]     - Per-step timeout in ms (default: 60 000)
   */
  constructor({ jid, userJid, workflowName, state = {}, timeout = 60_000 }) {
    this.jid          = jid;
    this.userJid      = userJid;
    this.workflowName = workflowName;
    this.currentStep  = null;    // set by WorkflowManager after creation
    this.state        = { ...state };
    this.timeout      = timeout;
    this.startedAt    = Date.now();
    this.lastActivity = Date.now();
    this.retryCount   = 0;      // consecutive retries on the current step
    this._timer       = null;
    this._onTimeout   = null;   // callback set by manager; () => Promise<void>
  }

  /** Update last-activity timestamp (called after every input). */
  touch() {
    this.lastActivity = Date.now();
    this.retryCount   = 0;
  }

  /** Increment retry counter without touching the activity timer. */
  retry() {
    this.retryCount++;
  }

  /** Replace the step-timeout timer.  Calls `callback` if it fires. */
  resetTimer(callback) {
    this.clearTimer();
    this._onTimeout = callback;
    this._timer = setTimeout(async () => {
      this._timer = null;
      if (this._onTimeout) await this._onTimeout().catch(() => {});
    }, this.timeout);
  }

  /** Cancel any running timeout timer. */
  clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer    = null;
      this._onTimeout = null;
    }
  }

  /** Serialisable snapshot (for logging / debug). */
  toJSON() {
    return {
      jid:          this.jid,
      userJid:      this.userJid,
      workflowName: this.workflowName,
      currentStep:  this.currentStep,
      state:        this.state,
      startedAt:    this.startedAt,
      lastActivity: this.lastActivity,
      retryCount:   this.retryCount,
    };
  }
}

// ─── SessionStore ─────────────────────────────────────────────────────────────

class SessionStore {
  constructor() {
    /** @type {Map<string, WorkflowSession>} jid → session */
    this._map = new Map();
  }

  /**
   * Store a session for a JID.  Replaces any existing session (clearing its timer).
   * @param {WorkflowSession} session
   */
  set(session) {
    const existing = this._map.get(session.jid);
    if (existing) existing.clearTimer();
    this._map.set(session.jid, session);
  }

  /**
   * Retrieve the active session for a JID.
   * @param {string} jid
   * @returns {WorkflowSession|null}
   */
  get(jid) {
    return this._map.get(jid) ?? null;
  }

  /**
   * Check whether a JID has an active session.
   * @param {string} jid
   * @returns {boolean}
   */
  has(jid) {
    return this._map.has(jid);
  }

  /**
   * Remove a session, clearing its timer first.
   * @param {string} jid
   */
  delete(jid) {
    const s = this._map.get(jid);
    if (s) s.clearTimer();
    this._map.delete(jid);
  }

  /** All active sessions as an array. */
  all() {
    return [...this._map.values()];
  }

  /** Number of active sessions. */
  get size() {
    return this._map.size;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export { SessionStore };
export const sessionStore = new SessionStore();
export default sessionStore;
