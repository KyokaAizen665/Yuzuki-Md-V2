/**
 * Plugin: plugininfo
 * Category: tools
 *
 * Displays detailed metadata for a loaded plugin by primary name or alias.
 * Useful for debugging plugin configuration and dependency chains.
 *
 * Usage:
 *   .plugininfo <name>     — show info for a specific plugin
 *   .plugininfo --all      — list every plugin with one-line summaries
 */

import { pluginManager, PluginStatus } from '../../plugin-manager.js';

const STATUS_ICONS = {
  [PluginStatus.LOADED]:   '✅',
  [PluginStatus.DISABLED]: '⛔',
  [PluginStatus.ERROR]:    '❌',
};

export default {
  name:        'pluginstatus',
  aliases:     ['pstatus', 'pdetail'],
  category:    'tools',
  description: 'Show public status info about a loaded plugin',
  usage:       '.pluginstatus <name|--all>',

  async execute({ replyChannel, args }) {
    const query = args[0]?.toLowerCase();

    if (!query) {
      await replyChannel(
        `Usage: *.pluginstatus <plugin name>*\n` +
        `       *.pluginstatus --all* — list all plugins`
      );
      return;
    }

    // ── --all flag: compact summary of every plugin ──────────────────────────
    if (query === '--all') {
      const list = pluginManager.listPlugins();
      if (!list.length) {
        await replyChannel('No plugins are currently loaded.');
        return;
      }

      const byCategory = pluginManager.getPluginsByCategory();
      const lines      = [`🔌 *All Plugins (${list.length})*\n`];

      for (const [cat, names] of Object.entries(byCategory).sort()) {
        lines.push(`*${cat.toUpperCase()}*`);
        for (const name of names.sort()) {
          const entry = pluginManager.getPlugin(name);
          const icon  = STATUS_ICONS[entry?.status] ?? '❓';
          lines.push(`  ${icon} ${name}`);
        }
        lines.push('');
      }

      await replyChannel(lines.join('\n'));
      return;
    }

    // ── Single plugin lookup ─────────────────────────────────────────────────
    const entry = pluginManager.getPlugin(query);
    if (!entry) {
      await replyChannel(
        `❌ Plugin not found: *${query}*\n` +
        `Use *.plugininfo --all* to see all loaded plugins.`
      );
      return;
    }

    const { plugin, status, loadedAt, filePath, error } = entry;
    const icon     = STATUS_ICONS[status] ?? '❓';
    const aliases  = plugin.aliases?.length  ? plugin.aliases.join(', ')     : 'None';
    const deps     = plugin.dependencies?.length ? plugin.dependencies.join(', ') : 'None';
    const usage    = plugin.usage ?? 'N/A';

    const lines = [
      `🔌 *Plugin: ${plugin.name}*`,
      '',
      `• *Status:*       ${icon} ${status}`,
      `• *Category:*     ${plugin.category ?? 'Uncategorized'}`,
      `• *Description:*  ${plugin.description ?? 'No description'}`,
      `• *Usage:*        ${usage}`,
      `• *Aliases:*      ${aliases}`,
      `• *Dependencies:* ${deps}`,
      `• *Loaded at:*    ${loadedAt}`,
      `• *Source:*       ${filePath}`,
    ];

    if (error) {
      lines.push(`• *Error:* ${error}`);
    }

    await replyChannel(lines.join('\n'));
  },
};
