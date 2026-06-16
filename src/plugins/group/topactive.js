/**
 * Plugin: topactive
 * Category: group
 *
 * Top active members ranked by activity score (messages + media + rep).
 * NativeFlow list allows viewing each member's profile.
 *
 * Usage:
 *   .topactive       — top 10 by activity score
 *   .top             — alias
 *
 * VRS: heroType 'leaderboard' — achievement/stars imagery
 */

import { getActivityLeaderboard }                       from '../../lib/group-db.js';
import { computeActivityScore, getActivityLevel, msAgo } from '../../lib/group-analytics.js';
import { sendHeroCard }                                  from '../../lib/visual-response.js';
import { selectButton }                                  from '../../message-engine/index.js';

const MEDALS = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

export default {
  name:        'topactive',
  aliases:     ['top', 'topmembers', 'activemembers', 'mostactive'],
  category:    'group',
  description: 'Top active members ranked by activity score',
  usage:       '.topactive',
  permissions: ['group'],

  async execute({ sock, msg, reply, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    const top = getActivityLeaderboard(jid, 10);
    if (!top.length) {
      await reply(`📊 *No Activity Data Yet*\n\nMessages are tracked automatically. Start chatting to build the activity board!`);
      return;
    }

    let meta;
    try { meta = await sock.groupMetadata(jid); } catch { meta = { subject: 'Group' }; }

    const ranked = top
      .map(m => ({ ...m, score: computeActivityScore(m), level: getActivityLevel(computeActivityScore(m)) }))
      .sort((a, b) => b.score - a.score);

    const bodyLines = [`🏆 *Top Active Members*\n_${meta.subject ?? 'Group'}_\n${'─'.repeat(22)}\n`];
    ranked.forEach((m, i) => {
      bodyLines.push(
        `${MEDALS[i] ?? `${i + 1}.`}  ${m.level.icon} @${m.jid.split('@')[0]}\n` +
        `   💬 ${m.msgCount} msgs  ·  ⭐ ${m.rep ?? 0} rep  ·  ${msAgo(m.lastSeen ?? 0)}`,
      );
    });

    const body = bodyLines.join('\n');
    const rows = ranked.map((m, i) => ({
      title:       `${MEDALS[i] ?? `${i + 1}.`} @${m.jid.split('@')[0]}`,
      description: `${m.msgCount} msgs · ⭐${m.rep ?? 0} rep · ${m.level.label}`,
      rowId:       `${prefix}activity @${m.jid.split('@')[0]}`,
    }));

    await sendHeroCard(sock, jid, msg, {
      body,
      footer:    settings?.botName ?? 'Yuzuki MD',
      heroType:  'leaderboard',
      settings,
      forceHero: true,
      buttons:   [selectButton('👤 View Member', rows, 'Top Members')],
      fallback:  body,
    });
  },
};
