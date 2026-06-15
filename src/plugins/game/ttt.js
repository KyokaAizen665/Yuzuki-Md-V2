/**
 * Plugin: ttt (Tic-Tac-Toe)
 * Category: game
 *
 * Two-player game via @mention challenge or AI opponent.
 * Commands:
 *   .ttt @user     — challenge another user (group only)
 *   .ttt bot       — play vs bot AI
 *   .ttt <1-9>     — make a move when a session is active
 *   .ttt resign    — forfeit the current game
 */

import { gameEngine }             from '../../lib/game-engine.js';
import { recordWin, recordLoss, recordDraw }   from '../../lib/game-store.js';

function board(b) {
  const s = i => b[i] || String(i + 1);
  return `\`\`\`\n${s(0)} │ ${s(1)} │ ${s(2)}\n──┼───┼──\n${s(3)} │ ${s(4)} │ ${s(5)}\n──┼───┼──\n${s(6)} │ ${s(7)} │ ${s(8)}\n\`\`\``;
}
const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function checkWin(b, p) { return WINS.some(([a,c,d]) => b[a]===p && b[c]===p && b[d]===p); }
function isDraw(b)      { return b.every(Boolean); }
function botMove(b) {
  const e = b.map((v,i) => v?null:i).filter(v=>v!==null);
  for (const i of e) { const t=[...b]; t[i]='O'; if(checkWin(t,'O')) return i; }
  for (const i of e) { const t=[...b]; t[i]='X'; if(checkWin(t,'X')) return i; }
  if (b[4]===null) return 4;
  return e[Math.floor(Math.random()*e.length)];
}

export default {
  name:        'ttt',
  aliases:     ['tictactoe', 'xo'],
  category:    'game',
  description: 'Play Tic-Tac-Toe vs another player or the bot',
  usage:       '.ttt @user | .ttt bot | .ttt <1-9> | .ttt resign',

  async execute({ sock, msg, reply, args, sender }) {
    const jid     = msg.key.remoteJid;
    const session = gameEngine.get(jid);
    const arg0    = (args[0] ?? '').toLowerCase();

    // ── Resign ────────────────────────────────────────────────────────────────
    if (arg0 === 'resign' || arg0 === 'end') {
      if (!session || session.gameId !== 'ttt') { await reply('❌ No active Tic-Tac-Toe game.'); return; }
      gameEngine.end(jid);
      await reply('🏳️ Game resigned.');
      return;
    }

    // ── Move (1–9) ────────────────────────────────────────────────────────────
    if (/^[1-9]$/.test(arg0) && session?.gameId === 'ttt') {
      const { b, players, vsBot } = session.state;
      const idx = parseInt(arg0) - 1;

      if (session.turn !== sender) { await reply(`⏳ Not your turn!`); return; }
      if (b[idx]) { await reply('❌ That cell is taken, pick another.'); return; }

      const mark = players.indexOf(sender) === 0 ? 'X' : 'O';
      b[idx] = mark;

      if (checkWin(b, mark)) {
        const name = msg.pushName ?? sender.split('@')[0];
        gameEngine.end(jid);
        recordWin(sender, 'ttt', name);
        if (!vsBot) recordLoss(session.players.find(p => p !== sender), 'ttt');
        await reply(`${board(b)}\n\n🎉 *${name}* wins!`);
        return;
      }
      if (isDraw(b)) {
        gameEngine.end(jid);
        for (const p of session.players) recordDraw(p, 'ttt');
        await reply(`${board(b)}\n\n🤝 Draw!`);
        return;
      }

      // Bot response
      if (vsBot) {
        const bi = botMove(b);
        b[bi] = 'O';
        if (checkWin(b, 'O')) {
          gameEngine.end(jid);
          recordLoss(sender, 'ttt');
          await reply(`${board(b)}\n\n🤖 Bot wins!`);
          return;
        }
        if (isDraw(b)) {
          gameEngine.end(jid);
          recordDraw(sender, 'ttt');
          await reply(`${board(b)}\n\n🤝 Draw!`);
          return;
        }
        gameEngine.update(jid, { b });
        await reply(`${board(b)}\n\n♟️ Your turn! *(X)* — send a number 1-9`);
      } else {
        const nextTurn = session.nextTurn();
        const nextName = nextTurn.split('@')[0];
        gameEngine.update(jid, { b });
        await reply(`${board(b)}\n\n⏳ *${nextName}'s* turn *(${mark==='X'?'O':'X'})*`);
      }
      return;
    }

    // ── Start vs Bot ──────────────────────────────────────────────────────────
    if (arg0 === 'bot' || arg0 === 'ai') {
      if (session) { await reply(`❌ Another game (${session.gameId}) is active. Use .${session.gameId} resign to cancel.`); return; }
      const newSession = gameEngine.create(jid, 'ttt', [sender, 'bot'], { b: Array(9).fill(null), vsBot: true, players: [sender, 'bot'] });
      await reply(`🤖 *Tic-Tac-Toe vs Bot*\n\n${board(newSession.state.b)}\n\nYou are *X*. Send a number 1-9 to place:`);
      return;
    }

    // ── Challenge another player ───────────────────────────────────────────────
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    if (mentioned.length) {
      if (!jid.endsWith('@g.us')) { await reply('❌ Player-vs-player only works in groups. Use .ttt bot for solo play.'); return; }
      if (session) { await reply(`❌ Another game (${session.gameId}) is active here.`); return; }
      const opponent   = mentioned[0];
      const newSession = gameEngine.create(jid, 'ttt', [sender, opponent], { b: Array(9).fill(null), vsBot: false, players: [sender, opponent] });
      await reply(`♟️ *Tic-Tac-Toe*\n@${sender.split('@')[0]} (X) vs @${opponent.split('@')[0]} (O)\n\n${board(newSession.state.b)}\n\n⏳ *${sender.split('@')[0]}'s* turn — send a number 1-9`);
      return;
    }

    // ── Help ──────────────────────────────────────────────────────────────────
    if (session?.gameId === 'ttt') {
      await reply(`${board(session.state.b)}\n\n⏳ Game in progress — send a number 1-9 to play, or *.ttt resign* to quit.`);
    } else {
      await reply(`♟️ *Tic-Tac-Toe*\n\n*.ttt @user* — challenge someone\n*.ttt bot*  — play vs AI\n*.ttt 1-9* — make a move`);
    }
  },
};
