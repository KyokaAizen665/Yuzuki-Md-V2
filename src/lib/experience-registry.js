/**
 * Workflow Experience Registry
 *
 * Defines discoverable "feature journeys" — logical groupings of commands
 * into user-facing workflows. Everything is generated at render time from
 * live registry data; nothing is hardcoded beyond the group skeleton.
 *
 * ─── Concepts ─────────────────────────────────────────────────────────────────
 *
 *   Experience Group
 *     A named, icon-tagged cluster of commands that together accomplish a
 *     real-world goal (e.g. "Music" = search + download + lyrics).
 *
 *   Step
 *     A single command inside a group.  Only `command` (registry name) is
 *     mandatory; `label` and `hint` are optional display overrides.
 *
 *   Resolved Step
 *     A step enriched with live registry data: full description, usage
 *     string, enabled/disabled state, and availability flag.
 *
 * ─── API ──────────────────────────────────────────────────────────────────────
 *
 *   EXPERIENCE_GROUPS          — Map<id, ExperienceGroup>
 *   listExperienceGroups()     — ExperienceGroup[] sorted by name
 *   getExperienceGroup(id)     — ExperienceGroup | null
 *   resolveSteps(group,prefix) — ResolvedStep[]
 *   getRecommendations(cmd)    — ExperienceGroup[]  (groups that contain cmd)
 *
 * ─── Adding a new group ───────────────────────────────────────────────────────
 *
 *   1. Add a block in _RAW_GROUPS below.
 *   2. Assign a unique lowercase `id`.
 *   3. List the real plugin command names in `steps[].command`.
 *   4. Done — no other file needs to change.
 */

import { getCommand, isCommandEnabled } from './registry.js';

// ── Group definitions ─────────────────────────────────────────────────────────

