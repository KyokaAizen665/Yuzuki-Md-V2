/**
 * Message Engine — Cards Layer
 *
 * Pre-built, reusable message templates for common bot patterns.
 * All cards delegate to the text and interactive layers — they
 * never call sock.sendMessage directly.
 *
 * Design principle:
 *   Cards = opinionated templates. They encode Yuzuki's visual style so
 *   individual plugins don't need to think about formatting.
 *
 * Available templates:
 *   errorCard        — ❌ error reply with optional detail
 *   successCard      — ✅ success confirmation
 *   progressCard     — ⏱️ reaction + "working…" text before slow ops
 *   infoCard         — ℹ️ general information display
 *   noticeCard       — ⚠️ warning / notice
 *   ownerOnlyCard    — ⛔ access-denied for non-owner callers
 *   usageCard        — 💡 incorrect-usage reminder
 *   loadingSequence  — react ⏱️, do work, react ✅/❌ in one call
 *
 * Usage:
 *   import { errorCard, progressCard, loadingSequence } from '../message-engine/cards.js';
 *
 *   // In a plugin execute():
 *   const done = await loadingSequence(sock, jid, msg, async () => {
 *     const result = await someSlowOperation();
 *     await sendImage(sock, jid, { url: result.url }, result.title, { quoted: msg });
 *   });
 */

import { sendText, sendReply, sendReact } from './text.js';
import { sendCard, copyButton, urlButton } from './interactive.js';

// ─── Error card ───────────────────────────────────────────────────────────────

/**
 * Send a standardised error message.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string|Error} error       - Error message or Error instance
 * @param {object} [opts]
 * @param {string}  [opts.label]     - Short label (default: "Error")
 * @param {string}  [opts.hint]      - Optional recovery hint shown to user
 * @param {boolean} [opts.react]     - Send ❌ reaction before text (default: true)
 * @returns {Promise<{ ok: boolean }>}
 */
export async function errorCard(sock, jid, quotedMsg, error, {
  label = 'Error', hint, react: doReact = true,
} = {}) {
  const errMsg = error instanceof Error ? error.message : String(error);

  if (doReact && quotedMsg?.key) {
    await sendReact(sock, jid, '❌', quotedMsg.key).catch(() => {});
  }

  const lines = [`❌  *${label}*`, `╰›  ${errMsg}`];
  if (hint) lines.push(``, `💡  _${hint}_`);

  return sendReply(sock, jid, lines.join('\n'), quotedMsg);
}

// ─── Success card ─────────────────────────────────────────────────────────────

/**
 * Send a standardised success confirmation.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} label             - What succeeded (e.g. "Plugin Loaded")
 * @param {string} [value]           - Optional: the resulting value (shown after arrow)
 * @param {object} [opts]
 * @param {boolean} [opts.react]     - Send ✅ reaction (default: true)
 * @returns {Promise<{ ok: boolean }>}
 */
export async function successCard(sock, jid, quotedMsg, label, value, {
  react: doReact = true,
} = {}) {
  if (doReact && quotedMsg?.key) {
    await sendReact(sock, jid, '✅', quotedMsg.key).catch(() => {});
  }

  const text = value
    ? `✅  *${label}*\n╰›  ${value}`
    : `✅  *${label}*`;

  return sendReply(sock, jid, text, quotedMsg);
}

// ─── Progress card ────────────────────────────────────────────────────────────

/**
 * Send a "working on it" progress indicator before a slow operation.
 * Sends a ⏱️ reaction on the trigger message and a text reply.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} label             - e.g. "Downloading Video"
 * @param {string} [detail]          - e.g. "This may take a moment..."
 * @returns {Promise<{ ok: boolean }>}
 */
export async function progressCard(sock, jid, quotedMsg, label, detail) {
  if (quotedMsg?.key) {
    await sendReact(sock, jid, '⏱️', quotedMsg.key).catch(() => {});
  }

  const text = detail
    ? `⏱️  *${label}*\n╰›  _${detail}_`
    : `⏱️  *${label}*`;

  return sendReply(sock, jid, text, quotedMsg);
}

// ─── Info card ────────────────────────────────────────────────────────────────

/**
 * Send a general information card.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} emoji
 * @param {string} title
 * @param {Array<[string, string]|null>} fields  - [label, value] pairs; null = horizontal divider
 * @param {string} [footer]
 * @returns {Promise<{ ok: boolean }>}
 */
