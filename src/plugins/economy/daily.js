/**
 * Plugin: daily
 * Category: economy
 *
 * Claim daily coin and XP rewards. Consecutive daily claims build a streak
 * that increases the base reward. Streak resets if more than 48 hours pass
 * between claims.
 *
 * Usage:
 *   .daily     — claim daily reward
 *   .claim     — alias
 *
 * Rewards:
 *   Base:    200 coins + 100 XP
 *   Streak:  +15 coins per day streak (max +450 at 30 days)
 *   Premium: ×2 everything
 *
 * VRS: heroType 'economy' — golden/sunset imagery
 */

import { loadDB, addXP, addCoins, initUserDB }          from '../../lib/database.js';
import { getDailyData, setDailyData, updateStat, getGU } from '../../lib/games-db.js';
import { checkAchievements }                             from '../../lib/rpg.js';
import { sendHeroCard }                                  from '../../lib/visual-response.js';

const BASE_COINS   = 200;
const BASE_XP      = 100;
const STREAK_BONUS = 15;
const MAX_STREAK_BONUS = 450;
const RESET_MS     = 48 * 60 * 60 * 1000;
const CLAIM_DELAY  = 20 * 60 * 60 * 1000;

const STREAK_MESSAGES = [
  '',
  '🔥 1 day streak!',
  '🔥🔥 2 days in a row!',
  '🔥🔥🔥 3 day streak!',
  '⭐ 4 day streak!',
  '⭐⭐ 5 day streak!',
  '💫 6 days!',
  '👑 1 week streak! Amazing!',
];

function streakMsg(n) {
  return STREAK_MESSAGES[Math.min(n, STREAK_MESSAGES.length - 1)] || `🔥 ${n}-day streak! Incredible!`;
}

export default {
  name:        'daily',
  aliases:     ['claim', 'checkin', 'dailyreward'],
  category:    'economy',
  description: 'Claim your daily coins + XP — builds streak bonuses',
  usage:       '.daily',

  async execute({ sock, msg, reply, sender, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';

    initUserDB(sender);
    const db    = loadDB();
    const dbu   = db.users[sender] ?? {};
    const { lastDaily, dailyStreak } = getDailyData(sender);

    const now     = Date.now();
    const sinceMs = now - lastDaily;

    // Already claimed today?
    if (sinceMs < CLAIM_DELAY) {
      const waitMs = CLAIM_DELAY - sinceMs;
      const h = Math.floor(waitMs / 3600000);
      const m = Math.floor((waitMs % 3600000) / 60000);
      await reply(
        `📅 *Daily already claimed!*\n\n` +
        `Come back in *${h}h ${m}m* for your next reward.\n` +
        `_Streak: 🔥 ${dailyStreak} day${dailyStreak !== 1 ? 's' : ''}_`,
      );
      return;
    }

    const newStreak = sinceMs < RESET_MS && lastDaily > 0 ? dailyStreak + 1 : 1;

    const isPrem  = dbu.premium ?? false;
    const streakB = Math.min(newStreak * STREAK_BONUS, MAX_STREAK_BONUS);
    let coins     = BASE_COINS + streakB;
    let xp        = BASE_XP;
    if (isPrem) { coins *= 2; xp *= 2; }

    addCoins(sender, coins);
    const { leveled, newLevel } = addXP(sender, xp, settings?.pushName);
    setDailyData(sender, { lastDaily: now, dailyStreak: newStreak });
    updateStat(sender, 'dailysClaimed', 1);
    updateStat(sender, 'totalEarned', coins);

    const freshDB = loadDB();
    const gu      = getGU(sender);
    const newAch  = checkAchievements(sender, freshDB.users[sender], gu);

    const sm = streakMsg(newStreak);
    let body =
      `🎁 *Daily Reward Claimed!*\n${'─'.repeat(22)}\n\n` +
      (sm ? `${sm}\n\n` : '') +
      `💰 Coins:  *+${coins}*${isPrem ? '  _(Premium ×2)_' : ''}\n` +
      `✨ XP:     *+${xp}*${isPrem ? '  _(Premium ×2)_' : ''}\n\n` +
      `📊 _Streak: ${newStreak} day${newStreak !== 1 ? 's' : ''}_\n` +
      `_Streak bonus: +${streakB} coins/day_`;

    if (leveled)   body += `\n\n🎉 *Level Up!* You reached *Level ${newLevel}*!`;
    if (newAch.length) {
      body += `\n\n🏆 *Achievement${newAch.length > 1 ? 's' : ''} unlocked:*\n` +
              newAch.map(a => `${a.emoji} ${a.name} (+${a.reward} 🪙)`).join('\n');
    }

    await sock.sendMessage(jid, { react: { text: '🎁', key: msg.key } }).catch(() => {});
    await sendHeroCard(sock, jid, msg, {
      body,
      footer:    settings?.botName ?? 'Yuzuki MD',
      heroType:  'economy',
      settings,
      forceHero: true,
      fallback:  body,
    });
  },
};
