/**
 * Plugin: updateplugin
 * Category: owner
 *
 * Re-fetch and apply the latest version of an installed plugin from its
 * registered source (GitHub or URL).
 *
 * All validation and rollback safety from the original install applies:
 *   • Static security scan
 *   • Schema validation
 *   • Automatic rollback if the new version fails to load
 *
 * Usage:
 *   .updateplugin <plugin_name>     — update one plugin
 *   .updateplugin --all             — update all installed plugins
 *   .updateplugin --check <name>    — check for updates without applying
 */

import { update, updateAll, checkUpdate } from '../../plugin-manager/updater.js';
import { pluginManifest }                 from '../../plugin-manager/registry.js';
import { isOwner }                        from '../../settings.js';
import { card, toast, progress, listCard } from '../../utils/ui.js';

export default {
  name:        'updateplugin',
  aliases:     ['upgradeplugin', 'pluginupdate', 'upplugin'],
  category:    'owner',
  description: 'Update an installed plugin from its registered source',
  usage:       '.updateplugin <name> | .updateplugin --all | .updateplugin --check <name>',
  permissions: ['owner'],

  async execute({ reply, args, sender, settings }) {
    if (!isOwner(sender, settings)) { await reply('⛔ Owner only.'); return; }

    const flag = args[0]?.toLowerCase();

    // ── .updateplugin --check <name> ──────────────────────────────────────────
    if (flag === '--check') {
      const name = args[1]?.toLowerCase();
      if (!name) { await reply(`Usage: .updateplugin --check <plugin_name>`); return; }

      await reply(progress('🔍', 'Checking for updates…', name));
      const info = await checkUpdate(name);

      if (!info.ok) {
        await reply(toast('err', 'Check Failed', info.error));
        return;
      }

      if (info.hasUpdate) {
        await reply(
          card('🔔', 'Update Available', [
            ['Plugin',   name],
            ['Installed', info.currentVersion],
            ['Status',   'Remote content has changed'],
            [null, null],
            ['Tip', `.updateplugin ${name} to apply`],
          ]),
        );
      } else {
        await reply(toast('ok', 'Up to Date', `${name} matches the remote source`));
      }
      return;
    }

    // ── .updateplugin --all ───────────────────────────────────────────────────
    if (flag === '--all' || flag === 'all') {
      const installed = pluginManifest.list().filter(p => !p.bundled);
      if (!installed.length) {
        await reply(toast('info', 'No Installed Plugins', 'Nothing to update'));
        return;
      }

      await reply(progress('🔄', 'Updating All Plugins…', `${installed.length} plugin(s) queued`));

      const batch = await updateAll();

      const lines = batch.results.map(r => {
        if (!r.ok)      return `❌ ${r.name} — ${r.error}`;
        if (r.changed)  return `✅ ${r.name} — updated`;
        return              `⏭️  ${r.name} — already latest`;
      });

      await reply(
        card('🔄', 'Update Complete', [
          ['Total',   String(batch.total)],
          ['Updated', String(batch.updated)],
          ['Skipped', String(batch.skipped)],
          ['Failed',  String(batch.failed)],
          [null, null],
          ['Results', lines.slice(0, 10).join('\n')],
        ]),
      );
      return;
    }

    // ── .updateplugin <name> ──────────────────────────────────────────────────
    if (!flag) {
      await reply(
        card('🔄', 'Update Plugin', [
          ['Single', '.updateplugin <name>'],
          ['All',    '.updateplugin --all'],
          ['Check',  '.updateplugin --check <name>'],
        ]),
      );
      return;
    }

    const name = flag; // first arg is the plugin name
    await reply(progress('🔄', 'Updating Plugin…', name));

    const result = await update(name);

    if (!result.ok) {
      await reply(
        card('❌', 'Update Failed', [
          ['Plugin', name],
          ['Reason', result.error],
        ]),
      );
      return;
    }

    if (!result.changed) {
      await reply(toast('ok', 'Already Up to Date', `${name} is already at the latest version`));
      return;
    }

    await reply(
      card('✅', 'Plugin Updated', [
        ['Name',        result.name],
        ['Old Version', result.oldVersion],
        ['New Version', result.newVersion],
        [null, null],
        ['Status', 'Hot-reloaded — no restart needed'],
      ], result.warnings?.length ? `⚠️ ${result.warnings[0]}` : undefined),
    );
  },
};
