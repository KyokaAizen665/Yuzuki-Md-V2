/**
 * Plugin Installer
 *
 * Handles downloading, validating, and writing plugin files from:
 *   • GitHub shorthand  — "owner/repo[/path/to/file.js][@ref]"
 *   • Raw HTTP/S URL    — "https://example.com/plugin.js"
 *   • ZIP HTTP/S URL    — "https://example.com/plugin.zip"  (requires adm-zip)
 *
 * Install flow:
 *   1. Parse source spec → resolve download URL
 *   2. Fetch raw content (text for JS, buffer for ZIP)
 *   3. Extract plugin source (ZIP only)
 *   4. Phase-1 static security scan (validateSource)
 *   5. Phase-2 schema validation (dynamic import to temp file)
 *   6. Backup existing file (if updating)
 *   7. Write to src/plugins/external/<name>.js
 *   8. Load into runtime via pluginManager.loadPlugin()
 *   9. Register in manifest
 *  10. Clean up backup (success) or restore (failure)
 *
 * Returns:
 *   { ok: true,  name, version, filePath, warnings, isUpdate }
 *   { ok: false, error, phase }
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { validateAll }    from './validator.js';
import { pluginManifest, sha256 } from './registry.js';
import { backup, restore, cleanup } from './rollback.js';
import { pluginManager }  from '../plugin-manager.js';
import { getCommand }     from '../lib/registry.js';

const __dirname      = path.dirname(fileURLToPath(import.meta.url));
const EXTERNAL_DIR   = path.resolve(__dirname, '../plugins/external');
const GITHUB_RAW     = 'https://raw.githubusercontent.com';
const FETCH_TIMEOUT  = 20_000; // 20 s

// ─── Source type detection ────────────────────────────────────────────────────

/**
 * Determine the source type from a spec string.
 * @param {string} spec
 * @returns {'github'|'zip'|'url'}
 */
