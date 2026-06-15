/**
 * Items Registry
 *
 * Central catalog for all game items: fish, prey, ores, crops,
 * seeds, consumables. Also contains loot tables, crop definitions,
 * and the shop catalog.
 *
 * ─── Exports ──────────────────────────────────────────────────────────────────
 *   ITEMS          — Map<id, ItemDef>
 *   CROPS          — Map<cropId, CropDef>
 *   LOOT_TABLES    — Map<activity, WeightedEntry[]>
 *   SHOP_CATALOG   — { buy: ShopEntry[], sell: 'any' }
 *   getItem(id)    — ItemDef | null
 *   rollLoot(activity, count?) — ItemDrop[]
 *   formatItem(itemId, qty?) — string  (e.g. "🐟 Common Fish ×3")
 *   sellPrice(item) — number  (60% of base value)
 *   rarityStars(rarity) — string
 */

// ── Item definitions ──────────────────────────────────────────────────────────

export const ITEMS = {
  // ── Junk ────────────────────────────────────────────────────────────────────
  junk:        { id: 'junk',        name: 'Old Boot',       emoji: '🥾', value: 5,    rarity: 'junk',      type: 'misc'   },
  seaweed:     { id: 'seaweed',     name: 'Seaweed',        emoji: '🌿', value: 8,    rarity: 'junk',      type: 'misc'   },

  // ── Fish ────────────────────────────────────────────────────────────────────
  common_fish:   { id: 'common_fish',   name: 'Common Fish',   emoji: '🐟', value: 30,   rarity: 'common',    type: 'fish' },
  small_fish:    { id: 'small_fish',    name: 'Pufferfish',    emoji: '🐡', value: 45,   rarity: 'common',    type: 'fish' },
  tropical_fish: { id: 'tropical_fish', name: 'Tropical Fish', emoji: '🐠', value: 85,   rarity: 'uncommon',  type: 'fish' },
  crab:          { id: 'crab',          name: 'Crab',          emoji: '🦀', value: 110,  rarity: 'uncommon',  type: 'fish' },
  shrimp:        { id: 'shrimp',        name: 'Shrimp',        emoji: '🦐', value: 90,   rarity: 'uncommon',  type: 'fish' },
  lobster:       { id: 'lobster',       name: 'Lobster',       emoji: '🦞', value: 175,  rarity: 'rare',      type: 'fish' },
  octopus:       { id: 'octopus',       name: 'Octopus',       emoji: '🐙', value: 225,  rarity: 'rare',      type: 'fish' },
  shark:         { id: 'shark',         name: 'Shark',         emoji: '🦈', value: 400,  rarity: 'epic',      type: 'fish' },
  golden_fish:   { id: 'golden_fish',   name: 'Golden Fish',   emoji: '🌟', value: 600,  rarity: 'legendary', type: 'fish' },
  pearl:         { id: 'pearl',         name: 'Pearl',         emoji: '🫧', value: 900,  rarity: 'mythic',    type: 'fish' },

  // ── Prey (hunting) ──────────────────────────────────────────────────────────
  feathers:     { id: 'feathers',     name: 'Feathers',      emoji: '🪶', value: 15,   rarity: 'junk',      type: 'prey' },
  rabbit:       { id: 'rabbit',       name: 'Rabbit',        emoji: '🐰', value: 60,   rarity: 'common',    type: 'prey' },
  fox_pelt:     { id: 'fox_pelt',     name: 'Fox Pelt',      emoji: '🦊', value: 90,   rarity: 'uncommon',  type: 'prey' },
  deer_antler:  { id: 'deer_antler',  name: 'Deer Antler',   emoji: '🦌', value: 140,  rarity: 'uncommon',  type: 'prey' },
  boar_tusk:    { id: 'boar_tusk',    name: 'Boar Tusk',     emoji: '🐗', value: 185,  rarity: 'rare',      type: 'prey' },
  wolf_pelt:    { id: 'wolf_pelt',    name: 'Wolf Pelt',     emoji: '🐺', value: 280,  rarity: 'rare',      type: 'prey' },
  bear_hide:    { id: 'bear_hide',    name: 'Bear Hide',     emoji: '🐻', value: 450,  rarity: 'epic',      type: 'prey' },
  dragon_scale: { id: 'dragon_scale', name: 'Dragon Scale',  emoji: '🐉', value: 1200, rarity: 'mythic',    type: 'prey' },

  // ── Ores (mining) ───────────────────────────────────────────────────────────
  stone:         { id: 'stone',         name: 'Stone',          emoji: '🪨', value: 8,    rarity: 'junk',      type: 'ore' },
  coal:          { id: 'coal',          name: 'Coal',           emoji: '⬛', value: 20,   rarity: 'common',    type: 'ore' },
  iron_ore:      { id: 'iron_ore',      name: 'Iron Ore',       emoji: '⚙️',  value: 45,   rarity: 'common',    type: 'ore' },
  copper_ore:    { id: 'copper_ore',    name: 'Copper Ore',     emoji: '🔶', value: 70,   rarity: 'uncommon',  type: 'ore' },
  silver_ore:    { id: 'silver_ore',    name: 'Silver Ore',     emoji: '🥈', value: 110,  rarity: 'uncommon',  type: 'ore' },
  gold_ore:      { id: 'gold_ore',      name: 'Gold Ore',       emoji: '🥇', value: 220,  rarity: 'rare',      type: 'ore' },
  sapphire:      { id: 'sapphire',      name: 'Sapphire',       emoji: '💎', value: 550,  rarity: 'epic',      type: 'ore' },
  ruby:          { id: 'ruby',          name: 'Ruby',           emoji: '❤️',  value: 800,  rarity: 'epic',      type: 'ore' },
  diamond:       { id: 'diamond',       name: 'Diamond',        emoji: '💍', value: 1200, rarity: 'legendary', type: 'ore' },
  mystic_crystal:{ id: 'mystic_crystal',name: 'Mystic Crystal', emoji: '🔮', value: 2500, rarity: 'mythic',    type: 'ore' },

  // ── Harvested crops ──────────────────────────────────────────────────────────
  wheat:       { id: 'wheat',       name: 'Wheat',       emoji: '🌾', value: 80,  rarity: 'common',   type: 'crop' },
  carrot:      { id: 'carrot',      name: 'Carrot',      emoji: '🥕', value: 120, rarity: 'common',   type: 'crop' },
  tomato:      { id: 'tomato',      name: 'Tomato',      emoji: '🍅', value: 185, rarity: 'uncommon', type: 'crop' },
  corn:        { id: 'corn',        name: 'Corn',        emoji: '🌽', value: 240, rarity: 'uncommon', type: 'crop' },
  strawberry:  { id: 'strawberry',  name: 'Strawberry',  emoji: '🍓', value: 330, rarity: 'rare',     type: 'crop' },
  sunflower:   { id: 'sunflower',   name: 'Sunflower',   emoji: '🌻', value: 470, rarity: 'rare',     type: 'crop' },

  // ── Seeds (buyable) ──────────────────────────────────────────────────────────
  wheat_seed:      { id: 'wheat_seed',      name: 'Wheat Seed',      emoji: '🌾', value: 25,  rarity: 'common', type: 'seed' },
  carrot_seed:     { id: 'carrot_seed',     name: 'Carrot Seed',     emoji: '🥕', value: 35,  rarity: 'common', type: 'seed' },
  tomato_seed:     { id: 'tomato_seed',     name: 'Tomato Seed',     emoji: '🍅', value: 55,  rarity: 'common', type: 'seed' },
  corn_seed:       { id: 'corn_seed',       name: 'Corn Seed',       emoji: '🌽', value: 70,  rarity: 'common', type: 'seed' },
  strawberry_seed: { id: 'strawberry_seed', name: 'Strawberry Seed', emoji: '🍓', value: 100, rarity: 'uncommon', type: 'seed' },
  sunflower_seed:  { id: 'sunflower_seed',  name: 'Sunflower Seed',  emoji: '🌻', value: 130, rarity: 'uncommon', type: 'seed' },

  // ── Consumables ──────────────────────────────────────────────────────────────
  health_potion: { id: 'health_potion', name: 'Health Potion', emoji: '🧪', value: 100, rarity: 'common',   type: 'consumable' },
  xp_scroll:     { id: 'xp_scroll',    name: 'XP Scroll',     emoji: '📜', value: 180, rarity: 'uncommon', type: 'consumable' },
};

