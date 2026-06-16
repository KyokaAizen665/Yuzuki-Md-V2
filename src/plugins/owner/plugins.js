/**
 * Plugin: plugins
 * Category: owner
 *
 * Lists every loaded plugin grouped by category with status icons.
 * Sends as an interactive card with a select list.
 * Owner-only command.
 *
 * VRS: heroType 'owner' — city-command imagery
 */

import { pluginManager, PluginStatus } from '../../plugin-manager.js';
import { pluginManifest }              from '../../plugin-manager/registry.js';
import { isOwner }                     from '../../settings.js';
import { sendHeroCard }                from '../../lib/visual-response.js';
import { selectButton }                from '../../message-engine/index.js';

const STATUS_ICONS = {
  [PluginStatus.LOADED]:   '✅',
  [PluginStatus.DISABLED]: '⛔',
  [PluginStatus.ERROR]:    '❌',
};

export default {
  name:        'plugins',
  aliases:     ['pluginlist', 'plist'],
  category:    'owner',
  description: 'List all loaded plugins with their status',
  usage:       '.plugins [category]',

  async execute({ sock, msg, reply, args, sender, settings }) {
    if (!isOwner(sender, settings)) { await reply('⛔ Owner only.'); return; }

    const jid        = msg.key.remoteJid;
    const filterCat  = args[0]?.toLowerCase();
    const list       = pluginManager.listPlugins();

    if (!list.length) { await reply('No plugins are currently loaded.'); return; }

    const filtered = filterCat ? list.filter(p => p.category === filterCat) : list;
    if (!filtered.length) { await reply(`❌ No plugins in category: *${filterCat}*`); return; }

    const byCategory = {};
    for (const p of filtered) {
      const cat = p.category ?? 'uncategorized';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(p);
    }

    const total    = list.length;
    const active   = list.filter(p => p.status === PluginStatus.LOADED).length;
    const disabled = list.filter(p => p.status === PluginStatus.DISABLED).length;
    const errored  = list.filter(p => p.status === PluginStatus.ERROR).length;

    const lines = [
      `🔌 *Plugin Registry*${filterCat ? ` — ${filterCat}` : ''}`,
      `Total: ${total}  |  ✅ ${active}  ⛔ ${disabled}  ❌ ${errored}`,
      '',
    ];

    const selectRows = [];

    for (const [cat, plugins] of Object.entries(byCategory).sort()) {
      lines.push(`*${cat.toUpperCase()}*`);
      for (const p of plugins.sort((a, b) => a.name.localeCompare(b.name))) {
        const icon    = STATUS_ICONS[p.status] ?? '❓';
        const aliases = p.aliases?.length ? ` _(${p.aliases.join(', ')})_` : '';
        const mEntry  = pluginManifest.get(p.name);
        const mBadge  = mEntry ? ` 📦 _v${mEntry.displayVersion}_` : '';
        lines.push(`  ${icon} *${p.name}*${aliases}${mBadge}`);
        if (p.status === PluginStatus.ERROR) lines.push(`    ⚠️ ${p.error}`);
        selectRows.push({
          title:       `${icon} ${p.name}`,
          description: (p.description ?? p.category ?? '').slice(0, 72),
          rowId:       `${settings.prefix ?? '.'}plugininfo ${p.name}`,
        });
      }
      lines.push('');
    }

    const extCount = pluginManifest.size;
    lines.push(`_Use .plugininfo <name> for details_`);
    if (extCount > 0) lines.push(`_📦 ${extCount} installed via marketplace_`);
    const body = lines.join('\n').trim();

    const rows = selectRows.slice(0, 10);
    await sendHeroCard(sock, jid, msg, {
      body,
      footer:    `${total} plugins loaded${extCount ? ` • ${extCount} from marketplace` : ''}`,
      heroType:  'owner',
      settings,
      forceHero: true,
      buttons:   rows.length ? [selectButton('🔍 Plugin Details', rows, 'Select Plugin')] : [],
      fallback:  body,
    });
  },
};
