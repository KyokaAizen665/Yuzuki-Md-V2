/**
 * Game Plugin: Fishing
 * Category: game
 *
 * Economy game — cast your rod and catch fish for coins.
 * Fish are stored in a persistent inventory and can be sold.
 *
 * Commands:
 *   .fishing          — cast the rod (30s cooldown)
 *   .fishing bag      — view fish inventory
 *   .fishing sell     — sell all fish for coins
 *   .fishing top      — leaderboard (most total fish caught)
 *   .fishing info     — rarity guide
 */

import { gamesEngine }    from '../engine.js';
import { getPlayerData, updatePlayerData, getGameData } from '../storage.js';
import { addCoins }       from '../../lib/database.js';

const GAME_ID     = 'fishing';
const COOLDOWN_MS = 30_000; // 30 seconds between casts

// ─── Fish catalogue ───────────────────────────────────────────────────────────
// weight = relative probability

const FISH_TABLE = [
  { id: 'nothing',   name: '🌿 Seaweed',      rarity: 'junk',      coins: 0,    weight: 18 },
  { id: 'boot',      name: '👟 Old Boot',      rarity: 'junk',      coins: 2,    weight: 10 },
  { id: 'sardine',   name: '🐟 Sardine',       rarity: 'common',    coins: 15,   weight: 28 },
  { id: 'bass',      name: '🎣 Bass',          rarity: 'common',    coins: 25,   weight: 20 },
  { id: 'trout',     name: '🐠 Trout',         rarity: 'uncommon',  coins: 60,   weight: 12 },
  { id: 'salmon',    name: '🐡 Salmon',        rarity: 'uncommon',  coins: 90,   weight:  7 },
  { id: 'swordfish', name: '⚔️ Swordfish',     rarity: 'rare',      coins: 250,  weight:  3 },
  { id: 'shark',     name: '🦈 Shark',         rarity: 'epic',      coins: 600,  weight:  1.5 },
  { id: 'whale',     name: '🐋 Blue Whale',    rarity: 'legendary', coins: 2500, weight:  0.5 },
];

const TOTAL_WEIGHT = FISH_TABLE.reduce((s, f) => s + f.weight, 0);

const RARITY_COLOURS = {
  junk:      '⬛',
  common:    '⬜',
  uncommon:  '🟩',
  rare:      '🟦',
  epic:      '🟪',
  legendary: '🟨',
};

function rollFish() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const fish of FISH_TABLE) {
    r -= fish.weight;
    if (r <= 0) return fish;
  }
  return FISH_TABLE[FISH_TABLE.length - 1];
}

// ─── Game definition ──────────────────────────────────────────────────────────

// Fishing is a single-shot action (no multi-turn session),
// so we register a minimal definition for leaderboard integration only.
gamesEngine.registerGame({
  gameId:      GAME_ID,
  name:        'Fishing',
  description: 'Cast your rod and collect fish to sell for coins',
  minPlayers:  1,
  maxPlayers:  1,
  // No onMove/onStart hooks needed — fishing is handled entirely in execute()
  rewards: {
    win:  { coins: 0, xp: 0 }, // coins granted directly from fish value
    lose: { coins: 0, xp: 0 },
  },
});

// ─── Utility ─────────────────────────────────────────────────────────────────

function getInventory(jid) {
  return getPlayerData(GAME_ID, jid).inventory ?? [];
}

function getTotalCaught(jid) {
  return getPlayerData(GAME_ID, jid).totalCaught ?? 0;
}

function getLastFished(jid) {
  return getPlayerData(GAME_ID, jid).lastFished ?? 0;
}

function addToInventory(jid, fish) {
  const data      = getPlayerData(GAME_ID, jid);
  const inventory = data.inventory ?? [];
  inventory.push({ ...fish, caughtAt: Date.now() });
  updatePlayerData(GAME_ID, jid, {
    inventory,
    totalCaught: (data.totalCaught ?? 0) + 1,
    lastFished:  Date.now(),
  });
}

function clearInventory(jid) {
  updatePlayerData(GAME_ID, jid, { inventory: [], lastFished: Date.now() });
}

