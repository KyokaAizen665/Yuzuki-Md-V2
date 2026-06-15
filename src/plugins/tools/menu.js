/**
 * Plugin: menu
 * Category: tools
 *
 * Registry-driven main menu with NativeFlow interactive card.
 * Categories and command counts are generated automatically from the registry.
 * No hardcoded command lists.
 *
 * Theme integration:
 *   - Active theme is read from settings.menuTheme (set via .settheme)
 *   - Falls back to 'default' when unset or unknown
 *   - Theme controls: hero image pool, greeting variants, and icon identity
 *   - Hero images cycle randomly per open; .setmenuimg override still wins
 *
 * Modes:
 *   .menu               — main menu with themed hero + dynamic greeting
 *   .menu <category>    — category sub-menu (e.g. .menu ai)
 */

import { buildMain, buildMenuRows }                    from '../../lib/menu-builder.js';
import { sendMenuCard }                                from '../../message-engine/index.js';
import { categoryCard }                                from '../../nativeflow/index.js';
import { getCategories }                               from '../../lib/registry.js';
import { loadDB }                                      from '../../lib/database.js';
import { isOwner }                                     from '../../settings.js';
import { getActiveTheme, resolveGreeting, resolveHero,
         resolveHeroFromUrl }                          from '../../lib/theme-manager.js';

/** Format seconds → "Xd Xh Xm Xs" */
function fmtUp(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

export default {
  name:        'menu',
  aliases:     ['start', 'm'],
  category:    'tools',
  description: 'Show the main bot menu or a category sub-menu',
  usage:       '.menu [category]',

  async execute({ sock, msg, args, settings, sender }) {
    const jid     = msg.key.remoteJid;
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';
    const sub     = args[0]?.toLowerCase();

    // ── Active theme (shared by both main and sub-menu) ───────────────────────
    const theme = getActiveTheme(settings);

    // ── Hero image (theme pool, overridden by .setmenuimg if set) ─────────────
    // Priority: settings.menuBgUrl → theme heroPool → no image header
    // Resolved once here so both main menu and sub-menus share the same image.
    let thumbBuf;
    if (settings?.menuBgUrl) {
      thumbBuf = await resolveHeroFromUrl(settings.menuBgUrl, 5000);
    } else {
      thumbBuf = await resolveHero(theme, 5000);
    }

    // ── Sub-menu: .menu ai, .menu tools, etc. ─────────────────────────────────
    if (sub && getCategories().includes(sub)) {
      await categoryCard(sock, jid, msg, sub, { prefix, botName, thumbBuf });
      return;
    }

    // ── Main menu ─────────────────────────────────────────────────────────────
    const db         = loadDB();
    const totalUsers = Object.keys(db.users ?? {}).length;
    const uptimeStr  = fmtUp(Math.floor(process.uptime()));
    const pushname   = msg.pushName ?? 'User';
    const userRank   = isOwner(sender, settings) ? 'Owner 👑' : 'User 🌟';

    // ── Dynamic greeting (theme-aware, time-based, personalised) ─────────────
    const greeting = resolveGreeting(theme, { name: pushname, botName });

    const caption  = buildMain(botName, prefix, {
      pushname, userRank, uptimeStr, totalUsers, greeting,
    });
    const menuRows = buildMenuRows(prefix);

    // sendMenuCard: NativeFlow card with optional image header + category select.
    // Falls back to plain text automatically if the interactive send fails.
    await sendMenuCard(sock, jid, msg, caption, menuRows, botName, thumbBuf, undefined);
  },
};
