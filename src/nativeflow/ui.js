/**
 * NativeFlow UI — Advanced Dynamic Cards
 *
 * Extends the base NativeFlow card set with rich interfaces generated
 * entirely from live metadata — no hardcoded content anywhere.
 *
 * ─── Card catalogue ───────────────────────────────────────────────────────────
 *
 *   pluginDetailCard(sock, jid, msg, cmdNameOrObj, opts?)
 *     Full plugin metadata: description, aliases, permissions, deps, examples,
 *     rate limit, optional docs URL. Related-commands select list included.
 *
 *   workflowCard(sock, jid, msg, workflowName, opts?)
 *     Single interactive workflow: step names, timeout, start command.
 *     Source: workflowManager.getWorkflowInfo()
 *
 *   workflowListCard(sock, jid, msg, opts?)
 *     All registered workflows as a select list.
 *     Source: workflowManager.listWorkflows()
 *
 *   gameCard(sock, jid, msg, gameId, opts?)
 *     Single game: name, description, player range, timeout, rewards.
 *     Source: gamesEngine.getGame()
 *
 *   gameListCard(sock, jid, msg, opts?)
 *     All registered games as a select list.
 *     Source: gamesEngine.listGames()
 *
 *   leaderboardCard(sock, jid, msg, gameId, opts?)
 *     Ranked player list with medals, win rates, and play counts.
 *     Source: getLeaderboard()
 *
 *   playerStatsCard(sock, jid, msg, playerJid, displayName, opts?)
 *     Individual player stats across all games + per-game breakdown with ranks.
 *     Source: getGlobalStats() + getPlayerRank()
 *
 * ─── Return shape ─────────────────────────────────────────────────────────────
 *
 *   { ok: true,  sent: <WAMessage> }
 *   { ok: false, error: <Error>, fallbackSent?: <WAMessage> }
 */

import {
  sendCard,
  sendReply,
  copyButton,
  urlButton,
  selectButton,
} from '../message-engine/index.js';

import {
  getCommand,
  getCommandsByCategory,
} from '../lib/registry.js';

import { CATEGORY_META } from '../lib/menu-builder.js';
import { workflowManager } from '../workflows/manager.js';
import { gamesEngine } from '../games/engine.js';
import {
  getLeaderboard,
  getGlobalStats,
  getPlayerRank,
} from '../games/leaderboard.js';

// ─── Shared constants & helpers ───────────────────────────────────────────────

const MAX_ROWS   = 10;
const MAX_SELECT = 10; // WhatsApp caps single_select rows at 10 per section

const RANK_MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/** Format a millisecond duration as "Xm" or "Xs". */
function fmtMs(ms) {
  if (!ms || typeof ms !== 'number') return '?';
  return ms >= 60_000 ? `${Math.round(ms / 60_000)}m` : `${Math.round(ms / 1_000)}s`;
}

/** Resolve opts with safe defaults. */
function resolveOpts({ prefix = '.', botName = 'Yuzuki MD' } = {}) {
  return { prefix, botName };
}

/**
 * Build standard select rows that open a plugininfo card for a command.
 * @param {object[]} cmds
 * @param {string}   prefix
 * @returns {object[]}
 */
function pluginRows(cmds, prefix) {
  return cmds
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_SELECT)
    .map(cmd => ({
      title:       `${prefix}${cmd.name}`,
      description: (cmd.description ?? '').slice(0, 72),
      rowId:    `${prefix}plugininfo ${cmd.name}`,
    }));
}

// ─── pluginDetailCard ─────────────────────────────────────────────────────────

/**
 * Rich plugin detail card.
 *
 * Shows every populated metadata field from the plugin object:
 * description, aliases, usage, permissions, dependencies, rate limit, examples.
 * Includes a "related commands in same category" select list.
 *
 * @param {object}        sock
 * @param {string}        jid
 * @param {object}        msg
 * @param {string|object} cmdNameOrObj - Command name (string) or plugin object
 * @param {object}        [opts]
 * @param {string}        [opts.prefix]
 * @param {string}        [opts.botName]
 * @returns {Promise<{ok: boolean}>}
 */
