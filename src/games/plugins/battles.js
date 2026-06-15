/**
 * Game Plugin: Battles
 * Category: game
 *
 * Turn-based PvP combat. Challenge another player or fight the bot.
 * Uses the Games Framework for sessions, leaderboard, and rewards.
 *
 * Commands:
 *   .battle @user   — challenge another player (group only)
 *   .battle bot     — fight the bot AI
 *   .battle attack  — deal normal damage
 *   .battle defend  — block and counter
 *   .battle special — powerful attack (lower accuracy)
 *   .battle flee    — forfeit the current battle
 *   .battle top     — leaderboard
 *   .battle status  — show current HP
 */

import { gamesEngine }       from '../engine.js';
import { formatLeaderboard } from '../leaderboard.js';

// ─── Combat constants ─────────────────────────────────────────────────────────

const MAX_HP = 100;

const MOVES = {
  attack:  { label: '⚔️ Attack',   dmgMin: 12, dmgMax: 25, accuracy: 0.90, block: 0    },
  defend:  { label: '🛡️ Defend',   dmgMin:  3, dmgMax: 10, accuracy: 1.00, block: 0.50 },
  special: { label: '✨ Special',  dmgMin: 22, dmgMax: 45, accuracy: 0.65, block: 0    },
};

const VALID_MOVES = new Set(['attack', 'defend', 'special', 'flee', 'status']);

function calcDamage(move, opponentBlocking) {
  if (Math.random() > move.accuracy) return null; // miss
  const raw    = move.dmgMin + Math.floor(Math.random() * (move.dmgMax - move.dmgMin + 1));
  const actual = opponentBlocking ? Math.max(1, Math.floor(raw * (1 - MOVES.defend.block))) : raw;
  return actual;
}

function hpBar(hp) {
  const filled = Math.round(hp / MAX_HP * 10);
  return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, 10 - filled));
}

function statusText(state, p1Name, p2Name) {
  return (
    `⚔️ *Battle Status*\n\n` +
    `${p1Name}: \`[${hpBar(state.hp[0])}]\` *${state.hp[0]}/${MAX_HP} HP*\n` +
    `${p2Name}: \`[${hpBar(state.hp[1])}]\` *${state.hp[1]}/${MAX_HP} HP*\n`
  );
}

// ─── Bot AI ───────────────────────────────────────────────────────────────────

function botChooseMove(opponentHp) {
  const r = Math.random();
  if (opponentHp > 60) {
    return r < 0.35 ? 'special' : r < 0.65 ? 'attack' : 'defend';
  } else if (opponentHp > 30) {
    return r < 0.50 ? 'special' : r < 0.75 ? 'attack' : 'defend';
  } else {
    return r < 0.60 ? 'special' : 'attack';
  }
}

// ─── Game definition ──────────────────────────────────────────────────────────

