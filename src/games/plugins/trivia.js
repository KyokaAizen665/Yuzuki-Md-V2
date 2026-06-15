/**
 * Game Plugin: Trivia
 * Category: game
 *
 * Fetches random multiple-choice questions from Open Trivia DB (no API key).
 * Uses the Games Framework engine for session management, leaderboard, and rewards.
 *
 * Commands:
 *   .trivia            — fetch and start a new question
 *   .trivia <1-4>      — answer by choice number
 *   .trivia <text>     — answer by typing the answer
 *   .trivia skip       — skip the current question (no penalty)
 *   .trivia score      — show your stats
 *   .trivia top        — leaderboard
 */

import { gamesEngine }        from '../engine.js';
import { formatLeaderboard, formatPlayerStats } from '../leaderboard.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decodeHTML(str) {
  return String(str)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"').replace(/&hellip;/g, '...');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchQuestion() {
  const r    = await fetch('https://opentdb.com/api.php?amount=1&type=multiple', {
    signal: AbortSignal.timeout(8000),
  });
  const data = await r.json();
  if (data.response_code !== 0) throw new Error('No questions available');
  const q       = data.results[0];
  const choices = shuffle([...q.incorrect_answers, q.correct_answer]).map(decodeHTML);
  return {
    question:   decodeHTML(q.question),
    correct:    decodeHTML(q.correct_answer),
    choices,
    category:   decodeHTML(q.category),
    difficulty: q.difficulty,
  };
}

function choiceList(choices) {
  return choices.map((c, i) => `  *${i + 1}.* ${c}`).join('\n');
}

// ─── Game definition (self-registers with engine on import) ───────────────────

gamesEngine.registerGame({
  gameId:      'trivia',
  name:        'Trivia',
  description: 'Random multiple-choice trivia questions from Open Trivia DB',
  minPlayers:  1,
  maxPlayers:  1,
  timeout:     90_000,
  rewards: {
    win:  { coins: 300, xp: 150 },
    lose: { coins: 0,   xp:  30 },
  },

  async onStart(session, ctx) {
    const { sock, msg } = ctx;
    const jid           = session.jid;
    const { question, choices, category, difficulty } = session.state;

    const text =
      `❓ *Trivia* — _${category}_ *(${difficulty})*\n\n` +
      `*${question}*\n\n` +
      `${choiceList(choices)}\n\n` +
      `_Send the choice number (1–${choices.length}) or the full answer.\n` +
      `Type *.trivia skip* to skip._`;

    await sock.sendMessage(jid, { text }, { quoted: msg }).catch(() => {});
  },

  async onMove(session, input, ctx) {
    const { sock, msg } = ctx;
    const jid           = session.jid;
    const sender        = ctx.sender ?? msg?.key?.participant ?? msg?.key?.remoteJid;
    const name          = msg?.pushName ?? sender?.split('@')[0] ?? 'Player';
    const { correct, choices } = session.state;

    // Skip / surrender
    const lo = input.toLowerCase().trim();
    if (lo === 'skip' || lo === 'pass' || lo === 'surrender') {
      await sock.sendMessage(jid, {
        text: `⏭️ Skipped!\nThe answer was: *${correct}*`,
      }, { quoted: msg }).catch(() => {});
      return { done: true, cancelled: true };
    }

    // Resolve numeric or text answer
    const num = parseInt(input);
    const guess = (!isNaN(num) && num >= 1 && num <= choices.length)
      ? choices[num - 1]
      : input;

    const isCorrect = guess.toLowerCase().trim() === correct.toLowerCase().trim();

    if (isCorrect) {
      await sock.sendMessage(jid, {
        text:
          `✅ *Correct!*\n\n` +
          `Answer: *${correct}*\n` +
          `Winner: *@${sender?.split('@')[0]}*\n\n` +
          `🎁 +300 Coins, +150 XP`,
        mentions: sender ? [sender] : [],
      }, { quoted: msg }).catch(() => {});
      return { done: true, winner: sender };
    }

    await sock.sendMessage(jid, {
      text: `❌ Wrong! You said *${guess}*.\nThe answer was: *${correct}*`,
    }, { quoted: msg }).catch(() => {});
    return { done: true, winners: [], draw: false };
  },
});

// ─── Command Plugin ───────────────────────────────────────────────────────────

export default {
  name:        'trivia',
  aliases:     ['quiz'],
  category:    'game',
  description: 'Answer random trivia questions (Open Trivia DB)',
  usage:       '.trivia | .trivia <answer> | .trivia skip | .trivia top',

  async execute({ sock, msg, args, sender, reply }) {
    const jid  = msg.key.remoteJid;
    const arg0 = (args[0] ?? '').toLowerCase();
    const name = msg.pushName ?? sender.split('@')[0];

    // ── Stats ──────────────────────────────────────────────────────────────────
    if (arg0 === 'score' || arg0 === 'stats') {
      await reply(formatPlayerStats(sender, name));
      return;
    }

    // ── Leaderboard ────────────────────────────────────────────────────────────
    if (arg0 === 'top' || arg0 === 'lb' || arg0 === 'leaderboard') {
      await reply(formatLeaderboard('trivia', 'Trivia'));
      return;
    }

    // ── Active session — route input ───────────────────────────────────────────
    if (gamesEngine.isActive(jid)) {
      const session = gamesEngine.getSession(jid);
      if (session?.gameId === 'trivia') {
        if (!arg0) {
          const { question, choices } = session.state;
          await reply(
            `❓ Question still active:\n\n*${question}*\n\n${choiceList(choices)}\n\n` +
            `_Send *.trivia <number or answer>* — or *.trivia skip*._`,
          );
        } else {
          await gamesEngine.routeInput(jid, args.join(' '), { sock, msg, sender });
        }
        return;
      }

      // Different game is active
      await reply(`❌ Another game (${session.gameId}) is active. End it first.`);
      return;
    }

    // ── Fetch new question ─────────────────────────────────────────────────────
    await reply('⏳ Fetching a question…');
    try {
      const q = await fetchQuestion();
      await gamesEngine.startGame(jid, 'trivia', [sender], q, { sock, msg });
    } catch (e) {
      await reply(`❌ Could not fetch a question: ${e.message}`);
    }
  },
};
