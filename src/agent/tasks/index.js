/**
 * Agent Workflow Registry
 *
 * All workflow instances are listed here in priority order.
 * The router tries each workflow's match() in this order and stops at the
 * first match. More specific patterns should come before broad ones.
 *
 * To add a new workflow:
 *   1. Create  src/agent/tasks/my-workflow.js  (extend BaseWorkflow)
 *   2. Import it below and add an instance to the array.
 *   3. No other files need to change.
 */

import { DownloadConvertWorkflow } from './download-convert.js';
import { SearchInfoWorkflow      } from './search-info.js';
import { StickerFromUrlWorkflow  } from './sticker-from-url.js';

/**
 * Ordered list of active workflow instances.
 * The router tries each in order — first match wins.
 * @type {import('./_base.js').BaseWorkflow[]}
 */
export const workflows = [
  new DownloadConvertWorkflow(),   // "download X and convert to voice note"
  new StickerFromUrlWorkflow(),    // "make sticker from <url>"
  new SearchInfoWorkflow(),        // "what does X do" / "how do I use X"
];
