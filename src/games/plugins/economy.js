/**
 * Game Plugin: Economy
 * Category: game
 *
 * Player economy hub — daily rewards, balance, coinflip, and transfers.
 * Wraps the core database economy (money, XP) in a game-friendly interface.
 *
 * Commands:
 *   .economy daily          — claim daily reward (500 coins + 100 XP)
 *   .economy balance        — check balance
 *   .economy coinflip <n>   — bet n coins on a coin flip (50/50)
 *   .economy give @user <n> — transfer coins to another user
 *   .economy top            — richest players leaderboard
 */

import { gamesEngine }  from '../engine.js';
import { getPlayerData, updatePlayerData, getGameData } from '../storage.js';
import {
  loadDB, saveDB,
  addXP, addCoins,
  initUserDB,
} from '../../lib/database.js';

const GAME_ID       = 'economy';
const DAILY_COINS   = 500;
const DAILY_XP      = 100;
const DAILY_COOL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Game definition (economy has no session-based gameplay) ──────────────────

gamesEngine.registerGame({
  gameId:      GAME_ID,
  name:        'Economy',
  description: 'Daily rewards, coinflip gambling, and player economy',
  minPlayers:  1,
  maxPlayers:  1,
  rewards: { win: { coins: 0, xp: 0 }, lose: { coins: 0, xp: 0 } },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBalance(jid) {
  try {
    const db = loadDB();
    return db.users?.[jid]?.money ?? 0;
  } catch { return 0; }
}

function spendCoins(jid, amount) {
  try {
    const db = loadDB();
    if (!db.users?.[jid]) return false;
    if ((db.users[jid].money ?? 0) < amount) return false;
    db.users[jid].money -= amount;
    saveDB(db);
    return true;
  } catch { return false; }
}

function getLastDaily(jid) {
  return getPlayerData(GAME_ID, jid).lastDaily ?? 0;
}

function recordDaily(jid) {
  updatePlayerData(GAME_ID, jid, { lastDaily: Date.now() });
}

function buildRichLeaderboard() {
  try {
    const db   = loadDB();
    const rows = Object.entries(db.users ?? {})
      .map(([jid, u]) => ({ jid, money: u.money ?? 0, name: u.name || jid.split('@')[0] }))
      .filter(r => r.money > 0)
      .sort((a, b) => b.money - a.money)
      .slice(0, 10);
    if (!rows.length) return '💰 No economy data yet.';
    const medals = ['🥇','🥈','🥉'];
    return ['💰 *Richest Players*\n',
      ...rows.map((r, i) => {
        const m = medals[i] ?? `${i + 1}.`;
        return `${m} *${r.name}*  —  ${r.money.toLocaleString()} coins`;
      }),
    ].join('\n');
  } catch { return '❌ Could not load economy data.'; }
}

// ─── Command Plugin ───────────────────────────────────────────────────────────

export default {
  name:        'economy',
  aliases:     ['eco', 'wallet'],
  category:    'game',
  description: 'Economy hub — daily reward, balance, coinflip, rich leaderboard',
  usage:       '.economy daily | .economy balance | .economy coinflip <amount> | .economy top',

  async execute({ msg, args, sender, reply }) {
    const jid  = msg.key.remoteJid;
    const name = msg.pushName ?? sender.split('@')[0];
    const arg0 = (args[0] ?? '').toLowerCase();

    // Ensure user exists in DB
    try { initUserDB(sender, name); } catch {}

    // ── Daily reward ──────────────────────────────────────────────────────────
    if (!arg0 || arg0 === 'daily') {
      const now     = Date.now();
      const last    = getLastDaily(sender);
      const elapsed = now - last;

      if (elapsed < DAILY_COOL_MS) {
        const remaining = DAILY_COOL_MS - elapsed;
        const h = Math.floor(remaining / 3_600_000);
        const m = Math.floor((remaining % 3_600_000) / 60_000);
        await reply(
          `⏳ Daily reward already claimed!\n` +
          `Come back in *${h}h ${m}m*.\n\n` +
          `💰 Current balance: *${getBalance(sender).toLocaleString()} coins*`,
        );
        return;
      }

      recordDaily(sender);
      try { addCoins(sender, DAILY_COINS); } catch {}
      try { addXP(sender,    DAILY_XP);   } catch {}

      await reply(
        `🎁 *Daily Reward Claimed!*\n\n` +
        `+${DAILY_COINS} coins\n` +
        `+${DAILY_XP} XP\n\n` +
        `💰 Balance: *${getBalance(sender).toLocaleString()} coins*`,
      );
      return;
    }

    // ── Balance ───────────────────────────────────────────────────────────────
    if (arg0 === 'balance' || arg0 === 'bal' || arg0 === 'money') {
      const bal = getBalance(sender);
      await reply(
        `💰 *${name}'s Balance*\n\n` +
        `Wallet: *${bal.toLocaleString()} coins*\n\n` +
        `_Use *.economy daily* to claim your daily reward._`,
      );
      return;
    }

    // ── Coinflip ──────────────────────────────────────────────────────────────
    if (arg0 === 'coinflip' || arg0 === 'cf' || arg0 === 'flip') {
      const amount = parseInt(args[1]);
      if (isNaN(amount) || amount < 1) {
        await reply('❌ Usage: *.economy coinflip <amount>*\nExample: *.economy coinflip 100*');
        return;
      }

      const bal = getBalance(sender);
      if (bal < amount) {
        await reply(
          `❌ Not enough coins!\n` +
          `You have *${bal.toLocaleString()}* coins but tried to bet *${amount.toLocaleString()}*.`,
        );
        return;
      }

      const win  = Math.random() < 0.5;
      const flip = ['🪙 Heads', '🪙 Tails'][Math.floor(Math.random() * 2)];

      if (win) {
        try { addCoins(sender, amount); } catch {}
        await reply(
          `${flip}\n\n` +
          `🎉 *You won the flip!*\n` +
          `+${amount.toLocaleString()} coins\n\n` +
          `💰 New balance: *${(bal + amount).toLocaleString()} coins*`,
        );
      } else {
        const spent = spendCoins(sender, amount);
        if (!spent) { await reply('❌ Transaction failed. Try again.'); return; }
        await reply(
          `${flip}\n\n` +
          `💀 *You lost the flip.*\n` +
          `-${amount.toLocaleString()} coins\n\n` +
          `💰 New balance: *${Math.max(0, bal - amount).toLocaleString()} coins*`,
        );
      }
      return;
    }

    // ── Give / Transfer ───────────────────────────────────────────────────────
    if (arg0 === 'give' || arg0 === 'send' || arg0 === 'transfer') {
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
      const target    = mentioned[0];
      const amount    = parseInt(args[2] ?? args[1]);

      if (!target || isNaN(amount) || amount < 1) {
        await reply('❌ Usage: *.economy give @user <amount>*');
        return;
      }
      if (target === sender) { await reply('❌ You cannot send coins to yourself.'); return; }

      const bal = getBalance(sender);
      if (bal < amount) {
        await reply(`❌ Not enough coins! You have *${bal.toLocaleString()}* coins.`);
        return;
      }

      const ok = spendCoins(sender, amount);
      if (!ok) { await reply('❌ Transfer failed.'); return; }
      try { addCoins(target, amount); } catch {}

      await reply(
        `✅ Sent *${amount.toLocaleString()} coins* to @${target.split('@')[0]}\n` +
        `💰 Your new balance: *${(bal - amount).toLocaleString()} coins*`,
        { mentions: [target] },
      );
      return;
    }

    // ── Leaderboard ───────────────────────────────────────────────────────────
    if (arg0 === 'top' || arg0 === 'rich' || arg0 === 'leaderboard' || arg0 === 'lb') {
      await reply(buildRichLeaderboard());
      return;
    }

    // ── Help ──────────────────────────────────────────────────────────────────
    await reply(
      `💰 *Economy Commands*\n\n` +
      `*.economy daily*            — claim 500 coins + 100 XP\n` +
      `*.economy balance*          — check your wallet\n` +
      `*.economy coinflip <n>*     — gamble coins (50/50)\n` +
      `*.economy give @user <n>*   — send coins to a friend\n` +
      `*.economy top*              — richest players`,
    );
  },
};
