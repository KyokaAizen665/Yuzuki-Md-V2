/**
 * Plugin: tiktok
 * Category: download
 * Migrated from commands.js case "tiktok"
 *
 * Downloads TikTok video without watermark via tikwm.com API (free).
 */

/** Format a number with K/M suffix */
function fmtNum(n) {
  if (!n) return 'N/A';
  const x = parseInt(n);
  if (x >= 1e6) return (x / 1e6).toFixed(1) + 'M';
  if (x >= 1e3) return (x / 1e3).toFixed(1) + 'K';
  return x.toLocaleString();
}

export default {
  name:        'tiktok',
  aliases:     ['tt', 'tiktokvideo', 'ttdl'],
  category:    'download',
  description: 'Download a TikTok video without watermark',
  usage:       '.tiktok <TikTok URL>',

  async execute({ sock, msg, reply, args }) {
    const jid = msg.key.remoteJid;
    const u   = args[0]?.trim();
    if (!u || !/tiktok\.com/.test(u)) {
      await reply(`Usage: .tiktok <TikTok URL>`);
      return;
    }

    await reply('⏳ Fetching TikTok video...');
    try {
      const r = await fetch(`https://tikwm.com/api/?url=${encodeURIComponent(u)}`);
      const d = await r.json();
      if (d.code !== 0 || !d.data) { await reply('❌ Could not fetch. Check the URL.'); return; }

      const v      = d.data;
      const vidUrl = v.play || v.hdplay || v.wmplay;
      if (!vidUrl) { await reply('❌ No video found.'); return; }

      await sock.sendMessage(jid, {
        video:   { url: vidUrl },
        caption: `📥 *${(v.title ?? 'TikTok Video').slice(0, 100)}*\n` +
                 `👤 ${v.author?.nickname ?? '?'}  ` +
                 `👁 ${fmtNum(v.play_count)}  ❤️ ${fmtNum(v.digg_count)}`,
      }, { quoted: msg });
    } catch (e) {
      await reply(`❌ tiktok: ${e.message}`);
    }
  },
};
