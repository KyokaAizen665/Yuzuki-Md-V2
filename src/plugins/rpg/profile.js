/**
 * Plugin: profile
 * Category: rpg
 *
 * Full user profile card showing level, rank, coins, stats,
 * achievements count, daily streak, and battle record.
 *
 * Usage:
 *   .profile         — your profile
 *   .me              — alias
 *   .profile @user   — view another user's profile
 *   .stats           — alias
 */

import { loadDB, initUserDB }          from '../../lib/database.js';
import { getGU, getInventory }         from '../../lib/games-db.js';
import { getRankInfo, xpToNext, xpBar, ACHIEVEMENTS } from '../../lib/rpg.js';
import { ITEMS, sellPrice }            from '../../lib/items.js';

function netWorth(coins, bank, inv) {
  const invVal = Object.entries(inv).reduce((s, [id, q]) => s + sellPrice(id) * q, 0);
  return coins + bank + invVal;
}

export default {
  name:        'profile',
  aliases:     ['me', 'myprofile', 'stats', 'card', 'playercard'],
  category:    'rpg',
  description: 'Full profile card — level, rank, coins, stats, achievements',
  usage:       '.profile [@user]',

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    const targetJid = mentioned[0] ?? sender;
    const isSelf    = targetJid === sender;

    initUserDB(targetJid);
    const db  = loadDB();
    const dbu = db.users[targetJid];
    if (!dbu) { await reply(`❌ User not found.`); return; }

    const level  = dbu.level   ?? 0;
    const exp    = dbu.exp     ?? 0;
    const coins  = dbu.money   ?? 0;
    const bank   = dbu.bank    ?? 0;
    const name   = dbu.name    ?? 'User';
    const prem   = dbu.premium ?? false;
    const badges = dbu.badges  ?? [];
    const rank   = getRankInfo(level);
    const bar    = xpBar(exp, level, 10);

    const gu     = getGU(targetJid);
    const stats  = gu.stats ?? {};
    const streak = gu.dailyStreak ?? 0;
    const achs   = gu.achievements ?? [];

    const inv    = getInventory(targetJid);
    const nw     = netWorth(coins, bank, inv);
    const invCnt = Object.values(inv).filter(q => q > 0).length;

    const top3Ach = achs.slice(-3).reverse()
      .map(id => ACHIEVEMENTS[id])
      .filter(Boolean)
      .map(a => `${a.emoji} ${a.name}`)
      .join('  ');

    const winRate = (stats.battlesWon ?? 0) + (stats.battlesLost ?? 0) > 0
      ? Math.round((stats.battlesWon / ((stats.battlesWon ?? 0) + (stats.battlesLost ?? 0))) * 100)
      : 0;

    let text =
      `${rank.icon} *${name}*${prem ? '  ⭐ _Premium_' : ''}\n` +
      `${'─'.repeat(24)}\n\n` +

      `🏅 *Rank*     ${rank.name} ${rank.icon}\n` +
      `⭐ *Level*    ${level}\n` +
      `✨ *XP*       ${bar}\n\n` +

      `💰 *Wallet*   ${coins} coins\n` +
      `🏦 *Bank*     ${bank} coins\n` +
      `💎 *Net Worth* ${nw} coins\n\n` +

      `📦 *Inventory*  ${invCnt} types\n\n` +

      `${'─'.repeat(24)}\n` +
      `📊 *Game Stats*\n` +
      `  🎣 Fishing:   ${stats.fishCount    ?? 0}\n` +
      `  🏹 Hunting:   ${stats.huntCount    ?? 0}\n` +
      `  ⛏️  Mining:    ${stats.mineCount    ?? 0}\n` +
      `  🌾 Harvests:  ${stats.harvestCount ?? 0}\n` +
      `  ⚔️  Battles:   W${stats.battlesWon ?? 0}/L${stats.battlesLost ?? 0}  (${winRate}% win rate)\n` +
      `  📅 Streak:    🔥 ${streak} days\n\n` +

      `🏆 *Achievements*  (${achs.length}/${Object.keys(ACHIEVEMENTS).length})\n` +
      (top3Ach ? `  ${top3Ach}\n` : '  _None yet_\n') +
      `  _Use \`${prefix}achievements\` to see all_\n\n` +

      (badges.length ? `🏷️ *Badges:*  ${badges.join('  ')}\n\n` : '') +
      `_\`${prefix}rank\` · \`${prefix}quests\` · \`${prefix}inventory\`_`;

    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