const _RAW_GROUPS = [

  // ── Music ──────────────────────────────────────────────────────────────────
  {
    id:          'music',
    name:        'Music',
    icon:        '🎵',
    description: 'Search, stream, download and explore music from YouTube, Deezer & more',
    tags:        ['audio', 'youtube', 'download', 'mp3', 'deezer', 'saavn'],
    steps: [
      { command: 'play',        label: 'Search & Play Song',      hint: 'Interactive guided search with results list'         },
      { command: 'song',        label: 'Download Audio (MP3)',     hint: 'Download any song as an audio file'                 },
      { command: 'musicsearch', label: 'Rich Music Search',        hint: 'Deezer-powered search with artist, album, duration' },
      { command: 'lyrics',      label: 'Get Song Lyrics',          hint: 'Look up full lyrics for any song'                   },
      { command: 'trending',    label: 'Trending / Top Charts',    hint: 'iTunes top songs chart for any country'             },
      { command: 'video',       label: 'Download Video (MP4)',     hint: 'Download a YouTube video by URL or title'           },
    ],
  },

  // ── Media Hub ─────────────────────────────────────────────────────────────
  {
    id:          'media',
    name:        'Media Hub',
    icon:        '🎶',
    description: 'Full music assistant — artist profiles, albums, lyrics, recommendations, charts',
    tags:        ['lyrics', 'artist', 'album', 'trending', 'recommend', 'deezer', 'audiomack', 'soundcloud'],
    steps: [
      { command: 'musicsearch', label: 'Search Music',              hint: 'Rich search results powered by Deezer + Saavn'  },
      { command: 'artist',      label: 'Artist Profile',            hint: 'Fan count, top tracks, and Deezer link'         },
      { command: 'album',       label: 'Album Info & Tracklist',    hint: 'Full album with downloadable track rows'         },
      { command: 'lyrics',      label: 'Song Lyrics',               hint: 'Full lyrics, auto-chunked for long songs'        },
      { command: 'trending',    label: 'Trending Charts',           hint: 'iTunes top songs — any country'                  },
      { command: 'recommend',   label: 'Artist Recommendations',    hint: 'Discover similar artists via Deezer graph'       },
      { command: 'playlist',    label: 'Playlist Browser',          hint: 'Browse & download Deezer playlists'              },
      { command: 'audiomack',   label: 'Audiomack Download',        hint: 'Download from Audiomack by URL or search'        },
      { command: 'soundcloud',  label: 'SoundCloud Download',       hint: 'Download any public SoundCloud track by URL'     },
    ],
  },

  // ── AI Assistants ─────────────────────────────────────────────────────────
  {
    id:          'ai',
    name:        'AI Assistants',
    icon:        '🤖',
    description: 'Multi-turn chat, image gen, vision, translation, coding & more — all free',
    tags:        ['chatgpt', 'gemini', 'claude', 'ai', 'gpt', 'ask', 'image', 'translate'],
    steps: [
      { command: 'aichat',    label: 'Chat with Memory',       hint: 'Multi-turn AI chat — context saved across messages' },
      { command: 'chatgpt',   label: 'Ask ChatGPT',            hint: 'GPT-4o via Pollinations.AI — no key needed'        },
      { command: 'gemini',    label: 'Ask Gemini',             hint: 'Google Gemini via Pollinations.AI'                 },
      { command: 'imagegen',  label: 'Generate Image',         hint: 'AI image from text prompt — Flux model'            },
      { command: 'imganalyze',label: 'Analyze Image',          hint: 'Describe or question any image with AI vision'     },
      { command: 'translate', label: 'Translate Text',         hint: 'Translate between 50+ languages — free'            },
      { command: 'summarize', label: 'Summarize Text',         hint: 'AI-powered TL;DR and bullet points'                },
      { command: 'code',      label: 'Coding Assistant',       hint: 'Write, debug, review, or explain code'             },
    ],
  },

  // ── AI Tools ──────────────────────────────────────────────────────────────
  {
    id:          'aitools',
    name:        'AI Writing Tools',
    icon:        '✍️',
    description: 'Rewrite, grammar check, explain, and summarize text with AI',
    tags:        ['rewrite', 'grammar', 'explain', 'summarize', 'writing', 'correct'],
    steps: [
      { command: 'rewrite',  label: 'Rewrite Text',       hint: 'Professional, casual, formal, simple, or creative'   },
      { command: 'grammar',  label: 'Grammar Check',      hint: 'Fix spelling, punctuation, and grammar errors'       },
      { command: 'explain',  label: 'Explain Anything',   hint: 'ELI5, deep dive, or quick answer modes'              },
      { command: 'summarize',label: 'Summarize',          hint: 'TL;DR + key bullet points from any text'             },
      { command: 'translate',label: 'Translate',          hint: 'Translate between 50+ languages'                     },
      { command: 'code',     label: 'Code Assistant',     hint: 'Write, debug, review, or explain code'               },
      { command: 'aimemory', label: 'Memory Manager',     hint: 'Clear history, view log, set preferred model'        },
    ],
  },

  // ── Download ──────────────────────────────────────────────────────────────
  {
    id:          'download',
    name:        'Downloads',
    icon:        '📥',
    description: 'Download media from YouTube, TikTok, Instagram, and Facebook',
    tags:        ['mp3', 'mp4', 'tiktok', 'instagram', 'facebook', 'youtube'],
    steps: [
      { command: 'song',      label: 'YouTube Audio',     hint: 'Download as MP3 (JioSaavn → YouTube fallback)' },
      { command: 'video',     label: 'YouTube Video',     hint: 'Download as MP4 by URL or title'               },
      { command: 'tiktok',    label: 'TikTok Video',      hint: 'Download TikTok video without watermark'       },
      { command: 'instagram', label: 'Instagram Media',   hint: 'Download Reel, photo, or Story'                },
      { command: 'facebook',  label: 'Facebook Video',    hint: 'Download Facebook video by URL'                },
    ],
  },

  // ── Mini-Games ────────────────────────────────────────────────────────────
  {
    id:          'games',
    name:        'Mini-Games',
    icon:        '🎮',
    description: 'Play card games, word games, number games, and more in-chat',
    tags:        ['play', 'game', 'fun', 'trivia', 'blackjack', 'wordle'],
    steps: [
      { command: 'blackjack', label: 'Blackjack',           hint: 'Classic card game — beat the dealer'     },
      { command: 'hangman',   label: 'Hangman',             hint: 'Guess the hidden word letter by letter'  },
      { command: 'wordle',    label: 'Wordle',              hint: '5-letter word guessing game'             },
      { command: 'ttt',       label: 'Tic-Tac-Toe',         hint: 'Classic 3x3 board game'                  },
      { command: 'rps',       label: 'Rock Paper Scissors', hint: 'Quick best-of-one match'                 },
      { command: 'guess',     label: 'Number Guess',        hint: 'Guess the secret number'                 },
      { command: 'dice',      label: 'Dice Roll',           hint: 'Roll one or multiple dice'               },
      { command: 'coinflip',  label: 'Coin Flip',           hint: 'Heads or tails'                          },
    ],
  },

  // ── RPG Activities ────────────────────────────────────────────────────────
  {
    id:          'rpgactivities',
    name:        'RPG Activities',
    icon:        '⚔️',
    description: 'Fish, hunt, mine, and farm to earn coins, XP, and rare loot drops',
    tags:        ['fish', 'hunt', 'mine', 'farm', 'battle', 'loot', 'rpg'],
    steps: [
      { command: 'fishing', label: 'Go Fishing',     hint: 'Cast rod — catch fish from common to mythic rarity'   },
      { command: 'hunting', label: 'Go Hunting',     hint: 'Hunt animals for pelts, tusks, and dragon scales'     },
      { command: 'mining',  label: 'Go Mining',      hint: 'Mine ores and gems — coal to mystic crystals'         },
      { command: 'farming', label: 'Farm',           hint: 'Plant seeds, water crops, and harvest for profit'     },
      { command: 'battle',  label: 'PvP Battle',     hint: 'Challenge any user — auto-resolves with level scaling'},
      { command: 'daily',   label: 'Daily Reward',   hint: 'Claim coins + XP daily — streak multiplier up to 30x' },
    ],
  },

  // ── Economy ───────────────────────────────────────────────────────────────
  {
    id:          'economy',
    name:        'Economy',
    icon:        '💰',
    description: 'Manage coins, inventory, and trade — shop, sell loot, and pay friends',
    tags:        ['coins', 'shop', 'inventory', 'trade', 'pay', 'sell', 'balance'],
    steps: [
      { command: 'balance',   label: 'Check Balance',    hint: 'View wallet, bank, and full net worth'             },
      { command: 'inventory', label: 'View Inventory',   hint: 'All collected items grouped by type with sell value'},
      { command: 'shop',      label: 'Shop',             hint: 'Buy seeds and consumables or sell any item'        },
      { command: 'pay',       label: 'Pay a Friend',     hint: 'Transfer coins to any user with @mention'          },
      { command: 'daily',     label: 'Daily Reward',     hint: 'Claim streak-bonus daily rewards'                  },
    ],
  },

  // ── RPG Progression ───────────────────────────────────────────────────────
  {
    id:          'rpgprogression',
    name:        'RPG Progression',
    icon:        '🏆',
    description: 'Track rank, achievements, quests, and compete on leaderboards',
    tags:        ['rank', 'level', 'achievements', 'quests', 'leaderboard', 'profile', 'xp'],
    steps: [
      { command: 'profile',      label: 'Full Profile',      hint: 'Level, rank, stats, achievements, and net worth'  },
      { command: 'rank',         label: 'Rank & XP',         hint: 'Current rank, XP bar, and next tier progress'     },
      { command: 'achievements', label: 'Achievements',      hint: 'All trophies — unlocked, locked, and rewards'     },
      { command: 'quests',       label: 'Daily Quests',      hint: 'View and claim daily quest rewards'               },
      { command: 'leaderboard',  label: 'Leaderboard',       hint: 'Top 10 by level, coins, fish, hunt, or mine'      },
    ],
  },

  // ── Sticker ───────────────────────────────────────────────────────────────
  {
    id:          'sticker',
    name:        'Sticker Tools',
    icon:        '🎨',
    description: 'Build and manage sticker packs, aliases, and macro collections',
    tags:        ['sticker', 'pack', 'alias', 'macro', 'emoji'],
    steps: [
      { command: 'stickerpack',  label: 'Manage Sticker Pack',  hint: 'Create and organise sticker packs as command sets' },
      { command: 'stickeralias', label: 'Register Alias',       hint: 'Map a text alias to an EXIF sticker pack name'    },
      { command: 'stickermacro', label: 'Register Macro',       hint: 'Register reusable macro sticker commands'         },
    ],
  },

  // ── Group ─────────────────────────────────────────────────────────────────
  {
    id:          'group',
    name:        'Group Management',
    icon:        '👥',
    description: 'Manage WhatsApp group members, admin powers, and broadcasts',
    tags:        ['admin', 'kick', 'promote', 'demote', 'tagall', 'group'],
    steps: [
      { command: 'tagall',  label: 'Tag All Members', hint: 'Mention everyone in the group'            },
      { command: 'hidetag', label: 'Silent Tag',      hint: 'Mention all without visible @-list'       },
      { command: 'kick',    label: 'Kick Member',     hint: 'Remove a member from the group'           },
      { command: 'mute',    label: 'Mute Group',      hint: 'Restrict messaging to admins only'        },
      { command: 'unmute',  label: 'Unmute Group',    hint: 'Restore messaging for all members'        },
      { command: 'promote', label: 'Promote Admin',   hint: 'Grant admin rights to a member'           },
      { command: 'demote',  label: 'Demote Admin',    hint: 'Remove admin rights from a member'        },
    ],
  },

  // ── Group Analytics ───────────────────────────────────────────────────────
  {
    id:          'group-analytics',
    name:        'Group Analytics',
    icon:        '📊',
    description: 'Activity tracking, engagement metrics, retention analytics, and group health dashboards',
    tags:        ['activity', 'stats', 'analytics', 'insights', 'engagement', 'top', 'leaderboard'],
    steps: [
      { command: 'insights',   label: 'Group Insights',     hint: 'Full group health dashboard — engagement, retention, activity'   },
      { command: 'groupstats', label: 'Group Stats',        hint: 'Message totals, member count, join and leave summary'            },
      { command: 'activity',   label: 'Activity Board',     hint: 'Member message-count leaderboard — auto-tracked'                 },
      { command: 'topactive',  label: 'Top Active',         hint: 'Top members ranked by weighted activity score'                   },
      { command: 'engagement', label: 'Engagement Metrics', hint: 'Hourly chart, peak times, active-member ratio'                   },
      { command: 'welcoming',  label: 'Welcome Analytics',  hint: 'Join/leave history and 7d / 30d retention rate'                  },
    ],
  },

  // ── Group Reputation & Warnings ────────────────────────────────────────────
  {
    id:          'group-rep',
    name:        'Reputation & Warnings',
    icon:        '⭐',
    description: 'Group reputation system, warning history, and moderation configuration',
    tags:        ['rep', 'reputation', 'warn', 'warning', 'moderation', 'admin'],
    steps: [
      { command: 'rep',      label: 'Give Reputation', hint: 'Award +1 rep to a member (once per 24h per target)'         },
      { command: 'toprep',   label: 'Rep Leaderboard', hint: 'Top members by reputation points'                            },
      { command: 'warn',     label: 'Warn Member',     hint: 'Issue a formal warning with reason — auto-kicks at threshold'},
      { command: 'unwarn',   label: 'Remove Warning',  hint: 'Clear one or all warnings from a member'                    },
      { command: 'warnings', label: 'View Warnings',   hint: 'Full warning history for yourself or a member'              },
    ],
  },

  // ── Group Moderation ──────────────────────────────────────────────────────
  {
    id:          'group-moderation',
    name:        'Group Moderation',
    icon:        '🛡️',
    description: 'Auto-mod rules, anti-spam, lockdown, and the full moderation ruleset overview',
    tags:        ['automod', 'antispam', 'lockdown', 'modrules', 'protection', 'moderation'],
    steps: [
      { command: 'modrules',  label: 'Mod Rules Overview', hint: 'All active moderation rules in one interactive card'    },
      { command: 'automod',   label: 'Auto-Mod Config',    hint: 'View and configure warn threshold and action'           },
      { command: 'antispam',  label: 'Anti-Spam',          hint: 'Enable/disable and configure spam detection window'     },
      { command: 'lockdown',  label: 'Group Lockdown',     hint: 'Restrict group to admin-only messaging instantly'       },
    ],
  },

  // ── Tools ─────────────────────────────────────────────────────────────────
  {
    id:          'tools',
    name:        'Bot Tools',
    icon:        '🛠️',
    description: 'Explore commands, check bot health, and navigate the feature set',
    tags:        ['help', 'search', 'ping', 'uptime', 'menu', 'info'],
    steps: [
      { command: 'search',     label: 'Search Commands', hint: 'Find commands by keyword across names & descriptions' },
      { command: 'help',       label: 'Command Help',    hint: 'Get full details on any command'                     },
      { command: 'ping',       label: 'Ping Bot',        hint: 'Check that the bot is alive and responsive'          },
      { command: 'uptime',     label: 'Uptime',          hint: 'How long the bot has been running'                   },
      { command: 'runtime',    label: 'Runtime Info',    hint: 'Node.js version, memory, and OS details'             },
      { command: 'plugininfo', label: 'Plugin Info',     hint: 'Detailed metadata for any loaded plugin'             },
    ],
  },

];

