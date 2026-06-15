/**
 * Plugin Validator
 *
 * Two-phase validation for plugin source code:
 *
 *   Phase 1 — Static analysis (no execution)
 *     Scans the raw source text for dangerous patterns that could harm the bot,
 *     the host system, or other users.  Returns immediately; nothing is written.
 *
 *   Phase 2 — Schema validation (import + introspect)
 *     Writes the source to a temp file, dynamically imports it, checks that
 *     the default export satisfies the plugin contract, then deletes the temp.
 *
 * Usage:
 *   import { validateSource, validatePlugin } from './validator.js';
 *
 *   // Phase 1 (always run first):
 *   const staticResult = validateSource(sourceCode);
 *   if (!staticResult.valid) { ... abort ... }
 *
 *   // Phase 2 (run after Phase 1 passes):
 *   const schemaResult = await validatePlugin(sourceCode, 'myplugin');
 *   if (!schemaResult.valid) { ... abort ... }
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR   = path.resolve(__dirname, '../plugins/external');
const TEMP_PREFIX = '_validate_tmp_';

// ─── Dangerous pattern rules ──────────────────────────────────────────────────
//
// Each rule:  { pattern: RegExp, message: string, severity: 'block'|'warn' }
//
// 'block' → validation fails immediately (plugin is rejected).
// 'warn'  → added to warnings but does not block installation.

const RULES = [
  // ── Execution / code injection ─────────────────────────────────────────────
  {
    pattern:  /\beval\s*\(/,
    message:  'Uses eval() — arbitrary code execution risk',
    severity: 'block',
  },
  {
    pattern:  /new\s+Function\s*\(/,
    message:  'Uses new Function() — arbitrary code execution risk',
    severity: 'block',
  },
  {
    pattern:  /\bvm\b.*\bcreateContext\b|\bvm\.runIn/,
    message:  'Uses Node vm module — sandbox escape risk',
    severity: 'block',
  },

  // ── Shell / process control ────────────────────────────────────────────────
  {
    pattern:  /require\s*\(\s*['"]child_process['"]\s*\)|import\s+.*child_process|from\s+['"]child_process['"]/,
    message:  'Imports child_process — shell execution risk',
    severity: 'block',
  },
  {
    pattern:  /\bprocess\.exit\s*\(/,
    message:  'Calls process.exit() — can terminate the bot',
    severity: 'block',
  },
  {
    pattern:  /\bprocess\.kill\s*\(/,
    message:  'Calls process.kill() — can terminate the bot',
    severity: 'block',
  },
  {
    pattern:  /\bspawn\s*\(|execSync\s*\(|execFile\s*\(/,
    message:  'Direct shell execution call detected',
    severity: 'block',
  },

  // ── Filesystem destruction ─────────────────────────────────────────────────
  {
    pattern:  /fs\.(unlink|rm|rmdir|rmSync|unlinkSync)\s*\(/,
    message:  'Direct filesystem deletion call — review carefully',
    severity: 'warn',
  },
  {
    pattern:  /fs\.(writeFile|appendFile|writeFileSync)\s*\([^)]*(?:\.env|settings\.json|database\.json|plugin-registry)/,
    message:  'Writes to protected system files',
    severity: 'block',
  },

  // ── Exfiltration ──────────────────────────────────────────────────────────
  {
    pattern:  /process\.env\b/,
    message:  'Accesses process.env — may read API keys',
    severity: 'warn',
  },

  // ── Prototype pollution ───────────────────────────────────────────────────
  {
    pattern:  /__proto__\s*=|Object\.setPrototypeOf\s*\(/,
    message:  'Possible prototype pollution (Object.setPrototypeOf or __proto__ assignment)',
    severity: 'warn',
  },

  // ── vm.Script sandbox escape ───────────────────────────────────────────────
  {
    pattern:  /new\s+vm\s*\.?\s*Script\s*\(/,
    message:  'Uses vm.Script() — sandbox escape risk',
    severity: 'block',
  },
];

// ─── Required metadata fields ─────────────────────────────────────────────────

const REQUIRED_EXPORTS = ['name', 'execute'];

// ─── Phase 1 — Static analysis ────────────────────────────────────────────────

/**
 * Scan raw source code for dangerous patterns.
 *
 * @param {string} source
 * @returns {{ valid: boolean, errors: string[], warnings: string[], risk: 'low'|'medium'|'high' }}
 */
