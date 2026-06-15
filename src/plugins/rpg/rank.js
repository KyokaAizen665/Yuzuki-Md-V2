/**
 * Plugin: rank
 * Category: rpg
 *
 * View your current rank, level, XP progress, and rank breakdown.
 * Shows XP needed for next level and all rank tiers.
 *
 * Usage:
 *   .rank         — your rank and XP
 *   .level        — alias
 *   .rank @user   — view another user's rank
 *   .ranks        — show all rank tiers
 */

import { loadDB, initUserDB }    from '../../lib/database.js';
import { getRankInfo, RANKS, xpToNext, xpBar } from '../../lib/rpg.js';

export default {
  name:        'rank',
  aliases:     ['level', 'lvl', 'xp', 'progress', 'ranks'],
  category:    'rpg',
  description: 'View rank, level, XP progress and rank tier list',
  usage:       '.rank [@user]  |  .ranks',

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';

    // Show all rank tiers
    const rawCmd = (msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? '')
      .trim().replace(/^\./, '').split(' ')[0].toLowerCase();
    if (rawCmd === 'ranks') {
      const lines = RANKS.map(r =>
        `${r.icon} *${r.name}*  —  Lv.${r.min}${r.max < Infinity ? `–${r.max}` : '+'}`,
      ).join('\n');
      await reply(`🏅 *Rank Tiers*\n${'─'.repeat(22)}\n\n${lines}`);
      return;
    }

    // Target user
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    const targetJid = mentioned[0] ?? sender;
    const isSelf    = targetJid === sender;

    initUserDB(targetJid);
    const db  = loadDB();
    const dbu = db.users[targetJid];
    if (!dbu) { await reply(`❌ User not found.`); return; }

    const level  = dbu.level ?? 0;
    const exp    = dbu.exp   ?? 0;
    const name   = dbu.name  ?? 'User';
    const rank   = getRankInfo(level);
    const need   = xpToNext(level);
    const bar    = xpBar(exp, level, 12);

    // Next rank
    const nextRank = RANKS.find(r => r.min > level);

    let text =
      `${rank.icon} *${isSelf ? 'Your' : `${name}'s`} Rank*\n${'─'.repeat(22)}\n\n` +
      `🏅 Rank:     *${rank.name}* ${rank.icon}\n` +
      `⭐ Level:    *${level}*\n` +
      `✨ XP:      ${bar}\n`;

    if (nextRank) {
      const levelsToNext = nextRank.min - level;
      text += `\n📈 *${levelsToNext} level${levelsToNext > 1 ? 's' : ''} until ${nextRank.icon} ${nextRank.name}*\n`;
    } else {
      text += `\n👑 *Maximum rank achieved!*\n`;
    }

    const badges = dbu.badges ?? [];
    if (badges.length) {
      text += `\n🏷️ *Badges:*  ${badges.join('  ')}\n`;
    }

    text +=
      `\n_Use \`${prefix}achievements\` to see all trophies_\n` +
      `_Use \`${prefix}leaderboard\` to see top players_`;

    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
