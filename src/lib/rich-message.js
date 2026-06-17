/**
 * Yuzuki MD — Rich Message Utilities
 *
 * Higher-level helpers that compose NativeFlow interactive messages for
 * common rich-response patterns: code blocks, data tables, multi-field
 * info cards, and formatted list responses.
 *
 * All functions return the same { ok, sent } / { ok, error } shape used
 * across the rest of the message-engine.
 *
 * Usage:
 *   import { sendRichCode, sendRichTable, sendRichList } from '../lib/rich-message.js';
 */

import { sendCard, copyButton, urlButton, quickReply } from '../message-engine/interactive.js';

// ─── Code block card ──────────────────────────────────────────────────────────

/**
 * Send a styled code-response card with a copy button.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} code       — The code / output to display
 * @param {object} [opts]
 * @param {string}   [opts.language]    — Language label (e.g. "JavaScript")
 * @param {string}   [opts.title]       — Card title (default: "Code")
 * @param {string}   [opts.footer]      — Footer text
 * @param {string[]} [opts.extraButtons] — Additional NativeFlow button objects
 */
export async function sendRichCode(sock, jid, quotedMsg, code, {
  language = '', title = '💻 Code', footer = 'Yuzuki MD', extraButtons = [],
} = {}) {
  const langLabel = language ? `*${language}*\n` : '';
  const body = `${title}\n\n${langLabel}\`\`\`\n${code}\n\`\`\``;

  return sendCard(sock, jid, quotedMsg, {
    body,
    footer,
    buttons: [
      copyButton('📋 Copy Code', code),
      ...extraButtons,
    ],
    fallback: body,
  });
}

// ─── Data table card ──────────────────────────────────────────────────────────

/**
 * Send a formatted data-table card.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} title
 * @param {Array<[string, string]>} rows  — [[label, value], ...]
 * @param {object} [opts]
 * @param {string}   [opts.footer]
 * @param {object[]} [opts.buttons]
 */
export async function sendRichTable(sock, jid, quotedMsg, title, rows, {
  footer = 'Yuzuki MD', buttons = [],
} = {}) {
  const maxLabel = Math.max(...rows.map(([l]) => l.length), 0);
  const lines = rows.map(([label, value]) => {
    const padded = label.padEnd(maxLabel);
    return `  ${padded} : ${value}`;
  });

  const body = `*${title}*\n${'─'.repeat(28)}\n${lines.join('\n')}\n${'─'.repeat(28)}`;

  return sendCard(sock, jid, quotedMsg, {
    body, footer, buttons,
    fallback: body,
  });
}

// ─── Rich list card ───────────────────────────────────────────────────────────

/**
 * Send a numbered / bulleted list card.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} title
 * @param {string[]} items
 * @param {object} [opts]
 * @param {boolean} [opts.numbered]   — Use numbers instead of bullets (default: true)
 * @param {string}  [opts.footer]
 * @param {object[]} [opts.buttons]
 */
export async function sendRichList(sock, jid, quotedMsg, title, items, {
  numbered = true, footer = 'Yuzuki MD', buttons = [],
} = {}) {
  const lines = items.map((item, i) =>
    numbered ? `${i + 1}. ${item}` : `• ${item}`
  );
  const body = `*${title}*\n\n${lines.join('\n')}`;

  return sendCard(sock, jid, quotedMsg, {
    body, footer, buttons,
    fallback: body,
  });
}

// ─── Field info card ──────────────────────────────────────────────────────────

/**
 * Send a rich info card with labeled fields.
 * Similar to sendRichTable but with emoji field markers.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {object} opts
 * @param {string}   opts.title
 * @param {string}   [opts.description]
 * @param {Array<{ emoji: string, label: string, value: string }>} opts.fields
 * @param {string}   [opts.footer]
 * @param {object[]} [opts.buttons]
 */
export async function sendRichInfo(sock, jid, quotedMsg, {
  title, description, fields = [], footer = 'Yuzuki MD', buttons = [],
}) {
  const header  = description ? `*${title}*\n\n${description}\n\n` : `*${title}*\n\n`;
  const fieldLines = fields.map(({ emoji, label, value }) =>
    `${emoji ?? '◦'} *${label}:* ${value}`
  ).join('\n');

  const body = `${header}${fieldLines}`;

  return sendCard(sock, jid, quotedMsg, {
    body, footer, buttons,
    fallback: body,
  });
}

// ─── Compare card ─────────────────────────────────────────────────────────────

/**
 * Send a two-column comparison card (before vs after, A vs B, etc.).
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} title
 * @param {{ label: string, items: string[] }} left
 * @param {{ label: string, items: string[] }} right
 * @param {object} [opts]
 */
export async function sendRichCompare(sock, jid, quotedMsg, title, left, right, {
  footer = 'Yuzuki MD', buttons = [],
} = {}) {
  const len   = Math.max(left.items.length, right.items.length);
  const lHead = left.label.padEnd(20);
  const rHead = right.label;
  const sep   = '─'.repeat(40);

  const lines = [`*${title}*\n\n${lHead}│ ${rHead}`, sep];
  for (let i = 0; i < len; i++) {
    const l = (left.items[i]  ?? '').padEnd(20);
    const r = right.items[i]  ?? '';
    lines.push(`${l}│ ${r}`);
  }

  const body = lines.join('\n');
  return sendCard(sock, jid, quotedMsg, { body, footer, buttons, fallback: body });
}
