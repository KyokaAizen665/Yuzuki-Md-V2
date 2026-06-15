/**
 * Plugin: kick
 * Category: group
 * Migrated from commands.js case "kick"
 */

export default {
  name:        'kick',
  aliases:     ['remove', 'ban'],
  category:    'group',
  description: 'Remove a tagged member from the group',
  usage:       '.kick @user',
  permissions: ['admin', 'group'],

  async execute({ sock, msg, reply, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    if (!mentioned.length) { await reply(`Usage: ${prefix}kick @user`); return; }
    try {
      await sock.groupParticipantsUpdate(jid, mentioned, 'remove');
      await reply(`✅ Removed ${mentioned.length} member(s).`);
    } catch {
      await reply('❌ Failed — make sure I\'m an admin.');
    }
  },
};
