/**
 * Workflow Manager — singleton
 *
 * Central coordinator for all multi-step user interactions.
 *
 * ─── Lifecycle ────────────────────────────────────────────────────────────────
 *
 *   workflowManager.register(definition)
 *     Register a workflow definition (from defineWorkflow()).
 *     Should be done at startup, before any messages arrive.
 *
 *   workflowManager.start(jid, name, initialState, ctx)
 *     Start a workflow for a chat.  Runs the first step's enter().
 *     Returns { ok, error }.
 *
 *   workflowManager.resume(jid, input, ctx)
 *     Route a user message to the active workflow for that JID.
 *     Returns true if the message was consumed (caller should skip
 *     normal command routing), false if there is no active workflow.
 *
 *   workflowManager.cancel(jid, reason, ctx)
 *     Abort the active workflow for a JID. Calls onCancel hook.
 *
 *   workflowManager.has(jid) / workflowManager.get(jid)
 *     Query session existence / retrieve session snapshot.
 *
 * ─── bot.js integration ───────────────────────────────────────────────────────
 *
 *   import { workflowManager } from './workflows/manager.js';
 *
 *   // In message handler, before normal command routing:
 *   const handled = await workflowManager.resume(jid, text, { sock, msg, settings });
 *   if (handled) continue;
 *
 * ─── Plugin integration ───────────────────────────────────────────────────────
 *
 *   import { workflowManager } from '../../workflows/manager.js';
 *
 *   // Start a workflow from execute():
 *   const result = await workflowManager.start(
 *     jid, 'play', { query: args.join(' ') }, { sock, msg, settings }
 *   );
 *   if (!result.ok) await reply(result.error);
 */

import { WorkflowSession, sessionStore } from './sessions.js';
import { normaliseResult }               from './states.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum consecutive retries per step before the workflow is auto-cancelled. */
const MAX_RETRIES = 3;

/** Commands that always cancel an active workflow (checked after prefix strip). */
const CANCEL_COMMANDS = new Set(['cancel', 'stop', 'quit', 'exit']);

// ─── WorkflowManager ─────────────────────────────────────────────────────────

class WorkflowManager {
  constructor() {
    /** @type {Map<string, object>} name → frozen workflow definition */
    this._definitions = new Map();
    /** @type {string[]|null} cached listWorkflows() result; null = dirty */
    this._namesCache  = null;
  }

  // ─── Registration ───────────────────────────────────────────────────────────

  /**
   * Register a workflow definition produced by defineWorkflow().
   * Duplicate names overwrite the previous definition.
   *
   * @param {Readonly<object>} definition
   */
  register(definition) {
    if (!definition?.name) {
      throw new Error('WorkflowManager.register: definition must have a "name"');
    }
    this._definitions.set(definition.name, definition);
    this._namesCache = null; // invalidate cache
  }

  /**
   * Convenience: register multiple definitions at once.
   * @param {Readonly<object>[]} definitions
   */
  registerAll(definitions) {
    for (const def of definitions) this.register(def);
  }

  // ─── Query ──────────────────────────────────────────────────────────────────

  /** True if the JID currently has an active workflow session. */
  has(jid) {
    return sessionStore.has(jid);
  }

  /**
   * Return a plain snapshot of the active session for a JID, or null.
   * @param {string} jid
   * @returns {object|null}
   */
  get(jid) {
    const s = sessionStore.get(jid);
    return s ? s.toJSON() : null;
  }

  /** Return all registered workflow names. Cached — O(1) after first call. */
  listWorkflows() {
    if (!this._namesCache) {
      this._namesCache = [...this._definitions.keys()];
    }
    return this._namesCache;
  }

  /**
   * Return a safe metadata summary for a workflow — no function references.
   * Used by UI card generators that need step names and timeout.
   *
   * @param {string} name
   * @returns {{
   *   name:       string,
   *   timeout:    number,
   *   stepCount:  number,
   *   firstStep:  string,
   *   steps:      Array<{ name: string, maxRetries: number }>,
   * } | null}
   */
  getWorkflowInfo(name) {
    const def = this._definitions.get(name);
    if (!def) return null;
    return {
      name:      def.name,
      timeout:   def.timeout,
      stepCount: def.steps.length,
      firstStep: def.firstStep,
      steps:     def.steps.map(s => ({
        name:       s.name,
        maxRetries: s.maxRetries ?? 3,
      })),
    };
  }

