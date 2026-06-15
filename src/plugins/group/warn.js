/**
 * Plugin: warn
 * Category: group
 *
 * Issue a formal warning to a group member (admin only).
 * Stores full warn history with reason, issuer, and timestamp.
 * Auto-kicks on threshold (default 3, configurable).
 *
 * Usage:
 *   .warn @user [reason]   — warn a member
 */

import { addWarn, isGroupAdmin, isBotGroupAdmin }  from '../../lib/group-db.js';
import { warningsCard }                            from '../../lib/group-cards.js';

export default {
  name:        'warn',
  aliases:     ['warning', 'strike'],
  category:    'group',
  description: 'Issue a warning to a member with history (auto-kicks at threshold)',
  usage:       '.warn @user [reason]',
  permissions: ['admin', 'group'],

  async execute({ sock, msg, reply, args, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    // Admin check
    const adminOk = await isGroupAdmin(sock, jid, sender);
    if (!adminOk) { await reply('❌ Only group admins can issue warnings.'); return; }

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    const targetJid = mentioned[0];
    if (!targetJid) {
      await reply(`⚠️ Usage: \`${prefix}warn @user [reason]\`\n_e.g. \`${prefix}warn @user Spamming links\`_`);
      return;
    }

    const reason = args.filter(a => !a.includes('@')).join(' ') || 'No reason given';
    const { warnCount, threshold } = addWarn(jid, targetJid, { reason, by: sender });

    const targetPhone = targetJid.split('@')[0];
    const card        = warningsCard(targetPhone, [{ reason, by: sender, at: Date.now() }].slice(0, 1), threshold);

    await sock.sendMessage(jid, { react: { text: '⚠️', key: msg.key } }).catch(() => {});

    if (warnCount >= threshold) {
      // Auto-kick
      const botOk = await isBotGroupAdmin(sock, jid);
      if (botOk) {
        try {
          await sock.groupParticipantsUpdate(jid, [targetJid], 'remove');
          await sock.sendMessage(jid, {
            text:
              `🚨 @${targetPhone} has been *kicked* after reaching *${threshold} warnings*.\n` +
              `Last warn reason: _${reason}_`,
            mentions: [targetJid],
          }, { quoted: msg });
          return;
        } catch {}
      }
      await sock.sendMessage(jid, {
        text:
          `⚠️ @${targetPhone} — Warning *${warnCount}/${threshold}*\n` +
          `_Reason:_ ${reason}\n\n` +
          `🚨 *Threshold reached!* Make me admin to auto-kick.`,
        mentions: [targetJid],
      }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, {
        text:
          `⚠️ @${targetPhone} — Warning *${warnCount}/${threshold}*\n` +
          `_Reason:_ ${reason}\n` +
          `_${threshold - warnCount} more warn${threshold - warnCount > 1 ? 's' : ''} before auto-kick._`,
        mentions: [targetJid],
      }, { quoted: msg });
    }
  },
};
