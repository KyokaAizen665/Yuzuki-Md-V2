/**
 * Plugin: hidetag
 * Category: group
 *
 * Tags all group members silently — the message body does not contain
 * visible @mentions, but every member still receives a notification.
 * Useful for announcements where you don't want to flood the chat with names.
 */

export default {
  name:        'hidetag',
  aliases:     ['htag', 'stag', 'hiddentag'],
  category:    'group',
  description: 'Tag all members silently (hidden @mention)',
  usage:       '.hidetag [message]',
  permissions: ['admin', 'group'],

  async execute({ sock, msg, reply, args }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }
    try {
      const meta     = await sock.groupMetadata(jid);
      const mentions = meta.participants.map(p => p.id);
      const text     = args.join(' ').trim() || '📢';
      await sock.sendMessage(jid, { text, mentions }, { quoted: msg });
    } catch {
      await reply('❌ Failed — make sure I\'m an admin.');
    }
  },
};
