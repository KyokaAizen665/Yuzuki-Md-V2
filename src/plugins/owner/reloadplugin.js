/**
 * Plugin: reloadplugin
 * Category: owner
 *
 * Hot-reload a plugin without restarting the bot.
 * Unregisters the old version, imports the file fresh (cache-busted),
 * and re-registers the new version.
 *
 * Usage:
 *   .reloadplugin <name>   — reload one plugin
 *   .reloadplugin --all    — reload ALL plugins
 */

import { pluginManager } from '../../plugin-manager.js';
import { isOwner }       from '../../settings.js';
import { progress, toast } from '../../utils/ui.js';

export default {
  name:        'reloadplugin',
  aliases:     ['reload', 'reloadcmd', 'hotreload'],
  category:    'owner',
  description: 'Hot-reload a plugin (or all plugins) without restarting',
  usage:       '.reloadplugin <plugin_name> | .reloadplugin --all',

  async execute({ reply, args, sender, settings }) {
    if (!isOwner(sender, settings)) { await reply('⛔ Owner only.'); return; }

    const arg0 = args[0]?.toLowerCase();
    if (!arg0) { await reply(`Usage:\n  .reloadplugin <name>\n  .reloadplugin --all`); return; }

    // Reload all
    if (arg0 === '--all' || arg0 === 'all') {
      await reply(progress('♻️', 'Reloading all plugins', 'This may take a moment...'));
      const list    = pluginManager.listPlugins();
      let ok = 0, fail = 0;
      const errors  = [];
      for (const { name } of list) {
        const r = await pluginManager.reloadPlugin(name);
        if (r.success) ok++;
        else { fail++; errors.push(`${name}: ${r.error}`); }
      }
      const summary = `✅ Reloaded ${ok} plugin(s)${fail ? `\n❌ ${fail} failed:\n${errors.slice(0,5).join('\n')}` : '.'}`;
      await reply(summary);
      return;
    }

    // Reload single
    const result = await pluginManager.reloadPlugin(arg0);
    if (result.success) {
      await reply(toast('ok', 'Plugin Reloaded', result.name));
    } else {
      await reply(toast('err', 'Reload Failed', result.error));
    }
  },
};
