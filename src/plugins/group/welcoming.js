/**
 * Plugin: welcoming
 * Category: group
 *
 * Welcome analytics — join/leave history, retention rates, and member flow.
 *
 * Usage:
 *   .welcoming    — welcome and retention analytics
 *   .joinleave    — alias
 */

import { getGroupStats }                         from '../../lib/group-db.js';
import { welcomeCard }                           from '../../lib/group-cards.js';
import { sendInteractive, copyButton }           from '../../lib/interactive.js';

export default {
  name:        'welcoming',
  aliases:     ['joinleave', 'retention', 'memberstats', 'welcomestats'],
  category:    'group',
  description: 'Join/leave analytics, member retention rate, and recent member flow',
  usage:       '.welcoming',
  permissions: ['group'],

  async execute({ sock, msg, reply, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    let meta;
    try { meta = await sock.groupMetadata(jid); } catch { meta = { subject: 'Group' }; }

    const stats = getGroupStats(jid);
    const card  = welcomeCard(meta.subject ?? 'Group', stats);

    await sendInteractive(sock, jid, msg, {
      body:    card,
      footer:  settings?.botName ?? 'Yuzuki MD',
      buttons: [
        copyButton('📋 Copy Report', card),
      ],
    }, card);
  },
};