export async function infoCard(sock, jid, quotedMsg, emoji, title, fields, footer) {
  const LINE = '─'.repeat(22);
  const SEP  = '┄'.repeat(22);

  const header = `╭${LINE}╮\n│  ${emoji}  *${title.toUpperCase()}*`;
  const body = fields.map(row => {
    if (row === null) return `│  ${SEP}`;
    const [label, value] = row;
    return `│  ${label.padEnd(12)}› ${value}`;
  }).join('\n');
  const foot = footer ? `╰${LINE}╯\n_${footer}_` : `╰${LINE}╯`;

  const text = `${header}\n│\n${body}\n│\n${foot}`;
  return sendReply(sock, jid, text, quotedMsg);
}

// ─── Notice card ──────────────────────────────────────────────────────────────

/**
 * Send a warning / notice message.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} label
 * @param {string} [detail]
 * @returns {Promise<{ ok: boolean }>}
 */
export async function noticeCard(sock, jid, quotedMsg, label, detail) {
  const text = detail
    ? `⚠️  *${label}*\n╰›  _${detail}_`
    : `⚠️  *${label}*`;
  return sendReply(sock, jid, text, quotedMsg);
}

// ─── Owner-only denial card ───────────────────────────────────────────────────

/**
 * Send an access-denied card for non-owner users.
 * Consistent wording across every owner-only command.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @returns {Promise<{ ok: boolean }>}
 */
export async function ownerOnlyCard(sock, jid, quotedMsg) {
  return sendReply(sock, jid, '⛔  *Owner Only*\n╰›  This command is restricted to bot owners.', quotedMsg);
}

// ─── Usage card ───────────────────────────────────────────────────────────────

/**
 * Send a "wrong usage" reminder.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} usage             - Correct usage string (e.g. ".download <url>")
 * @param {string} [example]         - Optional example
 * @returns {Promise<{ ok: boolean }>}
 */
export async function usageCard(sock, jid, quotedMsg, usage, example) {
  const lines = [`💡  *Usage*`, `╰›  \`${usage}\``];
  if (example) lines.push(``, `📌  _Example:_ \`${example}\``);
  return sendReply(sock, jid, lines.join('\n'), quotedMsg);
}

// ─── Interactive info card ────────────────────────────────────────────────────

/**
 * Send an interactive info card with optional action buttons.
 * Useful for bot status, system info, and plugin detail displays.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} body              - Card body text (WA markdown supported)
 * @param {string} [footer]
 * @param {object[]} [buttons]       - NativeFlow buttons (from interactive.js factories)
 * @returns {Promise<{ ok: boolean }>}
 */
export async function richInfoCard(sock, jid, quotedMsg, body, footer = 'Yuzuki MD', buttons = []) {
  return sendCard(sock, jid, quotedMsg, { body, footer, buttons, fallback: body });
}

// ─── Loading sequence helper ──────────────────────────────────────────────────

/**
 * Wraps a slow async operation with automatic ⏱️ / ✅ / ❌ reactions.
 *
 * 1. Sends a ⏱️ reaction on the trigger message.
 * 2. Executes your async work function.
 * 3. On success: sends a ✅ reaction.
 * 4. On failure: sends a ❌ reaction + an errorCard.
 *
 * The work function receives `{ react }` helper for custom mid-work reactions.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object}   quotedMsg
 * @param {Function} workFn          - async () => any  — your operation
 * @param {object}   [opts]
 * @param {string}   [opts.errorLabel]  - Label for the error card (default: "Failed")
 * @param {string}   [opts.errorHint]   - Hint for the error card
 * @returns {Promise<{ ok: boolean, result?: any, error?: Error }>}
 */
export async function loadingSequence(sock, jid, quotedMsg, workFn, {
  errorLabel = 'Failed', errorHint,
} = {}) {
  const key = quotedMsg?.key;

  // 1. Show ⏱️ reaction
  if (key) await sendReact(sock, jid, '⏱️', key).catch(() => {});

  try {
    // 2. Run the work
    const result = await workFn({
      react: (emoji) => key ? sendReact(sock, jid, emoji, key) : Promise.resolve(),
    });

    // 3. Success reaction
    if (key) await sendReact(sock, jid, '✅', key).catch(() => {});
    return { ok: true, result };

  } catch (err) {
    // 4. Failure reaction + error card
    if (key) await sendReact(sock, jid, '❌', key).catch(() => {});
    await errorCard(sock, jid, quotedMsg, err, {
      label: errorLabel,
      hint:  errorHint,
      react: false, // already sent ❌ reaction above
    });
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

// ─── Convenience re-exports ───────────────────────────────────────────────────
// So plugins only need to import from cards.js for the most common patterns.

export { copyButton, urlButton } from './interactive.js';
