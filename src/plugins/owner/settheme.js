/**
 * Plugin: settheme
 * Category: owner
 *
 * Switch the active menu theme.
 *
 * Usage:
 *   .settheme              — list all available themes
 *   .settheme <id>         — activate a theme (e.g. .settheme midnight)
 *   .settheme default      — reset to the default theme
 */

import { setSetting, isOwner } from '../../settings.js';
import { listThemes, getTheme } from '../../lib/theme-registry.js';
import { toast, listCard }      from '../../utils/ui.js';

export default {
  name:        'settheme',
  aliases:     ['theme', 'menutheme'],
  category:    'owner',
  description: 'Switch the bot menu theme',
  usage:       '.settheme [theme-id]',
  permissions: ['owner'],

  async execute({ reply, args, sender, settings, prefix }) {
    if (!isOwner(sender, settings)) {
      await reply(toast('err', 'Owner Only', 'This command is restricted to bot owners.'));
      return;
    }

    const themes = listThemes();

    // ── No argument: list all themes ──────────────────────────────────────────
    if (!args[0]) {
      const current = settings?.menuTheme || 'default';
      const items   = themes.map(t => {
        const active = t.id === current ? ' ✅' : '';
        return `${t.icon}  *${t.name}*  \`${t.id}\`${active}\n     _${t.description}_`;
      });
      await reply(
        `🎨  *Menu Themes*\n${'─'.repeat(22)}\n\n${items.join('\n\n')}\n\n` +
        `_Current: *${current}*_\n` +
        `_Use \`${prefix}settheme <id>\` to switch._`,
      );
      return;
    }

    // ── Set theme ─────────────────────────────────────────────────────────────
    const id    = args[0].toLowerCase().trim();
    const theme = getTheme(id);

    // getTheme falls back to default, so check the id directly
    if (!theme || theme.id !== id) {
      const ids = themes.map(t => `\`${t.id}\``).join('  ');
      await reply(toast('err', 'Unknown Theme', `Available: ${ids}`));
      return;
    }

    setSetting('menuTheme', id);
    await reply(
      toast('ok', 'Theme Updated', `${theme.icon}  *${theme.name}*`) +
      `\n╰›  _${theme.description}_\n\n` +
      `_Send \`${prefix}menu\` to preview the new theme._`,
    );
  },
};
