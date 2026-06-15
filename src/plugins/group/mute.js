/**
 * Plugin: mute
 * Category: group
 * Migrated from commands.js case "mute"
 */

export default {
  name:        'mute',
  aliases:     ['lock', 'lockgroup'],
  category:    'group',
  description: 'Mute the group — only admins can send messages',
  usage:       '.mute',
  permissions: ['admin', 'group'],

  async execute({ sock, msg, reply }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }
    try {
      await sock.groupSettingUpdate(jid, 'announcement');
      await reply('🔇 Group muted — only admins can send messages.');
    } catch {
      await reply('❌ Failed — make sure I\'m an admin.');
    }
  },
};
