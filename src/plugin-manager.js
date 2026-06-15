/**
 * Plugin Manager
 *
 * Provides the full plugin lifecycle on top of the command registry:
 *
 *   • Metadata validation   — enforces required fields and type checks
 *   • Dependency checking   — ensures declared deps are already loaded
 *   • Error isolation       — a broken plugin never crashes the bot
 *   • Enable / Disable      — toggle command availability at runtime
 *   • Reload                — hot-swap a plugin without restarting
 *   • Listing               — inspect all plugins and their status
 *   • Category indexing     — query plugins grouped by category
 *
 * Usage:
 *   import { pluginManager } from './plugin-manager.js';
 *   await pluginManager.loadPlugin('/abs/path/to/plugin.js');
 */

import { pathToFileURL } from 'url';
import {
  registerCommand,
  unregisterCommand,
  enableCommand,
  disableCommand,
} from './lib/registry.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Plugin lifecycle statuses */
export const PluginStatus = Object.freeze({
  LOADED:   'loaded',
  DISABLED: 'disabled',
  ERROR:    'error',
});

/** Fields every plugin MUST export */
const REQUIRED_FIELDS = ['name', 'execute'];

/**
 * Optional metadata fields and their expected types.
 * Used for soft validation (warnings, not errors).
 */
const OPTIONAL_FIELD_TYPES = {
  aliases:      'array',
  category:     'string',
  description:  'string',
  usage:        'string',
  permissions:  'array',
  dependencies: 'array',
  limit:        'number',
};

// ─── PluginManager class ──────────────────────────────────────────────────────

/**
 * @typedef {object} PluginEntry
 * @property {object}       plugin    - The raw plugin module export
 * @property {string}       filePath  - Absolute path to the source file
 * @property {string}       status    - One of PluginStatus values
 * @property {string}       loadedAt  - ISO timestamp of last successful load
 * @property {string|null}  error     - Error message if status === 'error'
 */

class PluginManager {
  constructor() {
    /** @type {Map<string, PluginEntry>} primary name → entry */
    this._plugins = new Map();

    /** @type {Map<string, string>} alias → primary name */
    this._aliases = new Map();
  }

  // ─── Metadata validation ───────────────────────────────────────────────────

  /**
   * Validate a plugin object's metadata shape.
   *
   * @param {object} plugin
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  validateMetadata(plugin) {
    const errors = [];
    const warnings = [];

    if (!plugin || typeof plugin !== 'object') {
      return { valid: false, errors: ['Plugin export is not an object'], warnings };
    }

    // Required fields
    for (const field of REQUIRED_FIELDS) {
      if (plugin[field] == null) {
        errors.push(`Missing required field: "${field}"`);
      }
    }

    // Type checks on required fields
    if (plugin.name !== undefined && typeof plugin.name !== 'string') {
      errors.push('"name" must be a string');
    }
    if (plugin.execute !== undefined && typeof plugin.execute !== 'function') {
      errors.push('"execute" must be a function');
    }

    // Optional field type checks
    for (const [field, expectedType] of Object.entries(OPTIONAL_FIELD_TYPES)) {
      const value = plugin[field];
      if (value == null) continue;

      if (expectedType === 'array') {
        if (!Array.isArray(value)) {
          warnings.push(`"${field}" should be an array`);
        }
      } else if (typeof value !== expectedType) {
        warnings.push(`"${field}" should be a ${expectedType}`);
      }
    }

    // Warn about empty description
    if (!plugin.description) {
      warnings.push('No "description" provided — this plugin will not appear in help');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ─── Dependency checking ───────────────────────────────────────────────────

  /**
   * Check that every dependency listed in plugin.dependencies is already loaded.
   *
   * Dependencies are matched against both primary names (_plugins) and aliases
   * (_aliases). This allows authors to declare a dep by alias or primary name.
   *
   * @param {object} plugin
   * @returns {{ satisfied: boolean, missing: string[] }}
   */
  checkDependencies(plugin) {
    if (!Array.isArray(plugin.dependencies) || plugin.dependencies.length === 0) {
      return { satisfied: true, missing: [] };
    }
    const missing = plugin.dependencies.filter(
      dep => !this._plugins.has(dep) && !this._aliases.has(dep),
    );
    return { satisfied: missing.length === 0, missing };
  }

