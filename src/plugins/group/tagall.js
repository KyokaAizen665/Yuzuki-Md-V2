/**
 * Plugin: tagall
 * Category: group
 * Migrated from commands.js case "tagall"
 */

export default {
  name:        'tagall',
  aliases:     ['tageveryone', 'mentionall'],
  category:    'group',
  description: 'Tag all members in the group with visible @mentions',
  usage:       '.tagall',
  permissions: ['admin', 'group'],

  async execute({ sock, msg, reply }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }
    try {
      const meta     = await sock.groupMetadata(jid);
      const mentions = meta.participants.map(p => p.id);
      const text     = `*\`Yuzuki MD\` tag all ${mentions.length} members*\n` +
                       mentions.map(id => `@${id.split('@')[0]}`).join(' ');
      await sock.sendMessage(jid, { text, mentions }, { quoted: msg });
    } catch {
      await reply('❌ Failed to tag members — make sure I\'m an admin.');
    }
  },
};