gamesEngine.registerGame({
  gameId:      'battles',
  name:        'Battles',
  description: 'Turn-based PvP combat — attack, defend, or use a special move',
  minPlayers:  1,
  maxPlayers:  2,
  timeout:     300_000, // 5 min
  rewards: {
    win:  { coins: 400, xp: 200 },
    lose: { coins:   0, xp:  50 },
    draw: { coins: 100, xp:  80 },
  },

  async onStart(session, ctx) {
    const { sock, msg } = ctx;
    const jid           = session.jid;
    const [p1, p2]      = session.players;
    const { state }     = session;
    const p1Name        = state.names?.[0] ?? p1.split('@')[0];
    const p2Name        = state.names?.[1] ?? (p2 === 'bot' ? '🤖 Bot' : p2.split('@')[0]);

    const header = p2 === 'bot'
      ? `🤖 *Battle vs Bot*\n\n${p1Name} *(you)* vs 🤖 Bot`
      : `⚔️ *Battle!*\n\n@${p1Name} vs @${p2Name}`;

    await sock.sendMessage(jid, {
      text:
        `${header}\n\n` +
        `${statusText(state, p1Name, p2Name)}\n` +
        `⏳ *${p1Name}'s* turn!\n\n` +
        `Moves: \`attack\` · \`defend\` · \`special\` · \`flee\``,
      mentions: p2 === 'bot' ? [p1] : [p1, p2],
    }, { quoted: msg }).catch(() => {});
  },

  async onMove(session, input, ctx) {
    const { sock, msg } = ctx;
    const jid           = session.jid;
    const sender        = ctx.sender ?? msg?.key?.participant ?? msg?.key?.remoteJid;

    const [p1, p2]  = session.players;
    const { state } = session;
    const p1Name    = state.names?.[0] ?? p1.split('@')[0];
    const p2Name    = state.names?.[1] ?? (p2 === 'bot' ? '🤖 Bot' : p2.split('@')[0]);
    const vsBot     = p2 === 'bot';

    const lo = input.toLowerCase().trim();

    // ── Status query ──────────────────────────────────────────────────────────
    if (lo === 'status') {
      await sock.sendMessage(jid, {
        text: statusText(state, p1Name, p2Name),
      }, { quoted: msg }).catch(() => {});
      return { done: false };
    }

    // ── Turn check ────────────────────────────────────────────────────────────
    if (session.turn !== sender) {
      await sock.sendMessage(jid, {
        text: `⏳ It's not your turn!`,
      }, { quoted: msg }).catch(() => {});
      return { done: false };
    }

    // ── Flee ─────────────────────────────────────────────────────────────────
    if (lo === 'flee' || lo === 'forfeit' || lo === 'surrender') {
      await sock.sendMessage(jid, {
        text: `🏳️ *${p1Name === p1.split('@')[0] ? sender.split('@')[0] : p2Name}* fled the battle!`,
      }, { quoted: msg }).catch(() => {});
      return { done: true, cancelled: true };
    }

    // ── Validate move ─────────────────────────────────────────────────────────
    if (!MOVES[lo]) {
      await sock.sendMessage(jid, {
        text: `❓ Unknown move. Use: \`attack\` · \`defend\` · \`special\` · \`flee\` · \`status\``,
      }, { quoted: msg }).catch(() => {});
      return { done: false };
    }

    // ── Resolve player move ───────────────────────────────────────────────────
    const attackerIdx  = session.players.indexOf(sender); // 0 or 1
    const defenderIdx  = 1 - attackerIdx;
    const move         = MOVES[lo];
    const defBlocking  = state.lastMove?.[defenderIdx] === 'defend';

    const dmg = calcDamage(move, defBlocking);
    const lines = [];

    if (dmg === null) {
      lines.push(`${move.label} *${(attackerIdx === 0 ? p1Name : p2Name)}* — ❌ *Missed!*`);
    } else {
      state.hp[defenderIdx] = Math.max(0, state.hp[defenderIdx] - dmg);
      const prefix = move === MOVES.defend ? '🛡️ Counter —' : `${move.label} —`;
      lines.push(`${prefix} *${dmg} damage* dealt!`);
    }

    // Track last move for blocking logic
    state.lastMove = state.lastMove ?? [null, null];
    state.lastMove[attackerIdx] = lo;

    // ── Check if defender is KO ───────────────────────────────────────────────
    if (state.hp[defenderIdx] <= 0) {
      const winner = session.players[attackerIdx];
      const loser  = session.players[defenderIdx];
      lines.push(
        `\n${statusText(state, p1Name, p2Name)}`,
        `🏆 *${attackerIdx === 0 ? p1Name : p2Name}* wins the battle!\n🎁 +400 Coins, +200 XP`,
      );
      await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg }).catch(() => {});
      return { done: true, winner };
    }

    // ── Bot counter-move ──────────────────────────────────────────────────────
    if (vsBot && session.turn === p1) {
      const botMoveName = botChooseMove(state.hp[0]);
      const botMove     = MOVES[botMoveName];
      const botDefBlk   = state.lastMove[0] === 'defend';
      const botDmg      = calcDamage(botMove, botDefBlk);

      state.lastMove[1] = botMoveName;

      if (botDmg === null) {
        lines.push(`🤖 Bot used ${botMove.label} — ❌ *Missed!*`);
      } else {
        state.hp[0] = Math.max(0, state.hp[0] - botDmg);
        lines.push(`🤖 Bot used ${botMove.label} — *${botDmg} damage*!`);
      }

      // Check if player KO'd by bot
      if (state.hp[0] <= 0) {
        lines.push(
          `\n${statusText(state, p1Name, p2Name)}`,
          `💀 *Bot wins!* Better luck next time.`,
        );
        await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg }).catch(() => {});
        return { done: true, winners: [] }; // bot win = player loss, no bot in reward list
      }

      // After bot moves, it's still the player's turn
      lines.push(`\n${statusText(state, p1Name, p2Name)}`);
      lines.push(`⏳ *Your turn!*  \`attack\` · \`defend\` · \`special\` · \`flee\``);
    } else {
      // PvP: advance turn
      session.nextTurn();
      const nextName = session.turn === p1 ? p1Name : p2Name;
      lines.push(`\n${statusText(state, p1Name, p2Name)}`);
      lines.push(`⏳ *${nextName}'s* turn!  \`attack\` · \`defend\` · \`special\` · \`flee\``);
    }

    // Persist mutated state
    session.state = state;

    await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg }).catch(() => {});
    return { done: false };
  },
});

