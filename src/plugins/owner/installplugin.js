/**
 * Plugin: installplugin
 * Category: owner
 *
 * Install a new plugin from GitHub or a raw URL without restarting the bot.
 *
 * Source formats:
 *   GitHub shorthand  — owner/repo[@ref]
 *                       owner/repo/path/to/plugin.js[@ref]
 *   Raw JS URL        — https://example.com/plugin.js
 *   ZIP URL           — https://example.com/plugin.zip  (requires adm-zip)
 *
 * Examples:
 *   .installplugin KyokaAizen665/yuzuki-extra-tools
 *   .installplugin KyokaAizen665/yuzuki-plugins/src/myplugin.js@dev
 *   .installplugin https://raw.githubusercontent.com/user/repo/main/plugin.js
 *
 * Flags:
 *   --force   Overwrite a bundled plugin with the same name (use with care)
 */

import { install }       from '../../plugin-manager/installer.js';
import { isOwner }       from '../../settings.js';
import { card, toast, progress } from '../../utils/ui.js';

export default {
  name:        'installplugin',
  aliases:     ['iplugin', 'plugininstall', 'addplugin'],
  category:    'owner',
  description: 'Install a plugin from GitHub or URL without restarting',
  usage:       '.installplugin <owner/repo[/path][@ref]|URL> [--force]',
  permissions: ['owner'],

  async execute({ reply, args, sender, settings }) {
    if (!isOwner(sender, settings)) { await reply('⛔ Owner only.'); return; }

    const flags = new Set(args.filter(a => a.startsWith('--')));
    const parts = args.filter(a => !a.startsWith('--'));
    const spec  = parts.join(' ').trim();

    if (!spec) {
      await reply(
        card('📦', 'Install Plugin', [
          ['Usage',   '.installplugin <source>'],
          [null, null],
          ['GitHub',  'owner/repo[@ref]'],
          ['File',    'owner/repo/path/to/plugin.js'],
          ['URL',     'https://example.com/plugin.js'],
          ['ZIP',     'https://example.com/plugin.zip'],
        ], 'Example: .installplugin KyokaAizen665/yuzuki-plugins/tools/weather.js'),
      );
      return;
    }

    // Send progress indicator (installation may take several seconds)
    await reply(progress('📦', 'Installing Plugin…', `Fetching from: ${spec}`));

    const result = await install(spec, { force: flags.has('--force') });

    if (!result.ok) {
      const phaseLabel = {
        fetch:     'Download Failed',
        validate:  'Validation Failed',
        write:     'Write Failed',
        runtime:   'Runtime Load Failed',
        collision: 'Name Conflict',
      }[result.phase] ?? 'Install Failed';

      await reply(
        card('❌', phaseLabel, [
          ['Source',  spec],
          ['Reason',  result.error],
          [null, null],
          ['Tip',
            result.phase === 'collision'
              ? 'Use --force to overwrite or rename the plugin'
              : result.phase === 'validate'
              ? 'Review plugin source for dangerous patterns'
              : 'Check the source URL and try again',
          ],
        ]),
      );
      return;
    }

    const action  = result.isUpdate ? 'Plugin Updated' : 'Plugin Installed';
    const icon    = result.isUpdate ? '🔄' : '✅';
    const warnTxt = result.warnings?.length
      ? result.warnings.slice(0, 3).join('\n')
      : null;

    const fields = [
      ['Name',    result.name],
      ['Version', result.version],
      ['Path',    result.filePath],
      ['Source',  spec.length > 50 ? `${spec.slice(0, 47)}…` : spec],
    ];
    if (warnTxt) {
      fields.push([null, null]);
      fields.push(['⚠️ Warnings', warnTxt]);
    }

    await reply(
      card(icon, action, fields,
        `Use .plugininfo ${result.name} for full details`),
    );
  },
};
