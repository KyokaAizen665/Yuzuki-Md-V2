/**
 * NativeFlow Cards — Auto-generated from Plugin Metadata
 *
 * The canonical source for all 4 interactive card types.
 * Every function reads live from the command registry and builds
 * NativeFlow messages using the message-engine layer.
 *
 * No raw Socketon payloads are constructed here — all sending is
 * delegated to sendCard() which uses generateWAMessageFromContent +
 * relayMessage internally and falls back to plain text automatically.
 *
 * Card types:
 *   helpCard      — main help overview with category select
 *   categoryCard  — all commands in a category with command select
 *   commandCard   — detail card for one command (copy buttons)
 *   pluginCard    — alias for commandCard (explicit naming at import sites)
 *   searchCard    — full-text search results with command select
 *
 * Return shape: { ok: boolean, sent?, error?, fallbackSent? }
 */

import {
  sendCard,
  sendReply,
  copyButton,
  urlButton,
  selectButton,
  prepareImageHeader,
} from '../message-engine/index.js';

import {
  getCommandsByCategory,
  getCategoryIndex,
  getAllCommands,
  searchCommands,
} from '../lib/registry.js';

import {
  buildCommandHelp,
  buildSub,
  buildSearchResults,
  CATEGORY_META,
} from '../lib/menu-builder.js';

// WhatsApp caps single_select rows at 10 per section
const MAX_ROWS = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve prefix + botName from opts with safe defaults. */
function resolveOpts({ prefix = '.', botName = 'Yuzuki MD' } = {}) {
  return { prefix, botName };
}

/** Build select rows from a command array. */
function buildCommandRows(cmds, prefix) {
  return cmds
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_ROWS)
    .map(cmd => ({
      title:       `${prefix}${cmd.name}`,
      description: (cmd.description ?? '').slice(0, 72),
      rowId:       `${prefix}help ${cmd.name}`,
    }));
}

// ─── helpCard ─────────────────────────────────────────────────────────────────

/**
 * Send the main help overview — all categories as an interactive select list.
 * Category list and command counts come directly from the registry.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg          - Trigger message (used for quoting)
 * @param {object} [opts]
 * @param {string} [opts.prefix]
 * @param {string} [opts.botName]
 * @returns {Promise<{ok: boolean, sent?, error?, fallbackSent?}>}
 */
export async function helpCard(sock, jid, msg, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);

  const index = getCategoryIndex();
  const cats  = Object.entries(index)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, names]) => names.length > 0);

  const total = getAllCommands().length;

  const lines = [
    `📖 *Help — ${total} command${total !== 1 ? 's' : ''} loaded*`,
    `Prefix: *${prefix}*`,
    '',
  ];
  for (const [cat, names] of cats) {
    const { icon } = CATEGORY_META[cat] ?? { icon: '📁' };
    lines.push(`${icon} *${cat}*  _(${names.length})_`);
  }
  lines.push('');
  lines.push(`*${prefix}help <category>* — list category`);
  lines.push(`*${prefix}help <command>*  — command details`);
  lines.push(`*${prefix}search <query>* — find commands`);

  const body = lines.join('\n');

  const rows = cats.slice(0, MAX_ROWS).map(([cat, names]) => {
    const { icon } = CATEGORY_META[cat] ?? { icon: '📁' };
    return {
      title:       `${icon} ${cat}`,
      description: `${names.length} command${names.length !== 1 ? 's' : ''}`,
      rowId:       `${prefix}help ${cat}`,
    };
  });

  return sendCard(sock, jid, msg, {
    body,
    footer:  botName,
    buttons: rows.length ? [selectButton('📂 Browse Category', rows, 'All Categories')] : [],
    fallback: body,
  });
}

// ─── categoryCard ─────────────────────────────────────────────────────────────

/**
 * Send a card listing all commands in a category.
 * Includes a single_select list so the user can jump to any command detail.
 * Commands are read live from the registry — nothing is hardcoded.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {string} categoryKey   - Registry category key (e.g. 'ai', 'tools')
 * @param {object} [opts]
 * @param {string} [opts.prefix]
 * @param {string} [opts.botName]
 * @returns {Promise<{ok: boolean, sent?, error?, fallbackSent?}>}
 */
