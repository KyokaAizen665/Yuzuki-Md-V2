/**
 * Plugin: enableplugin
 * Category: owner
 *
 * Enable a previously disabled plugin so its commands respond again.
 * Usage: .enableplugin <plugin_name>
 */

import { pluginManager } from '../../plugin-manager.js';
import { isOwner }       from '../../settings.js';
import { toast }         from '../../utils/ui.js';

export default {
  name:        'enableplugin',
  aliases:     ['enablecmd', 'enplugin', 'enable'],
  category:    'owner',
  description: 'Enable a disabled plugin and restore its commands',
  usage:       '.enableplugin <plugin_name>',

  async execute({ reply, args, sender, settings }) {
    if (!isOwner(sender, settings)) { await reply('⛔ Owner only.'); return; }

    const name = args[0]?.toLowerCase();
    if (!name) { await reply(`Usage: .enableplugin <plugin_name>`); return; }

    const result = pluginManager.enablePlugin(name);
    if (result.success) {
      await reply(toast('ok', `Plugin Enabled`, name));
    } else {
      await reply(toast('err', `Enable Failed`, result.error));
    }
  },
};
