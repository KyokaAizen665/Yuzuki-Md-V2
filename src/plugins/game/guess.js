/**
 * Plugin: guess
 * Category: game
 *
 * Number guessing game — guess a random number in range.
 * Commands:
 *   .guess          — start a new game (1–100)
 *   .guess <num>    — make a guess
 *   .guess resign   — give up
 */

import { gameEngine }            from '../../lib/game-engine.js';
import { recordWin, recordLoss } from '../../lib/game-store.js';

export default {
  name:        'guess',
  aliases:     ['numguess', 'numberguess'],
  category:    'game',
  description: 'Guess the secret number between 1 and 100',
  usage:       '.guess | .guess <number> | .guess resign',

  async execute({ reply, args, sender, msg }) {
    const jid     = msg.key.remoteJid;
    const session = gameEngine.get(jid);
    const arg0    = (args[0] ?? '').toLowerCase();
    const name    = msg.pushName ?? sender.split('@')[0];

    if (arg0 === 'resign' || arg0 === 'end') {
      if (!session || session.gameId !== 'guess') { await reply('❌ No active Guess game.'); return; }
      const n = session.state.number;
      gameEngine.end(jid);
      recordLoss(sender, 'guess', name);
      await reply(`🏳️ Resigned. The number was *${n}*.`);
      return;
    }

    const num = parseInt(arg0);

    if (!isNaN(num) && session?.gameId === 'guess') {
      const { number, attempts, max } = session.state;
      const newAttempts = attempts + 1;

      if (num < 1 || num > 100) { await reply(`❌ Number must be between 1 and 100.`); return; }

      if (num === number) {
        gameEngine.end(jid);
        recordWin(sender, 'guess', name);
        await reply(`🎉 *Correct!* The number was *${number}*.\n${name} guessed it in *${newAttempts}* attempt${newAttempts!==1?'s':''}!`);
        return;
      }

      if (newAttempts >= max) {
        gameEngine.end(jid);
        recordLoss(sender, 'guess', name);
        await reply(`💀 Out of attempts! The number was *${number}*.\nUse *.guess* to start over.`);
        return;
      }

      const hint = num < number ? '📈 Too low!' : '📉 Too high!';
      gameEngine.update(jid, { attempts: newAttempts });
      await reply(`${hint}\nAttempt ${newAttempts}/${max} — guess again with *.guess <number>*`);
      return;
    }

    // Start new game
    if (!session) {
      const number = Math.floor(Math.random() * 100) + 1;
      const max    = 8;
      gameEngine.create(jid, 'guess', [sender], { number, attempts: 0, max });
      await reply(`🔢 *Guess the Number!*\n\nI'm thinking of a number between *1 and 100*.\nYou have *${max} attempts*.\n\nSend *.guess <number>* to guess!`);
      return;
    }

    const { attempts, state: { max } = {} } = session;
    await reply(`🔢 Game in progress (${session.state.attempts}/${session.state.max} attempts).\nSend *.guess <number>* to guess, or *.guess resign* to quit.`);
  },
};
