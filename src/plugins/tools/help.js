/**
 * Plugin: help
 * Category: tools
 *
 * Registry-aware help command with NativeFlow interactive cards.
 * All card generation is delegated to src/nativeflow/ — this plugin
 * contains only routing logic.
 *
 * Modes:
 *   .help               — overview of all categories (interactive select)
 *   .help <category>    — list every command in that category
 *   .help <command>     — detail card for a specific command or alias
 *   .help search <q>    — same as .search <q>
 */

import {
  getCategoryIndex,
  getAllCommands,
  searchCommands,
} from '../../lib/registry.js';

import {
  helpCard,
  categoryCard,
  commandCard,
  searchCard,
  didYouMeanCard,
} from '../../nativeflow/index.js';

export default {
  name:        'help',
  aliases:     ['commands', 'cmds'],
  category:    'tools',
  description: 'Show available commands, browse categories, or search by keyword',
  usage:       '.help [command|category] | .help search <query>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';
    const query  = args[0]?.toLowerCase();
    const opts   = { prefix, botName };

    // ── .help search <q> ─────────────────────────────────────────────────────
    if (query === 'search' && args[1]) {
      await searchCard(sock, jid, msg, args.slice(1).join(' '), opts);
      return;
    }

    // ── No argument: category overview ───────────────────────────────────────
    if (!query) {
      await helpCard(sock, jid, msg, opts);
      return;
    }

    // ── Category lookup ───────────────────────────────────────────────────────
    const index = getCategoryIndex();
    if (index[query]) {
      await categoryCard(sock, jid, msg, query, opts);
      return;
    }

    // ── Command / alias lookup ────────────────────────────────────────────────
    const cmd = getAllCommands().find(
      c => c.name === query || (c.aliases ?? []).includes(query),
    );
    if (cmd) {
      await commandCard(sock, jid, msg, cmd, opts);
      return;
    }

    // ── Fuzzy "did you mean?" fallback ────────────────────────────────────────
    const suggestions = searchCommands(query, { limit: 5 });
    if (suggestions.length) {
      await didYouMeanCard(sock, jid, msg, query, suggestions, opts);
      return;
    }

    // ── No match at all ───────────────────────────────────────────────────────
    await reply(
      `❓ No command or category found for: *${query}*\n` +
      `Try *${prefix}help* to see all categories or *${prefix}search <keyword>* to search.`,
    );
  },
};
