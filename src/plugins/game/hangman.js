/**
 * Plugin: hangman
 * Category: game
 *
 * Classic hangman game with session state.
 * Commands:
 *   .hangman           — start a new game
 *   .hangman <letter>  — guess a letter
 *   .hangman word <W>  — guess the whole word
 *   .hangman resign    — give up
 */

import { gameEngine }                        from '../../lib/game-engine.js';
import { recordWin, recordLoss }             from '../../lib/game-store.js';

const WORDS = [
  'javascript','programming','elephant','adventure','chocolate',
  'university','basketball','watermelon','technology','friendship',
  'butterfly','strawberry','dangerous','knowledge','dictionary',
  'television','helicopter','constitution','multiplication','championship',
  'algorithm','blockchain','cryptography','developer','environment',
  'framework','generator','infrastructure','javascript','kubernetes',
];

const FIGURES = [
  '  ___\n |   |\n |\n |\n |\n_|_',
  '  ___\n |   |\n |   O\n |\n |\n_|_',
  '  ___\n |   |\n |   O\n |   |\n |\n_|_',
  '  ___\n |   |\n |   O\n |  /|\n |\n_|_',
  '  ___\n |   |\n |   O\n |  /|\\\n |\n_|_',
  '  ___\n |   |\n |   O\n |  /|\\\n |  /\n_|_',
  '  ___\n |   |\n |   O\n |  /|\\\n |  / \\\n_|_',
];

function drawBoard(word, guessed, wrong) {
  const display = word.split('').map(c => (guessed.has(c) ? c : '_')).join(' ');
  const fig     = FIGURES[Math.min(wrong, FIGURES.length - 1)];
  return `\`\`\`\n${fig}\n\`\`\`\n\n*Word:* ${display}\n*Wrong guesses (${wrong}/6):* ${[...guessed].filter(g => !word.includes(g)).join(' ') || '—'}`;
}

export default {
  name:        'hangman',
  aliases:     ['hm'],
  category:    'game',
  description: 'Play Hangman — guess the hidden word letter by letter',
  usage:       '.hangman | .hangman <letter> | .hangman word <guess> | .hangman resign',

  async execute({ reply, args, sender, msg }) {
    const jid     = msg.key.remoteJid;
    const session = gameEngine.get(jid);
    const arg0    = (args[0] ?? '').toLowerCase();
    const name    = msg.pushName ?? sender.split('@')[0];

    // Resign
    if (arg0 === 'resign' || arg0 === 'end') {
      if (!session || session.gameId !== 'hangman') { await reply('❌ No active Hangman game.'); return; }
      const word = session.state.word;
      gameEngine.end(jid);
      recordLoss(sender, 'hangman', name);
      await reply(`🏳️ Resigned. The word was *${word}*.`);
      return;
    }

    // Whole-word guess
    if (arg0 === 'word' && args[1]) {
      if (!session || session.gameId !== 'hangman') { await reply('❌ No active Hangman game. Start one with *.hangman*'); return; }
      const { word, guessed, wrong } = session.state;
      const guess = args[1].toLowerCase();
      if (guess === word) {
        gameEngine.end(jid);
        recordWin(sender, 'hangman', name);
        await reply(`🎉 Correct! The word was *${word}*! You win, ${name}!`);
      } else {
        const newWrong = wrong + 2; // word guess penalty = 2
        if (newWrong >= 6) {
          gameEngine.end(jid);
          recordLoss(sender, 'hangman', name);
          await reply(`${drawBoard(word, guessed, newWrong)}\n\n💀 Wrong! The word was *${word}*.`);
        } else {
          gameEngine.update(jid, { wrong: newWrong });
          await reply(`${drawBoard(word, guessed, newWrong)}\n\n❌ Wrong word! *-2 lives.*`);
        }
      }
      return;
    }

    // Letter guess
    if (session?.gameId === 'hangman' && /^[a-z]$/.test(arg0)) {
      const { word, guessed, wrong } = session.state;
      if (guessed.has(arg0)) { await reply(`⚠️ You already guessed *${arg0}*.`); return; }
      guessed.add(arg0);
      const newWrong = word.includes(arg0) ? wrong : wrong + 1;
      gameEngine.update(jid, { guessed, wrong: newWrong });

      const allGuessed = word.split('').every(c => guessed.has(c));
      if (allGuessed) {
        gameEngine.end(jid);
        recordWin(sender, 'hangman', name);
        await reply(`${drawBoard(word, guessed, newWrong)}\n\n🎉 You got it! The word was *${word}*! ${name} wins!`);
        return;
      }
      if (newWrong >= 6) {
        gameEngine.end(jid);
        recordLoss(sender, 'hangman', name);
        await reply(`${drawBoard(word, guessed, newWrong)}\n\n💀 Game over! The word was *${word}*.`);
        return;
      }
      const hit = word.includes(arg0);
      await reply(`${drawBoard(word, guessed, newWrong)}\n\n${hit ? `✅ *${arg0}* is in the word!` : `❌ No *${arg0}* in this word.`}`);
      return;
    }

    // Start new game
    if (!session || session.gameId !== 'hangman') {
      if (session) { await reply(`❌ Another game (${session.gameId}) is active here.`); return; }
      const word    = WORDS[Math.floor(Math.random() * WORDS.length)];
      const guessed = new Set();
      gameEngine.create(jid, 'hangman', [sender], { word, guessed, wrong: 0 });
      await reply(`🕹️ *Hangman Started!*\n\n${drawBoard(word, guessed, 0)}\n\nSend a letter to guess! (*.hangman <letter>*)\nGuess the word with *.hangman word <guess>*`);
      return;
    }

    // Show current board
    const { word, guessed, wrong } = session.state;
    await reply(`${drawBoard(word, guessed, wrong)}\n\nSend *.hangman <letter>* to guess.`);
  },
};
