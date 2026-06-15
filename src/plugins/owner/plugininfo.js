/**
 * Plugin: plugininfo
 * Category: owner
 *
 * Show detailed runtime info for a specific plugin.
 * Includes: load status, file path, aliases, load time, metadata.
 * Sends as an interactive NativeFlow card via the nativeflow layer.
 */

import { pluginManager }  from '../../plugin-manager.js';
import { pluginManifest } from '../../plugin-manager/registry.js';
import { isOwner }        from '../../settings.js';
import { pluginDetailCard } from '../../nativeflow/index.js';

export default {
  name:        'plugininfo',
  aliases:     ['pinfo', 'cmdinfo'],
  category:    'owner',
  description: 'Show detailed info and status for a specific plugin',
  usage:       '.plugininfo <plugin_name>',

  async execute({ sock, msg, reply, args, sender, settings }) {
    if (!isOwner(sender, settings)) { await reply('⛔ Owner only.'); return; }

    const jid  = msg.key.remoteJid;
    const name = args[0]?.toLowerCase();
    if (!name) {
      await reply(`Usage: .plugininfo <plugin_name>\nExample: .plugininfo chatgpt`);
      return;
    }

    const entry = pluginManager.getPlugin(name);
    if (!entry) {
      await reply(`❌ Plugin not found: *${name}*`);
      return;
    }

    const { plugin, filePath, status, loadedAt, error } = entry;
    const prefix  = settings?.prefix ?? '.';
    const relPath = filePath.replace(/.*\/src\//, 'src/');
    const mEntry  = pluginManifest.get(name);

    // Build a runtime-enriched copy of the plugin object so commandCard
    // renders the extra fields (status, path, marketplace) alongside metadata.
    const enriched = {
      ...plugin,
      // Append runtime detail to description for the info card
      description: [
        plugin.description ?? '—',
        ``,
        `🔌 *Runtime*`,
        `Status:    ${status}`,
        `File:      ${relPath}`,
        `Loaded at: ${new Date(loadedAt).toLocaleTimeString()}`,
        ...(error ? [`Error:     ${error}`] : []),
        ...(mEntry ? [
          ``,
          `📦 *Marketplace*`,
          `Version:   ${mEntry.displayVersion}`,
          `Source:    ${mEntry.source}`,
          `Installed: ${new Date(mEntry.installedAt).toLocaleDateString()}`,
          ...(mEntry.updatedAt !== mEntry.installedAt
            ? [`Updated:   ${new Date(mEntry.updatedAt).toLocaleDateString()}`]
            : []),
          `Size:      ${(mEntry.size / 1024).toFixed(1)} KB`,
        ] : []),
      ].join('\n'),
    };

    await pluginDetailCard(sock, jid, msg, enriched, { prefix });
  },
};
