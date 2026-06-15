/**
 * Menu Builder — registry-driven
 *
 * Generates all menu content (captions, cards, list payloads) dynamically
 * from the command registry. No hardcoded command lists.
 *
 * Category display metadata (icon, title) is defined in CATEGORY_META.
 * Categories without a meta entry get a default icon and title-cased name.
 */

import {
  getCategoryIndex,
  getCommandsByCategory,
  getCategories,
  getCommandCount,
  searchCommands,
} from './registry.js';

// ─── Category presentation metadata ──────────────────────────────────────────
// Editable: icon + display title per category key.
// Actual command lists come from the registry — nothing here is authoritative.

export const CATEGORY_META = {
  ai:         { icon: '🤖', title: '𝐀𝐈' },
  download:   { icon: '📥', title: '𝐃𝐨𝐰𝐧𝐥𝐨𝐚𝐝𝐞𝐫' },
  downloader: { icon: '📥', title: '𝐃𝐨𝐰𝐧𝐥𝐨𝐚𝐝𝐞𝐫' },
  fun:        { icon: '🎉', title: '𝐅𝐮𝐧' },
  game:       { icon: '🎮', title: '𝐆𝐚𝐦𝐞𝐬' },
  group:      { icon: '👥', title: '𝐆𝐫𝐨𝐮𝐩' },
  general:    { icon: '🌐', title: '𝐆𝐞𝐧𝐞𝐫𝐚𝐥' },
  maker:      { icon: '🎨', title: '𝐌𝐚𝐤𝐞𝐫' },
  media:      { icon: '🎵', title: '𝐌𝐞𝐝𝐢𝐚' },
  owner:      { icon: '👑', title: '𝐎𝐰𝐧𝐞𝐫' },
  profile:    { icon: '🪪', title: '𝐏𝐫𝐨𝐟𝐢𝐥𝐞' },
  protect:    { icon: '🛡️', title: '𝐏𝐫𝐨𝐭𝐞𝐜𝐭𝐢𝐨𝐧' },
  search:     { icon: '🔍', title: '𝐒𝐞𝐚𝐫𝐜𝐡' },
  tools:      { icon: '🔧', title: '𝐓𝐨𝐨𝐥𝐬' },
  youtube:       { icon: '▶️', title: '𝐘𝐨𝐮𝐓𝐮𝐛𝐞' },
  games:         { icon: '🎮', title: '𝐆𝐚𝐦𝐞𝐬' },
  economy:       { icon: '💰', title: '𝐄𝐜𝐨𝐧𝐨𝐦𝐲' },
  rpg:           { icon: '⚔️', title: '𝐑𝐏𝐆' },
  rpgactivities: { icon: '🗺️', title: '𝐑𝐏𝐆 𝐀𝐜𝐭𝐢𝐯𝐢𝐭𝐢𝐞𝐬' },
  rpgprogression:{ icon: '🏆', title: '𝐑𝐏𝐆 𝐏𝐫𝐨𝐠𝐫𝐞𝐬𝐬𝐢𝐨𝐧' },
};

/** Get icon + title for a category, with sensible defaults */
function catMeta(key) {
  const m = CATEGORY_META[key];
  return {
    icon:  m?.icon  ?? '📁',
    title: m?.title ?? key.charAt(0).toUpperCase() + key.slice(1),
  };
}

// ─── Public exports ───────────────────────────────────────────────────────────

/**
 * Build the main menu caption from registry data.
 *
 * @param {string} botName
 * @param {string} prefix
 * @param {object} runtime - { pushname, userRank, uptimeStr, totalUsers, ownerNumber }
 * @returns {string}
 */
export function buildMain(botName, prefix, runtime = {}) {
  const {
    pushname    = 'User',
    userRank    = 'User 🌟',
    uptimeStr   = '-',
    totalUsers  = 0,
    ownerNumber = '',
    greeting    = '',
  } = runtime;

  const cats      = getCategories().filter(c => c !== 'owner');
  const totalCmds = getCommandCount();

  const catLines = cats.map(key => {
    const { icon, title } = catMeta(key);
    const count = getCommandsByCategory(key).length;
    return `│  ${icon}  *${prefix}menu ${key}*  _(${count} cmds)_`;
  }).join('\n');

  const greetingLine = greeting ? `${greeting}\n\n` : '';

  return (
`${greetingLine}✨━━〔 🤖 *${botName}* 〕━━✨

╭─〔 👤 *𝐔𝐬𝐞𝐫 𝐈𝐧𝐟𝐨* 〕
│ 𝗡𝗮𝗺𝗲 : *${pushname}*
│ 𝗥𝗮𝗻𝗸 : *${userRank}*
╰──────────────────────╯

╭─〔 🤖 *𝐁𝐨𝐭 𝐈𝐧𝐟𝐨* 〕
│ 𝗣𝗿𝗲𝗳𝗶𝘅    : *${prefix}*
│ ⏱️ 𝗨𝗽𝘁𝗶𝗺𝗲  : *${uptimeStr}*
│ 👥 𝗨𝘀𝗲𝗿𝘀   : *${totalUsers}*
│ ⚒️ 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀 : *${totalCmds} loaded*
╰──────────────────────╯

✨━━〔 📂 *𝐂𝐚𝐭𝐞𝐠𝐨𝐫𝐢𝐞𝐬* 〕━━✨
╭──────────────────────╮
${catLines}
╰──────────────────────╯

╭─〔 💡 *𝐓𝐢𝐩𝐬* 〕
│ *${prefix}help <cmd>* — command details
│ *${prefix}search <query>* — find any command
│ *${prefix}menu owner* — owner commands
╰──────────────────────╯`
  );
}

