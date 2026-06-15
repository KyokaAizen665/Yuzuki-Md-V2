/**
 * Plugin: facebook
 * Category: download
 * Migrated from commands.js case "fbdl"
 *
 * Downloads videos from Facebook using the fastdl.app API (free).
 * Original alias "fbdl" preserved for backward compatibility.
 */

export default {
  name:        'facebook',
  aliases:     ['fbdl', 'fb', 'fbdownload'],
  category:    'download',
  description: 'Download a video from a Facebook URL',
  usage:       '.facebook <Facebook video URL>',

  async execute({ sock, msg, reply, args }) {
    const jid = msg.key.remoteJid;
    const u   = args[0]?.trim();
    if (!u || !/facebook\.com|fb\.watch/.test(u)) {
      await reply(`Usage: .facebook <Facebook video URL>`);
      return;
    }

    await reply('⏳ Fetching Facebook video...');
    try {
      const r = await fetch('https://api.fastdl.app/api/convert', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: u }),
      });
      const d   = await r.json();
      const vid = d?.medias?.find(m => m.type === 'video') || d?.medias?.[0];
      if (!vid?.url) {
        await reply('❌ Could not fetch. The video may be private or the URL is invalid.');
        return;
      }
      await sock.sendMessage(jid, {
        video:   { url: vid.url },
        caption: `📥 Facebook Video${d.title ? ` — ${d.title.slice(0, 80)}` : ''}`,
      }, { quoted: msg });
    } catch (e) {
      await reply(`❌ fbdl: ${e.message}`);
    }
  },
};
