/**
 * Plugin: speed
 * Category: tools
 *
 * Reports how quickly the bot can respond.
 * Distinct from ping: intended as a quick health-check alias.
 */

export default {
  name:        'speed',
  aliases:     ['latency'],
  category:    'tools',
  description: 'Check bot response speed',
  usage:       '.speed',

  async execute({ replyChannel }) {
    const t0 = Date.now();
    await replyChannel(`📡 *Speed Test*\nResponse time: ${Date.now() - t0} ms`);
  },
};
