/**
 * Command Registry — v3
 *
 * Central store for all registered plugin commands.
 * Tracks: primary names + aliases → plugin object, enabled/disabled state,
 * category index, and exposes search/query helpers used by menu/help layers.
 *
 * Performance improvements over v2:
 *  - primaryNames Set maintained in parallel with commands Map.
 *    getAllCommands() is now O(n) array map instead of O(n) Set construction.
 *  - getCommandsByCategory() reads categoryIndex directly — no getAllCommands() call.
 *  - getCategoryIndex() caches its result; invalidated only on register/unregister.
 *  - getCommandCount() reads primaryNames.size directly — O(1).
 *
 * All functions are exported as named ESM exports.
 * A default export mirrors every named export for backward-compat.
 */

/** @type {Map<string, object>} name/alias → plugin object */
const commands = new Map();

/**
 * Set of primary command names only (no aliases).
 * Maintained in lockstep with `commands`.
 * Enables O(1) count and O(n) getAllCommands() without Set construction.
 * @type {Set<string>}
 */
const primaryNames = new Set();

/** @type {Map<string, Set<string>>} category → Set of primary command names */
const categoryIndex = new Map();

/** @type {Set<string>} Primary names that are currently disabled */
const disabledSet = new Set();

/**
 * Cached getCategoryIndex() result. Set to null whenever the registry mutates.
 * @type {Record<string, string[]>|null}
 */
let _catIndexCache = null;

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Register a plugin command. Idempotent: re-registering the same primary name
 * overwrites the old entry (intended for reload/update flows).
 *
 * Alias conflict policy:
 *   • If an alias would overwrite an existing PRIMARY command name, the alias
 *     is skipped and a warning is logged. This prevents the most damaging
 *     conflict (alias-overwrites-primary corrupts getAllCommands()).
 *   • If an alias conflicts with another plugin's alias, a warning is logged
 *     and the new binding wins (last-registered-wins for alias-vs-alias).
 *
 * @param {object} cmd - Plugin object with at least { name }
 */
export function registerCommand(cmd) {
  if (!cmd?.name) return;
  // Warn if this primary name is currently bound as another plugin's alias.
  // The new primary always wins (overwrites) — the installer pre-flight check
  // should prevent this from happening for marketplace installs.
  const existingForName = commands.get(cmd.name);
  if (existingForName && existingForName !== cmd && !primaryNames.has(cmd.name)) {
    console.warn(
      `[Registry] CONFLICT: plugin "${cmd.name}" registered as primary overwrites ` +
      `alias binding previously owned by "${existingForName.name}"`,
    );
  }
  commands.set(cmd.name, cmd);
  primaryNames.add(cmd.name);
  if (Array.isArray(cmd.aliases)) {
    for (const alias of cmd.aliases) {
      if (alias === cmd.name) continue; // alias same as primary — skip silently
      const current = commands.get(alias);
      if (current && current !== cmd) {
        if (primaryNames.has(alias)) {
          // Alias would shadow an existing primary command — block to prevent corruption
          console.warn(
            `[Registry] CONFLICT: alias "${alias}" of plugin "${cmd.name}" ` +
            `shadows primary command "${current.name}" — alias skipped`,
          );
          continue;
        }
        // Alias-vs-alias: warn but allow (last-registered wins)
        console.warn(
          `[Registry] CONFLICT: alias "${alias}" of plugin "${cmd.name}" ` +
          `overwrites alias previously owned by "${current.name}"`,
        );
      }
      commands.set(alias, cmd);
    }
  }
  if (cmd.category) {
    if (!categoryIndex.has(cmd.category)) categoryIndex.set(cmd.category, new Set());
    categoryIndex.get(cmd.category).add(cmd.name);
  }
  _catIndexCache = null;
}

/**
 * Unregister a plugin command by primary name.
 * @param {string} name - Primary command name
 */
