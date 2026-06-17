/**
 * Plugin: alive
 * Category: tools
 * Migrated from commands.js case "alive"
 *
 * Shows bot status with uptime, prefix and mode as a preview card.
 * Also posts to the bot's configured WhatsApp channel if one is set.
 */

import { card, previewCard } from '../../utils/ui.js';
import { isOwner } from '../../settings.js';

/** Format seconds → "Xd Xh Xm Xs" */
function fmt(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${d}d ${h % 24}h ${m % 60}m ${s}s`;
}

export default {
  name:        'alive',
  aliases:     ['status', 'online'],
  category:    'tools',
  description: 'Check bot status, uptime and mode',
  usage:       '.alive',

  async execute({ sock, msg, sender, settings }) {
    const jid      = msg.key.remoteJid;
    const botName  = settings.botName ?? 'Yuzuki MD';
    const uptimeSec = Math.floor(process.uptime());
    const uptimeStr = fmt(uptimeSec);

    const text = card('🐋', botName, [
      ['Status',  'Online ✅'],
      ['Prefix',  `\`${settings.prefix ?? '.'}\``],
      ['Mode',    (settings.mode ?? 'public').toUpperCase()],
      ['Uptime',  uptimeStr],
    ], 'Yuzuki MD v2 • Powered by cv3inx/baileys');

    const payload = await previewCard(text, {
      title:     botName,
      body:      `Online ✅  •  Uptime: ${uptimeStr}`,
      thumbUrl:  'https://www.upload.ee/image/19419994/file.jpg',
      sourceUrl: 'https://github.com/KyokaAizen665/Yuzuki-Md-V2',
    });

    // Optionally post to channel (settings.channelId may include @newsletter)
    const channelJid = settings.channelId
      ? (settings.channelId.includes('@') ? settings.channelId : `${settings.channelId}@newsletter`)
      : null;
    if (channelJid) {
      try { await sock.sendMessage(channelJid, payload); } catch {}
    }

    await sock.sendMessage(jid, payload, { quoted: msg });
  },
};
