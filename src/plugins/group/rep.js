/**
 * Plugin: rep
 * Category: group
 *
 * Give reputation to a group member (once per 24 hours per target).
 * Reputation is group-specific and displayed on the rep leaderboard.
 *
 * Usage:
 *   .rep           — view your own rep
 *   .rep @user     — give +1 rep to that user
 */

import { addRep, getMember, fmtDuration } from '../../lib/group-db.js';

export default {
  name:        'rep',
  aliases:     ['reputation', 'giverep', 'upvote'],
  category:    'group',
  description: 'Give +1 reputation to a group member (once per 24h per target)',
  usage:       '.rep [@user]',
  permissions: ['group'],

  async execute({ sock, msg, reply, args, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    const targetJid = mentioned[0];

    // ── View own rep ────────────────────────────────────────────────────────
    if (!targetJid) {
      const m     = getMember(jid, sender);
      const phone = sender.split('@')[0];
      await reply(
        `⭐ *Your Reputation*\n\n` +
        `📛 @${phone}\n` +
        `⭐ Rep: *${m.rep ?? 0}*\n\n` +
        `_Others can give you rep with \`${prefix}rep @${phone}\` (once per 24h each)_`,
      );
      return;
    }

    // ── Give rep ─────────────────────────────────────────────────────────────
    const result = addRep(jid, sender, targetJid);

    if (!result.ok) {
      if (result.reason === 'self') {
        await reply(`❌ You cannot give rep to yourself!`);
        return;
      }
      if (result.reason === 'cooldown') {
        await reply(
          `⏳ You already gave rep to @${targetJid.split('@')[0]} recently.\n` +
          `Try again in *${fmtDuration(result.remaining)}*.`,
        );
        return;
      }
    }

    const targetPhone = targetJid.split('@')[0];
    await sock.sendMessage(jid, { react: { text: '⭐', key: msg.key } }).catch(() => {});
    await sock.sendMessage(jid, {
      text:
        `⭐ *Rep Given!*\n\n` +
        `@${sender.split('@')[0]} gave +1 rep to @${targetPhone}\n` +
        `⭐ ${targetPhone}'s rep: *${result.newRep}*`,
      mentions: [sender, targetJid],
    }, { quoted: msg });
  },
};
