/**
 * Yuzuki MD — WhatsApp message UI builder
 * Produces consistently styled text cards for bot replies.
 *
 * WhatsApp supports: *bold*, _italic_, ~strike~, ```mono```, > blockquote
 * Box-drawing chars render fine in every WhatsApp client.
 */

const LINE = "─".repeat(22);
const SEP  = "┄".repeat(22);

/**
 * Full info card.
 * @param {string} emoji  - icon for the header
 * @param {string} title  - header title (auto-uppercased)
 * @param {Array<[string,string]|null>} fields - [label, value] pairs; null = divider
 * @param {string} [footer] - optional dim footer line
 */
export function card(emoji, title, fields, footer) {
  const header = `╭${LINE}╮\n│  ${emoji}  *${title.toUpperCase()}*`;
  const body = fields.map(row => {
    if (row === null) return `│  ${SEP}`;
    const [label, value] = row;
    return `│  ${label.padEnd(12)}› ${value}`;
  }).join("\n");
  const foot = footer ? `╰${LINE}\n_${footer}_` : `╰${LINE}╯`;
  return `${header}\n│\n${body}\n│\n${foot}`;
}

/**
 * Compact confirmation toast — single-line result.
 * @param {"ok"|"err"|"warn"|"info"} type
 * @param {string} label - what changed
 * @param {string} [value] - new value (shown after arrow)
 */
export function toast(type, label, value) {
  const icons = { ok: "✅", err: "❌", warn: "⚠️", info: "ℹ️" };
  const icon = icons[type] ?? "•";
  return value
    ? `${icon}  *${label}*\n╰›  ${value}`
    : `${icon}  *${label}*`;
}

/**
 * Toggle card — shows a feature name and its new ON/OFF state.
 * @param {string} emoji
 * @param {string} name
 * @param {boolean} on
 * @param {string} [note]
 */
export function toggle(emoji, name, on, note) {
  const state = on ? "✅  *ON*" : "🔴  *OFF*";
  const base  = `${emoji}  *${name}*  •  ${state}`;
  return note ? `${base}\n╰›  _${note}_` : base;
}

/**
 * Numbered list card.
 * @param {string} emoji
 * @param {string} title
 * @param {string[]} items
 */
export function listCard(emoji, title, items) {
  const header = `${emoji}  *${title}*\n${"─".repeat(18)}`;
  const rows   = items.map((item, i) => `  ${i + 1}.  ${item}`).join("\n");
  return `${header}\n${rows}\n${"─".repeat(18)}`;
}

/**
 * Action progress toast (sent before a slow operation).
 * @param {string} emoji
 * @param {string} label
 * @param {string} [detail]
 */
export function progress(emoji, label, detail) {
  return detail
    ? `${emoji}  *${label}*\n╰›  _${detail}_`
    : `${emoji}  *${label}*`;
}
