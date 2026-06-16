/**
 * Plugin: wordle
 * Category: game
 *
 * 5-letter word guessing game — 6 attempts.
 * Commands:
 *   .wordle          — start new game
 *   .wordle <word>   — guess a 5-letter word
 *   .wordle resign   — give up
 *
 * VRS: hero image on game START only (heroType: 'games')
 */

import { gameEngine }            from '../../lib/game-engine.js';
import { recordWin, recordLoss } from '../../lib/game-store.js';
import { sendHeroCard }          from '../../lib/visual-response.js';

const WORDS = [
  'brave','cloud','dream','flame','grace','heart','ivory','juice','knife','lemon',
  'magic','night','ocean','piano','queen','river','storm','tiger','ultra','vivid',
  'water','xenon','yacht','zebra','apple','brick','chess','dance','earth','frost',
  'grape','house','igloo','joker','karma','light','music','ninja','olive','peach',
  'quiet','radar','solar','table','upset','valid','wheat','xerox','yield','zones',
  'alert','black','cabin','draft','eager','fixed','glass','honor','input','joint',
  'known','lucky','metro','noble','orbit','plumb','quilt','radio','saint','track',
];

const TILE = { hit: '🟩', near: '🟨', miss: '⬜' };

function score(guess, target) {
  const result = Array(5).fill('miss');
  const tArr   = target.split('');
  const used   = Array(5).fill(false);

  for (let i = 0; i < 5; i++) {
    if (guess[i] === tArr[i]) { result[i] = 'hit'; used[i] = true; }
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === 'hit') continue;
    const j = tArr.findIndex((c, k) => c === guess[i] && !used[k]);
    if (j !== -1) { result[i] = 'near'; used[j] = true; }
  }
  return result;
}

function renderRow(guess, result) {
  return result.map(r => TILE[r]).join('') + '  ' + guess.toUpperCase();
}

function renderBoard(rows) {
  return rows.map(r => renderRow(r.guess, r.result)).join('\n');
}

export default {
  name:        'wordle',
  aliases:     ['wordguess'],
  category:    'game',
  description: 'Guess the 5-letter word in 6 tries',
  usage:       '.wordle | .wordle <5-letter-word> | .wordle resign',

  async execute({ sock, reply, args, sender, msg, settings }) {
    const jid     = msg.key.remoteJid;
    const session = gameEngine.get(jid);
    const arg0    = (args[0] ?? '').toLowerCase();
    const name    = msg.pushName ?? sender.split('@')[0];

    if (arg0 === 'resign' || arg0 === 'end') {
      if (!session || session.gameId !== 'wordle') { await reply('❌ No active Wordle game.'); return; }
      const word = session.state.word;
      gameEngine.end(jid);
      recordLoss(sender, 'wordle', name);
      await reply(`🏳️ Resigned. The word was *${word.toUpperCase()}*.`);
      return;
    }

    // Guess
    if (session?.gameId === 'wordle' && /^[a-z]{5}$/.test(arg0)) {
      const { word, rows } = session.state;
      const result = score(arg0, word);
      rows.push({ guess: arg0, result });

      const board = renderBoard(rows);
      const won   = result.every(r => r === 'hit');
      const lost  = !won && rows.length >= 6;

      if (won) {
        gameEngine.end(jid);
        recordWin(sender, 'wordle', name);
        await reply(`🟩 *Wordle*\n\n${board}\n\n🎉 *Correct! ${name} solved it in ${rows.length}/6!*`);
      } else if (lost) {
        gameEngine.end(jid);
        recordLoss(sender, 'wordle', name);
        await reply(`⬜ *Wordle*\n\n${board}\n\n💀 Game over! The word was *${word.toUpperCase()}*.`);
      } else {
        gameEngine.update(jid, { rows });
        await reply(`🟩 *Wordle* — Attempt ${rows.length}/6\n\n${board}\n\nGuess again with *.wordle <word>*`);
      }
      return;
    }

    if (session?.gameId === 'wordle' && arg0 && arg0.length !== 5) {
      await reply(`❌ Must be exactly 5 letters. Try again.`);
      return;
    }

    // Start new game
    if (!session) {
      const word = WORDS[Math.floor(Math.random() * WORDS.length)];
      gameEngine.create(jid, 'wordle', [sender], { word, rows: [] });

      // Hero image on game start only
      const startBody =
        `🟩 *Wordle Started!*\n${'─'.repeat(22)}\n\n` +
        `Guess the 5-letter word in 6 tries.\n\n` +
        `🟩 = correct place\n🟨 = wrong place\n⬜ = not in word\n\n` +
        `Send *.wordle <5-letter-word>* to guess!`;

      await sendHeroCard(sock, jid, msg, {
        body:      startBody,
        footer:    settings?.botName ?? 'Yuzuki MD',
        heroType:  'games',
        settings,
        forceHero: true,
        fallback:  startBody,
      });
      return;
    }

    const { word: w, rows: r } = session.state;
    const board = r.length ? renderBoard(r) : '(no guesses yet)';
    await reply(`🟩 *Wordle* — Attempt ${r.length}/6\n\n${board}\n\nSend *.wordle <5-letter-word>* to guess.`);
  },
};
