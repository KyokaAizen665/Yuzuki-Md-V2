/**
 * Plugin: mining
 * Category: games
 *
 * Mine for ores and gems ranging from common stone to mythic crystals.
 * Better luck at deeper sessions (no gear needed — just cooldown).
 *
 * Usage:
 *   .mine   — start mining
 *
 * Cooldown: 3 minutes
 * XP reward: 10–60 XP
 */

import { loadDB, addXP, initUserDB }            from '../../lib/database.js';
import {
  getCooldownRemaining, refreshCooldown,
  updateStat, updateQuestProgress, fmtCooldown, addItem, getGU,
} from '../../lib/games-db.js';
import { rollLoot, getItem, formatItem, rarityIcon, rarityLabel } from '../../lib/items.js';
import { checkAchievements }                    from '../../lib/rpg.js';

const COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes

const XP_BY_RARITY = { junk: 5, common: 10, uncommon: 20, rare: 35, epic: 55, legendary: 90, mythic: 150 };

const MINE_INTROS = [
  'You descend into the cave…',
  'You swing your pickaxe into the rock face…',
  'You dig deep into the mine shaft…',
  'You chip away at the stone wall…',
  'You follow a vein of ore underground…',
];

export default {
  name:        'mining',
  aliases:     ['mine', 'dig', 'pickaxe'],
  category:    'games',
  description: 'Mine for ores and gems — from coal to mythic crystals',
  usage:       '.mine',

  async execute({ sock, msg, reply, sender, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';

    const remaining = getCooldownRemaining(sender, 'mine', COOLDOWN_MS);
    if (remaining > 0) {
      await reply(`⛏️ The mine needs time to reset! *${fmtCooldown(remaining)}* remaining.`);
      return;
    }

    await sock.sendMessage(jid, { react: { text: '⛏️', key: msg.key } }).catch(() => {});

    const drop  = rollLoot('mining');
    const item  = getItem(drop.id);
    const rIcon = rarityIcon(item.rarity);
    const rLbl  = rarityLabel(item.rarity);
    const xp    = XP_BY_RARITY[item.rarity] ?? 10;
    const intro = MINE_INTROS[Math.floor(Math.random() * MINE_INTROS.length)];

    refreshCooldown(sender, 'mine');
    addItem(sender, drop.id, drop.qty);
    updateStat(sender, 'mineCount', 1);
    updateQuestProgress(sender, 'mineCount', 1);

    initUserDB(sender);
    const { leveled, newLevel } = addXP(sender, xp, settings?.pushName);

    const db     = loadDB();
    const dbu    = db.users[sender];
    const gu     = getGU(sender);
    const newAch = checkAchievements(sender, dbu, gu);

    const isRare   = ['rare', 'epic', 'legendary', 'mythic'].includes(item.rarity);
    const headline = isRare ? `🎊 *Jackpot! Rare find!*` : `⛏️ *You went mining…*`;

    let text =
      `${headline}\n_${intro}_\n\n` +
      `${rIcon} ${item.emoji}  *${item.name}*  _(${rLbl})_\n` +
      `💰 Value: *${item.value} coins* each\n` +
      `✨ XP gained: *+${xp}*\n\n` +
      `📦 Added: ${formatItem(drop.id, drop.qty)}\n` +
      `_Use \`${prefix}inventory\` · \`${prefix}shop sell ${drop.id}\` to sell_`;

    if (leveled)  text += `\n\n🎉 *Level Up!* You reached *Level ${newLevel}*!`;
    if (newAch.length) {
      text += `\n\n🏆 *Achievement${newAch.length > 1 ? 's' : ''} unlocked:*\n` +
              newAch.map(a => `${a.emoji} ${a.name} (+${a.reward} 🪙)`).join('\n');
    }

    await sock.sendMessage(jid, { text }, { quoted: msg });
    await sock.sendMessage(jid, { react: { text: item.emoji, key: msg.key } }).catch(() => {});
  },
};