  // ─── Internal load helper ─────────────────────────────────────────────────

  /**
   * Import a JS module from an absolute path.
   * Appends a cache-busting query string when cacheBust is true so that
   * Node.js treats it as a different URL and re-executes the file.
   *
   * @param {string}  filePath
   * @param {boolean} cacheBust
   * @returns {Promise<object>}
   */
  async _importFile(filePath, cacheBust = false) {
    const base = pathToFileURL(filePath).href;
    const url  = cacheBust ? `${base}?t=${Date.now()}` : base;
    return import(url);
  }

  // ─── loadPlugin ───────────────────────────────────────────────────────────

  /**
   * Load (or re-load) a plugin from an absolute file path.
   *
   * Steps:
   *   1. Dynamically import the file (ESM-safe)
   *   2. Validate metadata
   *   3. Check dependencies
   *   4. Register in the command registry
   *   5. Track in the plugin manager
   *
   * Errors at any step are caught so one bad plugin never halts startup.
   *
   * @param {string}  filePath            - Absolute path to the .js plugin file
   * @param {object}  [opts]
   * @param {boolean} [opts.cacheBust]    - Force fresh import (used by reload)
   * @returns {Promise<{ success: boolean, name?: string, error?: string, warnings?: string[] }>}
   */
  async loadPlugin(filePath, { cacheBust = false } = {}) {
    let mod;
    try {
      mod = await this._importFile(filePath, cacheBust);
    } catch (err) {
      return { success: false, error: `Import error: ${err.message}` };
    }

    // Support both `export default {...}` and `module.exports = {...}`
    const plugin = mod.default ?? mod;

    // Validate metadata
    const { valid, errors, warnings } = this.validateMetadata(plugin);
    if (!valid) {
      return {
        success: false,
        error: `Metadata validation failed: ${errors.join('; ')}`,
        warnings,
      };
    }

    // Check dependencies
    const { satisfied, missing } = this.checkDependencies(plugin);
    if (!satisfied) {
      return {
        success: false,
        error: `Unsatisfied dependencies: ${missing.join(', ')}`,
        warnings,
      };
    }

    // Register in command registry
    registerCommand(plugin);

    // Track in plugin manager
    this._plugins.set(plugin.name, {
      plugin,
      filePath,
      status:   PluginStatus.LOADED,
      loadedAt: new Date().toISOString(),
      error:    null,
    });

    // Track aliases for reverse-lookup
    if (Array.isArray(plugin.aliases)) {
      for (const alias of plugin.aliases) {
        this._aliases.set(alias, plugin.name);
      }
    }

    return { success: true, name: plugin.name, warnings };
  }

  // ─── reloadPlugin ─────────────────────────────────────────────────────────

  /**
   * Hot-reload a plugin by primary name.
   *
   * Unregisters the current version, imports the file fresh (cache-busted),
   * then re-registers the new version. If the new version fails to load the
   * old version is considered unloaded (not silently kept).
   *
   * @param {string} name - Primary plugin name
   * @returns {Promise<{ success: boolean, name?: string, error?: string }>}
   */
  async reloadPlugin(name) {
    const entry = this._plugins.get(name);
    if (!entry) {
      return { success: false, error: `Plugin not found: "${name}"` };
    }

    const { filePath, plugin: oldPlugin } = entry;

    // Unregister old version from registry and manager
    unregisterCommand(oldPlugin.name);
    if (Array.isArray(oldPlugin.aliases)) {
      for (const alias of oldPlugin.aliases) {
        this._aliases.delete(alias);
      }
    }
    this._plugins.delete(name);

    // Load fresh copy
    const result = await this.loadPlugin(filePath, { cacheBust: true });
    return result;
  }

  // ─── removePlugin ─────────────────────────────────────────────────────────