// ── Crop definitions ──────────────────────────────────────────────────────────

export const CROPS = {
  wheat:      { id: 'wheat',      name: 'Wheat',      emoji: '🌾', seedId: 'wheat_seed',      growMs: 45  * 60000, harvestId: 'wheat'      },
  carrot:     { id: 'carrot',     name: 'Carrot',     emoji: '🥕', seedId: 'carrot_seed',     growMs: 60  * 60000, harvestId: 'carrot'     },
  tomato:     { id: 'tomato',     name: 'Tomato',     emoji: '🍅', seedId: 'tomato_seed',     growMs: 90  * 60000, harvestId: 'tomato'     },
  corn:       { id: 'corn',       name: 'Corn',       emoji: '🌽', seedId: 'corn_seed',       growMs: 120 * 60000, harvestId: 'corn'       },
  strawberry: { id: 'strawberry', name: 'Strawberry', emoji: '🍓', seedId: 'strawberry_seed', growMs: 180 * 60000, harvestId: 'strawberry' },
  sunflower:  { id: 'sunflower',  name: 'Sunflower',  emoji: '🌻', seedId: 'sunflower_seed',  growMs: 240 * 60000, harvestId: 'sunflower'  },
};

// Map seed IDs → crop for planting lookup
export const SEED_TO_CROP = Object.fromEntries(
  Object.values(CROPS).map(c => [c.seedId, c]),
);

