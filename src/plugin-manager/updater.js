/**
 * Plugin Updater
 *
 * Re-fetches a plugin from its registered source and re-installs it.
 * Uses the same install() pipeline so all validation + rollback applies.
 *
 * Usage:
 *   import { update, updateAll, checkUpdate } from './updater.js';
 *
 *   // Update one plugin
 *   const result = await update('myplugin');
 *
 *   // Update all external plugins
 *   const results = await updateAll();
 *
 *   // Check version change without updating
 *   const info = await checkUpdate('myplugin');
 */

import { pluginManifest, sha256 } from './registry.js';
import { install }               from './installer.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse the stored source string back to a raw spec.
 * Stored as "github:owner/repo/path" or "url:https://..." or "zip:https://..."
 * Returns the spec without the type prefix.
 *
 * @param {string} storedSource
 * @returns {string}
 */
function parseStoredSource(storedSource) {
  const colonIdx = storedSource.indexOf(':');
  if (colonIdx === -1) return storedSource;
  const type = storedSource.slice(0, colonIdx);
  // Known prefixes we strip
  if (['github', 'url', 'zip'].includes(type)) {
    return storedSource.slice(colonIdx + 1);
  }
  return storedSource;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Update a single plugin by re-fetching from its registered source.
 *
 * @param {string} name  - Plugin primary name
 * @returns {Promise<{
 *   ok:         boolean,
 *   name?:      string,
 *   oldVersion?: string,
 *   newVersion?: string,
 *   changed?:   boolean,
 *   warnings?:  string[],
 *   error?:     string,
 * }>}
 */
export async function update(name) {
  const entry = pluginManifest.get(name);
  if (!entry) {
    return {
      ok:    false,
      error: `"${name}" is not in the installed plugin registry. Install it first.`,
    };
  }
  if (entry.bundled) {
    return {
      ok:    false,
      error: `"${name}" is a bundled plugin — update via a bot restart or git pull.`,
    };
  }

  const spec       = parseStoredSource(entry.source);
  const oldVersion = entry.displayVersion;
  const oldSha     = entry.sha256;

  const result = await install(spec, { force: true });

  if (!result.ok) {
    return { ok: false, name, error: result.error };
  }

  const newEntry = pluginManifest.get(name);
  const changed  = newEntry ? (newEntry.sha256 !== oldSha) : true;

  return {
    ok:         true,
    name,
    oldVersion,
    newVersion: result.version,
    changed,
    warnings:   result.warnings ?? [],
  };
}

/**
 * Update all externally installed plugins.
 * Runs updates sequentially to avoid file-lock races.
 *
 * @returns {Promise<{
 *   total:   number,
 *   updated: number,
 *   skipped: number,
 *   failed:  number,
 *   results: Array<{ name: string, ok: boolean, changed: boolean, error?: string }>
 * }>}
 */
export async function updateAll() {
  const plugins = pluginManifest.list().filter(p => !p.bundled);

  let updated = 0;
  let skipped = 0;
  let failed  = 0;
  const results = [];

  for (const p of plugins) {
    const res = await update(p.name);
    if (res.ok) {
      if (res.changed) updated++;
      else             skipped++;
    } else {
      failed++;
    }
    results.push({
      name:    p.name,
      ok:      res.ok,
      changed: res.changed ?? false,
      error:   res.error,
    });
  }

  return {
    total:   plugins.length,
    updated,
    skipped,
    failed,
    results,
  };
}

/**
 * Check whether a newer version is available without updating.
 * Compares SHA-256 of the current file vs the live source.
 *
 * Note: this performs a full fetch but does NOT write anything.
 *
 * @param {string} name
 * @returns {Promise<{
 *   ok:          boolean,
 *   name:        string,
 *   hasUpdate:   boolean,
 *   currentSha:  string,
 *   remoteSha:   string,
 *   currentVersion: string,
 *   error?:      string,
 * }>}
 */
export async function checkUpdate(name) {
  const entry = pluginManifest.get(name);
  if (!entry) {
    return { ok: false, name, hasUpdate: false, error: 'Plugin not in registry' };
  }

  try {
    const spec = parseStoredSource(entry.source);

    // Fetch remote content without installing
    const response = await fetch(
      spec.startsWith('http') ? spec : `https://raw.githubusercontent.com/${spec}`,
      {
        signal:  AbortSignal.timeout(15_000),
        headers: { 'User-Agent': 'YuzukiMD-PluginInstaller/1.0' },
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const remoteSource = await response.text();
    const remoteSha    = sha256(remoteSource);
    const hasUpdate    = remoteSha !== entry.sha256;

    return {
      ok:             true,
      name,
      hasUpdate,
      currentSha:     entry.sha256,
      remoteSha,
      currentVersion: entry.displayVersion,
    };
  } catch (err) {
    return { ok: false, name, hasUpdate: false, error: err.message };
  }
}
