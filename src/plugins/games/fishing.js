/**
 * Plugin: fishing
 * Category: games
 *
 * Cast a fishing rod and reel in random catches — from common fish to
 * mythic pearls. Each catch is added to inventory and can be sold at the shop.
 *
 * Usage:
 *   .fish          — cast your rod
 *   .fishing       — alias
 *
 * Cooldown: 60 seconds
 * XP reward: 10–30 XP per catch
 * Coins: item sold at shop, or keep in inventory
 */

import { loadDB, addXP, addCoins, initUserDB }  from '../../lib/database.js';
import {
  getCooldownRemaining, refreshCooldown,
  updateStat, updateQuestProgress, fmtCooldown, addItem,
} from '../../lib/games-db.js';
import { rollLoot, getItem, formatItem, rarityIcon, rarityLabel } from '../../lib/items.js';
import { checkAchievements }            from '../../lib/rpg.js';

const COOLDOWN_MS = 60 * 1000; // 1 minute

const CATCH_XP = { junk: 5, common: 10, uncommon: 18, rare: 30, epic: 50, legendary: 80, mythic: 120 };

export default {
  name:        'fishing',
  aliases:     ['fish', 'castrod', 'angler'],
  category:    'games',
  description: 'Cast a fishing rod and catch fish — from common to mythic rarity',
  usage:       '.fish',

  async execute({ sock, msg, reply, sender, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';

    // Cooldown check
    const remaining = getCooldownRemaining(sender, 'fish', COOLDOWN_MS);
    if (remaining > 0) {
      await reply(`🎣 Your rod is still drying! Try again in *${fmtCooldown(remaining)}*`);
      return;
    }

    await sock.sendMessage(jid, { react: { text: '🎣', key: msg.key } }).catch(() => {});

    // Roll a catch
    const drop  = rollLoot('fishing');
    const item  = getItem(drop.id);
    const rIcon = rarityIcon(item.rarity);
    const rLbl  = rarityLabel(item.rarity);
    const xp    = CATCH_XP[item.rarity] ?? 10;

    // Update state
    refreshCooldown(sender, 'fish');
    addItem(sender, drop.id, drop.qty);
    updateStat(sender, 'fishCount', 1);
    updateQuestProgress(sender, 'fishCount', 1);

    // XP
    initUserDB(sender);
    const { leveled, newLevel } = addXP(sender, xp, settings?.pushName);

    // Achievement check
    const db   = loadDB();
    const dbu  = db.users[sender];
    const gUser = { stats: { fishCount: (dbu?.fishCount ?? 0) + 1 } };
    // (Full check done via games-db stat)
    const { getGU } = await import('../../lib/games-db.js');
    const gu   = getGU(sender);
    const newAch = checkAchievements(sender, dbu, gu);

    // Build response
    const isRare  = ['rare', 'epic', 'legendary', 'mythic'].includes(item.rarity);
    const headline = isRare
      ? `🎊 *Amazing catch!*`
      : `🎣 *You cast your rod...*`;

    let msg2 =
      `${headline}\n\n` +
      `${rIcon} ${item.emoji}  *${item.name}*  _(${rLbl})_\n` +
      `💰 Value: *${item.value} coins* each\n` +
      `✨ XP gained: *+${xp}*\n\n` +
      `📦 Added to inventory: ${formatItem(drop.id, drop.qty)}\n` +
      `_Use \`${prefix}inventory\` to view · \`${prefix}shop sell ${drop.id}\` to sell_`;

    if (leveled) {
      msg2 += `\n\n🎉 *Level Up!* You are now *Level ${newLevel}*!`;
    }
    if (newAch.length) {
      msg2 += `\n\n🏆 *Achievement${newAch.length > 1 ? 's' : ''} unlocked:*\n` +
              newAch.map(a => `${a.emoji} ${a.name} (+${a.reward} 🪙)`).join('\n');
    }

    await sock.sendMessage(jid, { text: msg2 }, { quoted: msg });
    await sock.sendMessage(jid, { react: { text: item.emoji, key: msg.key } }).catch(() => {});
  },
};
