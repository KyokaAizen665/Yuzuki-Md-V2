/**
 * Games Engine — v1.0
 *
 * Central coordinator for the Yuzuki Games Framework.
 * Provides the full game lifecycle API used by game plugins.
 *
 * ─── Core API ─────────────────────────────────────────────────────────────────
 *
 *   gamesEngine.registerGame(definition)
 *     Register a game type. Typically called at module-level in a game plugin
 *     so it self-registers when imported by the plugin-loader.
 *
 *   gamesEngine.startGame(jid, gameId, players, initialState, ctx)
 *     Start a new game session. Calls definition.onStart(session, ctx).
 *     Returns { ok, session?, error? }.
 *
 *   gamesEngine.pauseGame(jid, ctx)
 *     Pause an active game. Blocks move routing. Calls definition.onPause().
 *
 *   gamesEngine.resumeGame(jid, ctx)
 *     Resume a paused game. Re-enables move routing. Calls definition.onResume().
 *
 *   gamesEngine.endGame(jid, result, ctx)
 *     End a session. Records leaderboard. Grants rewards. Calls definition.onEnd().
 *
 *   gamesEngine.routeInput(jid, input, ctx)
 *     Route a raw message to the active game's onMove() handler.
 *     Returns true if message was consumed (caller should skip further routing).
 *
 * ─── Game Definition Contract ──────────────────────────────────────────────────
 *
 *   {
 *     gameId:      string,          // unique identifier (required)
 *     name:        string,          // display name
 *     description: string,
 *     minPlayers:  number,          // default 1
 *     maxPlayers:  number,          // default 1
 *     timeout:     number,          // ms, default 120_000
 *     rewards: {
 *       win:  { coins: number, xp: number },
 *       lose: { coins: number, xp: number },
 *       draw: { coins: number, xp: number },
 *     },
 *
 *     // Lifecycle hooks — all optional
 *     async onStart(session, ctx)         → void
 *     async onMove(session, input, ctx)   → MoveResult
 *     async onPause(session, ctx)         → void
 *     async onResume(session, ctx)        → void
 *     async onEnd(session, result, ctx)   → void
 *   }
 *
 * ─── MoveResult (returned by onMove) ──────────────────────────────────────────
 *
 *   { done: false }                           game continues, wait for next input
 *   { done: true, winner: jid }               single winner
 *   { done: true, winners: [jid, ...] }       multiple winners
 *   { done: true, draw: true }                draw / tie
 *   { done: true, cancelled: true }           surrender / timeout cancel (no rewards)
 *
 * ─── Plugin self-registration pattern ─────────────────────────────────────────
 *
 *   // In src/games/plugins/mygame.js (top of file, before export default):
 *   import { gamesEngine } from '../engine.js';
 *   gamesEngine.registerGame({
 *     gameId: 'mygame',
 *     onStart: async (session, ctx) => { ... },
 *     onMove:  async (session, input, ctx) => { ... },
 *   });
 *   export default { name: 'mygame', category: 'game', execute: ... };
 */

import { gameSessions }    from './sessions.js';
import { recordOutcome }   from './leaderboard.js';
import { addXP, addCoins } from '../lib/database.js';

// ─── GamesEngine ─────────────────────────────────────────────────────────────

class GamesEngine {
  constructor() {
    /** @type {Map<string, object>} gameId → frozen game definition */
    this._games = new Map();
    /** @type {string[]|null} cached listGames() result; null = dirty */
    this._gameIdCache = null;
  }

  // ─── Registration ───────────────────────────────────────────────────────────