export async function pluginDetailCard(sock, jid, msg, cmdNameOrObj, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);

  const cmd = typeof cmdNameOrObj === 'string'
    ? getCommand(cmdNameOrObj)
    : cmdNameOrObj;

  if (!cmd?.name) {
    return sendReply(sock, jid, `❌ Plugin not found: *${cmdNameOrObj}*`, msg);
  }

  const catKey   = cmd.category ?? '';
  const catMeta  = CATEGORY_META[catKey] ?? { icon: '📁', title: catKey || 'Unknown' };
  const divider  = '━'.repeat(22);

  const lines = [
    `${catMeta.icon} *${cmd.name}*  ·  ${catMeta.title}`,
    divider,
  ];

  // ── Description ─────────────────────────────────────────────────────────────
  if (cmd.description) {
    lines.push(`📝 *Description:*`, `   ${cmd.description}`, '');
  } else {
    lines.push(`📝 _No description provided._`, '');
  }

  // ── Usage ────────────────────────────────────────────────────────────────────
  const usageStr = (cmd.usage ?? `${prefix}${cmd.name}`).replace(/^\./, prefix);
  lines.push(`💡 *Usage:*  \`${usageStr}\``);

  // ── Aliases ──────────────────────────────────────────────────────────────────
  if (cmd.aliases?.length) {
    lines.push(`🔗 *Aliases:*  ${cmd.aliases.map(a => `${prefix}${a}`).join('  ·  ')}`);
  }

  // ── Permissions ──────────────────────────────────────────────────────────────
  if (cmd.permissions?.length) {
    lines.push(`🔒 *Permissions:*  ${cmd.permissions.join(', ')}`);
  }

  // ── Dependencies ─────────────────────────────────────────────────────────────
  if (cmd.dependencies?.length) {
    lines.push(`📦 *Requires:*  ${cmd.dependencies.join(', ')}`);
  }

  // ── Rate limit ───────────────────────────────────────────────────────────────
  if (typeof cmd.limit === 'number' && cmd.limit > 0) {
    lines.push(`⏱️ *Rate limit:*  ${cmd.limit}s cooldown`);
  }

  // ── Examples ─────────────────────────────────────────────────────────────────
  if (cmd.examples?.length) {
    lines.push('', `📌 *Examples:*`);
    for (const ex of cmd.examples.slice(0, 4)) {
      lines.push(`   ${ex.replace(/^\./, prefix)}`);
    }
  }

  const body = lines.join('\n');

  // ── Buttons ──────────────────────────────────────────────────────────────────
  const buttons = [
    copyButton('📋 Copy Usage',   usageStr),
    copyButton('📝 Copy Command', `${prefix}${cmd.name}`),
  ];

  if (typeof cmd.url === 'string' && /^https?:\/\//i.test(cmd.url)) {
    buttons.push(urlButton('🔗 Docs', cmd.url));
  }

  // Related commands in the same category (excludes self)
  if (catKey) {
    const related = getCommandsByCategory(catKey).filter(c => c.name !== cmd.name);
    const rows = pluginRows(related, prefix);
    if (rows.length) {
      buttons.push(selectButton(
        `📂 More in ${catMeta.title}`,
        rows,
        `${catMeta.icon} ${catMeta.title}`,
      ));
    }
  }

  return sendCard(sock, jid, msg, { body, footer: botName, buttons, fallback: body });
}

// ─── workflowCard ─────────────────────────────────────────────────────────────

/**
 * Workflow detail card for one registered interactive workflow.
 *
 * Shows: step names, timeout per step, trigger command.
 * Source: workflowManager.getWorkflowInfo()
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {string} workflowName
 * @param {object} [opts]
 * @returns {Promise<{ok: boolean}>}
 */
export async function workflowCard(sock, jid, msg, workflowName, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);
  const info = workflowManager.getWorkflowInfo(workflowName);

  if (!info) {
    return sendReply(sock, jid, `❌ Workflow not found: *${workflowName}*`, msg);
  }

  const divider = '━'.repeat(22);
  const lines   = [
    `🔄 *Workflow: ${info.name}*`,
    divider,
    `🔢 *Steps (${info.stepCount}):*`,
    ...info.steps.map((s, i) => `   ${i + 1}. ${s.name}`),
    '',
    `⏱️ *Timeout per step:* ${fmtMs(info.timeout)}`,
    '',
    `_Trigger:_  \`${prefix}${info.name}\``,
  ];

  const body = lines.join('\n');

  return sendCard(sock, jid, msg, {
    body,
    footer:  botName,
    buttons: [copyButton('▶️ Start Workflow', `${prefix}${info.name}`)],
    fallback: body,
  });
}

// ─── workflowListCard ─────────────────────────────────────────────────────────

/**
 * List all registered interactive workflows as an interactive select card.
 *
 * Source: workflowManager.listWorkflows()
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {object} [opts]
 * @returns {Promise<{ok: boolean}>}
 */