  // ─── Start ──────────────────────────────────────────────────────────────────

  /**
   * Start a workflow for a chat JID.
   *
   * If a workflow is already active for this JID it is cancelled first.
   *
   * @param {string} jid          - Chat JID
   * @param {string} name         - Registered workflow name
   * @param {object} initialState - Seed data passed to every step as session.state
   * @param {object} ctx          - { sock, msg, settings }
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async start(jid, name, initialState = {}, ctx = {}) {
    const def = this._definitions.get(name);
    if (!def) {
      return { ok: false, error: `Unknown workflow: "${name}"` };
    }

    // Cancel any existing workflow for this JID silently (no hook call)
    if (sessionStore.has(jid)) {
      const old = sessionStore.get(jid);
      old.clearTimer();
      sessionStore.delete(jid);
    }

    const userJid = ctx.msg?.key?.participant ?? ctx.msg?.key?.remoteJid ?? 'unknown';

    const session = new WorkflowSession({
      jid,
      userJid,
      workflowName: name,
      state:        initialState,
      timeout:      def.timeout,
    });

    sessionStore.set(session);

    // Enter the first step
    try {
      await this._enterStep(session, def, def.firstStep, ctx);
    } catch (err) {
      sessionStore.delete(jid);
      return { ok: false, error: `Workflow start error: ${err.message}` };
    }

    return { ok: true };
  }

  // ─── Resume ─────────────────────────────────────────────────────────────────

  /**
   * Route a user message to the active workflow for that JID.
   *
   * Handles:
   *   - Auto-cancel on known cancel commands (.cancel / cancel / etc.)
   *   - Auto-cancel when a *different* prefixed command is sent
   *     (workflow ends, command is allowed to execute normally → returns false)
   *   - Step handler invocation and result routing
   *   - Retry limiting
   *   - Timeout reset
   *
   * @param {string} jid     - Chat JID
   * @param {string} input   - Raw message text
   * @param {object} ctx     - { sock, msg, settings }
   * @returns {Promise<boolean>} true if consumed, false if caller should continue
   */
  async resume(jid, input, ctx = {}) {
    const session = sessionStore.get(jid);
    if (!session) return false;

    const def    = this._definitions.get(session.workflowName);
    const prefix = ctx.settings?.prefix ?? '.';
    const trimmed = input.trim();

    // ── Explicit cancel commands ────────────────────────────────────────────
    if (trimmed.startsWith(prefix)) {
      const cmd = trimmed.slice(prefix.length).split(/\s+/)[0].toLowerCase();
      if (CANCEL_COMMANDS.has(cmd)) {
        await this.cancel(jid, 'user', ctx);
        return true; // consumed
      }
      // A *different* prefixed command → cancel workflow silently, let command run
      await this._silentCancel(jid, 'interrupted', ctx);
      return false; // not consumed
    }

    if (!def) {
      // Definition was unregistered while session was active — clean up
      sessionStore.delete(jid);
      return false;
    }

    // ── Route to current step handler ──────────────────────────────────────
    const step = def.stepMap.get(session.currentStep);
    if (!step) {
      await this.cancel(jid, 'invalid_step', ctx);
      return true;
    }

    session.touch();

    let result;
    try {
      const handler = step.handle ?? (async () => null);
      result = normaliseResult(await handler(session, trimmed, ctx));
    } catch (err) {
      console.error(`[Workflow] Step "${step.name}" handler error:`, err);
      result = { _type: 'retry', error: `⚠️ An error occurred. Please try again.` };
    }

    await this._processResult(session, def, result, ctx);
    return true; // always consumed (we responded somehow)
  }

  // ─── Cancel ─────────────────────────────────────────────────────────────────