/**
 * Build a sub-menu caption for a specific category from registry data.
 *
 * @param {string} botName
 * @param {string} prefix
 * @param {string} key  - category key
 * @returns {string|null}
 */
export function buildSub(botName, prefix, key) {
  const cmds = getCommandsByCategory(key);
  if (!cmds.length) return null;

  const { icon, title } = catMeta(key);

  const cmdLines = cmds
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(cmd => {
      const permIcon = (cmd.permissions ?? []).includes('owner') ? ' Ⓞ'
                     : (cmd.permissions ?? []).includes('admin') ? ' Ⓐ'
                     : (cmd.limit  ?? 0) > 0                    ? ' Ⓛ'
                     : ' Ⓕ';
      const desc = cmd.description ? `  _${cmd.description.slice(0, 40)}_` : '';
      return `◦ *${prefix}${cmd.name}*${permIcon}${desc}`;
    })
    .join('\n');

  return (
`✨━━〔 ${icon} *${title} Menu* 〕━━✨

╭─〔 🔖 *𝐀𝐜𝐜𝐞𝐬𝐬 𝐊𝐞𝐲* 〕
│ Ⓕ = ꜰʀᴇᴇ  │  Ⓛ = ʟɪᴍɪᴛᴇᴅ
│ Ⓐ = ᴀᴅᴍɪɴ  │  Ⓞ = ᴏᴡɴᴇʀ
╰──────────────────────╯

${cmdLines}

╭─〔 💡 *𝐓𝐢𝐩𝐬* 〕
│ *${prefix}help <cmd>* — detailed info
│ *${prefix}search <query>* — search commands
│ Back: *${prefix}menu*
╰──────────────────────╯`
  );
}

/**
 * Build a detailed help page for a single command.
 *
 * @param {object} cmd - Plugin object from registry
 * @param {string} prefix
 * @returns {string}
 */
export function buildCommandHelp(cmd, prefix) {
  const aliases     = (cmd.aliases ?? []).map(a => `${prefix}${a}`).join(', ') || 'None';
  const usage       = (cmd.usage ?? `${prefix}${cmd.name}`).replace(/^\./, prefix);
  const permissions = (cmd.permissions ?? []).join(', ') || 'Everyone';
  const { icon }    = catMeta(cmd.category ?? 'general');

  const lines = [
    `${icon} *${prefix}${cmd.name}*`,
    '',
    `📋 *Description:*  ${cmd.description ?? 'No description.'}`,
    `🗂️ *Category:*     ${cmd.category    ?? 'Uncategorized'}`,
    `💬 *Usage:*        ${usage}`,
    `🔗 *Aliases:*      ${aliases}`,
    `🔒 *Permissions:*  ${permissions}`,
  ];
  if ((cmd.limit ?? 0) > 0) lines.push(`💎 *Limit cost:*   ${cmd.limit} credit(s)`);

  return lines.join('\n');
}

/**
 * Build a search-results caption for a query.
 *
 * @param {string} query
 * @param {string} prefix
 * @param {number} [limit=10]
 * @returns {string}
 */
export function buildSearchResults(query, prefix, limit = 10) {
  const results = searchCommands(query, { limit });
  if (!results.length) {
    return `🔍 No results for *"${query}"*\n\nTry ${prefix}help to browse categories.`;
  }

  const lines = [`🔍 *Search: "${query}"*  (${results.length} result${results.length === 1 ? '' : 's'})\n`];
  for (const cmd of results) {
    const { icon } = catMeta(cmd.category ?? 'general');
    lines.push(`${icon} *${prefix}${cmd.name}*  _[${cmd.category ?? '?'}]_`);
    if (cmd.description) lines.push(`  ${cmd.description.slice(0, 60)}`);
    lines.push('');
  }
  lines.push(`_Type *${prefix}help <command>* for details._`);
  return lines.join('\n').trim();
}

/**
 * Build the native list-message rows for the main menu.
 * Used to populate a WhatsApp single_select button.
 *
 * @param {string} prefix
 * @returns {Array<{ title: string, description: string, rowId: string }>}
 */
export function buildMenuRows(prefix) {
  return getCategories()
    .filter(c => c !== 'owner')
    .map(key => {
      const { icon, title } = catMeta(key);
      const count = getCommandsByCategory(key).length;
      return {
        title:       `${icon} ${title}`,
        description: `${count} commands`,
        rowId:       `${prefix}menu ${key}`,
      };
    });
}

/**
 * Build a WhatsApp list-message payload for the main menu.
 *
 * @param {string} botName
 * @param {string} prefix
 * @returns {object}
 */
export function buildListPayload(botName, prefix) {
  const rows     = buildMenuRows(prefix);
  const sections = [{ title: 'Categories', rows }];
  return {
    text:       buildMain(botName, prefix),
    footer:     'Powered by YuzukiMD',
    title:      `${botName} Menu`,
    buttonText: '📂 Browse Categories',
    sections,
    listType:   1,
  };
}
