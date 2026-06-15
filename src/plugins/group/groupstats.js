/**
 * Plugin: groupstats
 * Category: group
 *
 * Comprehensive group statistics card with NativeFlow navigation.
 *
 * Usage:
 *   .groupstats    — full stats overview
 *   .gstats        — alias
 */

import { getGroupStats }                                     from '../../lib/group-db.js';
import { statsCard }                                         from '../../lib/group-cards.js';
import { sendInteractive, selectButton, copyButton }         from '../../lib/interactive.js';

export default {
  name:        'groupstats',
  aliases:     ['gstats', 'groupinfo', 'gcstats'],
  category:    'group',
  description: 'Full group statistics — messages, members, activity, and join/leave data',
  usage:       '.groupstats',
  permissions: ['group'],

  async execute({ sock, msg, reply, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    let meta;
    try { meta = await sock.groupMetadata(jid); }
    catch { await reply('❌ Could not fetch group information.'); return; }

    const stats       = getGroupStats(jid);
    const memberCount = meta.participants?.length ?? 0;
    const groupName   = meta.subject ?? 'Group';

    const card = statsCard(groupName, memberCount, stats);

    await sendInteractive(sock, jid, msg, {
      body:    card,
      footer:  settings?.botName ?? 'Yuzuki MD',
      buttons: [
        copyButton('📋 Copy Stats', card),
        selectButton('📊 Explore More', [
          { title: '🏆 Activity Board',  rowId: `${prefix}activity`,   description: 'Top active members' },
          { title: '⭐ Rep Board',        rowId: `${prefix}toprep`,     description: 'Reputation leaderboard' },
          { title: '💡 Insights',         rowId: `${prefix}insights`,   description: 'Group health dashboard' },
          { title: '📈 Engagement',       rowId: `${prefix}engagement`, description: 'Message metrics' },
          { title: '👋 Welcome Stats',    rowId: `${prefix}welcoming`,  description: 'Join and leave data' },
        ], 'Analytics'),
      ],
    }, card);
  },
};
