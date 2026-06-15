/**
 * Plugin: stats
 * Category: game
 *
 * Show a player's game stats across all games.
 * Displays global totals, win rate, and per-game breakdown with leaderboard rank.
 *
 * Usage:
 *   .stats                — show your own stats
 *   .stats @mention       — show a mentioned user's stats
 */

import { playerStatsCard } from '../../nativeflow/index.js';

export default {
  name:        'stats',
  aliases:     ['mystats', 'gamestats', 'score'],
  category:    'game',
  description: 'Show your (or another player\'s) game stats across all games',
  usage:       '.stats [@mention]',

  async execute({ sock, msg, args, settings, sender }) {
    const jid     = msg.key.remoteJid;
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';

    // Resolve target player — mentioned user or self
    const mentions  = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    const playerJid = mentions[0] ?? sender;
    const pushName  = msg.pushName ?? playerJid.split('@')[0];
    const isOther   = playerJid !== sender;

    // Extract display name: if arg looks like a name (not a number), use it
    const nameArg = args.filter(a => !a.startsWith('@') && !/^\d+$/.test(a)).join(' ').trim();
    const displayName = isOther ? (nameArg || playerJid.split('@')[0]) : (pushName || '');

    await playerStatsCard(sock, jid, msg, playerJid, displayName, { prefix, botName });
  },
};
