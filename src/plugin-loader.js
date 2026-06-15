/**
 * Plugin Loader
 *
 * Recursively scans src/plugins/ AND src/games/plugins/ and loads every .js
 * file through the PluginManager so that each plugin gets:
 *   - Metadata validation
 *   - Dependency checking
 *   - Error isolation (one failure never stops the rest)
 *   - Automatic registration in the command registry
 *
 * Game plugins in src/games/plugins/ also self-register with the GamesEngine
 * at module-load time (top-level gamesEngine.registerGame() call inside each file).
 *
 * Convention
 *   - Files beginning with "_" are skipped (private helpers).
 *   - Each .js file should have exactly one `export default { name, execute, … }`.
 *
 * Usage
 *   import { loadPlugins } from './plugin-loader.js';
 *   await loadPlugins();   // must be awaited — import() is async
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pluginManager } from './plugin-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Walk a directory tree and invoke `callback` for every .js file found.
 * Files whose basenames start with "_" are skipped.
 *
 * @param {string}   dir
 * @param {Function} callback  async (absoluteFilePath: string) => void
 */
async function walk(dir, callback) {
  if (!fs.existsSync(dir)) return;

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      await walk(full, callback);
    } else if (item.endsWith('.js') && !item.startsWith('_')) {
      await callback(full);
    }
  }
}

/**
 * Load all .js plugins from a given root directory.
 * Returns { loaded, failed } counts for that directory.
 *
 * @param {string} rootDir   - Absolute path to scan
 * @param {string} label     - Human-readable label for log output
 */
async function loadDir(rootDir, label) {
  let loaded = 0;
  let failed = 0;

  await walk(rootDir, async (filePath) => {
    const rel    = path.relative(rootDir, filePath);
    const result = await pluginManager.loadPlugin(filePath);

    if (result.success) {
      loaded++;
      if (result.warnings?.length) {
        for (const w of result.warnings) {
          console.warn(`[PluginLoader/${label}] ${rel} — warning: ${w}`);
        }
      }
    } else {
      failed++;
      console.error(`[PluginLoader/${label}] Failed to load "${rel}": ${result.error}`);
    }
  });

  return { loaded, failed };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load all plugins from:
 *   - src/plugins/        (core command plugins)
 *   - src/games/plugins/  (game framework plugins — also self-register with GamesEngine)
 *
 * Each plugin is loaded through pluginManager.loadPlugin() which
 * validates metadata, checks dependencies, and registers commands.
 * Failures are logged but do not abort the loop.
 *
 * @returns {Promise<{ loaded: number, failed: number }>}
 */
export async function loadPlugins() {
  const pluginsDir      = path.join(__dirname, 'plugins');
  const gamePluginsDir  = path.join(__dirname, 'games', 'plugins');

  // Load core plugins
  const core = await loadDir(pluginsDir,     'core');

  // Load game plugins (they also call gamesEngine.registerGame() on import)
  const game = await loadDir(gamePluginsDir, 'games');

  const loaded = core.loaded + game.loaded;
  const failed = core.failed + game.failed;

  console.log(
    `[PluginLoader] Done — ${loaded} plugin(s) loaded (${core.loaded} core + ${game.loaded} game), ${failed} failed.`
  );

  return { loaded, failed };
}
