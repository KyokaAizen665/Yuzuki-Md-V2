/**
 * Registry Bootstrap — Phase 9
 *
 * This module is imported early in bot.js (before loadPlugins is called)
 * to make the pluginManager singleton available across the process from
 * the very first tick.
 *
 * History
 *   Phase 1 — manually called registerCommand() with metadata-only stubs
 *              (no execute function) so the registry existed at import time.
 *   Phase 9 — full metadata + execute is handled by plugin-manager.loadPlugin().
 *              This file is retained as a lifecycle anchor and re-exports
 *              pluginManager for modules that import it from here.
 *
 * Usage
 *   import './registry-bootstrap.js';          // side-effect: initialises singletons
 *   import { pluginManager } from './registry-bootstrap.js';  // optional direct access
 */

import { pluginManager } from './plugin-manager.js';

export { pluginManager };
export const bootstrapReady = true;
