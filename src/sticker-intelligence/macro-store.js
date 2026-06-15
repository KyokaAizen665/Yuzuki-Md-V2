/**
 * Sticker Intelligence — Macro Store
 *
 * Persistent registry that maps sticker SHA-256 hashes to commands,
 * and sticker pack names to command collections.
 *
 * Storage: data/sticker-macros.json  (auto-created on first use)
 *
 * Schema:
 * {
 *   macros: {
 *     "<sha256hex>": { command: "menu", args: [], label: "Main Menu", addedBy: "…", addedAt: "…" }
 *   },
 *   aliases: {
 *     "<alias-name>": { command: "play", args: ["cocoronco"], label: "▶️ Cocoronco" }
 *   },
 *   packs: {
 *     "<pack-name>": {
 *       name: "My Bot Pack",
 *       description: "Collection of bot commands",
 *       commands: {
 *         "<sha256hex>": { command: "menu",  args: [] },
 *         "<sha256hex>": { command: "ping",  args: [] }
 *       }
 *     }
 *   }
 * }
 *
 * Usage:
 *   import { getMacro, addMacro, listMacros } from './macro-store.js';
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE   = path.resolve(__dirname, '../../data/sticker-macros.json');
const DATA_DIR    = path.dirname(DATA_FILE);

const EMPTY_STORE = () => ({ macros: {}, aliases: {}, packs: {} });

// ─── I/O helpers ──────────────────────────────────────────────────────────────

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return EMPTY_STORE();
    return { ...EMPTY_STORE(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch {
    return EMPTY_STORE();
  }
}

function save(store) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
    return true;
  } catch {
    return false;
  }
}

// ─── Macros (sha256 → command) ────────────────────────────────────────────────

/**
 * Retrieve a registered macro by sticker SHA-256 hex.
 * @param {string} sha256hex
 * @returns {{ command: string, args: string[], label: string }|null}
 */
export function getMacro(sha256hex) {
  if (!sha256hex) return null;
  return load().macros[sha256hex] ?? null;
}

/**
 * Register a sticker macro.
 * @param {string} sha256hex
 * @param {string} command
 * @param {string[]} [args]
 * @param {string} [label]        - Human-readable label for listing
 * @param {string} [addedBy]      - JID of the user who added it
 * @returns {boolean}
 */
export function addMacro(sha256hex, command, args = [], label = '', addedBy = '') {
  if (!sha256hex || !command) return false;
  const store = load();
  store.macros[sha256hex] = {
    command:  command.toLowerCase().trim(),
    args,
    label:    label || command,
    addedBy,
    addedAt:  new Date().toISOString(),
  };
  return save(store);
}

/**
 * Remove a sticker macro by SHA-256 hex.
 * @param {string} sha256hex
 * @returns {boolean} true if something was removed
 */
export function removeMacro(sha256hex) {
  const store = load();
  if (!store.macros[sha256hex]) return false;
  delete store.macros[sha256hex];
  return save(store);
}

/**
 * List all registered macros.
 * @returns {Array<{ sha256: string, command: string, args: string[], label: string, addedAt: string }>}
 */
export function listMacros() {
  const store = load();
  return Object.entries(store.macros).map(([sha256, m]) => ({ sha256, ...m }));
}

/**
 * Check whether a sha256hex has a registered macro.
 * @param {string} sha256hex
 * @returns {boolean}
 */
export function hasMacro(sha256hex) {
  return !!getMacro(sha256hex);
}

// ─── Aliases (text name → command) ───────────────────────────────────────────

/**
 * Get a sticker alias by name.
 * Aliases let users refer to commands by a friendly text name stored in EXIF.
 * @param {string} aliasName
 * @returns {{ command: string, args: string[], label: string }|null}
 */
export function getAlias(aliasName) {
  if (!aliasName) return null;
  const key = aliasName.toLowerCase().trim();
  return load().aliases[key] ?? null;
}