function detectSourceType(spec) {
  if (/^https?:\/\/.+\.zip(\?.*)?$/i.test(spec)) return 'zip';
  if (/^https?:\/\//i.test(spec))                 return 'url';
  return 'github';
}

// ─── GitHub spec parser ───────────────────────────────────────────────────────

/**
 * Parse a GitHub shorthand spec.
 * Formats:
 *   owner/repo
 *   owner/repo@ref
 *   owner/repo/path/to/file.js
 *   owner/repo/path/to/file.js@ref
 *
 * @param {string} spec
 * @returns {{ owner: string, repo: string, filePath: string|null, ref: string }}
 */
function parseGitHubSpec(spec) {
  // Strip trailing @ref if present
  let ref  = 'main';
  let body = spec;
  const atIdx = spec.lastIndexOf('@');
  if (atIdx > spec.indexOf('/')) {
    ref  = spec.slice(atIdx + 1) || 'main';
    body = spec.slice(0, atIdx);
  }

  const parts    = body.split('/');
  const owner    = parts[0];
  const repo     = parts[1];
  const filePath = parts.length > 2 ? parts.slice(2).join('/') : null;

  return { owner, repo, filePath, ref };
}

/**
 * Build the raw content URL for a GitHub file.
 * @param {string} owner
 * @param {string} repo
 * @param {string} ref
 * @param {string} filePath
 * @returns {string}
 */
function githubRawUrl(owner, repo, ref, filePath) {
  return `${GITHUB_RAW}/${owner}/${repo}/${ref}/${filePath}`;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchText(url) {
  const r = await fetch(url, {
    signal:  AbortSignal.timeout(FETCH_TIMEOUT),
    headers: { 'User-Agent': 'YuzukiMD-PluginInstaller/1.0' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
  return r.text();
}

async function fetchBuffer(url) {
  const r = await fetch(url, {
    signal:  AbortSignal.timeout(FETCH_TIMEOUT),
    headers: { 'User-Agent': 'YuzukiMD-PluginInstaller/1.0' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
  return Buffer.from(await r.arrayBuffer());
}

// ─── Source fetchers ──────────────────────────────────────────────────────────

/**
 * Fetch plugin source from a GitHub spec.
 * If no filePath given, probes common root filenames.
 *
 * @param {string} spec
 * @returns {Promise<{ source: string, resolvedUrl: string, guessedName: string }>}
 */
async function fromGitHub(spec) {
  const { owner, repo, filePath, ref } = parseGitHubSpec(spec);

  if (!owner || !repo) {
    throw new Error(`Invalid GitHub spec: "${spec}". Expected "owner/repo[/path][@ref]"`);
  }

  // If a specific file was given, fetch it directly
  if (filePath) {
    const url    = githubRawUrl(owner, repo, ref, filePath);
    const source = await fetchText(url).catch(async () => {
      // Retry with master branch if main fails
      if (ref === 'main') {
        const masterUrl = githubRawUrl(owner, repo, 'master', filePath);
        return fetchText(masterUrl);
      }
      throw new Error(`File not found at ${url}`);
    });
    const guessedName = path.basename(filePath, '.js');
    return { source, resolvedUrl: url, guessedName };
  }

  // No file specified — probe common root filenames
  const candidates = [
    `${repo}.js`,
    'index.js',
    'plugin.js',
    'main.js',
  ];

  for (const candidate of candidates) {
    const url = githubRawUrl(owner, repo, ref, candidate);
    try {
      const source = await fetchText(url);
      return { source, resolvedUrl: url, guessedName: repo };
    } catch {
      // try next candidate
    }
  }

  // Retry all candidates with master branch
  if (ref === 'main') {
    for (const candidate of candidates) {
      const url = githubRawUrl(owner, repo, 'master', candidate);
      try {
        const source = await fetchText(url);
        return { source, resolvedUrl: url, guessedName: repo };
      } catch {}
    }
  }

  throw new Error(
    `Could not find a plugin file in "${owner}/${repo}". ` +
    `Specify the path: ${owner}/${repo}/path/to/plugin.js`,
  );
}

/**
 * Fetch plugin source from a direct URL.
 * @param {string} url
 * @returns {Promise<{ source: string, resolvedUrl: string, guessedName: string }>}
 */
async function fromUrl(url) {
  const source      = await fetchText(url);
  const guessedName = path.basename(new URL(url).pathname, '.js') || 'plugin';
  return { source, resolvedUrl: url, guessedName };
}

/**
 * Extract plugin JS files from a ZIP buffer.
 * Requires adm-zip (npm install adm-zip).
 *
 * @param {Buffer}  buffer
 * @param {string}  url     - original URL (for guessedName)
 * @returns {Promise<Array<{ source: string, guessedName: string }>>}
 */
async function fromZipBuffer(buffer, url) {
  let AdmZip;
  try {
    AdmZip = (await import('adm-zip')).default;
  } catch {
    throw new Error(
      'ZIP support requires adm-zip. Run: npm install adm-zip\n' +
      'Or install the plugin from its raw JS URL instead.',
    );
  }

  const zip     = new AdmZip(buffer);
  const entries = zip.getEntries().filter(e =>
    e.entryName.endsWith('.js') &&
    !e.entryName.includes('/node_modules/') &&
    !e.isDirectory,
  );

  if (!entries.length) {
    throw new Error('ZIP contains no .js files');
  }

  return entries.map(e => ({
    source:      e.getData().toString('utf8'),
    guessedName: path.basename(e.entryName, '.js'),
  }));
}

// ─── Main installer ───────────────────────────────────────────────────────────

/**
 * Install a plugin from a source spec.
 *
 * @param {string} spec  - "owner/repo[@ref]", "owner/repo/path.js[@ref]", or URL
 * @param {object} [opts]
 * @param {string}  [opts.nameOverride]  - Force a specific plugin name
 * @param {boolean} [opts.force]         - Overwrite even if already installed
 * @returns {Promise<{
 *   ok:        boolean,
 *   name?:     string,
 *   version?:  string,
 *   filePath?: string,
 *   warnings?: string[],
 *   isUpdate?: boolean,
 *   error?:    string,
 *   phase?:    string,
 * }>}
 */
export async function install(spec, opts = {}) {
  const sourceType = detectSourceType(spec);
  let   source, resolvedUrl, guessedName;

  // ── 1. Fetch ───────────────────────────────────────────────────────────────
  try {
    if (sourceType === 'github') {
      ({ source, resolvedUrl, guessedName } = await fromGitHub(spec));
    } else if (sourceType === 'zip') {
      const buf     = await fetchBuffer(spec);
      const results = await fromZipBuffer(buf, spec);
      if (results.length > 1) {
        return {
          ok:    false,
          error: `ZIP contains ${results.length} JS files. Install each individually using their raw URL.`,
          phase: 'fetch',
        };
      }
      ({ source, guessedName } = results[0]);
      resolvedUrl = spec;
    } else {
      ({ source, resolvedUrl, guessedName } = await fromUrl(spec));
    }
  } catch (err) {
    return { ok: false, error: `Fetch failed: ${err.message}`, phase: 'fetch' };
  }

  // ── 2. Validate ────────────────────────────────────────────────────────────
  const validation = await validateAll(source, guessedName);
  if (!validation.valid) {
    return {
      ok:    false,
      error: `Validation failed:\n${validation.errors.join('\n')}`,
      phase: 'validate',
    };
  }

  const { meta } = validation;
  const name     = opts.nameOverride ?? meta.name ?? guessedName;

  if (!name) {
    return { ok: false, error: 'Could not determine plugin name', phase: 'validate' };
  }

  // ── 3. Collision check ─────────────────────────────────────────────────────
  const isUpdate = pluginManifest.has(name);
  const existing = pluginManager.getPlugin(name);

  if (existing && !isUpdate && !opts.force) {
    // Bundled plugin with this name exists
    return {
      ok:    false,
      error: `A plugin named "${name}" is already loaded as a bundled plugin. Choose a different name or use --force.`,
      phase: 'collision',
    };
  }

  if (!opts.force) {
    // ── Pre-flight alias conflict check (before touching disk) ───────────────
    // Check if incoming plugin NAME matches an existing alias (name-vs-alias conflict)
    const nameConflict = getCommand(name);
    if (nameConflict && nameConflict.name !== name) {
      return {
        ok:    false,
        error: `Plugin name "${name}" is already in use as an alias of "${nameConflict.name}". ` +
               `Choose a different name or use --force.`,
        phase: 'collision',
      };
    }
    // Check if any incoming ALIAS conflicts with an existing command (alias vs. primary or alias)
    for (const alias of meta.aliases ?? []) {
      const aliasConflict = getCommand(alias);
      if (aliasConflict) {
        return {
          ok:    false,
          error: `Plugin alias "${alias}" conflicts with existing command "${aliasConflict.name}". ` +
                 `Remove the alias or use --force.`,
          phase: 'collision',
        };
      }
    }
  }

  // ── 4. Write to disk (with rollback safety) ────────────────────────────────
  if (!fs.existsSync(EXTERNAL_DIR)) {
    fs.mkdirSync(EXTERNAL_DIR, { recursive: true });
  }

  const fileName = `${name}.js`;
  const filePath = path.join(EXTERNAL_DIR, fileName);
  const relPath  = path.relative(path.resolve(__dirname, '../..'), filePath);

  // Backup existing file before overwrite
  let didBackup = false;
  if (fs.existsSync(filePath)) {
    didBackup = backup(name, filePath);
  }

  try {
    fs.writeFileSync(filePath, source, 'utf8');
  } catch (err) {
    if (didBackup) restore(name, filePath);
    return { ok: false, error: `Write failed: ${err.message}`, phase: 'write' };
  }

  // ── 5. Load into runtime ──────────────────────────────────────────────────
  const loadResult = await pluginManager.loadPlugin(filePath, { cacheBust: isUpdate });

  if (!loadResult.success) {
    // Revert file on load failure
    if (didBackup) {
      restore(name, filePath);
      await pluginManager.loadPlugin(filePath).catch(() => {});
    } else {
      try { fs.unlinkSync(filePath); } catch {}
    }
    return {
      ok:    false,
      error: `Plugin loaded to disk but failed runtime registration: ${loadResult.error}`,
      phase: 'runtime',
    };
  }

  // ── 6. Register in manifest ───────────────────────────────────────────────
  const displayVersion = meta.version
    ?? `0x${sha256(source).slice(0, 8)}`;

  pluginManifest.set(name, {
    name,
    displayVersion,
    source:         `${sourceType}:${spec}`,
    sourceType,
    installedAt:    pluginManifest.get(name)?.installedAt ?? new Date().toISOString(),
    updatedAt:      new Date().toISOString(),
    filePath:       relPath,
    sha256:         sha256(source),
    size:           Buffer.byteLength(source),
    category:       meta.category    ?? 'external',
    description:    meta.description ?? '',
    bundled:        false,
  });

  // ── 7. Cleanup backup on success ──────────────────────────────────────────
  if (didBackup) cleanup(name);

  return {
    ok:       true,
    name,
    version:  displayVersion,
    filePath: relPath,
    warnings: [...validation.warnings, ...(loadResult.warnings ?? [])],
    isUpdate,
  };
}

/**
 * Uninstall a plugin: unload from runtime, delete the file, remove from manifest.
 *
 * Only external (non-bundled) plugins can be uninstalled.
 *
 * @param {string} name
 * @returns {{ ok: boolean, error?: string }}
 */
export function uninstall(name) {
  const entry = pluginManifest.get(name);
  if (!entry) {
    return { ok: false, error: `"${name}" is not in the installed plugin registry.` };
  }
  if (entry.bundled) {
    return { ok: false, error: `"${name}" is a bundled plugin and cannot be uninstalled.` };
  }

  // Unregister commands and aliases from the runtime
  const removeResult = pluginManager.removePlugin(name);
  if (!removeResult.success) {
    // Plugin may not be loaded (e.g. it errored on last load) — proceed anyway
    console.warn(`[Uninstall] removePlugin("${name}"): ${removeResult.error}`);
  }

  // Delete the file from disk.
  // Resolve relative to project root (not process.cwd()) so uninstall works
  // regardless of the current working directory when the bot is started.
  const PROJECT_ROOT = path.resolve(__dirname, '../..');
  const absPath = path.isAbsolute(entry.filePath)
    ? entry.filePath
    : path.resolve(PROJECT_ROOT, entry.filePath);
  if (fs.existsSync(absPath)) {
    try { fs.unlinkSync(absPath); } catch (err) {
      return { ok: false, error: `File delete failed: ${err.message}` };
    }
  }

  // Remove from manifest
  pluginManifest.delete(name);

  return { ok: true };
}
