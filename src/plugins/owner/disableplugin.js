/**
 * Plugin: disableplugin
 * Category: owner
 *
 * Disable a plugin so its commands silently do nothing.
 * The plugin remains loaded and can be re-enabled without reload.
 * Usage: .disableplugin <plugin_name>
 */

import { pluginManager } from '../../plugin-manager.js';
import { isOwner }       from '../../settings.js';
import { toast }         from '../../utils/ui.js';

export default {
  name:        'disableplugin',
  aliases:     ['disablecmd', 'displugin', 'disable'],
  category:    'owner',
  description: 'Disable a plugin — commands silently ignored until re-enabled',
  usage:       '.disableplugin <plugin_name>',

  async execute({ reply, args, sender, settings }) {
    if (!isOwner(sender, settings)) { await reply('⛔ Owner only.'); return; }

    const name = args[0]?.toLowerCase();
    if (!name) { await reply(`Usage: .disableplugin <plugin_name>`); return; }

    // Refuse to disable critical core plugins
    const PROTECTED = new Set(['reload', 'enableplugin', 'disableplugin', 'reloadplugin']);
    if (PROTECTED.has(name)) {
      await reply(toast('warn', 'Protected Plugin', `${name} cannot be disabled.`));
      return;
    }

    const result = pluginManager.disablePlugin(name);
    if (result.success) {
      await reply(toast('ok', `Plugin Disabled`, `${name} — use .enableplugin ${name} to restore`));
    } else {
      await reply(toast('err', `Disable Failed`, result.error));
    }
  },
};
