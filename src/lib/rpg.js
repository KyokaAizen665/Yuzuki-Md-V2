/**
 * RPG System
 *
 * Covers rank progression, achievements, and daily quests.
 *
 * ─── Exports ──────────────────────────────────────────────────────────────────
 *   RANKS                          — rank tier definitions
 *   ACHIEVEMENTS                   — all achievement definitions
 *   DAILY_QUESTS                   — daily quest definitions (resets at midnight)
 *   getRankInfo(level)             — RankDef for a given level
 *   xpToNext(level)                — XP needed to reach level+1
 *   xpBar(exp, level, width?)      — unicode XP progress bar string
 *   checkAchievements(jid, dbUser, gameUser) → string[]  (newly unlocked ids)
 *   getDailyQuestDisplay(questState) → QuestDisplayItem[]
 *   claimQuest(jid, questId, questState) → { reward, questState } | null
 */

import { unlockAchievement } from './games-db.js';

// ── Rank tiers ────────────────────────────────────────────────────────────────

export const RANKS = [
  { id: 'newbie',      name: 'Newbie',      icon: '🌱', min: 0,   max: 4   },
  { id: 'apprentice',  name: 'Apprentice',  icon: '🥉', min: 5,   max: 9   },
  { id: 'adventurer',  name: 'Adventurer',  icon: '🥈', min: 10,  max: 19  },
  { id: 'warrior',     name: 'Warrior',     icon: '🥇', min: 20,  max: 29  },
  { id: 'hero',        name: 'Hero',        icon: '💫', min: 30,  max: 39  },
  { id: 'champion',    name: 'Champion',    icon: '⚡', min: 40,  max: 49  },
  { id: 'elite',       name: 'Elite',       icon: '🌟', min: 50,  max: 74  },
  { id: 'legend',      name: 'Legend',      icon: '👑', min: 75,  max: 99  },
  { id: 'immortal',    name: 'Immortal',    icon: '🔱', min: 100, max: Infinity },
];

export function getRankInfo(level) {
  return RANKS.find(r => level >= r.min && level <= r.max) ?? RANKS[0];
}

// ── XP helpers ────────────────────────────────────────────────────────────────

export function xpToNext(level) {
  return (level + 1) * 100;
}

/** Unicode block XP progress bar. */
export function xpBar(exp, level, width = 10) {
  const need  = xpToNext(level);
  const pct   = Math.min(exp / need, 1);
  const fill  = Math.round(pct * width);
  const empty = width - fill;
  return `[${'█'.repeat(fill)}${'░'.repeat(empty)}] ${exp}/${need}`;
}

// ── Achievement definitions ───────────────────────────────────────────────────

export const ACHIEVEMENTS = {
  // Fishing
  first_fish:    { id: 'first_fish',   emoji: '🎣', name: 'First Cast',      desc: 'Catch your first fish',               reward: 50  },
  fisher_10:     { id: 'fisher_10',    emoji: '🐟', name: 'Weekend Angler',  desc: 'Catch 10 fish',                       reward: 100 },
  fisher_50:     { id: 'fisher_50',    emoji: '🐠', name: 'Sea Hunter',      desc: 'Catch 50 fish',                       reward: 300 },
  fisher_100:    { id: 'fisher_100',   emoji: '🦈', name: 'Ocean Master',    desc: 'Catch 100 fish',                      reward: 600 },

  // Hunting
  first_hunt:    { id: 'first_hunt',   emoji: '🏹', name: 'First Hunt',      desc: 'Hunt for the first time',             reward: 50  },
  hunter_10:     { id: 'hunter_10',    emoji: '🐰', name: 'Tracker',         desc: 'Hunt 10 times',                       reward: 100 },
  hunter_50:     { id: 'hunter_50',    emoji: '🦌', name: 'Ranger',          desc: 'Hunt 50 times',                       reward: 300 },
  hunter_100:    { id: 'hunter_100',   emoji: '🐺', name: 'Apex Predator',   desc: 'Hunt 100 times',                      reward: 600 },

  // Mining
  first_mine:    { id: 'first_mine',   emoji: '⛏️',  name: 'First Strike',   desc: 'Mine for the first time',             reward: 50  },
  miner_10:      { id: 'miner_10',     emoji: '🪨', name: 'Digger',          desc: 'Mine 10 times',                       reward: 100 },
  miner_50:      { id: 'miner_50',     emoji: '⚙️',  name: 'Shaft Worker',   desc: 'Mine 50 times',                       reward: 300 },
  miner_100:     { id: 'miner_100',    emoji: '💎', name: 'Gem Hunter',      desc: 'Mine 100 times',                      reward: 600 },

  // Farming
  first_harvest: { id: 'first_harvest',emoji: '🌱', name: 'Green Thumb',    desc: 'Harvest your first crop',             reward: 50  },
  farmer_10:     { id: 'farmer_10',    emoji: '🥕', name: 'Farmhand',        desc: 'Harvest 10 crops',                    reward: 100 },
  farmer_50:     { id: 'farmer_50',    emoji: '🌾', name: 'Farmer',          desc: 'Harvest 50 crops',                    reward: 300 },
  farmer_100:    { id: 'farmer_100',   emoji: '🌻', name: 'Harvest King',    desc: 'Harvest 100 crops',                   reward: 600 },

  // Battle
  first_win:     { id: 'first_win',    emoji: '⚔️',  name: 'First Blood',    desc: 'Win your first battle',               reward: 100 },
  champion_10:   { id: 'champion_10',  emoji: '🛡️',  name: 'Fighter',        desc: 'Win 10 battles',                      reward: 350 },
  champion_50:   { id: 'champion_50',  emoji: '👑', name: 'Warlord',         desc: 'Win 50 battles',                      reward: 1000},

  // Economy
  rich:          { id: 'rich',         emoji: '💰', name: 'Rich',            desc: 'Accumulate 10,000 coins',             reward: 500 },
  very_rich:     { id: 'very_rich',    emoji: '💎', name: 'Wealthy',         desc: 'Accumulate 100,000 coins',            reward: 2000},

  // Progression
  level_5:       { id: 'level_5',      emoji: '⭐', name: 'Rising Star',     desc: 'Reach level 5',                       reward: 150 },
  level_10:      { id: 'level_10',     emoji: '🔥', name: 'Veteran',         desc: 'Reach level 10',                      reward: 300 },
  level_25:      { id: 'level_25',     emoji: '💫', name: 'Elite',           desc: 'Reach level 25',                      reward: 750 },
  level_50:      { id: 'level_50',     emoji: '👑', name: 'Legend',          desc: 'Reach level 50',                      reward: 2000},

  // Daily
  daily_7:       { id: 'daily_7',      emoji: '📅', name: 'Devoted',         desc: 'Claim daily rewards 7 days in a row', reward: 400 },
  daily_30:      { id: 'daily_30',     emoji: '🗓️',  name: 'Dedicated',      desc: 'Claim daily rewards 30 days straight',reward: 2000},

  // Quests
  quest_10:      { id: 'quest_10',     emoji: '📋', name: 'Quester',         desc: 'Complete 10 quests',                  reward: 350 },
  quest_50:      { id: 'quest_50',     emoji: '📜', name: 'Questmaster',     desc: 'Complete 50 quests',                  reward: 1500},
};

