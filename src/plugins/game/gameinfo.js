/**
 * Plugin: gameinfo
 * Category: game
 *
 * Show a rich detail card for a registered game.
 * Card is generated from the game definition — name, description,
 * player range, turn timeout, and rewards breakdown.
 *
 * Usage:
 *   .gameinfo <gameId>    — show game detail
 *   .gameinfo             — list all games
 */

import { gameCard, gameListCard } from '../../nativeflow/index.js';

export default {
  name:        'gameinfo',
  aliases:     ['ginfo', 'gamedetail'],
  category:    'game',
  description: 'Show detailed info about a specific game',
  usage:       '.gameinfo <gameId>',

  async execute({ sock, msg, args, settings }) {
    const jid     = msg.key.remoteJid;
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';
    const gameId  = (args[0] ?? '').toLowerCase().trim();

    if (!gameId) {
      await gameListCard(sock, jid, msg, { prefix, botName });
      return;
    }

    await gameCard(sock, jid, msg, gameId, { prefix, botName });
  },
};
