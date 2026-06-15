/**
 * Game Plugin: Tic-Tac-Toe
 * Category: game
 *
 * Two-player board game. Play against another user or the bot AI.
 * Uses the Games Framework engine for sessions, leaderboard, and rewards.
 *
 * Commands:
 *   .ttt @user     — challenge another player (group only)
 *   .ttt bot       — play vs bot AI
 *   .ttt <1-9>     — place a mark (when a game is active)
 *   .ttt resign    — forfeit the current game
 *   .ttt top       — leaderboard
 */

import { gamesEngine }      from '../engine.js';
import { formatLeaderboard } from '../leaderboard.js';

// ─── Board helpers ────────────────────────────────────────────────────────────

function renderBoard(b) {
  const s = i => b[i] || String(i + 1);
  return (
    `\`\`\`\n` +
    ` ${s(0)} │ ${s(1)} │ ${s(2)} \n` +
    `───┼───┼───\n` +
    ` ${s(3)} │ ${s(4)} │ ${s(5)} \n` +
    `───┼───┼───\n` +
    ` ${s(6)} │ ${s(7)} │ ${s(8)} \n` +
    `\`\`\``
  );
}

const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function checkWin(b, p) { return WIN_LINES.some(([a,c,d]) => b[a]===p && b[c]===p && b[d]===p); }
function isDraw(b)      { return b.every(Boolean); }

function botMove(b) {
  const empty = b.map((v,i) => v ? null : i).filter(v => v !== null);
  for (const i of empty) { const t=[...b]; t[i]='O'; if(checkWin(t,'O')) return i; }
  for (const i of empty) { const t=[...b]; t[i]='X'; if(checkWin(t,'X')) return i; }
  if (b[4] === null) return 4;
  const corners = [0,2,6,8].filter(i => !b[i]);
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  return empty[Math.floor(Math.random() * empty.length)];
}

// ─── Game definition ──────────────────────────────────────────────────────────

gamesEngine.registerGame({
  gameId:      'ttt',
  name:        'Tic-Tac-Toe',
  description: 'Classic 3×3 board game — beat a friend or the bot',
  minPlayers:  1,
  maxPlayers:  2,
  timeout:     300_000, // 5 min
  rewards: {
    win:  { coins: 250, xp: 120 },
    lose: { coins:   0, xp:  30 },
    draw: { coins:  75, xp:  60 },
  },

  async onStart(session, ctx) {
    const { sock, msg } = ctx;
    const jid           = session.jid;
    const { b, vsBot, players } = session.state;
    const [p1, p2] = players;

    const header = vsBot
      ? `🤖 *Tic-Tac-Toe vs Bot*\n\nYou are *X*. Bot is *O*.`
      : `♟️ *Tic-Tac-Toe*\n\n@${p1.split('@')[0]} *(X)* vs @${p2.split('@')[0]} *(O)*`;

    await sock.sendMessage(jid, {
      text: `${header}\n\n${renderBoard(b)}\n\n⏳ *${p1.split('@')[0]}'s* turn — send a number 1–9`,
      mentions: vsBot ? [] : [p1, p2],
    }, { quoted: msg }).catch(() => {});
  },

  async onMove(session, input, ctx) {
    const { sock, msg } = ctx;
    const jid           = session.jid;
    const sender        = ctx.sender ?? msg?.key?.participant ?? msg?.key?.remoteJid;
    const { b, vsBot, players } = session.state;

    // Resign
    if (input === 'resign' || input === 'end') {
      await sock.sendMessage(jid, { text: '🏳️ Game resigned.' }, { quoted: msg }).catch(() => {});
      return { done: true, cancelled: true };
    }

    // Validate input
    if (!/^[1-9]$/.test(input)) return { done: false };

    // Turn check
    if (session.turn !== sender) {
      await sock.sendMessage(jid, { text: '⏳ Not your turn!' }, { quoted: msg }).catch(() => {});
      return { done: false };
    }

    const idx  = parseInt(input) - 1;
    if (b[idx]) {
      await sock.sendMessage(jid, { text: '❌ Cell already taken — pick another.' }, { quoted: msg }).catch(() => {});
      return { done: false };
    }

    const mark = players.indexOf(sender) === 0 ? 'X' : 'O';
    b[idx] = mark;

    if (checkWin(b, mark)) {
      const winName = msg?.pushName ?? sender.split('@')[0];
      await sock.sendMessage(jid, {
        text: `${renderBoard(b)}\n\n🎉 *${winName}* wins!\n🎁 +250 Coins, +120 XP`,
      }, { quoted: msg }).catch(() => {});
      return { done: true, winner: sender };
    }

    if (isDraw(b)) {
      await sock.sendMessage(jid, {
        text: `${renderBoard(b)}\n\n🤝 *Draw!*  +75 Coins, +60 XP each`,
      }, { quoted: msg }).catch(() => {});
      return { done: true, draw: true };
    }

    // Bot response (vsBot)
    if (vsBot) {
      const bi = botMove(b);
      b[bi] = 'O';

      if (checkWin(b, 'O')) {
        await sock.sendMessage(jid, {
          text: `${renderBoard(b)}\n\n🤖 Bot wins! Better luck next time.`,
        }, { quoted: msg }).catch(() => {});
        return { done: true, winners: [] };
      }
      if (isDraw(b)) {
        await sock.sendMessage(jid, {
          text: `${renderBoard(b)}\n\n🤝 *Draw!*  +75 Coins, +60 XP`,
        }, { quoted: msg }).catch(() => {});
        return { done: true, draw: true };
      }

      gameSessions_update(session, jid, { b });
      await sock.sendMessage(jid, {
        text: `${renderBoard(b)}\n\n⏳ Your turn *X* — send a number 1–9`,
      }, { quoted: msg }).catch(() => {});
    } else {
      session.nextTurn();
      gameSessions_update(session, jid, { b });
      const nextName = session.turn.split('@')[0];
      await sock.sendMessage(jid, {
        text: `${renderBoard(b)}\n\n⏳ *${nextName}'s* turn *(${mark === 'X' ? 'O' : 'X'})* — send a number 1–9`,
      }, { quoted: msg }).catch(() => {});
    }

    return { done: false };
  },
});