// ─── Command Plugin ───────────────────────────────────────────────────────────

export default {
  name:        'battles',
  aliases:     ['battle', 'fight', 'duel'],
  category:    'game',
  description: 'Turn-based PvP combat — attack, defend, or use specials',
  usage:       '.battles @user | .battles bot | .battles attack | .battles top',

  async execute({ sock, msg, args, sender, reply }) {
    const jid     = msg.key.remoteJid;
    const arg0    = (args[0] ?? '').toLowerCase();
    const name    = msg.pushName ?? sender.split('@')[0];
    const session = gamesEngine.getSession(jid);

    // ── Leaderboard ───────────────────────────────────────────────────────────
    if (arg0 === 'top' || arg0 === 'lb' || arg0 === 'leaderboard') {
      await reply(formatLeaderboard('battles', 'Battles'));
      return;
    }

    // ── In-battle actions ─────────────────────────────────────────────────────
    if (session?.gameId === 'battles') {
      if (VALID_MOVES.has(arg0)) {
        await gamesEngine.routeInput(jid, arg0, { sock, msg, sender });
        return;
      }
      // Show board if no valid action
      const [p1, p2]  = session.players;
      const p1Name    = session.state.names?.[0] ?? p1.split('@')[0];
      const p2Name    = session.state.names?.[1] ?? (p2 === 'bot' ? '🤖 Bot' : p2.split('@')[0]);
      await reply(
        `${statusText(session.state, p1Name, p2Name)}\n` +
        `⏳ *${session.turn === p1 ? p1Name : p2Name}'s* turn.\n\n` +
        `Moves: \`attack\` · \`defend\` · \`special\` · \`flee\` · \`status\``,
      );
      return;
    }

    // ── Conflict with another game ────────────────────────────────────────────
    if (session) {
      await reply(`❌ Another game (*${session.gameId}*) is active here. End it first.`);
      return;
    }

    // ── Start vs Bot ──────────────────────────────────────────────────────────
    if (arg0 === 'bot' || arg0 === 'ai') {
      await gamesEngine.startGame(
        jid, 'battles', [sender, 'bot'],
        { hp: [MAX_HP, MAX_HP], names: [name, '🤖 Bot'], lastMove: [null, null] },
        { sock, msg },
      );
      return;
    }

    // ── Challenge another player ──────────────────────────────────────────────
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    if (mentioned.length) {
      if (!jid.endsWith('@g.us')) {
        await reply('❌ PvP battles only work in groups. Use *.battles bot* for solo play.');
        return;
      }
      const opponent     = mentioned[0];
      if (opponent === sender) { await reply('❌ You cannot battle yourself.'); return; }
      const opponentName = opponent.split('@')[0];
      await gamesEngine.startGame(
        jid, 'battles', [sender, opponent],
        { hp: [MAX_HP, MAX_HP], names: [name, opponentName], lastMove: [null, null] },
        { sock, msg },
      );
      return;
    }

    // ── Help ──────────────────────────────────────────────────────────────────
    await reply(
      `⚔️ *Battles*\n\n` +
      `*.battles @user* — challenge a player\n` +
      `*.battles bot*   — fight the bot AI\n\n` +
      `*In-battle moves:*\n` +
      `\`attack\`  — normal hit (12–25 dmg, 90% acc)\n` +
      `\`defend\`  — block + counter (reduces incoming dmg 50%)\n` +
      `\`special\` — heavy hit (22–45 dmg, 65% acc)\n` +
      `\`flee\`    — forfeit the battle\n` +
      `\`status\`  — show HP bars\n\n` +
      `*.battles top* — leaderboard`,
    );
  },
};
