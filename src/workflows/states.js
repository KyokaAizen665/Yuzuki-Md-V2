/**
 * Workflow States — Step result helpers + defineWorkflow()
 *
 * This module is purely descriptive (no I/O, no singletons).
 * It provides the vocabulary that workflow handlers use to communicate
 * with the WorkflowManager about what should happen next.
 *
 * ─── Step result contract ─────────────────────────────────────────────────────
 *
 *  Step handlers (handle / enter) must return one of:
 *
 *    StepResult.next('stepName')      — advance to a named step
 *    StepResult.done()                — workflow completed successfully
 *    StepResult.retry('error msg')    — re-prompt; stay on current step
 *    StepResult.cancel('reason')      — abort workflow from within a step
 *
 *  Returning undefined / null from a handler is treated as StepResult.done().
 *
 * ─── Step definition contract ─────────────────────────────────────────────────
 *
 *  {
 *    name: string,
 *
 *    // Optional: runs when the step is first entered.
 *    // May return a StepResult to skip the handle phase entirely
 *    // (e.g. a "deliver" step that does all its work in enter()).
 *    enter?: async (session, ctx) => StepResult | void,
 *
 *    // Required: runs when the user sends a message while on this step.
 *    handle: async (session, input, ctx) => StepResult,
 *
 *    // Optional: max consecutive retries before auto-cancel (default: 3)
 *    maxRetries?: number,
 *  }
 *
 * ─── ctx shape ────────────────────────────────────────────────────────────────
 *
 *  {
 *    sock:     object,   // Baileys socket (live reference)
 *    msg:      object,   // WAMessage that triggered this step
 *    settings: object,   // Current bot settings
 *  }
 *
 * ─── Workflow definition contract ─────────────────────────────────────────────
 *
 *  defineWorkflow({
 *    name:      string,
 *    timeout:   number,   // ms per step (default: 60 000)
 *    steps:     Step[],
 *    onCancel:  async (session, ctx, reason) => void,
 *    onTimeout: async (session, ctx) => void,
 *    onComplete: async (session, ctx) => void,
 *  })
 */

// ─── Step result helpers ──────────────────────────────────────────────────────

/**
 * Namespace of step result factories.
 * Always use these instead of constructing plain objects — the shapes are
 * checked by WorkflowManager to decide what to do next.
 */
export const StepResult = Object.freeze({
  /**
   * Advance to a named step.
   * @param {string} stepName
   */
  next: (stepName) => ({ _type: 'next', next: stepName }),

  /**
   * Mark the workflow as successfully completed.
   */
  done: () => ({ _type: 'done' }),

  /**
   * Re-prompt the user; stay on the current step.
   * @param {string} [error]  - Optional message to send the user
   */
  retry: (error) => ({ _type: 'retry', error: error ?? null }),

  /**
   * Abort the workflow from inside a step handler.
   * @param {string} [reason] - Reason string forwarded to onCancel
   */
  cancel: (reason) => ({ _type: 'cancel', reason: reason ?? 'step' }),
});

// ─── defineWorkflow ───────────────────────────────────────────────────────────

/**
 * Define a workflow.
 *
 * Returns a frozen definition object the WorkflowManager can register.
 * Throws early (at definition time) if the shape is invalid.
 *
 * @param {object}   opts
 * @param {string}   opts.name        - Unique workflow name
 * @param {number}   [opts.timeout]   - Per-step timeout in ms (default: 60 000)
 * @param {object[]} opts.steps       - Ordered step definitions
 * @param {Function} [opts.onCancel]  - async (session, ctx, reason) => void
 * @param {Function} [opts.onTimeout] - async (session, ctx) => void
 * @param {Function} [opts.onComplete]- async (session, ctx) => void
 * @returns {Readonly<object>}
 */
export function defineWorkflow({
  name,
  timeout   = 60_000,
  steps,
  onCancel,
  onTimeout,
  onComplete,
}) {
  if (!name || typeof name !== 'string') {
    throw new Error('defineWorkflow: "name" must be a non-empty string');
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error(`defineWorkflow "${name}": "steps" must be a non-empty array`);
  }

  const stepMap = new Map();
  for (const step of steps) {
    if (!step.name || typeof step.name !== 'string') {
      throw new Error(`defineWorkflow "${name}": every step must have a "name" string`);
    }
    if (typeof step.handle !== 'function' && typeof step.enter !== 'function') {
      throw new Error(
        `defineWorkflow "${name}" step "${step.name}": ` +
        'must have at least one of "enter" or "handle"',
      );
    }
    if (stepMap.has(step.name)) {
      throw new Error(`defineWorkflow "${name}": duplicate step name "${step.name}"`);
    }
    stepMap.set(step.name, step);
  }

  return Object.freeze({
    name,
    timeout,
    steps,
    stepMap,
    firstStep:  steps[0].name,
    onCancel:   onCancel   ?? null,
    onTimeout:  onTimeout  ?? null,
    onComplete: onComplete ?? null,
  });
}

// ─── Internal helpers (used by WorkflowManager) ───────────────────────────────

/**
 * Normalise a handler return value to a StepResult shape.
 * undefined / null → done
 * @param {any} result
 * @returns {{ _type: string, [key: string]: any }}
 */
export function normaliseResult(result) {
  if (result == null)           return StepResult.done();
  if (result._type)             return result;
  // Legacy: plain { next } / { done } shapes (for convenience)
  if (result.done)              return StepResult.done();
  if (result.next)              return StepResult.next(result.next);
  if (result.retry !== undefined) return StepResult.retry(result.error);
  if (result.cancel !== undefined) return StepResult.cancel(result.reason);
  return StepResult.done();
}
