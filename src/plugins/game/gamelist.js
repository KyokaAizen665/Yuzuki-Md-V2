/**
 * Plugin: games
 * Category: game
 *
 * Show all registered games as an interactive select card.
 * The list is built from the live games engine registry —
 * installing a game plugin adds it automatically.
 *
 * Usage:
 *   .games               — list all games
 *   .gamelist            — alias
 */

import { gameListCard } from '../../nativeflow/index.js';

export default {
  name:        'games',
  aliases:     ['gamelist', 'allgames'],
  category:    'game',
  description: 'List all available games with descriptions',
  usage:       '.games',

  async execute({ sock, msg, settings }) {
    const jid     = msg.key.remoteJid;
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';

    await gameListCard(sock, jid, msg, { prefix, botName });
  },
};