export function validateSource(source) {
  const errors   = [];
  const warnings = [];

  for (const rule of RULES) {
    if (rule.pattern.test(source)) {
      if (rule.severity === 'block') {
        errors.push(rule.message);
      } else {
        warnings.push(rule.message);
      }
    }
  }

  // Determine risk level
  let risk = 'low';
  if (warnings.length > 0) risk = 'medium';
  if (errors.length > 0)   risk = 'high';

  return {
    valid:    errors.length === 0,
    errors,
    warnings,
    risk,
  };
}

// ─── Phase 2 — Schema validation ──────────────────────────────────────────────

/**
 * Write source to a temp file, import it, validate the export shape,
 * then clean up.  The temp file is prefixed with `_` so plugin-loader
 * skips it during startup scans.
 *
 * @param {string} source     - Plugin source code
 * @param {string} pluginName - Expected plugin name (used for temp filename)
 * @returns {Promise<{
 *   valid:       boolean,
 *   errors:      string[],
 *   warnings:    string[],
 *   meta:        object|null,   // extracted plugin metadata if valid
 * }>}
 */
export async function validatePlugin(source, pluginName = 'unknown') {
  const errors   = [];
  const warnings = [];
  let   meta     = null;

  // Ensure temp dir exists
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const tempName = `${TEMP_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2)}.js`;
  const tempPath = path.join(TEMP_DIR, tempName);

  try {
    fs.writeFileSync(tempPath, source, 'utf8');

    // Dynamic import (cache-busted)
    const url = `${pathToFileURL(tempPath).href}?v=${Date.now()}`;
    let mod;
    try {
      mod = await import(url);
    } catch (err) {
      errors.push(`Import error: ${err.message}`);
      return { valid: false, errors, warnings, meta };
    }

    const plugin = mod.default ?? mod;

    if (!plugin || typeof plugin !== 'object') {
      errors.push('Default export must be a plain object');
      return { valid: false, errors, warnings, meta };
    }

    // Check required fields
    for (const field of REQUIRED_EXPORTS) {
      if (plugin[field] == null) {
        errors.push(`Missing required export field: "${field}"`);
      }
    }

    if (plugin.name !== undefined && typeof plugin.name !== 'string') {
      errors.push('"name" must be a string');
    }
    if (plugin.execute !== undefined && typeof plugin.execute !== 'function') {
      errors.push('"execute" must be a function');
    }

    // Soft checks
    if (!plugin.description) {
      warnings.push('No "description" — plugin will not appear in help menus');
    }
    if (!plugin.category) {
      warnings.push('No "category" — plugin will be grouped as "external"');
    }

    if (errors.length === 0) {
      meta = {
        name:        plugin.name,
        category:    plugin.category    ?? 'external',
        description: plugin.description ?? '',
        usage:       plugin.usage       ?? `.${plugin.name}`,
        aliases:     Array.isArray(plugin.aliases) ? plugin.aliases : [],
        version:     plugin.version     ?? null,
      };
    }

  } finally {
    // Always remove the temp file
    try { fs.unlinkSync(tempPath); } catch {}
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    meta,
  };
}

/**
 * Run both phases and return a combined result.
 *
 * @param {string} source
 * @param {string} pluginName
 * @returns {Promise<{
 *   valid:    boolean,
 *   errors:   string[],
 *   warnings: string[],
 *   risk:     string,
 *   meta:     object|null,
 * }>}
 */
export async function validateAll(source, pluginName = 'unknown') {
  const phase1 = validateSource(source);
  if (!phase1.valid) {
    return { ...phase1, meta: null };
  }

  const phase2 = await validatePlugin(source, pluginName);

  return {
    valid:    phase2.valid,
    errors:   [...phase1.errors,   ...phase2.errors],
    warnings: [...phase1.warnings, ...phase2.warnings],
    risk:     phase1.risk,
    meta:     phase2.meta,
  };
}