// ── Loot tables ───────────────────────────────────────────────────────────────

export const LOOT_TABLES = {
  fishing: [
    { weight: 15, item: 'junk',          qty: 1 },
    { weight: 10, item: 'seaweed',        qty: 1 },
    { weight: 28, item: 'common_fish',    qty: 1 },
    { weight: 18, item: 'small_fish',     qty: 1 },
    { weight: 12, item: 'tropical_fish',  qty: 1 },
    { weight: 7,  item: 'crab',           qty: 1 },
    { weight: 5,  item: 'shrimp',         qty: 1 },
    { weight: 3,  item: 'lobster',        qty: 1 },
    { weight: 1.5,item: 'octopus',        qty: 1 },
    { weight: 0.4,item: 'shark',          qty: 1 },
    { weight: 0.08,item:'golden_fish',    qty: 1 },
    { weight: 0.02,item:'pearl',          qty: 1 },
  ],
  hunting: [
    { weight: 20, item: 'feathers',    qty: 3 },
    { weight: 28, item: 'rabbit',      qty: 1 },
    { weight: 18, item: 'fox_pelt',    qty: 1 },
    { weight: 14, item: 'deer_antler', qty: 1 },
    { weight: 9,  item: 'boar_tusk',   qty: 1 },
    { weight: 6,  item: 'wolf_pelt',   qty: 1 },
    { weight: 3.5,item: 'bear_hide',   qty: 1 },
    { weight: 1.5,item: 'dragon_scale',qty: 1 },
  ],
  mining: [
    { weight: 20, item: 'stone',          qty: 3 },
    { weight: 24, item: 'coal',           qty: 2 },
    { weight: 20, item: 'iron_ore',       qty: 1 },
    { weight: 13, item: 'copper_ore',     qty: 1 },
    { weight: 9,  item: 'silver_ore',     qty: 1 },
    { weight: 7,  item: 'gold_ore',       qty: 1 },
    { weight: 3.5,item: 'sapphire',       qty: 1 },
    { weight: 2,  item: 'ruby',           qty: 1 },
    { weight: 1,  item: 'diamond',        qty: 1 },
    { weight: 0.5,item: 'mystic_crystal', qty: 1 },
  ],
};

// ── Shop catalog ──────────────────────────────────────────────────────────────

export const SHOP_CATALOG = [
  { itemId: 'wheat_seed',      price: 25,  category: 'Seeds'        },
  { itemId: 'carrot_seed',     price: 35,  category: 'Seeds'        },
  { itemId: 'tomato_seed',     price: 55,  category: 'Seeds'        },
  { itemId: 'corn_seed',       price: 70,  category: 'Seeds'        },
  { itemId: 'strawberry_seed', price: 100, category: 'Seeds'        },
  { itemId: 'sunflower_seed',  price: 130, category: 'Seeds'        },
  { itemId: 'health_potion',   price: 80,  category: 'Consumables'  },
  { itemId: 'xp_scroll',       price: 150, category: 'Consumables'  },
];

// ── Utility ───────────────────────────────────────────────────────────────────

/** @returns {import('./items.js').ItemDef | null} */
export function getItem(id) { return ITEMS[id] ?? null; }

/** @returns {string} */
export function formatItem(itemId, qty = null) {
  const it = ITEMS[itemId];
  if (!it) return `❓ ${itemId}`;
  return qty != null ? `${it.emoji} ${it.name} ×${qty}` : `${it.emoji} ${it.name}`;
}

/** Sell price = 60% of base value (floor). */
export function sellPrice(itemId) {
  const it = ITEMS[itemId];
  return it ? Math.max(1, Math.floor(it.value * 0.6)) : 0;
}

const RARITY_STARS = {
  junk: '⬜', common: '🟩', uncommon: '🟦', rare: '🟪', epic: '🟧', legendary: '🌟', mythic: '🔴',
};
const RARITY_LABEL = {
  junk: 'Junk', common: 'Common', uncommon: 'Uncommon', rare: 'Rare',
  epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic',
};

export function rarityIcon(rarity) { return RARITY_STARS[rarity] ?? '⬜'; }
export function rarityLabel(rarity) { return RARITY_LABEL[rarity] ?? rarity; }

/** Roll one drop from a named loot table. */
export function rollLoot(activity) {
  const { weightedRandom } = { weightedRandom: (tbl) => {
    const total = tbl.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const e of tbl) { r -= e.weight; if (r <= 0) return e; }
    return tbl[tbl.length - 1];
  }};
  const table = LOOT_TABLES[activity];
  if (!table) return null;
  const entry = weightedRandom(table);
  return { ...ITEMS[entry.item], qty: entry.qty ?? 1 };
}

/** Roll multiple drops, returning an array. */
export function rollLoots(activity, count = 1) {
  return Array.from({ length: count }, () => rollLoot(activity)).filter(Boolean);
}
