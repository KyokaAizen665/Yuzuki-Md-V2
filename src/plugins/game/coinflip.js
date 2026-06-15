/**
 * Plugin: coinflip
 * Category: game
 *
 * Stateless coin flip. Usage: .coinflip [heads|tails]
 * If the user picks a side, the bot compares and reports win/loss.
 */

import { recordWin, recordLoss } from '../../lib/game-store.js';

export default {
  name:        'coinflip',
  aliases:     ['flip', 'coin'],
  category:    'game',
  description: 'Flip a coin — optionally bet on heads or tails',
  usage:       '.coinflip | .coinflip heads | .coinflip tails',

  async execute({ reply, args, sender, msg }) {
    const result  = Math.random() < 0.5 ? 'heads' : 'tails';
    const emoji   = result === 'heads' ? '🪙 *Heads!*' : '🟤 *Tails!*';
    const name    = msg.pushName ?? sender.split('@')[0];
    const pick    = args[0]?.toLowerCase();

    if (pick === 'heads' || pick === 'tails') {
      const won = pick === result;
      if (won) { recordWin(sender, 'coinflip', name); }
      else     { recordLoss(sender, 'coinflip', name); }
      await reply(`🪙 You picked *${pick}*... ${emoji}\n\n${won ? `🎉 *You win, ${name}!*` : `💀 *You lose!* Better luck next time.`}`);
    } else {
      await reply(`🪙 Flipping... ${emoji}`);
    }
  },
};
