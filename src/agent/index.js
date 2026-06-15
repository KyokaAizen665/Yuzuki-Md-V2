/**
 * Agent Layer — barrel export
 *
 * Import from here in other modules:
 *   import { agentRouter, taskQueue, sessionMemory } from './agent/index.js';
 */

export { agentRouter }    from './router.js';
export { taskQueue, JobStatus } from './queue.js';
export { sessionMemory }  from './memory.js';
export { workflows }      from './tasks/index.js';