  /**
   * Register a game definition.
   * Idempotent — re-registering replaces the previous definition.
   *
   * @param {object} def  Must include at minimum { gameId }
   */
  registerGame(def) {
    if (!def?.gameId) {
      throw new Error('[GamesEngine] registerGame: definition must have a "gameId"');
    }

    const normalised = {
      // Defaults
      name:        def.gameId,
      description: '',
      minPlayers:  1,
      maxPlayers:  1,
      timeout:     120_000,
      // Merge caller definition on top of defaults
      ...def,
      // Rewards: deep-merge so caller only needs to override what changes
      rewards: {
        win:  { coins: 200, xp: 100 },
        lose: { coins: 0,   xp:  25 },
        draw: { coins:  50, xp:  50 },
        ...(def.rewards ?? {}),
      },
    };

    this._games.set(def.gameId, Object.freeze(normalised));
    this._gameIdCache = null; // invalidate listGames() cache
    console.log(`[GamesEngine] Registered: ${def.gameId}`);
  }

  /**
   * Retrieve a registered game definition by ID.
   * @param {string} gameId
   * @returns {object|null}
   */
  getGame(gameId) {
    return this._games.get(gameId) ?? null;
  }

  /**
   * List all registered game IDs. Cached — O(1) after first call.
   * @returns {string[]}
   */
  listGames() {
    if (!this._gameIdCache) {
      this._gameIdCache = [...this._games.keys()];
    }
    return this._gameIdCache;
  }

  /**
   * True if a game is registered.
   * @param {string} gameId
   */
  hasGame(gameId) {
    return this._games.has(gameId);
  }

  // ─── startGame ──────────────────────────────────────────────────────────────

  /**
   * Start a game for a JID.
   *
   * If another game is already active it is terminated first (no rewards).
   *
   * @param {string}   jid           - Chat JID
   * @param {string}   gameId        - Registered game identifier
   * @param {string[]} players       - Player JIDs (use ['bot'] for AI opponents)
   * @param {object}   [initialState] - Seed data merged into session.state
   * @param {object}   [ctx]         - { sock, msg, settings }
   * @returns {Promise<{ ok: boolean, session?: object, error?: string }>}
   */
  async startGame(jid, gameId, players = [], initialState = {}, ctx = {}) {
    const def = this._games.get(gameId);
    if (!def) return { ok: false, error: `Unknown game: "${gameId}"` };

    if (players.length < def.minPlayers) {
      return { ok: false, error: `${def.name} requires at least ${def.minPlayers} player(s).` };
    }
    if (players.length > def.maxPlayers) {
      return { ok: false, error: `${def.name} supports at most ${def.maxPlayers} player(s).` };
    }

    // Silently replace any existing session
    if (gameSessions.hasAny(jid)) {
      gameSessions.end(jid);
    }

    const session = gameSessions.create(jid, gameId, players, initialState);

    if (typeof def.onStart === 'function') {
      try {
        await def.onStart(session, ctx);
      } catch (err) {
        gameSessions.end(jid);
        return { ok: false, error: `Game start error: ${err.message}` };
      }
    }

    return { ok: true, session };
  }

  // ─── pauseGame ──────────────────────────────────────────────────────────────

