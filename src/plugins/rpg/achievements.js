/**
 * Plugin: achievements
 * Category: rpg
 *
 * View all achievements — unlocked and locked.
 * Shows progress toward locked achievements and coin rewards for each.
 *
 * Usage:
 *   .achievements        — view all achievements
 *   .ach                 — alias
 *   .achievements locked — show only locked ones
 *   .achievements done   — show only unlocked ones
 */

import { getAchievements, getGU }   from '../../lib/games-db.js';
import { loadDB }                   from '../../lib/database.js';
import { ACHIEVEMENTS }             from '../../lib/rpg.js';

export default {
  name:        'achievements',
  aliases:     ['ach', 'achievement', 'trophies', 'medals'],
  category:    'rpg',
  description: 'View all achievements — unlocked, locked, and their rewards',
  usage:       '.achievements [locked|done]',

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid    = msg.key.remoteJid;
    const filter = args[0]?.toLowerCase();

    const unlocked = new Set(getAchievements(sender));
    const all      = Object.values(ACHIEVEMENTS);

    const show = all.filter(a => {
      if (filter === 'locked') return !unlocked.has(a.id);
      if (filter === 'done')   return  unlocked.has(a.id);
      return true;
    });

    const doneCount   = [...unlocked].filter(id => ACHIEVEMENTS[id]).length;
    const totalCount  = all.length;
    const totalReward = [...unlocked]
      .map(id => ACHIEVEMENTS[id]?.reward ?? 0)
      .reduce((a, b) => a + b, 0);

    let text =
      `🏆 *Achievements* (${doneCount}/${totalCount})\n${'─'.repeat(22)}\n` +
      `_Total rewards earned: ${totalReward}🪙_\n\n`;

    for (const a of show) {
      const done = unlocked.has(a.id);
      text += `${done ? '✅' : '🔒'} ${a.emoji} *${a.name}*\n`;
      text += `   _${a.desc}_  ·  +${a.reward}🪙\n\n`;
    }

    if (!show.length) {
      text += `_No achievements to show for this filter._`;
    } else {
      text += `${'─'.repeat(22)}\n_${totalCount - doneCount} remaining to unlock_`;
    }

    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
