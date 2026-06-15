/**
 * Plugin: rps (Rock Paper Scissors)
 * Category: game
 *
 * Stateless single-round game vs the bot.
 * Usage: .rps rock | .rps paper | .rps scissors
 */

import { recordWin, recordLoss, recordDraw } from '../../lib/game-store.js';

const CHOICES   = ['rock', 'paper', 'scissors'];
const EMOJI     = { rock: '🪨', paper: '📄', scissors: '✂️' };
const BEATS     = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const ALIASES_M = { r: 'rock', p: 'paper', s: 'scissors', stone: 'rock', leaf: 'paper', cut: 'scissors' };

export default {
  name:        'rps',
  aliases:     ['rockpaperscissors', 'janken'],
  category:    'game',
  description: 'Play Rock Paper Scissors against the bot',
  usage:       '.rps <rock|paper|scissors>',

  async execute({ reply, args, sender, msg }) {
    const raw    = (args[0] ?? '').toLowerCase();
    const choice = ALIASES_M[raw] ?? raw;

    if (!CHOICES.includes(choice)) {
      await reply(`✂️ *Rock Paper Scissors*\n\nUsage: *.rps rock | paper | scissors*\n\nExample: *.rps rock*`);
      return;
    }

    const botChoice = CHOICES[Math.floor(Math.random() * 3)];
    const name      = msg.pushName ?? sender.split('@')[0];

    let result, resultLine;
    if (choice === botChoice) {
      result     = 'draw';
      resultLine = '🤝 *Draw!*';
      recordDraw(sender, 'rps', name);
    } else if (BEATS[choice] === botChoice) {
      result     = 'win';
      resultLine = `🎉 *You win, ${name}!*`;
      recordWin(sender, 'rps', name);
    } else {
      result     = 'loss';
      resultLine = `🤖 *Bot wins!* Better luck next time.`;
      recordLoss(sender, 'rps', name);
    }

    await reply(
      `✂️ *Rock Paper Scissors*\n\n` +
      `You chose: ${EMOJI[choice]} *${choice}*\n` +
      `Bot chose: ${EMOJI[botChoice]} *${botChoice}*\n\n` +
      resultLine
    );
  },
};
