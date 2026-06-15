/**
 * Plugin Marketplace Registry
 *
 * Persists installation metadata for every externally installed plugin.
 * Stored at data/plugin-registry.json — one entry per installed plugin.
 *
 * This is SEPARATE from src/lib/registry.js (command registry) and
 * src/plugin-manager.js (runtime lifecycle manager).
 *
 * Schema per entry:
 * {
 *   name:           string   — primary plugin name (matches plugin.name export)
 *   displayVersion: string   — "1.2.3" or content-hash prefix
 *   source:         string   — original install spec ("github:owner/repo/file.js")
 *   sourceType:     string   — "github" | "url" | "zip"
 *   installedAt:    string   — ISO timestamp of first install
 *   updatedAt:      string   — ISO timestamp of last update
 *   filePath:       string   — relative path (src/plugins/external/name.js)
 *   sha256:         string   — hex SHA-256 of installed file content
 *   size:           number   — byte size of installed file
 *   category:       string   — from plugin metadata
 *   description:    string   — from plugin metadata
 *   bundled:        false    — always false; bundled plugins never appear here
 * }
 */

import fs   from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_DIR  = path.resolve(__dirname, '../../data');
const REGISTRY_PATH = path.join(REGISTRY_DIR, 'plugin-registry.json');
const MANIFEST_VER  = 1;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(REGISTRY_DIR)) {
    fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  }
}

function emptyManifest() {
  return { version: MANIFEST_VER, plugins: {} };
}

/**
 * Compute SHA-256 hex of a string or Buffer.
 * @param {string|Buffer} data
 * @returns {string}
 */
export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

// ─── PluginManifest class ─────────────────────────────────────────────────────

class PluginManifest {
  constructor() {
    this._data = null; // lazy-loaded
  }

  // ─── Load / save ────────────────────────────────────────────────────────────

  _load() {
    ensureDir();
    if (!fs.existsSync(REGISTRY_PATH)) {
      this._data = emptyManifest();
      return;
    }
    try {
      this._data = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
      if (!this._data.plugins) this._data.plugins = {};
    } catch {
      this._data = emptyManifest();
    }
  }

  _ensureLoaded() {
    if (!this._data) this._load();
  }

  _save() {
    ensureDir();
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(this._data, null, 2), 'utf8');
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Get the manifest entry for a plugin name, or null if not found.
   * @param {string} name
   * @returns {object|null}
   */
  get(name) {
    this._ensureLoaded();
    return this._data.plugins[name] ?? null;
  }

  /**
   * Check whether a plugin is tracked in the manifest.
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    this._ensureLoaded();
    return Object.prototype.hasOwnProperty.call(this._data.plugins, name);
  }

  /**
   * Write or overwrite a plugin entry and persist to disk.
   *
   * The caller's `bundled` value is preserved. Externally installed plugins
   * should always pass `bundled: false`. Core/bundled plugins that need
   * uninstall protection should pass `bundled: true`.
   *
   * Note: install() always passes `bundled: false` explicitly, so the
   * uninstall() guard remains effective for externally installed plugins.
   * Bundled-plugin entries that must be protected from uninstall should be
   * seeded directly in data/plugin-registry.json with `"bundled": true`.
   *
   * @param {string} name
   * @param {object} entry
   */
  set(name, entry) {
    this._ensureLoaded();
    this._data.plugins[name] = { ...entry, name };
    this._save();
  }

  /**
   * Remove a plugin entry from the manifest.
   * @param {string} name
   * @returns {boolean} true if it existed
   */
  delete(name) {
    this._ensureLoaded();
    if (!this._data.plugins[name]) return false;
    delete this._data.plugins[name];
    this._save();
    return true;
  }

  /**
   * Return all manifest entries as an array.
   * @returns {object[]}
   */
  list() {
    this._ensureLoaded();
    return Object.values(this._data.plugins);
  }

  /**
   * Total count of tracked (external) plugins.
   * @returns {number}
   */
  get size() {
    this._ensureLoaded();
    return Object.keys(this._data.plugins).length;
  }

  /**
   * Build a manifest entry object from raw fields.
   * Convenience factory used by the installer.
   *
   * @param {object} opts
   * @returns {object}
   */
  static buildEntry({
    name,
    displayVersion,
    source,
    sourceType,
    filePath,
    content,
    category    = 'external',
    description = '',
    existingEntry = null,
  }) {
    const now = new Date().toISOString();
    return {
      name,
      displayVersion: displayVersion ?? 'unknown',
      source,
      sourceType,
      installedAt:    existingEntry?.installedAt ?? now,
      updatedAt:      now,
      filePath,
      sha256:         sha256(content),
      size:           Buffer.byteLength(content),
      category,
      description,
      bundled:        false,
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const pluginManifest = new PluginManifest();
export default pluginManifest;