export async function categoryCard(sock, jid, msg, categoryKey, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);

  const cmds = getCommandsByCategory(categoryKey);
  if (!cmds.length) {
    return sendReply(sock, jid, `❌ No commands found in category: *${categoryKey}*`, msg);
  }

  const body = buildSub(botName, prefix, categoryKey);
  if (!body) {
    return sendReply(sock, jid, `❌ Unknown category: *${categoryKey}*`, msg);
  }

  const meta  = CATEGORY_META[categoryKey] ?? { icon: '📁', title: categoryKey };
  const title = meta.title ?? categoryKey;
  const rows  = buildCommandRows(cmds, prefix);

  // Prepare image header when a hero buffer is supplied by the caller.
  const mediaHeader = opts.thumbBuf
    ? await prepareImageHeader(sock, opts.thumbBuf)
    : undefined;

  return sendCard(sock, jid, msg, {
    body,
    footer:  botName,
    buttons: rows.length ? [selectButton('📂 Command Details', rows, `${title} Commands`)] : [],
    ...(mediaHeader ? { mediaHeader } : {}),
    fallback: body,
  });
}

// ─── commandCard ──────────────────────────────────────────────────────────────

/**
 * Send a detail card for a single command.
 * Reads all displayed fields directly from the plugin metadata object.
 *
 * Buttons included automatically:
 *   • 📋 Copy Usage   — pre-fills the usage string in the user's clipboard
 *   • 📝 Copy Command — pre-fills just the command name
 *   • 🔗 Open Link    — only if cmd.url is present (e.g. source repo / docs)
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {object} cmd           - Plugin object from registry or any plugin export
 * @param {object} [opts]
 * @param {string} [opts.prefix]
 * @param {string} [opts.footer] - Override footer (default: cmd.category)
 * @returns {Promise<{ok: boolean, sent?, error?, fallbackSent?}>}
 */
export async function commandCard(sock, jid, msg, cmd, opts = {}) {
  const prefix  = opts.prefix ?? '.';
  const footer  = opts.footer ?? cmd.category ?? 'Yuzuki MD';

  const body    = buildCommandHelp(cmd, prefix);
  const usage   = (cmd.usage ?? `${prefix}${cmd.name}`).replace(/^\./, prefix);
  const cmdName = `${prefix}${cmd.name}`;

  const buttons = [
    copyButton('📋 Copy Usage',   usage),
    copyButton('📝 Copy Command', cmdName),
  ];

  if (typeof cmd.url === 'string' && /^https?:\/\//i.test(cmd.url)) {
    buttons.push(urlButton('🔗 Open Link', cmd.url));
  }

  return sendCard(sock, jid, msg, {
    body,
    footer,
    buttons,
    fallback: body,
  });
}

// ─── pluginCard ───────────────────────────────────────────────────────────────

/**
 * Alias for commandCard.
 * Use this name at import sites where the intent is "show plugin runtime info"
 * rather than "show help for a command" — both produce the same card.
 *
 * @type {typeof commandCard}
 */
export const pluginCard = commandCard;

// ─── searchCard ───────────────────────────────────────────────────────────────

/**
 * Send a search-results card.
 * Results come from full-text registry search (name, alias, description).
 * Falls back to a plain-text reply when no results are found.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {string} query
 * @param {object} [opts]
 * @param {string} [opts.prefix]
 * @param {string} [opts.botName]
 * @param {number} [opts.limit]   - Max results (default: 10)
 * @returns {Promise<{ok: boolean, sent?, error?, fallbackSent?}>}
 */
export async function searchCard(sock, jid, msg, query, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);
  const limit   = opts.limit ?? 10;
  const results = searchCommands(query, { limit });
  const caption = buildSearchResults(query, prefix, limit);

  if (!results.length) {
    return sendReply(sock, jid, caption, msg);
  }

  const rows = buildCommandRows(results, prefix);
  const footer = `${results.length} result${results.length !== 1 ? 's' : ''} — ${botName}`;

  return sendCard(sock, jid, msg, {
    body:    caption,
    footer,
    buttons: [selectButton('📋 View Command', rows, `Results for "${query}"`)],
    fallback: caption,
  });
}

// ─── "Did you mean?" fuzzy card ───────────────────────────────────────────────

/**
 * Send a "did you mean?" card when a command name is close but not exact.
 * Shows the top fuzzy matches in a select list.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {string} query          - The unrecognised term the user typed
 * @param {object[]} suggestions  - Array of command objects (pre-fetched)
 * @param {object} [opts]
 * @param {string} [opts.prefix]
 * @param {string} [opts.botName]
 * @returns {Promise<{ok: boolean}>}
 */
export async function didYouMeanCard(sock, jid, msg, query, suggestions, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);

  const body = `❓ No exact match for *${query}*.\n\nDid you mean one of these?`;
  const rows = buildCommandRows(suggestions, prefix);

  return sendCard(sock, jid, msg, {
    body,
    footer:  botName,
    buttons: rows.length ? [selectButton('🔍 Select a Match', rows, 'Similar Commands')] : [],
    fallback: `${body}\n\n${suggestions.map(c => `• ${prefix}${c.name}`).join('\n')}`,
  });
}