function formatInventory(inventory) {
  if (!inventory.length) return '_Your bag is empty. Go fishing!_';
  const counts = {};
  for (const f of inventory) {
    if (!counts[f.id]) counts[f.id] = { fish: f, count: 0 };
    counts[f.id].count++;
  }
  const lines = [];
  let totalValue = 0;
  for (const { fish, count } of Object.values(counts)) {
    const val = fish.coins * count;
    totalValue += val;
    lines.push(`${RARITY_COLOURS[fish.rarity]} ${fish.name} ×${count}  _(${val} coins)_`);
  }
  lines.push(`\n💰 Total value: *${totalValue} coins*`);
  return lines.join('\n');
}

function buildLeaderboard() {
  const all  = getGameData(GAME_ID);
  const rows = Object.entries(all)
    .map(([jid, d]) => ({ jid, totalCaught: d.totalCaught ?? 0 }))
    .filter(r => r.totalCaught > 0)
    .sort((a, b) => b.totalCaught - a.totalCaught)
    .slice(0, 10);
  if (!rows.length) return '🎣 No fishing records yet.';
  const medals = ['🥇','🥈','🥉'];
  return ['🎣 *Fishing Leaderboard* _(most fish caught)_\n',
    ...rows.map((r, i) => {
      const m = medals[i] ?? `${i + 1}.`;
      return `${m} ${r.jid.split('@')[0]}  —  *${r.totalCaught}* fish`;
    }),
  ].join('\n');
}

// ─── Command Plugin ───────────────────────────────────────────────────────────

export default {
  name:        'fishing',
  aliases:     ['fish'],
  category:    'game',
  description: 'Cast your rod, catch fish, and sell them for coins',
  usage:       '.fishing | .fishing bag | .fishing sell | .fishing top',

  async execute({ msg, args, sender, reply }) {
    const arg0 = (args[0] ?? '').toLowerCase();

    // ── Bag (inventory) ───────────────────────────────────────────────────────
    if (arg0 === 'bag' || arg0 === 'inv' || arg0 === 'inventory') {
      const inv = getInventory(sender);
      await reply(
        `🎒 *Your Fishing Bag*\n` +
        `Total caught: *${getTotalCaught(sender)}*\n\n` +
        formatInventory(inv),
      );
      return;
    }

    // ── Sell ──────────────────────────────────────────────────────────────────
    if (arg0 === 'sell') {
      const inv = getInventory(sender);
      if (!inv.length) { await reply('🎒 Your bag is empty — nothing to sell!'); return; }
      const total = inv.reduce((s, f) => s + (f.coins ?? 0), 0);
      clearInventory(sender);
      try { addCoins(sender, total); } catch {}
      await reply(`💰 Sold *${inv.length}* fish for *${total} coins*!`);
      return;
    }

    // ── Leaderboard ───────────────────────────────────────────────────────────
    if (arg0 === 'top' || arg0 === 'lb' || arg0 === 'leaderboard') {
      await reply(buildLeaderboard());
      return;
    }

    // ── Info (rarity guide) ───────────────────────────────────────────────────
    if (arg0 === 'info' || arg0 === 'guide') {
      const lines = ['🎣 *Fish Rarity Guide*\n'];
      for (const f of FISH_TABLE) {
        if (f.coins === 0) continue;
        lines.push(`${RARITY_COLOURS[f.rarity]} ${f.name}  —  *${f.coins} coins*`);
      }
      await reply(lines.join('\n'));
      return;
    }

    // ── Cast (main action) ────────────────────────────────────────────────────
    const now      = Date.now();
    const lastTime = getLastFished(sender);
    const elapsed  = now - lastTime;

    if (elapsed < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      await reply(`⏳ Your rod is still cooling down — wait *${remaining}s* before casting again.`);
      return;
    }

    // Suspense delay
    await reply('🎣 *Casting your line…*');

    await new Promise(r => setTimeout(r, 1500));

    const fish = rollFish();
    addToInventory(sender, fish);

    if (fish.id === 'nothing') {
      await reply(
        `🌿 You pulled up some *Seaweed*!\n` +
        `_Nothing worth keeping. Try again in ${COOLDOWN_MS / 1000}s._`,
      );
      return;
    }

    const rarityLabel = fish.rarity.charAt(0).toUpperCase() + fish.rarity.slice(1);
    await reply(
      `${RARITY_COLOURS[fish.rarity]} *You caught a ${fish.name}!*\n\n` +
      `Rarity: *${rarityLabel}*\n` +
      `Value:  *${fish.coins} coins*\n\n` +
      `_Added to bag. Use *.fishing sell* to cash out._`,
    );
  },
};
