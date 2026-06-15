/**
 * Workflow Registry — auto-registers all built-in workflow handlers.
 *
 * Import this module once at startup (bot.js already does this via
 * registry-bootstrap or directly).  Every handler in src/workflows/handlers/
 * is registered with the workflowManager singleton here.
 *
 * Adding a new workflow:
 *   1. Create  src/workflows/handlers/myWorkflow.js
 *   2. Export  export const myWorkflow = defineWorkflow({ ... })
 *   3. Import + register it below — one line each.
 */

import { workflowManager } from './manager.js';
import { playWorkflow }    from './handlers/play.js';
import { remindWorkflow }  from './handlers/remind.js';

// ─── Register all workflows ───────────────────────────────────────────────────

workflowManager.register(playWorkflow);
workflowManager.register(remindWorkflow);

// ─── Re-exports for convenience ───────────────────────────────────────────────

export { workflowManager }   from './manager.js';
export { sessionStore }      from './sessions.js';
export { defineWorkflow, StepResult } from './states.js';

export const workflowsReady = true;
