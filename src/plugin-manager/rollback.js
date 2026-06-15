/**
 * Plugin Rollback — Backup and restore for safe plugin installs
 *
 * Before overwriting an existing plugin file the installer calls backup().
 * If the new version fails to load, restore() reverts the file.
 * On success, cleanup() removes the backup to save disk space.
 *
 * Backups are stored in data/plugin-backups/<name>.bak.js
 * (outside src/ so they're not scanned by the plugin loader).
 *
 * Usage:
 *   import { backup, restore, hasBackup, cleanup } from './rollback.js';
 *
 *   await backup('myplugin', 'src/plugins/external/myplugin.js');
 *   // ... attempt new install ...
 *   // On failure:
 *   await restore('myplugin', 'src/plugins/external/myplugin.js');
 *   // On success:
 *   cleanup('myplugin');
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR   = path.resolve(__dirname, '../../data/plugin-backups');

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * Path to the backup file for a plugin name.
 * @param {string} name
 * @returns {string}
 */
function backupPath(name) {
  return path.join(BACKUP_DIR, `${name}.bak.js`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Copy the current plugin file to the backup directory.
 * If the file does not exist (first install), this is a no-op.
 *
 * @param {string} name       - Plugin primary name
 * @param {string} filePath   - Absolute or relative path to the current file
 * @returns {boolean} true if a backup was made, false if nothing existed to back up
 */
export function backup(name, filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) return false;

  ensureBackupDir();
  try {
    fs.copyFileSync(absPath, backupPath(name));
    return true;
  } catch (err) {
    console.error(`[Rollback] backup("${name}") failed:`, err.message);
    return false;
  }
}

/**
 * Restore the backup file over the target path.
 * Used when a plugin update fails and you want to revert.
 *
 * @param {string} name       - Plugin primary name
 * @param {string} filePath   - Where to restore to (same path as when backup was made)
 * @returns {boolean} true on success
 */
export function restore(name, filePath) {
  const bak = backupPath(name);
  if (!fs.existsSync(bak)) {
    console.warn(`[Rollback] restore("${name}"): no backup found at ${bak}`);
    return false;
  }

  const absPath = path.resolve(filePath);
  const dir     = path.dirname(absPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    fs.copyFileSync(bak, absPath);
    return true;
  } catch (err) {
    console.error(`[Rollback] restore("${name}") failed:`, err.message);
    return false;
  }
}

/**
 * Check whether a backup exists for a plugin.
 * @param {string} name
 * @returns {boolean}
 */
export function hasBackup(name) {
  return fs.existsSync(backupPath(name));
}

/**
 * Delete the backup file for a plugin.
 * Call after a successful install/update to free disk space.
 *
 * @param {string} name
 */
export function cleanup(name) {
  const bak = backupPath(name);
  if (fs.existsSync(bak)) {
    try { fs.unlinkSync(bak); } catch {}
  }
}

/**
 * Return metadata about the backup file, or null if it doesn't exist.
 * @param {string} name
 * @returns {{ path: string, size: number, modifiedAt: string }|null}
 */
export function backupInfo(name) {
  const bak = backupPath(name);
  if (!fs.existsSync(bak)) return null;
  try {
    const stat = fs.statSync(bak);
    return {
      path:       bak,
      size:       stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}
