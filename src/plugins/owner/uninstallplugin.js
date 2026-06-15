/**
 * Plugin: uninstallplugin
 * Category: owner
 *
 * Remove an externally-installed plugin:
 *   1. Unregisters all its commands and aliases from the runtime
 *   2. Deletes the plugin file from disk
 *   3. Removes the manifest entry
 *
 * Only plugins installed via .installplugin can be uninstalled.
 * Bundled (built-in) plugins are protected and cannot be removed this way.
 *
 * Usage:
 *   .uninstallplugin <plugin_name>
 */

import { uninstall }   from '../../plugin-manager/installer.js';
import { isOwner }     from '../../settings.js';
import { toast, card } from '../../utils/ui.js';

// Core plugins that can never be uninstalled even if they appear in the registry
const PROTECTED = new Set([
  'plugins', 'plugininfo', 'reloadplugin', 'enableplugin', 'disableplugin',
  'installplugin', 'uninstallplugin', 'updateplugin',
]);

export default {
  name:        'uninstallplugin',
  aliases:     ['removeplugin', 'delplugin', 'unplugin'],
  category:    'owner',
  description: 'Remove an installed plugin and unregister its commands',
  usage:       '.uninstallplugin <plugin_name>',
  permissions: ['owner'],

  async execute({ reply, args, sender, settings }) {
    if (!isOwner(sender, settings)) { await reply('⛔ Owner only.'); return; }

    const name = args[0]?.toLowerCase();
    if (!name) {
      await reply(
        card('🗑️', 'Uninstall Plugin', [
          ['Usage',   '.uninstallplugin <name>'],
          ['Tip',     'Use .plugins to see installed plugins'],
        ]),
      );
      return;
    }

    if (PROTECTED.has(name)) {
      await reply(toast('warn', 'Protected Plugin', `"${name}" is a core plugin and cannot be uninstalled.`));
      return;
    }

    const result = uninstall(name);

    if (!result.ok) {
      await reply(
        card('❌', 'Uninstall Failed', [
          ['Plugin', name],
          ['Reason', result.error],
          [null, null],
          ['Tip', 'Only plugins installed via .installplugin can be removed'],
        ]),
      );
      return;
    }

    await reply(
      card('🗑️', 'Plugin Uninstalled', [
        ['Name',   name],
        ['Status', 'Commands unregistered'],
        ['File',   'Deleted from disk'],
        ['Registry', 'Entry removed'],
      ], 'The plugin will not be reloaded on restart'),
    );
  },
};
