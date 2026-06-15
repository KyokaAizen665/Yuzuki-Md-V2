/**
 * Plugin: runtime
 * Category: tools
 *
 * Shows live Node.js runtime information:
 *   - Node.js version
 *   - Operating system
 *   - Process uptime (from process.uptime())
 *   - Heap memory usage
 *   - RSS memory
 *   - CPU core count
 */

import os from 'os';

/** Format bytes → MB string */
const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);

/** Format seconds → "Xd Xh Xm Xs" */
function formatDuration(totalSec) {
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

export default {
  name:        'runtime',
  aliases:     ['sysinfo', 'sys'],
  category:    'tools',
  description: 'Show bot runtime and system information',
  usage:       '.runtime',

  async execute({ replyChannel }) {
    const mem      = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());
    const cpus     = os.cpus();
    const platform = `${os.type()} ${os.release()} (${os.arch()})`;

    const lines = [
      '⚙️ *Runtime Info*',
      '',
      `• *Node.js:*   ${process.version}`,
      `• *Platform:*  ${platform}`,
      `• *Uptime:*    ${formatDuration(uptimeSec)}`,
      `• *CPU cores:* ${cpus.length} × ${cpus[0]?.model ?? 'unknown'}`,
      '',
      '🧠 *Memory*',
      `• Heap used:  ${toMB(mem.heapUsed)} MB / ${toMB(mem.heapTotal)} MB`,
      `• RSS:        ${toMB(mem.rss)} MB`,
      `• External:   ${toMB(mem.external)} MB`,
    ];

    await replyChannel(lines.join('\n'));
  },
};
