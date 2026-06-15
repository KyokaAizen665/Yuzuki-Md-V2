/**
 * Plugin: balance
 * Category: economy
 *
 * Check your coin wallet and bank balance, plus a snapshot of
 * inventory sell value and game stats.
 *
 * Usage:
 *   .balance         — your balance
 *   .bal             — alias
 *   .balance @user   — view another user's balance
 *   .wallet          — alias
 */

import { loadDB, initUserDB }         from '../../lib/database.js';
import { getInventory, getGU }        from '../../lib/games-db.js';
import { ITEMS, sellPrice }           from '../../lib/items.js';
import { getRankInfo }                from '../../lib/rpg.js';

function totalSellValue(inv) {
  return Object.entries(inv).reduce((s, [id, qty]) => s + sellPrice(id) * qty, 0);
}

export default {
  name:        'balance',
  aliases:     ['bal', 'wallet', 'coins', 'money', 'bank'],
  category:    'economy',
  description: 'View your coin balance, bank, inventory value, and game stats',
  usage:       '.balance [@user]',

  async execute({ sock, msg, reply, sender, args, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';

    // Optional: view another user's balance
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    const targetJid = mentioned[0] ?? sender;
    const isSelf    = targetJid === sender;

    initUserDB(targetJid);
    const db  = loadDB();
    const dbu = db.users[targetJid];

    if (!dbu) {
      await reply(`❌ Could not find that user.`);
      return;
    }

    const coins  = dbu.money  ?? 0;
    const bank   = dbu.bank   ?? 0;
    const level  = dbu.level  ?? 0;
    const exp    = dbu.exp    ?? 0;
    const rank   = getRankInfo(level);
    const name   = dbu.name   ?? 'User';
    const prem   = dbu.premium ? ' _(Premium)_' : '';

    const inv     = getInventory(targetJid);
    const invVal  = totalSellValue(inv);
    const invCnt  = Object.values(inv).filter(q => q > 0).length;

    const gu     = getGU(targetJid);
    const stats  = gu.stats ?? {};
    const streak = gu.dailyStreak ?? 0;

    const text =
      `💰 *${isSelf ? 'Your' : `${name}'s`} Balance*\n${'─'.repeat(22)}\n\n` +
      `${rank.icon} *${rank.name}*  —  Level *${level}*${prem}\n\n` +
      `💵 Wallet:     *${coins} coins*\n` +
      `🏦 Bank:       *${bank} coins*\n` +
      `💎 Net worth:  *${coins + bank + invVal} coins*\n\n` +
      `📦 Inventory:  *${invCnt} item type${invCnt !== 1 ? 's' : ''}*  _(sell: ${invVal}🪙)_\n\n` +
      `📊 *Stats*\n` +
      `  🎣 Fish caught:   ${stats.fishCount    ?? 0}\n` +
      `  🏹 Hunts:         ${stats.huntCount    ?? 0}\n` +
      `  ⛏️  Mines:         ${stats.mineCount    ?? 0}\n` +
      `  🌾 Harvests:      ${stats.harvestCount ?? 0}\n` +
      `  ⚔️  Battles won:   ${stats.battlesWon  ?? 0}\n` +
      `  📅 Daily streak:  🔥 ${streak} day${streak !== 1 ? 's' : ''}\n\n` +
      `_Use \`${prefix}inventory\` to view items · \`${prefix}shop sell all\` to cash out_`;

    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