/**
 * Register a sticker alias.
 * @param {string} aliasName
 * @param {string} command
 * @param {string[]} [args]
 * @param {string} [label]
 * @returns {boolean}
 */
export function addAlias(aliasName, command, args = [], label = '') {
  if (!aliasName || !command) return false;
  const store = load();
  const key   = aliasName.toLowerCase().trim();
  store.aliases[key] = {
    command:  command.toLowerCase().trim(),
    args,
    label:    label || command,
    addedAt:  new Date().toISOString(),
  };
  return save(store);
}

/**
 * Remove a sticker alias.
 * @param {string} aliasName
 * @returns {boolean}
 */
export function removeAlias(aliasName) {
  const store = load();
  const key   = aliasName.toLowerCase().trim();
  if (!store.aliases[key]) return false;
  delete store.aliases[key];
  return save(store);
}

/**
 * List all registered aliases.
 * @returns {Array<{ name: string, command: string, args: string[], label: string }>}
 */
export function listAliases() {
  const store = load();
  return Object.entries(store.aliases).map(([name, a]) => ({ name, ...a }));
}

// ─── Packs (pack name → command collection) ───────────────────────────────────

/**
 * Get all commands for a named sticker pack.
 * @param {string} packName
 * @returns {{ name: string, description: string, commands: object }|null}
 */
export function getPack(packName) {
  if (!packName) return null;
  const key = packName.toLowerCase().trim();
  return load().packs[key] ?? null;
}

/**
 * Get a specific sticker's command within a pack.
 * @param {string} packName
 * @param {string} sha256hex
 * @returns {{ command: string, args: string[] }|null}
 */
export function getPackCommand(packName, sha256hex) {
  const pack = getPack(packName);
  if (!pack) return null;
  return pack.commands?.[sha256hex] ?? null;
}

/**
 * Register or update a sticker pack.
 * @param {string} packName
 * @param {string} [description]
 * @returns {boolean}
 */
export function addPack(packName, description = '') {
  if (!packName) return false;
  const store = load();
  const key   = packName.toLowerCase().trim();
  if (!store.packs[key]) {
    store.packs[key] = { name: packName, description, commands: {}, addedAt: new Date().toISOString() };
  } else {
    if (description) store.packs[key].description = description;
  }
  return save(store);
}

/**
 * Add a sticker to a pack's command map.
 * @param {string} packName
 * @param {string} sha256hex
 * @param {string} command
 * @param {string[]} [args]
 * @returns {boolean}
 */
export function addPackCommand(packName, sha256hex, command, args = []) {
  if (!packName || !sha256hex || !command) return false;
  const store = load();
  const key   = packName.toLowerCase().trim();
  if (!store.packs[key]) store.packs[key] = { name: packName, description: '', commands: {}, addedAt: new Date().toISOString() };
  store.packs[key].commands[sha256hex] = { command: command.toLowerCase().trim(), args };
  return save(store);
}

/**
 * Remove a pack entirely.
 * @param {string} packName
 * @returns {boolean}
 */
export function removePack(packName) {
  const store = load();
  const key   = packName.toLowerCase().trim();
  if (!store.packs[key]) return false;
  delete store.packs[key];
  return save(store);
}

/**
 * List all registered packs.
 * @returns {Array<{ key: string, name: string, description: string, commandCount: number }>}
 */
export function listPacks() {
  const store = load();
  return Object.entries(store.packs).map(([key, p]) => ({
    key,
    name:         p.name,
    description:  p.description,
    commandCount: Object.keys(p.commands ?? {}).length,
    addedAt:      p.addedAt,
  }));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Full store stats for admin display. */
export function getStats() {
  const store = load();
  return {
    macroCount:  Object.keys(store.macros).length,
    aliasCount:  Object.keys(store.aliases).length,
    packCount:   Object.keys(store.packs).length,
    totalStickers: Object.keys(store.macros).length +
      Object.values(store.packs).reduce((n, p) => n + Object.keys(p.commands ?? {}).length, 0),
  };
}