export function unregisterCommand(name) {
  const cmd = commands.get(name);
  if (!cmd) return;
  commands.delete(cmd.name);
  primaryNames.delete(cmd.name);
  if (Array.isArray(cmd.aliases)) {
    for (const alias of cmd.aliases) {
      // Only delete the alias entry if it still points to THIS command.
      // If the alias was conflicted/skipped at registration time (e.g. it
      // shadows a different primary), the commands Map entry belongs to the
      // other command and must not be removed.
      if (commands.get(alias) === cmd) commands.delete(alias);
    }
  }
  if (cmd.category && categoryIndex.has(cmd.category)) {
    categoryIndex.get(cmd.category).delete(cmd.name);
    if (categoryIndex.get(cmd.category).size === 0) categoryIndex.delete(cmd.category);
  }
  disabledSet.delete(cmd.name);
  _catIndexCache = null;
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Look up a command by name or alias.
 * Returns null if not found or currently disabled.
 * @param {string} name
 * @returns {object|null}
 */
export function getCommand(name) {
  const cmd = commands.get(name);
  if (!cmd) return null;
  if (disabledSet.has(cmd.name)) return null;
  return cmd;
}

/**
 * Return every unique plugin object (deduplicates aliases).
 * O(n) array map over primaryNames — no Set construction.
 * @returns {object[]}
 */
export function getAllCommands() {
  return [...primaryNames].map(name => commands.get(name)).filter(Boolean);
}

/**
 * Return all commands in a given category.
 * Reads categoryIndex directly — O(k) where k = commands in that category.
 * @param {string} category
 * @returns {object[]}
 */
export function getCommandsByCategory(category) {
  const names = categoryIndex.get(category);
  if (!names) return [];
  return [...names].map(name => commands.get(name)).filter(Boolean);
}

/**
 * Total count of unique registered commands (not aliases). O(1).
 * @returns {number}
 */
export function getCommandCount() {
  return primaryNames.size;
}

// ─── Category index ───────────────────────────────────────────────────────────

/**
 * Return all registered category names, sorted alphabetically.
 * @returns {string[]}
 */
export function getCategories() {
  return [...categoryIndex.keys()].sort();
}

/**
 * Return the full category → primary-name-array index.
 * Result is cached and invalidated on any register/unregister call.
 * @returns {Record<string, string[]>}
 */
export function getCategoryIndex() {
  if (_catIndexCache) return _catIndexCache;
  const result = {};
  for (const [cat, names] of categoryIndex) {
    result[cat] = [...names].sort();
  }
  _catIndexCache = result;
  return result;
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Full-text search across command names, aliases, and descriptions.
 * Case-insensitive. Returns an array of matching unique plugin objects,
 * sorted by relevance: exact name match first, then alias match, then description.
 *
 * @param {string} query
 * @param {object} [opts]
 * @param {number} [opts.limit=20]          - Max results
 * @param {string} [opts.category]          - Restrict to one category
 * @returns {object[]}
 */
export function searchCommands(query, { limit = 20, category } = {}) {
  if (!query) return [];
  const q   = query.toLowerCase().trim();
  const all = getAllCommands();

  const score = (cmd) => {
    if (cmd.name === q) return 100;
    if ((cmd.aliases ?? []).includes(q)) return 80;
    if (cmd.name.startsWith(q)) return 70;
    if ((cmd.aliases ?? []).some(a => a.startsWith(q))) return 60;
    if (cmd.name.includes(q)) return 50;
    if ((cmd.aliases ?? []).some(a => a.includes(q))) return 40;
    if ((cmd.description ?? '').toLowerCase().includes(q)) return 20;
    if ((cmd.usage ?? '').toLowerCase().includes(q)) return 10;
    return 0;
  };

  return all
    .filter(cmd => {
      if (category && cmd.category !== category) return false;
      return score(cmd) > 0;
    })
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

/**
 * Search category names by prefix or substring.
 * @param {string} query
 * @returns {string[]} matching category names
 */
export function searchCategories(query) {
  if (!query) return getCategories();
  const q = query.toLowerCase().trim();
  return getCategories().filter(cat => cat.includes(q));
}

// ─── Enable / Disable ─────────────────────────────────────────────────────────

/**
 * Enable a previously disabled command.
 * @param {string} name - Primary name or alias
 * @returns {boolean} true if the command was found
 */
export function enableCommand(name) {
  const cmd = commands.get(name);
  if (!cmd) return false;
  disabledSet.delete(cmd.name);
  return true;
}

/**
 * Disable a command so that getCommand() returns null for it.
 * @param {string} name - Primary name or alias
 * @returns {boolean} true if the command was found
 */
export function disableCommand(name) {
  const cmd = commands.get(name);
  if (!cmd) return false;
  disabledSet.add(cmd.name);
  return true;
}

/**
 * Check whether a command is currently enabled.
 * @param {string} name - Primary name or alias
 * @returns {boolean}
 */
export function isCommandEnabled(name) {
  const cmd = commands.get(name);
  if (!cmd) return false;
  return !disabledSet.has(cmd.name);
}

// ─── Default export (backward-compat) ────────────────────────────────────────

export default {
  registerCommand,
  unregisterCommand,
  getCommand,
  getAllCommands,
  getCommandsByCategory,
  getCommandCount,
  getCategories,
  getCategoryIndex,
  searchCommands,
  searchCategories,
  enableCommand,
  disableCommand,
  isCommandEnabled,
};
