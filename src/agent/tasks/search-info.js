/**
 * Workflow: Search & Show Command Info
 *
 * Triggered by natural-language phrases such as:
 *   "find the sticker command"
 *   "what does ytaudio do"
 *   "how do I use the downloader"
 *   "search for translate"
 *   "help me with the ai commands"
 *
 * Steps:
 *   1. Search the live registry for matching commands
 *   2a. Exactly one match → show full commandCard (plugininfo style)
 *   2b. Multiple matches  → show searchCard (select list)
 *   2c. No matches        → show didYouMeanCard or plain error
 *
 * This is a "zero-steps-blocking" workflow — all work happens in one async
 * step so the queue overhead is minimal.
 */

import { BaseWorkflow } from './_base.js';
import { searchCommands } from '../../lib/registry.js';
import { searchCard, commandCard, didYouMeanCard } from '../../nativeflow/index.js';

// ─── Pattern definitions ───────────────────────────────────────────────────────

const PATTERNS = [
  // "what does X do" / "what is X"
  /what\s+(?:does\s+)?(?:the\s+)?(.+?)\s+(?:command\s+)?do/i,
  /what\s+is\s+(?:the\s+)?(.+?)\s+command/i,
  // "how do I use X" / "how to use X"
  /how\s+(?:do\s+i\s+|to\s+)use\s+(?:the\s+)?(.+?)(?:\s+command)?$/i,
  // "find X command" / "find the X command"
  /find\s+(?:the\s+)?(.+?)\s+command/i,
  // "search for X" / "search X command"
  /search\s+(?:for\s+)?(?:the\s+)?(.+?)(?:\s+command)?$/i,
  // "help me with X" / "help with X"
  /help\s+(?:me\s+)?(?:with\s+)?(?:the\s+)?(.+?)(?:\s+command)?$/i,
  // "show me X" / "tell me about X"
  /(?:show\s+me|tell\s+me\s+about)\s+(?:the\s+)?(.+?)(?:\s+command)?$/i,
];

// ─── Workflow class ───────────────────────────────────────────────────────────

export class SearchInfoWorkflow extends BaseWorkflow {
  get name() { return 'Search & Show Command Info'; }

  match(text, { prefix }) {
    // Don't intercept bare prefix commands like ".search X" — those go to the plugin
    if (text.startsWith(prefix)) return { matched: false, vars: {} };

    for (const re of PATTERNS) {
      const m = text.match(re);
      if (m) {
        const query = (m[1] ?? '').trim();
        if (query.length >= 2) return { matched: true, vars: { query } };
      }
    }
    return { matched: false, vars: {} };
  }

  buildSteps({ vars, sock, msg, jid, settings, prefix }) {
    const { query } = vars;
    const botName   = settings?.botName ?? 'Yuzuki MD';

    return [
      {
        name: `🔍 Search registry for "${query}"`,
        abortOnError: false,
        fn: async (_ctx) => {
          const results = searchCommands(query, { limit: 10 });

          if (!results.length) {
            // Try broader search and suggest alternatives
            const broad = searchCommands(query.split(' ')[0], { limit: 5 });
            await didYouMeanCard(sock, jid, msg, query, broad, { prefix, botName });
            return { found: 0 };
          }

          if (results.length === 1) {
            // Exact / single match — show full command detail
            await commandCard(sock, jid, msg, results[0], { prefix, botName });
            return { found: 1, command: results[0].name };
          }

          // Multiple matches — show interactive select list
          await searchCard(sock, jid, msg, query, { prefix, botName, limit: 10 });
          return { found: results.length };
        },
      },
    ];
  }
}
