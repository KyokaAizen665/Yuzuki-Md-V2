/**
 * Plugin: unwarn
 * Category: group
 *
 * Remove warnings from a group member (admin only).
 *
 * Usage:
 *   .unwarn @user        — remove ALL warnings
 *   .unwarn @user 2      — remove warning #2
 *   .clearwarns @user    — alias
 */

import { removeWarn, getWarns, isGroupAdmin } from '../../lib/group-db.js';

export default {
  name:        'unwarn',
  aliases:     ['clearwarns', 'removewarn', 'resetwarn', 'warnremove'],
  category:    'group',
  description: 'Remove one or all warnings from a member (admin only)',
  usage:       '.unwarn @user [warn#]',
  permissions: ['admin', 'group'],

  async execute({ sock, msg, reply, args, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    const adminOk = await isGroupAdmin(sock, jid, sender);
    if (!adminOk) { await reply('❌ Only group admins can remove warnings.'); return; }

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    const targetJid = mentioned[0];
    if (!targetJid) {
      await reply(`❌ Usage: \`${prefix}unwarn @user [warn#]\``);
      return;
    }

    const idxArg  = args.find(a => /^\d+$/.test(a));
    const idx     = idxArg ? parseInt(idxArg) - 1 : null;
    const phone   = targetJid.split('@')[0];
    const before  = getWarns(jid, targetJid).length;

    if (!before) {
      await reply(`✅ @${phone} has no warnings to remove.`);
      return;
    }

    const remaining = removeWarn(jid, targetJid, idx);

    const removed = before - remaining;
    await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    await sock.sendMessage(jid, {
      text:
        `✅ *Warning${removed > 1 ? 's' : ''} Removed*\n\n` +
        `@${phone}: removed *${removed}* warning${removed > 1 ? 's' : ''}\n` +
        `Remaining: *${remaining}*`,
      mentions: [targetJid],
    }, { quoted: msg });
  },
};
