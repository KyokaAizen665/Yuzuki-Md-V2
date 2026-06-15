/**
 * Plugin: promote
 * Category: group
 * Migrated from commands.js case "promote"
 */

export default {
  name:        'promote',
  aliases:     ['makeadmin'],
  category:    'group',
  description: 'Promote a tagged member to group admin',
  usage:       '.promote @user',
  permissions: ['admin', 'group'],

  async execute({ sock, msg, reply, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    if (!mentioned.length) { await reply(`Usage: ${prefix}promote @user`); return; }
    try {
      await sock.groupParticipantsUpdate(jid, mentioned, 'promote');
      await reply(`✅ Promoted ${mentioned.length} member(s) to admin.`);
    } catch {
      await reply('❌ Failed — make sure I\'m an admin.');
    }
  },
};