  /**
   * Permanently remove a plugin from the runtime.
   *
   * Unregisters commands and aliases, then deletes the tracking entry.
   * Does NOT touch the file on disk — that is the installer's responsibility.
   *
   * @param {string} name - Primary plugin name
   * @returns {{ success: boolean, error?: string }}
   */
  removePlugin(name) {
    const primary = this._aliases.get(name) ?? name;
    const entry   = this._plugins.get(primary);

    if (!entry) {
      return { success: false, error: `Plugin not found: "${name}"` };
    }

    const { plugin } = entry;

    // Unregister from command registry
    unregisterCommand(plugin.name);

    // Remove all alias mappings
    if (Array.isArray(plugin.aliases)) {
      for (const alias of plugin.aliases) {
        this._aliases.delete(alias);
      }
    }
    // Also remove the primary alias entry if it exists
    this._aliases.delete(primary);

    // Remove from plugin map
    this._plugins.delete(primary);

    return { success: true };
  }

  // ─── enablePlugin / disablePlugin ─────────────────────────────────────────

  /**
   * Enable a disabled plugin.
   * The plugin must already be tracked (i.e. previously loaded).
   *
   * @param {string} name - Primary plugin name or alias
   * @returns {{ success: boolean, error?: string }}
   */
  enablePlugin(name) {
    const primary = this._aliases.get(name) ?? name;
    const entry   = this._plugins.get(primary);

    if (!entry) {
      return { success: false, error: `Plugin not found: "${name}"` };
    }
    if (entry.status === PluginStatus.ERROR) {
      return { success: false, error: `Plugin "${name}" has a load error — use reload instead` };
    }

    enableCommand(primary);
    entry.status = PluginStatus.LOADED;
    return { success: true };
  }

  /**
   * Disable a loaded plugin.
   * Commands become unavailable (getCommand returns null) without unloading.
   *
   * @param {string} name - Primary plugin name or alias
   * @returns {{ success: boolean, error?: string }}
   */
  disablePlugin(name) {
    const primary = this._aliases.get(name) ?? name;
    const entry   = this._plugins.get(primary);

    if (!entry) {
      return { success: false, error: `Plugin not found: "${name}"` };
    }

    disableCommand(primary);
    entry.status = PluginStatus.DISABLED;
    return { success: true };
  }

  // ─── Lookup ───────────────────────────────────────────────────────────────

  /**
   * Get the entry for a plugin by primary name or alias.
   *
   * @param {string} name
   * @returns {PluginEntry|null}
   */
  getPlugin(name) {
    if (this._plugins.has(name)) return this._plugins.get(name);
    const primary = this._aliases.get(name);
    if (primary) return this._plugins.get(primary);
    return null;
  }

  // ─── Listing ──────────────────────────────────────────────────────────────

  /**
   * Return a flat list of all tracked plugins with their runtime status.
   *
   * @returns {Array<{
   *   name: string,
   *   category: string,
   *   description: string,
   *   aliases: string[],
   *   status: string,
   *   loadedAt: string,
   *   filePath: string,
   *   error: string|null,
   * }>}
   */
  listPlugins() {
    return [...this._plugins.values()].map(entry => ({
      name:        entry.plugin.name,
      category:    entry.plugin.category    ?? 'uncategorized',
      description: entry.plugin.description ?? '',
      usage:       entry.plugin.usage       ?? '',
      aliases:     entry.plugin.aliases     ?? [],
      dependencies: entry.plugin.dependencies ?? [],
      status:      entry.status,
      loadedAt:    entry.loadedAt,
      filePath:    entry.filePath,
      error:       entry.error,
    }));
  }

  // ─── Category indexing ────────────────────────────────────────────────────

  /**
   * Return plugins grouped by category.
   *
   * @returns {Record<string, string[]>} category → [primary names]
   */
  getPluginsByCategory() {
    const index = {};
    for (const entry of this._plugins.values()) {
      const cat = entry.plugin.category ?? 'uncategorized';
      if (!index[cat]) index[cat] = [];
      index[cat].push(entry.plugin.name);
    }
    return index;
  }

  /** Total number of tracked plugins (loaded + disabled + error). */
  get size() {
    return this._plugins.size;
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const pluginManager = new PluginManager();
export default pluginManager;
