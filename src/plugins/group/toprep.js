/**
 * Plugin: toprep
 * Category: group
 *
 * Reputation leaderboard for the current group.
 *
 * Usage:
 *   .toprep     — top 10 by reputation
 *   .repboard   — alias
 */

import { getRepLeaderboard }                         from '../../lib/group-db.js';
import { repLeaderCard }                             from '../../lib/group-cards.js';
import { sendInteractive, selectButton }             from '../../lib/interactive.js';

const MEDALS = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

export default {
  name:        'toprep',
  aliases:     ['repboard', 'repleader', 'reprank', 'topreputation'],
  category:    'group',
  description: 'Reputation leaderboard — top members by rep points',
  usage:       '.toprep',
  permissions: ['group'],

  async execute({ sock, msg, reply, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    let meta;
    try { meta = await sock.groupMetadata(jid); } catch { meta = { subject: 'Group' }; }

    const top  = getRepLeaderboard(jid, 10);
    const card = repLeaderCard(meta.subject ?? 'Group', top);

    if (!top.length) {
      await reply(card);
      return;
    }

    const rows = top.map((m, i) => ({
      title:       `${MEDALS[i] ?? `${i + 1}.`} @${m.jid.split('@')[0]}`,
      description: `⭐ ${m.rep} rep  ·  💬 ${m.msgCount} msgs`,
      rowId:       `${prefix}activity ${m.jid.split('@')[0]}`,
    }));

    await sendInteractive(sock, jid, msg, {
      body:    card,
      footer:  settings?.botName ?? 'Yuzuki MD',
      buttons: [selectButton('👤 View Member', rows, 'Reputation Board')],
    }, card);
  },
};
