/**
 * Plugin: unmute
 * Category: group
 * Migrated from commands.js case "unmute"
 */

export default {
  name:        'unmute',
  aliases:     ['unlock', 'unlockgroup', 'open'],
  category:    'group',
  description: 'Unmute the group — everyone can send messages',
  usage:       '.unmute',
  permissions: ['admin', 'group'],

  async execute({ sock, msg, reply }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }
    try {
      await sock.groupSettingUpdate(jid, 'not_announcement');
      await reply('🔊 Group unmuted — everyone can send messages.');
    } catch {
      await reply('❌ Failed — make sure I\'m an admin.');
    }
  },
};
