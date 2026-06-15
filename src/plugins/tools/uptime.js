/**
 * Plugin: uptime
 * Category: tools
 *
 * Reports how long the Node.js process has been running using
 * process.uptime() (seconds since process start).
 *
 * Note: this reflects the Node.js process start time, which is the
 * closest approximation to "bot start time" available without a
 * shared state module.
 */

/** Format seconds → "Xd Xh Xm Xs" */
function formatUptime(totalSec) {
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

export default {
  name:        'uptime',
  aliases:     ['ut', 'up'],
  category:    'tools',
  description: 'Show how long the bot has been running',
  usage:       '.uptime',

  async execute({ replyChannel }) {
    const sec = Math.floor(process.uptime());
    await replyChannel(`⏱️ *Bot Uptime*\n${formatUptime(sec)}`);
  },
};
