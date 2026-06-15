/**
 * Plugin: ping
 * Category: tools
 *
 * Measures round-trip bot response latency.
 * Sends an initial message, then edits / sends a follow-up with the elapsed ms.
 */

export default {
  name:        'ping',
  aliases:     ['p'],
  category:    'tools',
  description: 'Check bot response latency',
  usage:       '.ping',

  async execute({ sock, msg, replyChannel }) {
    const t0 = Date.now();
    await replyChannel(`🏓 *Pong!*\nLatency: ${Date.now() - t0} ms`);
  },
};