export async function workflowListCard(sock, jid, msg, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);
  const names = workflowManager.listWorkflows().sort();

  if (!names.length) {
    return sendReply(sock, jid,
      `📭 *No workflows registered.*\n_Workflows are multi-step interactive conversations started by commands._`,
      msg,
    );
  }

  const divider = '━'.repeat(22);
  const lines   = [
    `🔄 *Workflows (${names.length})*`,
    divider,
    `Interactive multi-step conversations built into the bot.`,
    '',
  ];

  const rows = [];
  for (const name of names) {
    const info = workflowManager.getWorkflowInfo(name);
    const sc   = info?.stepCount ?? '?';
    lines.push(`• *${name}*  _(${sc} step${sc !== 1 ? 's' : ''})_`);
    rows.push({
      title:       name,
      description: `${sc} steps — tap to view`,
      rowId:    `${prefix}wfinfo ${name}`,
    });
  }

  const body = lines.join('\n');

  return sendCard(sock, jid, msg, {
    body,
    footer:  botName,
    buttons: rows.length
      ? [selectButton('🔄 Workflow Details', rows.slice(0, MAX_SELECT), 'Registered Workflows')]
      : [],
    fallback: body,
  });
}

// ─── gameCard ─────────────────────────────────────────────────────────────────

/**
 * Detail card for a single registered game.
 *
 * Shows: name, description, player range, turn timeout, rewards breakdown.
 * Source: gamesEngine.getGame()
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {string} gameId
 * @param {object} [opts]
 * @returns {Promise<{ok: boolean}>}
 */
export async function gameCard(sock, jid, msg, gameId, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);
  const game = gamesEngine.getGame(gameId);

  if (!game) {
    return sendReply(sock, jid, `❌ Game not found: *${gameId}*`, msg);
  }

  const name        = game.name ?? gameId;
  const playerRange = game.minPlayers === game.maxPlayers
    ? `${game.minPlayers} player${game.minPlayers !== 1 ? 's' : ''}`
    : `${game.minPlayers}–${game.maxPlayers} players`;

  const divider = '━'.repeat(22);
  const lines   = [
    `🎮 *${name}*`,
    divider,
  ];

  if (game.description) lines.push(`📝 ${game.description}`, '');

  lines.push(
    `👥 *Players:*    ${playerRange}`,
    `⏱️ *Turn timer:* ${fmtMs(game.timeout)}`,
    '',
    `🏆 *Rewards:*`,
    `   🥇 Win  → +${game.rewards.win.coins} coins  +${game.rewards.win.xp} XP`,
    `   🤝 Draw → +${game.rewards.draw.coins} coins  +${game.rewards.draw.xp} XP`,
    `   🎯 Play → +${game.rewards.lose.xp} XP`,
    '',
    `_Start:_  \`${prefix}${gameId}\``,
  );

  const body = lines.join('\n');

  return sendCard(sock, jid, msg, {
    body,
    footer:  botName,
    buttons: [
      copyButton('🎮 Start Game',      `${prefix}${gameId}`),
      copyButton('🏆 Leaderboard',     `${prefix}lb ${gameId}`),
    ],
    fallback: body,
  });
}

// ─── gameListCard ─────────────────────────────────────────────────────────────

/**
 * List all registered games as an interactive select card.
 *
 * Source: gamesEngine.listGames() + gamesEngine.getGame()
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {object} [opts]
 * @returns {Promise<{ok: boolean}>}
 */
export async function gameListCard(sock, jid, msg, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);
  const gameIds = gamesEngine.listGames().sort();

  if (!gameIds.length) {
    return sendReply(sock, jid,
      `🎮 *No games are currently registered.*\n_Install a game plugin to add games._`,
      msg,
    );
  }

  const divider = '━'.repeat(22);
  const lines   = [
    `🎮 *Games (${gameIds.length})*`,
    divider,
    `Select a game to view details, then start it.`,
    '',
  ];

  const rows = [];
  for (const id of gameIds) {
    const g    = gamesEngine.getGame(id);
    const name = g?.name ?? id;
    const pr   = (g?.minPlayers ?? 1) === (g?.maxPlayers ?? 1)
      ? `${g?.minPlayers ?? 1}P`
      : `${g?.minPlayers ?? 1}–${g?.maxPlayers ?? 1}P`;
    const desc = g?.description ? g.description.slice(0, 60) : `Start: ${prefix}${id}`;
    lines.push(`🎯 *${name}*  _(${pr})_`);
    rows.push({ title: name, description: desc, rowId: `${prefix}gameinfo ${id}` });
  }

  const body = lines.join('\n');

  return sendCard(sock, jid, msg, {
    body,
    footer:  botName,
    buttons: rows.length
      ? [selectButton('🎮 View Game', rows.slice(0, MAX_SELECT), 'Available Games')]
      : [],
    fallback: body,
  });
}

// ─── leaderboardCard ─────────────────────────────────────────────────────────