// Helper — update board state on the session object directly
function gameSessions_update(session, jid, patch) {
  session.state = { ...session.state, ...patch };
  session.updatedAt = Date.now();
}

// ─── Command Plugin ───────────────────────────────────────────────────────────

export default {
  name:        'ttt',
  aliases:     ['tictactoe', 'xo'],
  category:    'game',
  description: 'Play Tic-Tac-Toe vs another player or the bot',
  usage:       '.ttt @user | .ttt bot | .ttt <1-9> | .ttt resign | .ttt top',

  async execute({ sock, msg, args, sender, reply }) {
    const jid     = msg.key.remoteJid;
    const arg0    = (args[0] ?? '').toLowerCase();
    const session = gamesEngine.getSession(jid);

    // ── Leaderboard ────────────────────────────────────────────────────────────
    if (arg0 === 'top' || arg0 === 'leaderboard' || arg0 === 'lb') {
      await reply(formatLeaderboard('ttt', 'Tic-Tac-Toe'));
      return;
    }

    // ── Resign ────────────────────────────────────────────────────────────────
    if (arg0 === 'resign' || arg0 === 'end') {
      if (!session || session.gameId !== 'ttt') {
        await reply('❌ No active Tic-Tac-Toe game.');
        return;
      }
      await gamesEngine.routeInput(jid, 'resign', { sock, msg, sender });
      return;
    }

    // ── Move ──────────────────────────────────────────────────────────────────
    if (/^[1-9]$/.test(arg0) && session?.gameId === 'ttt') {
      await gamesEngine.routeInput(jid, arg0, { sock, msg, sender });
      return;
    }

    // ── Active session status ─────────────────────────────────────────────────
    if (session?.gameId === 'ttt') {
      const { b } = session.state;
      await reply(`${renderBoard(b)}\n\n⏳ Game in progress — send 1–9 to play, or *.ttt resign*`);
      return;
    }

    // ── Conflict with another game ────────────────────────────────────────────
    if (session) {
      await reply(`❌ Another game (*${session.gameId}*) is active here. End it first.`);
      return;
    }

    // ── Start vs Bot ──────────────────────────────────────────────────────────
    if (arg0 === 'bot' || arg0 === 'ai') {
      const b = Array(9).fill(null);
      await gamesEngine.startGame(
        jid, 'ttt', [sender, 'bot'],
        { b, vsBot: true, players: [sender, 'bot'] },
        { sock, msg },
      );
      return;
    }

    // ── Challenge another player ──────────────────────────────────────────────
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    if (mentioned.length) {
      if (!jid.endsWith('@g.us')) {
        await reply('❌ PvP only works in groups. Use *.ttt bot* to play solo.');
        return;
      }
      const opponent = mentioned[0];
      if (opponent === sender) { await reply('❌ You cannot challenge yourself.'); return; }
      const b = Array(9).fill(null);
      await gamesEngine.startGame(
        jid, 'ttt', [sender, opponent],
        { b, vsBot: false, players: [sender, opponent] },
        { sock, msg },
      );
      return;
    }

    // ── Help ──────────────────────────────────────────────────────────────────
    await reply(
      `♟️ *Tic-Tac-Toe*\n\n` +
      `*.ttt @user* — challenge a friend\n` +
      `*.ttt bot*   — play vs AI\n` +
      `*.ttt 1–9*   — make a move\n` +
      `*.ttt resign* — forfeit\n` +
      `*.ttt top*    — leaderboard`,
    );
  },
};
