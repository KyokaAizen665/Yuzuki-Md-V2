/**
 * Plugin: endgame
 * Category: game
 *
 * Force-ends any active game session in the current chat.
 * Handles BOTH game engines:
 *   - Legacy engine  (lib/game-engine.js) — blackjack, coinflip, dice, hangman, rps, wordle, guess
 *   - Framework engine (games/engine.js)  — tictactoe, trivia, battles, fishing, economy
 *
 * Useful when a game gets stuck or the original player left the chat.
 *
 * Usage:
 *   .endgame     — end whichever game (either engine) is active in this chat
 */

import { gameEngine }  from '../../lib/game-engine.js';
import { gamesEngine } from '../../games/engine.js';

export default {
  name:        'endgame',
  aliases:     ['stopgame', 'cancelgame', 'quitgame'],
  category:    'game',
  description: 'End the currently active game in this chat (any engine)',
  usage:       '.endgame',

  async execute({ reply, msg }) {
    const jid = msg.key.remoteJid;

    // ── Check new Games Framework engine first ────────────────────────────
    if (gamesEngine.isActive(jid) || gamesEngine.isPaused(jid)) {
      const session = gamesEngine.getSession(jid);
      const gameId  = session?.gameId ?? 'game';
      await gamesEngine.endGame(jid, { cancelled: true }, {});
      await reply(`🛑 *${gameId}* session ended.`);
      return;
    }

    // ── Fall back to legacy game engine ───────────────────────────────────
    const legacySession = gameEngine.get(jid);
    if (legacySession) {
      const gameId = legacySession.gameId ?? 'game';
      gameEngine.end(jid);
      await reply(`🛑 *${gameId}* session ended.`);
      return;
    }

    await reply('✅ No active game session in this chat.');
  },
};
