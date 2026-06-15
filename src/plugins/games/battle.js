/**
 * Plugin: battle
 * Category: games
 *
 * Challenge another user to a PvP battle. Combat auto-resolves
 * using level-weighted dice rolls. Winner earns coins and XP,
 * loser loses a small % of wallet.
 *
 * Usage:
 *   .battle @user     — challenge a user to a battle
 *   .pvp @user        — alias
 *
 * Cooldown: 30 minutes
 * Win reward: 100 + loser_level × 10 coins + 75 XP
 * Loss penalty: 5% of wallet (capped at 200 coins)
 */

import { loadDB, addXP, addCoins, spendCoins, initUserDB } from '../../lib/database.js';
import {
  getCooldownRemaining, refreshCooldown,
  updateStat, updateQuestProgress, fmtCooldown, getGU,
} from '../../lib/games-db.js';
import { checkAchievements }            from '../../lib/rpg.js';

const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ROUNDS  = 20;

function simBattle(aLvl, bLvl) {
  let aHp = 50 + aLvl * 5;
  let bHp = 50 + bLvl * 5;
  const log = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const aDmg = Math.floor(Math.random() * 10) + 5 + Math.floor(aLvl / 2);
    bHp -= aDmg;
    if (bHp <= 0) { log.push(`⚔️ R${round + 1}: You deal *${aDmg}* dmg — Enemy defeated!`); return { winner: 'a', log }; }

    const bDmg = Math.floor(Math.random() * 10) + 5 + Math.floor(bLvl / 2);
    aHp -= bDmg;
    if (round < 3) log.push(`⚔️ R${round + 1}: You hit *${aDmg}* · Enemy hits *${bDmg}* | HP: ${Math.max(0, aHp)} vs ${Math.max(0, bHp)}`);
    if (aHp <= 0) { log.push(`💀 R${round + 1}: Enemy deals *${bDmg}* dmg — You are defeated!`); return { winner: 'b', log }; }
  }
  return { winner: 'draw', log };
}

export default {
  name:        'battle',
  aliases:     ['pvp', 'fight', 'duel', 'challenge'],
  category:    'games',
  description: 'Challenge another user to a PvP battle — winner earns coins and XP',
  usage:       '.battle @user',

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';

    // Get target JID from mention
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    const targetJid = mentioned[0];

    if (!targetJid) {
      await reply(
        `⚔️ *Battle*\n\nUsage: \`${prefix}battle @user\`\n` +
        `Mention the person you want to challenge.\n\n` +
        `_Cooldown: 30 minutes per battle._`,
      );
      return;
    }

    if (targetJid === sender) {
      await reply(`❌ You can't battle yourself! Challenge another user.`);
      return;
    }

    // Cooldown check
    const remaining = getCooldownRemaining(sender, 'battle', COOLDOWN_MS);
    if (remaining > 0) {
      await reply(`⚔️ You're still recovering from your last battle! Wait *${fmtCooldown(remaining)}*.`);
      return;
    }

    await sock.sendMessage(jid, { react: { text: '⚔️', key: msg.key } }).catch(() => {});

    const db   = loadDB();
    initUserDB(sender);
    initUserDB(targetJid);

    const aUser = db.users[sender]    ?? { level: 0, money: 0, name: 'Challenger' };
    const bUser = db.users[targetJid] ?? { level: 0, money: 0, name: 'Opponent'   };

    const aLvl = aUser.level ?? 0;
    const bLvl = bUser.level ?? 0;

    const { winner, log } = simBattle(aLvl, bLvl);

    refreshCooldown(sender, 'battle');

    let text = `⚔️ *Battle: ${aUser.name ?? 'You'} vs ${bUser.name ?? 'Opponent'}*\n${'─'.repeat(22)}\n\n`;
    text    += `🧍 You — Lv.${aLvl} · HP: ${50 + aLvl * 5}\n`;
    text    += `👥 Them — Lv.${bLvl} · HP: ${50 + bLvl * 5}\n\n`;
    text    += log.join('\n') + '\n\n';

    if (winner === 'draw') {
      text += `🤝 *Draw!* Both fighters are evenly matched. No coins exchanged.\n✨ XP gained: *+20*`;
      addXP(sender, 20, settings?.pushName);
    } else if (winner === 'a') {
      const prize   = 100 + bLvl * 10;
      const penalty = Math.min(200, Math.floor((bUser.money ?? 0) * 0.05));
      addCoins(sender, prize);
      if (penalty > 0) spendCoins(targetJid, penalty);
      const { leveled, newLevel } = addXP(sender, 75, settings?.pushName);
      addXP(targetJid, 15);
      updateStat(sender, 'battlesWon', 1);
      updateStat(targetJid, 'battlesLost', 1);
      updateQuestProgress(sender, 'battlesWon', 1);

      text +=
        `🎉 *Victory!*\n` +
        `💰 You earned: *+${prize} coins*\n` +
        `✨ XP gained: *+75*`;
      if (leveled) text += `\n🎉 *Level Up!* You reached *Level ${newLevel}*!`;

      // Achievements
      const freshDB = loadDB();
      const gu = getGU(sender);
      const newAch = checkAchievements(sender, freshDB.users[sender], gu);
      if (newAch.length) {
        text += `\n\n🏆 *Achievement${newAch.length > 1 ? 's' : ''} unlocked:*\n` +
                newAch.map(a => `${a.emoji} ${a.name} (+${a.reward} 🪙)`).join('\n');
      }
    } else {
      const penalty = Math.min(200, Math.floor((aUser.money ?? 0) * 0.05));
      if (penalty > 0) spendCoins(sender, penalty);
      addXP(targetJid, 75);
      addXP(sender, 15, settings?.pushName);
      updateStat(sender, 'battlesLost', 1);
      updateStat(targetJid, 'battlesWon', 1);
      updateQuestProgress(targetJid, 'battlesWon', 1);

      text +=
        `💀 *Defeat!*\n` +
        `💸 You lost: *${penalty} coins*\n` +
        `✨ XP gained: *+15* _(consolation)_\n` +
        `_Come back stronger! Cooldown: 30 min_`;
    }

    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