// ── Achievement check ─────────────────────────────────────────────────────────

/**
 * Check if any new achievements should be unlocked.
 * @param {string} jid           — sender JID
 * @param {object} dbUser        — user record from database.js
 * @param {object} gameUser      — user record from games-db.js
 * @returns {Array<import('./rpg.js').AchievementDef>}  newly unlocked
 */
export function checkAchievements(jid, dbUser, gameUser) {
  const s     = gameUser.stats ?? {};
  const money = dbUser?.money ?? 0;
  const level = dbUser?.level ?? 0;
  const streak = gameUser.dailyStreak ?? 0;

  const conditions = [
    ['first_fish',    s.fishCount    >= 1],
    ['fisher_10',     s.fishCount    >= 10],
    ['fisher_50',     s.fishCount    >= 50],
    ['fisher_100',    s.fishCount    >= 100],
    ['first_hunt',    s.huntCount    >= 1],
    ['hunter_10',     s.huntCount    >= 10],
    ['hunter_50',     s.huntCount    >= 50],
    ['hunter_100',    s.huntCount    >= 100],
    ['first_mine',    s.mineCount    >= 1],
    ['miner_10',      s.mineCount    >= 10],
    ['miner_50',      s.mineCount    >= 50],
    ['miner_100',     s.mineCount    >= 100],
    ['first_harvest', s.harvestCount >= 1],
    ['farmer_10',     s.harvestCount >= 10],
    ['farmer_50',     s.harvestCount >= 50],
    ['farmer_100',    s.harvestCount >= 100],
    ['first_win',     s.battlesWon   >= 1],
    ['champion_10',   s.battlesWon   >= 10],
    ['champion_50',   s.battlesWon   >= 50],
    ['rich',          money          >= 10000],
    ['very_rich',     money          >= 100000],
    ['level_5',       level          >= 5],
    ['level_10',      level          >= 10],
    ['level_25',      level          >= 25],
    ['level_50',      level          >= 50],
    ['daily_7',       streak         >= 7],
    ['daily_30',      streak         >= 30],
    ['quest_10',      s.questsDone   >= 10],
    ['quest_50',      s.questsDone   >= 50],
  ];

  const unlocked = [];
  for (const [id, met] of conditions) {
    if (met && unlockAchievement(jid, id)) {
      unlocked.push(ACHIEVEMENTS[id]);
    }
  }
  return unlocked;
}

// ── Daily quests ──────────────────────────────────────────────────────────────

export const DAILY_QUESTS = [
  { id: 'fish3',     label: '🎣 Fish 3 times',          stat: 'fishCount',    target: 3,   reward: { coins: 100, xp: 50  } },
  { id: 'hunt3',     label: '🏹 Hunt 3 times',          stat: 'huntCount',    target: 3,   reward: { coins: 120, xp: 50  } },
  { id: 'mine3',     label: '⛏️  Mine 3 times',          stat: 'mineCount',    target: 3,   reward: { coins: 120, xp: 50  } },
  { id: 'harvest1',  label: '🌾 Harvest 1 crop',        stat: 'harvestCount', target: 1,   reward: { coins: 150, xp: 75  } },
  { id: 'earn500',   label: '💰 Earn 500 coins today',  stat: 'totalEarned',  target: 500, reward: { coins: 200, xp: 100 } },
  { id: 'winbattle', label: '⚔️  Win 1 battle',          stat: 'battlesWon',   target: 1,   reward: { coins: 250, xp: 125 } },
];

/**
 * Get display state of all daily quests given current quest state.
 */
export function getDailyQuestDisplay(questState) {
  const prog    = questState?.progress ?? {};
  const claimed = questState?.claimed  ?? [];
  return DAILY_QUESTS.map(q => {
    const cur       = prog[q.stat]   ?? 0;
    const done      = cur            >= q.target;
    const isClaimed = claimed.includes(q.id);
    const pct       = Math.min(cur, q.target);
    return { ...q, progress: cur, done, claimed: isClaimed, pct };
  });
}
