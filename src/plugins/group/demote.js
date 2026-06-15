/**
 * Plugin: demote
 * Category: group
 * Migrated from commands.js case "demote"
 */

export default {
  name:        'demote',
  aliases:     ['removeadmin'],
  category:    'group',
  description: 'Demote a tagged admin to regular member',
  usage:       '.demote @user',
  permissions: ['admin', 'group'],

  async execute({ sock, msg, reply, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    if (!mentioned.length) { await reply(`Usage: ${prefix}demote @user`); return; }
    try {
      await sock.groupParticipantsUpdate(jid, mentioned, 'demote');
      await reply(`✅ Demoted ${mentioned.length} member(s) from admin.`);
    } catch {
      await reply('❌ Failed — make sure I\'m an admin.');
    }
  },
};