/**
 * Interactive leaderboard card for a specific game.
 *
 * Shows top N players with rank medals, wins/losses, and win rate.
 * Falls back to a plain reply when no scores exist yet.
 * Source: getLeaderboard()
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {string} gameId
 * @param {object} [opts]
 * @param {number} [opts.limit]   - Max rows (default: 10)
 * @param {string} [opts.prefix]
 * @param {string} [opts.botName]
 * @returns {Promise<{ok: boolean}>}
 */
export async function leaderboardCard(sock, jid, msg, gameId, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);
  const limit = opts.limit ?? 10;
  const game  = gamesEngine.getGame(gameId);
  const board = getLeaderboard(gameId, limit);
  const title = game?.name ?? gameId;

  if (!board.length) {
    return sendReply(sock, jid,
      `📊 *${title} Leaderboard*\n\n_No scores recorded yet._\n_Be the first! Start with ${prefix}${gameId}_`,
      msg,
    );
  }

  const divider = '━'.repeat(22);
  const lines   = [
    `🏆 *${title} — Top ${board.length}*`,
    divider,
  ];

  for (const entry of board) {
    const medal   = RANK_MEDALS[(entry.rank ?? 0) - 1] ?? `${entry.rank}.`;
    const name    = (entry.name ?? entry.jid?.split('@')[0] ?? '?').slice(0, 20);
    const plays   = entry.plays ?? ((entry.wins ?? 0) + (entry.losses ?? 0) + (entry.draws ?? 0));
    const winRate = plays > 0 ? Math.round(((entry.wins ?? 0) / plays) * 100) : 0;
    lines.push(
      `${medal} *${name}*  —  ${entry.wins ?? 0}W ${entry.losses ?? 0}L  _(${winRate}%)_`,
    );
  }

  lines.push('', `_Updated live from game data._`);
  const body = lines.join('\n');

  return sendCard(sock, jid, msg, {
    body,
    footer:  `Top ${board.length} — ${botName}`,
    buttons: [
      copyButton('🎮 Play Now',  `${prefix}${gameId}`),
      copyButton('📊 My Stats',  `${prefix}stats`),
    ],
    fallback: body,
  });
}

// ─── playerStatsCard ─────────────────────────────────────────────────────────

/**
 * Full player stats card across all games.
 *
 * Shows: global totals, win rate, per-game breakdown with rank.
 * Source: getGlobalStats() + getPlayerRank() per game
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {string} playerJid      - The player's WhatsApp JID
 * @param {string} [displayName]  - Optional display name override
 * @param {object} [opts]
 * @returns {Promise<{ok: boolean}>}
 */
export async function playerStatsCard(sock, jid, msg, playerJid, displayName, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);
  const stats     = getGlobalStats(playerJid);
  const shortName = displayName || playerJid?.split('@')[0] || '?';

  if (!stats) {
    return sendReply(sock, jid,
      `📊 *${shortName}* has no game history yet.\n_Start playing! Try ${prefix}games to see what's available._`,
      msg,
    );
  }

  const name    = displayName || stats.name || shortName;
  const winRate = stats.totalPlays > 0
    ? Math.round((stats.totalWins / stats.totalPlays) * 100) : 0;

  const divider = '━'.repeat(22);
  const lines   = [
    `📊 *${name}'s Stats*`,
    divider,
    `🏆 *Wins:*    ${stats.totalWins}`,
    `💀 *Losses:*  ${stats.totalLosses}`,
    `🤝 *Draws:*   ${stats.totalDraws}`,
    `🎮 *Played:*  ${stats.totalPlays}`,
    `📈 *Win Rate:* ${winRate}%`,
  ];

  const gameEntries = Object.entries(stats.games ?? {});
  if (gameEntries.length) {
    lines.push('', `📋 *By Game:*`);
    for (const [gid, g] of gameEntries) {
      const gameDef  = gamesEngine.getGame(gid);
      const gameName = gameDef?.name ?? gid;
      const rank     = getPlayerRank(playerJid, gid);
      const gr       = (g.plays ?? 0) > 0
        ? Math.round(((g.wins ?? 0) / g.plays) * 100) : 0;
      const rankStr  = rank ? `  [#${rank}]` : '';
      const medal    = rank && rank <= 3 ? (RANK_MEDALS[rank - 1] + ' ') : '• ';
      lines.push(
        `   ${medal}*${gameName}*${rankStr}  —  ${g.wins ?? 0}W ${g.losses ?? 0}L ${g.draws ?? 0}D  _(${gr}%)_`,
      );
    }
  }

  const body = lines.join('\n');

  return sendCard(sock, jid, msg, {
    body,
    footer:  botName,
    buttons: [
      copyButton('🎮 Play a Game', `${prefix}games`),
      copyButton('🏆 Leaderboard', `${prefix}lb`),
    ],
    fallback: body,
  });
}