// ── Build the Map ─────────────────────────────────────────────────────────────

export const EXPERIENCE_GROUPS = new Map(_RAW_GROUPS.map(g => [g.id, g]));

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List all experience groups, sorted alphabetically by name.
 * @returns {object[]}
 */
export function listExperienceGroups() {
  return [...EXPERIENCE_GROUPS.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get a single experience group by id.
 * @param {string} id
 * @returns {object|null}
 */
export function getExperienceGroup(id) {
  return EXPERIENCE_GROUPS.get(id?.toLowerCase?.()) ?? null;
}

/**
 * Enrich each step in a group with live registry data.
 *
 * Each returned ResolvedStep has:
 *   command      — original command name
 *   label        — display label (group override → cmd.name fallback)
 *   hint         — sub-label (group override → cmd.description fallback)
 *   usage        — cmd.usage string  (or `.command` if not in registry)
 *   available    — true when command exists in the registry
 *   enabled      — true when command is not disabled
 *   stepIndex    — 1-based position in this group
 *
 * @param {object} group    — ExperienceGroup
 * @param {string} [prefix] — bot prefix character
 * @returns {object[]}
 */
export function resolveSteps(group, prefix = '.') {
  return (group.steps ?? []).map((step, i) => {
    const cmd       = getCommand(step.command);
    const available = !!cmd;
    const enabled   = available ? isCommandEnabled(step.command) : false;

    const rawUsage  = cmd?.usage ?? `${prefix}${step.command}`;
    const usage     = rawUsage.startsWith('.') ? prefix + rawUsage.slice(1) : rawUsage;

    return {
      command:   step.command,
      label:     step.label   ?? (cmd ? cmd.name : step.command),
      hint:      step.hint    ?? (cmd?.description ?? ''),
      usage,
      aliases:   cmd?.aliases ?? [],
      available,
      enabled,
      stepIndex: i + 1,
    };
  });
}

/**
 * Return all experience groups whose steps mention the given command name.
 * Useful for surfacing "related workflow" recommendations after a command runs.
 *
 * @param {string} commandName
 * @returns {object[]}
 */
export function getRecommendations(commandName) {
  const name = commandName?.toLowerCase?.() ?? '';
  const matches = [];

  for (const group of EXPERIENCE_GROUPS.values()) {
    const found = group.steps.some(
      s => s.command === name || (getCommand(name)?.aliases ?? []).includes(s.command),
    );
    if (found) matches.push(group);
  }

  return matches;
}
