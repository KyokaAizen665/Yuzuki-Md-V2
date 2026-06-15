/**
 * Plugin: leaderboard
 * Category: rpg
 *
 * Show the top players ranked by level (default), coins, or total earned.
 * Uses the existing getLeaderboard() from database.js.
 *
 * Usage:
 *   .leaderboard          — top 10 by level (registered users)
 *   .lb                   — alias
 *   .leaderboard coins    — top 10 by wallet
 *   .leaderboard fish     — top 10 by fish caught
 *   .leaderboard hunters  — top 10 by hunt count
 *   .leaderboard miners   — top 10 by mine count
 */

import { getLeaderboard, getRankPosition, loadDB } from '../../lib/database.js';
import { getGU }                                   from '../../lib/games-db.js';
import { getRankInfo }                             from '../../lib/rpg.js';

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export default {
  name:        'leaderboard',
  aliases:     ['lb', 'top', 'topplayers', 'ranking', 'highscores'],
  category:    'rpg',
  description: 'Top 10 players by level, coins, or game stats',
  usage:       '.leaderboard [coins|fish|hunt|mine]',

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';
    const mode   = args[0]?.toLowerCase() ?? 'level';

    // ── Game-stat leaderboards ─────────────────────────────────────────────────
    if (['fish', 'fishing', 'hunt', 'hunters', 'hunting', 'mine', 'miners', 'mining'].includes(mode)) {
      const statMap = {
        fish: 'fishCount', fishing: 'fishCount',
        hunt: 'huntCount', hunters: 'huntCount', hunting: 'huntCount',
        mine: 'mineCount', miners: 'mineCount', mining: 'mineCount',
      };
      const statKey  = statMap[mode];
      const modeLabel = { fish: '🎣 Fishing', hunt: '🏹 Hunting', mine: '⛏️ Mining' };
      const label    = modeLabel[Object.keys(modeLabel).find(k => mode.startsWith(k))] ?? mode;

      const db = loadDB();
      const entries = Object.entries(db.users)
        .filter(([, u]) => typeof u === 'object')
        .map(([jid, u]) => {
          const gu = getGU(jid);
          return { jid, name: u.name ?? 'User', stat: gu.stats?.[statKey] ?? 0 };
        })
        .filter(e => e.stat > 0)
        .sort((a, b) => b.stat - a.stat)
        .slice(0, 10);

      if (!entries.length) {
        await reply(`📊 No data yet for *${label}* leaderboard. Be the first!\n\`${prefix}${Object.keys(statMap).find(k => statMap[k] === statKey)}\``);
        return;
      }

      let text = `${label} *Leaderboard*\n${'─'.repeat(22)}\n\n`;
      entries.forEach((e, i) => {
        text += `${MEDALS[i] ?? `${i + 1}.`}  *${e.name}*  —  ${e.stat}\n`;
      });

      await sock.sendMessage(jid, { text }, { quoted: msg });
      return;
    }

    // ── Coins leaderboard ──────────────────────────────────────────────────────
    if (mode === 'coins' || mode === 'rich' || mode === 'wealth') {
      const db = loadDB();
      const entries = Object.values(db.users)
        .filter(u => typeof u === 'object')
        .sort((a, b) => (b.money ?? 0) - (a.money ?? 0))
        .slice(0, 10);

      if (!entries.length) { await reply(`💰 No coin data yet.`); return; }

      let text = `💰 *Richest Players*\n${'─'.repeat(22)}\n\n`;
      entries.forEach((u, i) => {
        const rank = getRankInfo(u.level ?? 0);
        text += `${MEDALS[i] ?? `${i + 1}.`}  ${rank.icon} *${u.name ?? 'User'}*  —  ${u.money ?? 0}🪙\n`;
      });

      await sock.sendMessage(jid, { text }, { quoted: msg });
      return;
    }

    // ── Level leaderboard (default) ────────────────────────────────────────────
    const top    = getLeaderboard(10);
    const myPos  = getRankPosition(sender);

    if (!top.length) {
      await reply(
        `🏆 *Leaderboard*\n\nNo registered players yet!\n` +
        `_Register using \`${prefix}register\` to appear on the leaderboard._`,
      );
      return;
    }

    let text = `🏆 *Top Players by Level*\n${'─'.repeat(22)}\n\n`;
    top.forEach((u, i) => {
      const rank = getRankInfo(u.level ?? 0);
      const prem = u.premium ? ' ⭐' : '';
      text += `${MEDALS[i] ?? `${i + 1}.`}  ${rank.icon} *${u.name ?? 'User'}*${prem}  —  Lv.${u.level ?? 0}\n`;
    });

    if (myPos && !top.find(u => u.jid === sender)) {
      text += `\n${'─'.repeat(22)}\n_Your position: *#${myPos}*_`;
    }

    text +=
      `\n\n_Other boards:_\n` +
      `\`${prefix}leaderboard coins\`  ·  \`${prefix}leaderboard fish\`\n` +
      `\`${prefix}leaderboard hunt\`   ·  \`${prefix}leaderboard mine\``;

    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
