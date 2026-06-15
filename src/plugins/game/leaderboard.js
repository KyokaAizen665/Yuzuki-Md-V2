/**
 * Plugin: leaderboard
 * Category: game
 *
 * Show the ranked leaderboard for any registered game.
 * All data is read live from the persistent game-scores store.
 * The game list is pulled from the live games engine registry
 * (no hardcoded GAMES array).
 *
 * Usage:
 *   .leaderboard              — show all registered games (interactive select)
 *   .leaderboard <gameId>     — top-10 leaderboard for that game
 *   .leaderboard <gameId> <N> — top-N leaderboard (max 10)
 *   .leaderboard me           — your own stats across all games
 *   .leaderboard @mention     — another player's stats
 */

import { leaderboardCard, playerStatsCard, gameListCard } from '../../nativeflow/index.js';
import { gamesEngine } from '../../games/engine.js';

export default {
  name:        'leaderboard',
  aliases:     ['lb', 'ranking', 'topplayers', 'top'],
  category:    'game',
  description: 'Show the leaderboard or player stats for any registered game',
  usage:       '.leaderboard [gameId|me|@mention] [limit]',

  async execute({ sock, msg, args, reply, sender, settings }) {
    const jid     = msg.key.remoteJid;
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';

    const arg0 = (args[0] ?? '').toLowerCase().trim();

    // ── No argument → list all games ────────────────────────────────────────
    if (!arg0) {
      await gameListCard(sock, jid, msg, { prefix, botName });
      return;
    }

    // ── "me" / "mystats" → caller's own stats ────────────────────────────────
    if (arg0 === 'me' || arg0 === 'mystats' || arg0 === 'stats') {
      const pushName = msg.pushName ?? sender.split('@')[0];
      await playerStatsCard(sock, jid, msg, sender, pushName, { prefix, botName });
      return;
    }

    // ── @mention → another player's stats ────────────────────────────────────
    const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    if (mentions.length > 0) {
      const targetJid  = mentions[0];
      const targetName = arg0.replace(/[^a-z0-9]/gi, '') || targetJid.split('@')[0];
      await playerStatsCard(sock, jid, msg, targetJid, targetName, { prefix, botName });
      return;
    }

    // ── gameId argument → show leaderboard for that game ────────────────────
    const limit = Math.min(Math.max(parseInt(args[1] ?? '10', 10) || 10, 1), 10);

    // Validate the gameId against the live registry first
    if (!gamesEngine.hasGame(arg0)) {
      const available = gamesEngine.listGames().join(', ') || 'none';
      await reply(
        `❌ Unknown game: *${arg0}*\n\n` +
        `Available games: ${available}\n\n` +
        `_Use ${prefix}leaderboard (no args) to browse._`,
      );
      return;
    }

    await leaderboardCard(sock, jid, msg, arg0, { prefix, botName, limit });
  },
};
