/**
 * Plugin: quests
 * Category: rpg
 *
 * View and claim daily quests. Quests reset every 24 hours at midnight.
 * Progress is tracked automatically as you fish, hunt, mine, farm, and battle.
 *
 * Usage:
 *   .quests          — view today's quests and progress
 *   .quest           — alias
 *   .quests claim    — claim all completed quests
 */

import { loadDB, addXP, addCoins, initUserDB }  from '../../lib/database.js';
import { getQuestState, setQuestState, updateStat } from '../../lib/games-db.js';
import { DAILY_QUESTS, getDailyQuestDisplay }   from '../../lib/rpg.js';

function progressBar(cur, target, width = 8) {
  const fill  = Math.round(Math.min(cur / target, 1) * width);
  return `[${'█'.repeat(fill)}${'░'.repeat(width - fill)}]`;
}

export default {
  name:        'quests',
  aliases:     ['quest', 'dailyquest', 'dq', 'missions'],
  category:    'rpg',
  description: 'View and claim daily quests — reset every 24 hours',
  usage:       '.quests  |  .quests claim',

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';
    const sub    = args[0]?.toLowerCase();

    const questState = getQuestState(sender);
    const display    = getDailyQuestDisplay(questState);

    // ── Claim ─────────────────────────────────────────────────────────────────
    if (sub === 'claim') {
      const claimable = display.filter(q => q.done && !q.claimed);
      if (!claimable.length) {
        await reply(
          `📋 *No quests to claim!*\n\n` +
          (display.some(q => q.done) ? `All completed quests already claimed.` : `Complete quests first:`) +
          `\n\n` + display.filter(q => !q.done).map(q =>
            `  ${q.label}  (${q.progress}/${q.target})`).join('\n'),
        );
        return;
      }

      initUserDB(sender);
      let totalCoins = 0;
      let totalXp    = 0;
      const earned   = [];

      for (const q of claimable) {
        totalCoins += q.reward.coins;
        totalXp    += q.reward.xp;
        earned.push(`${q.label}  (+${q.reward.coins}🪙 +${q.reward.xp}✨)`);
        questState.claimed.push(q.id);
      }

      setQuestState(sender, questState);
      addCoins(sender, totalCoins);
      const { leveled, newLevel } = addXP(sender, totalXp, settings?.pushName);
      updateStat(sender, 'questsDone', claimable.length);

      const db      = loadDB();
      let text =
        `🎯 *Quests Claimed!*\n${'─'.repeat(22)}\n\n` +
        earned.join('\n') +
        `\n\n💰 Total: *+${totalCoins} coins*\n` +
        `✨ XP:    *+${totalXp}*\n` +
        `💳 Balance: *${db.users[sender]?.money ?? 0} coins*`;

      if (leveled) text += `\n\n🎉 *Level Up!* You reached *Level ${newLevel}*!`;
      await sock.sendMessage(jid, { text }, { quoted: msg });
      return;
    }

    // ── View quests ───────────────────────────────────────────────────────────
    const today = new Date().toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    let text = `🎯 *Daily Quests*  _${today}_\n${'─'.repeat(22)}\n\n`;

    for (const q of display) {
      const bar    = progressBar(q.progress, q.target);
      const status = q.claimed ? '✅ Claimed' : q.done ? '🟢 Done — claim!' : `${q.progress}/${q.target}`;
      text +=
        `${q.claimed ? '✅' : q.done ? '🟡' : '⬜'} ${q.label}\n` +
        `   ${bar} ${status}\n` +
        `   _Reward: ${q.reward.coins}🪙 + ${q.reward.xp}✨_\n\n`;
    }

    const allDone     = display.every(q => q.done);
    const anyClaimed  = display.some(q => q.claimed);
    const claimable   = display.filter(q => q.done && !q.claimed).length;

    if (claimable) {
      text += `_${claimable} quest${claimable > 1 ? 's' : ''} ready to claim! Use \`${prefix}quests claim\`_`;
    } else if (allDone && anyClaimed) {
      text += `🎊 All quests done for today! Come back tomorrow.`;
    } else {
      text += `_Quests reset daily at midnight._`;
    }

    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
