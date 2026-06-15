/**
 * Plugin: play
 * Category: download
 *
 * Starts the guided "play" workflow: search → pick → format → deliver.
 * The multi-step experience is handled by src/workflows/handlers/play.js.
 *
 * Usage:
 *   .play <song title>
 *   .play Blinding Lights
 */

import { workflowManager } from '../../workflows/index.js';
import { initUserDB, getLimitCost, checkLimit } from '../../lib/database.js';
import { isOwner } from '../../settings.js';

export default {
  name:        'play',
  aliases:     ['music', 'audio'],
  category:    'download',
  description: 'Search for a song and pick from results (guided workflow)',
  usage:       '.play <song title>',
  limit:       2,

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid  = msg.key.remoteJid;
    const query = args.join(' ').trim();

    if (!query) {
      await reply(
        `🎵 *Usage:* .play <song title>\n` +
        `_Example:_ .play Blinding Lights\n\n` +
        `The bot will show search results for you to choose from.`,
      );
      return;
    }

    initUserDB(sender, msg.pushName ?? 'User');
    const cost = getLimitCost('play', 2);
    const lim  = checkLimit(sender, isOwner(sender, settings));
    if (lim !== '∞' && lim < cost) {
      await reply(`❌ Not enough limit! Need *${cost}*, you have *${lim}*.`);
      return;
    }

    await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } }).catch(() => {});

    const result = await workflowManager.start(
      jid,
      'play',
      { query },
      { sock, msg, settings },
    );

    if (!result.ok) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌ ${result.error}`);
    }
  },
};