  /**
   * Cancel the active workflow for a JID.  Calls the onCancel hook.
   *
   * @param {string} jid
   * @param {string} [reason]  - 'user' | 'timeout' | 'interrupted' | custom
   * @param {object} [ctx]     - { sock, msg, settings }
   */
  async cancel(jid, reason = 'user', ctx = {}) {
    const session = sessionStore.get(jid);
    if (!session) return;

    const def = this._definitions.get(session.workflowName);
    sessionStore.delete(jid);

    if (def?.onCancel) {
      try { await def.onCancel(session, ctx, reason); } catch {}
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Silently cancel without running the onCancel hook.
   * Used when a different command interrupts the workflow.
   */
  async _silentCancel(jid, _reason, _ctx) {
    sessionStore.delete(jid);
  }

  /**
   * Activate a named step: set session.currentStep, run enter(), process result.
   *
   * @param {WorkflowSession} session
   * @param {object}          def
   * @param {string}          stepName
   * @param {object}          ctx
   */
  async _enterStep(session, def, stepName, ctx) {
    const step = def.stepMap.get(stepName);
    if (!step) {
      throw new Error(`Step "${stepName}" not found in workflow "${def.name}"`);
    }

    session.currentStep = stepName;
    session.retryCount  = 0;

    // Set (or reset) the per-step timeout
    session.resetTimer(async () => {
      const stillActive = sessionStore.get(session.jid) === session;
      if (!stillActive) return;
      sessionStore.delete(session.jid);
      if (def.onTimeout) {
        try { await def.onTimeout(session, ctx); } catch {}
      } else {
        // Default timeout message
        try {
          await ctx.sock?.sendMessage(session.jid, {
            text: `⏱️ *Workflow timed out.*\nType the command again to restart.`,
          });
        } catch {}
      }
    });

    // Run enter() if present
    if (typeof step.enter === 'function') {
      let rawEnterResult;
      try {
        rawEnterResult = await step.enter(session, ctx);
      } catch (err) {
        console.error(`[Workflow] Step "${stepName}" enter error:`, err);
        await this.cancel(session.jid, 'enter_error', ctx);
        return;
      }

      // null / undefined from enter() means "prompt sent — stay and wait for handle()".
      // Only act on an explicit StepResult (next / done / cancel / retry).
      // This matches the documented contract: returning nothing = wait for user input.
      if (rawEnterResult != null) {
        const enterResult = normaliseResult(rawEnterResult);
        if (enterResult._type !== 'retry') {
          await this._processResult(session, def, enterResult, ctx);
        }
      }
      // If enter() returned null/undefined/retry, stay on current step.
    }
  }

  /**
   * Process a StepResult returned by handle() or enter().
   *
   * @param {WorkflowSession} session
   * @param {object}          def
   * @param {object}          result    - normalised StepResult
   * @param {object}          ctx
   */
  async _processResult(session, def, result, ctx) {
    switch (result._type) {

      case 'next': {
        if (!def.stepMap.has(result.next)) {
          console.error(`[Workflow] "${def.name}": step "${result.next}" not found`);
          await this.cancel(session.jid, 'invalid_step', ctx);
          return;
        }
        await this._enterStep(session, def, result.next, ctx);
        break;
      }

      case 'done': {
        session.clearTimer();
        sessionStore.delete(session.jid);
        if (def.onComplete) {
          try { await def.onComplete(session, ctx); } catch {}
        }
        break;
      }

      case 'retry': {
        session.retry();
        const maxRetries = def.stepMap.get(session.currentStep)?.maxRetries ?? MAX_RETRIES;

        if (session.retryCount > maxRetries) {
          // Too many retries — cancel
          await this.cancel(session.jid, 'max_retries', ctx);
          try {
            await ctx.sock?.sendMessage(session.jid, {
              text: `❌ Too many invalid attempts. Workflow cancelled.\nType the command again to restart.`,
            });
          } catch {}
          return;
        }

        // Send the error hint if provided
        if (result.error) {
          try {
            await ctx.sock?.sendMessage(session.jid, { text: result.error }, { quoted: ctx.msg });
          } catch {}
        }
        // Stay on current step — timer keeps running
        break;
      }

      case 'cancel': {
        await this.cancel(session.jid, result.reason ?? 'step', ctx);
        break;
      }

      default:
        // Unknown result type — treat as done
        session.clearTimer();
        sessionStore.delete(session.jid);
    }
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────

export { WorkflowManager };
export const workflowManager = new WorkflowManager();
export default workflowManager;