  /**
   * Pause an active game.
   *
   * A paused session retains all state but routeInput() will not deliver
   * moves to it.  Use resumeGame() to continue.
   *
   * @param {string} jid
   * @param {object} [ctx]
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async pauseGame(jid, ctx = {}) {
    const session = gameSessions.get(jid);
    if (!session) return { ok: false, error: 'No active game to pause.' };

    const def = this._games.get(session.gameId);
    gameSessions.pause(jid);

    if (typeof def?.onPause === 'function') {
      try { await def.onPause(session, ctx); } catch {}
    }

    return { ok: true };
  }

  // ─── resumeGame ─────────────────────────────────────────────────────────────

  /**
   * Resume a paused game.
   *
   * @param {string} jid
   * @param {object} [ctx]
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async resumeGame(jid, ctx = {}) {
    if (!gameSessions.isPaused(jid)) {
      return { ok: false, error: 'No paused game to resume.' };
    }

    const session = gameSessions.getAny(jid);
    if (!session) return { ok: false, error: 'Session has expired.' };

    const def = this._games.get(session.gameId);
    gameSessions.resume(jid);

    if (typeof def?.onResume === 'function') {
      try { await def.onResume(session, ctx); } catch {}
    }

    return { ok: true };
  }

  // ─── endGame ────────────────────────────────────────────────────────────────

  /**
   * End a game session.
   *
   * Steps (in order):
   *   1. Remove session from store
   *   2. Record outcome to leaderboard (skipped if result.cancelled)
   *   3. Grant coin/XP rewards to winners/losers
   *   4. Call definition.onEnd(session, result, ctx)
   *
   * @param {string} jid
   * @param {object} result   { winner?, winners?, draw?, cancelled? }
   * @param {object} [ctx]
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async endGame(jid, result = {}, ctx = {}) {
    const session = gameSessions.getAny(jid);
    if (!session) return { ok: false, error: 'No game session to end.' };

    const def = this._games.get(session.gameId);

    // Remove from session store
    gameSessions.end(jid);

    // Record outcomes + grant rewards (skip on surrender/cancel)
    if (!result.cancelled && def) {
      await this._recordOutcomes(session, def, result);
    }

    // onEnd hook
    if (typeof def?.onEnd === 'function') {
      try { await def.onEnd(session, result, ctx); } catch {}
    }

    return { ok: true };
  }

  // ─── routeInput ─────────────────────────────────────────────────────────────

  /**
   * Route an incoming message to the active game's onMove() handler.
   *
   * Paused sessions are skipped (returns false).
   * If onMove() returns { done: true }, endGame() is automatically called.
   *
   * @param {string} jid
   * @param {string} input   Raw message text
   * @param {object} ctx     { sock, msg, settings, sender }
   * @returns {Promise<boolean>} true if message was consumed
   */
  async routeInput(jid, input, ctx = {}) {
    const session = gameSessions.get(jid); // null when paused
    if (!session) return false;

    const def = this._games.get(session.gameId);
    if (!def || typeof def.onMove !== 'function') return false;

    let moveResult;
    try {
      moveResult = await def.onMove(session, input.trim(), ctx);
    } catch (err) {
      console.error(`[GamesEngine] onMove error in "${session.gameId}":`, err);
      return true; // consumed — suppress further routing even on error
    }

    if (moveResult?.done) {
      await this.endGame(jid, moveResult, ctx);
    }

    return true;
  }

  // ─── Convenience query helpers ───────────────────────────────────────────────

  /** True if the JID has an active (non-paused) game session. */
  isActive(jid)  { return gameSessions.has(jid); }

  /** True if the JID has a paused game session. */
  isPaused(jid)  { return gameSessions.isPaused(jid); }

  /** Get the active (non-paused) session for a JID, or undefined. */
  getSession(jid) { return gameSessions.get(jid); }

  /** Get the session regardless of pause state, or undefined. */
  getSessionAny(jid) { return gameSessions.getAny(jid); }

  /** All sessions (active + paused). */
  getSessions() { return gameSessions.all(); }

  // ─── Private: leaderboard + reward dispatch ──────────────────────────────────

  async _recordOutcomes(session, def, result) {
    const rewards = def.rewards ?? {};

    // Build winner list
    const winners = result.winners
      ?? (result.winner ? [result.winner] : []);
    const isDraw  = !!(result.draw);

    for (const playerJid of session.players) {
      if (playerJid === 'bot') continue; // skip AI placeholder

      let outcome;
      if (isDraw) {
        outcome = 'draw';
      } else if (winners.includes(playerJid)) {
        outcome = 'win';
      } else {
        outcome = 'loss';
      }

      // Leaderboard
      recordOutcome(playerJid, session.gameId, outcome);

      // Economy
      const reward = rewards[outcome] ?? {};
      try { if ((reward.coins ?? 0) > 0) addCoins(playerJid, reward.coins); } catch {}
      try { if ((reward.xp    ?? 0) > 0) addXP(playerJid,    reward.xp);    } catch {}
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const gamesEngine = new GamesEngine();
export default gamesEngine;
