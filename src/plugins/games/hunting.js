/**
 * Plugin: hunting
 * Category: games
 *
 * Hunt in the wild for animals and pelts. Items vary by rarity,
 * from common feathers to mythic dragon scales.
 *
 * Usage:
 *   .hunt   — go on a hunt
 *
 * Cooldown: 2 minutes
 * XP reward: 15–40 XP per hunt
 */

import { loadDB, addXP, initUserDB }            from '../../lib/database.js';
import {
  getCooldownRemaining, refreshCooldown,
  updateStat, updateQuestProgress, fmtCooldown, addItem, getGU,
} from '../../lib/games-db.js';
import { rollLoot, getItem, formatItem, rarityIcon, rarityLabel } from '../../lib/items.js';
import { checkAchievements }                    from '../../lib/rpg.js';

const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

const XP_BY_RARITY = { junk: 8, common: 15, uncommon: 25, rare: 40, epic: 60, legendary: 100, mythic: 150 };

const HUNT_INTROS = [
  'You trek into the forest…',
  'You set up your trap…',
  'You track footprints through the undergrowth…',
  'You wait patiently in the brush…',
  'You follow the sound of rustling leaves…',
];

export default {
  name:        'hunting',
  aliases:     ['hunt', 'tracker', 'trap'],
  category:    'games',
  description: 'Hunt in the wild for animals and rare pelts',
  usage:       '.hunt',

  async execute({ sock, msg, reply, sender, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';

    const remaining = getCooldownRemaining(sender, 'hunt', COOLDOWN_MS);
    if (remaining > 0) {
      await reply(`🏹 You need to rest before hunting again! *${fmtCooldown(remaining)}* remaining.`);
      return;
    }

    await sock.sendMessage(jid, { react: { text: '🏹', key: msg.key } }).catch(() => {});

    const drop  = rollLoot('hunting');
    const item  = getItem(drop.id);
    const rIcon = rarityIcon(item.rarity);
    const rLbl  = rarityLabel(item.rarity);
    const xp    = XP_BY_RARITY[item.rarity] ?? 15;
    const intro = HUNT_INTROS[Math.floor(Math.random() * HUNT_INTROS.length)];

    refreshCooldown(sender, 'hunt');
    addItem(sender, drop.id, drop.qty);
    updateStat(sender, 'huntCount', 1);
    updateQuestProgress(sender, 'huntCount', 1);

    initUserDB(sender);
    const { leveled, newLevel } = addXP(sender, xp, settings?.pushName);

    const db     = loadDB();
    const dbu    = db.users[sender];
    const gu     = getGU(sender);
    const newAch = checkAchievements(sender, dbu, gu);

    const isRare    = ['rare', 'epic', 'legendary', 'mythic'].includes(item.rarity);
    const headline  = isRare ? `🎊 *Incredible find!*` : `🏹 *You went hunting…*`;

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
