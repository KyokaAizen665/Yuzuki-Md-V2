/**
 * Message Engine — Interactive Layer
 *
 * NativeFlow interactive message builders and senders.
 * This module is the canonical source for all interactive messages in the bot.
 * It wraps and extends the lower-level helpers in src/lib/interactive.js,
 * adding consistent error handling, a unified API, and richer button factories.
 *
 * Architecture note:
 *   src/lib/interactive.js  — low-level Socketon payload assembly (do not call directly)
 *   src/message-engine/interactive.js  — THIS FILE — the public API for all bot code
 *
 * Return shape (send* functions):
 *   { ok: true,  sent: <WAMessage> }
 *   { ok: false, error: <Error>, fallbackSent?: <WAMessage> }
 *
 * Usage:
 *   import { sendCard, copyButton, urlButton, selectButton } from '../message-engine/interactive.js';
 *
 *   await sendCard(sock, jid, msg, {
 *     body:    '✅ *Done!*\nYour task has been saved.',
 *     footer:  'Yuzuki MD',
 *     buttons: [copyButton('Copy ID', taskId)],
 *   });
 */

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { generateWAMessageFromContent, prepareWAMessageMedia } = _require('socketon');

// ─── Internal helper ──────────────────────────────────────────────────────────

async function safe(fn) {
  try {
    const sent = await fn();
    return { ok: true, sent };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

// ─── Button factories ─────────────────────────────────────────────────────────
// These return NativeFlow button objects. Pass them in the `buttons` array.

/**
 * "Copy to clipboard" button.
 * @param {string} label
 * @param {string} textToCopy
 * @returns {object} NativeFlow button
 */
export function copyButton(label, textToCopy) {
  return {
    name: 'cta_copy',
    buttonParamsJson: JSON.stringify({ display_text: label, copy_code: String(textToCopy) }),
  };
}

/**
 * URL / link button.
 * @param {string} label
 * @param {string} url
 * @returns {object} NativeFlow button
 */
export function urlButton(label, url) {
  return {
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({ display_text: label, url, merchant_url: url }),
  };
}

/**
 * Single-select dropdown button (one section of rows).
 * @param {string} label             - Button display label
 * @param {Array<{ title: string, description?: string, rowId: string }>} rows
 * @param {string} [sectionTitle]    - Section header inside the list
 * @returns {object} NativeFlow button
 */
export function selectButton(label, rows, sectionTitle = 'Options') {
  return {
    name: 'single_select',
    buttonParamsJson: JSON.stringify({
      title: label,
      sections: [{ title: sectionTitle, rows }],
    }),
  };
}

/**
 * Multi-section select button.
 * @param {string} label
 * @param {Array<{ title: string, rows: Array<{ title: string, description?: string, rowId: string }> }>} sections
 * @returns {object} NativeFlow button
 */
export function selectButtonSections(label, sections) {
  return {
    name: 'single_select',
    buttonParamsJson: JSON.stringify({ title: label, sections }),
  };
}

/**
 * Quick-reply button.
 * @param {string} label
 * @param {string} id    - The text sent back when tapped
 * @returns {object} NativeFlow button
 */
export function quickReply(label, id) {
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: label, id }),
  };
}

// ─── Content builder ──────────────────────────────────────────────────────────

/**
 * Build a viewOnce interactiveMessage content object (for generateWAMessageFromContent).
 *
 * @param {object} opts
 * @param {string}   opts.body           - Message body (supports WA markdown)
 * @param {string}   [opts.footer]       - Footer text
 * @param {string}   [opts.headerTitle]  - Text header title
 * @param {object[]} [opts.buttons]      - NativeFlow button objects
 * @param {object}   [opts.mediaHeader]  - Pre-prepared media header (prepareWAMessageMedia result)
 * @returns {object} content object for generateWAMessageFromContent
 */
export function buildContent({ body, footer = '', headerTitle, buttons = [], mediaHeader } = {}) {
  const header = mediaHeader
    ? { title: '', subtitle: '', hasMediaAttachment: true, ...mediaHeader }
    : headerTitle
      ? { title: headerTitle, subtitle: '', hasMediaAttachment: false }
      : undefined;

  return {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: {
          body:   { text: body },
          footer: { text: footer },
          nativeFlowMessage: { buttons },
          ...(header ? { header } : {}),
        },
      },
    },
  };
}

// ─── Core sender ──────────────────────────────────────────────────────────────

/**
 * Send a NativeFlow interactive card.
 *
 * Falls back to a plain text message if the interactive send fails,
 * so the user always gets a response even on older WhatsApp versions.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg          - Message to quote (pass msg from execute context)
 * @param {object} opts
 * @param {string}   opts.body
 * @param {string}   [opts.footer]
 * @param {string}   [opts.headerTitle]
 * @param {object[]} [opts.buttons]
 * @param {object}   [opts.mediaHeader]
 * @param {string}   [opts.fallback]  - Override fallback text (defaults to opts.body)
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error, fallbackSent?: object }>}
 */
export async function sendCard(sock, jid, quotedMsg, opts) {
  const { fallback, ...contentOpts } = opts;
  try {
    const content = buildContent(contentOpts);
    const waMsg   = generateWAMessageFromContent(jid, content, { quoted: quotedMsg });
    const sent    = await sock.relayMessage(jid, waMsg.message, { messageId: waMsg.key.id });
    return { ok: true, sent };
  } catch (err) {
    // Graceful fallback to plain text
    const fallbackText = fallback ?? opts.body;
    try {
      const fallbackSent = await sock.sendMessage(jid, { text: fallbackText }, { quoted: quotedMsg });
      return {
        ok: false,
        error: err instanceof Error ? err : new Error(String(err)),
        fallbackSent,
      };
    } catch (fallbackErr) {
      return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }
}

// ─── Media-header helper ──────────────────────────────────────────────────────

/**
 * Prepare a media header for use in sendCard.
 * Call this before sendCard when you want an image header on the card.
 *
 * @param {object} sock
 * @param {Buffer|{ url: string }} imageSource   - Buffer or { url } object
 * @returns {Promise<object|undefined>} mediaHeader (pass to sendCard opts.mediaHeader)
 */
export async function prepareImageHeader(sock, imageSource) {
  try {
    return await prepareWAMessageMedia(
      Buffer.isBuffer(imageSource) ? { image: imageSource } : { image: imageSource },
      { upload: sock.waUploadToServer }
    );
  } catch {
    return undefined;
  }
}

// ─── Specialised card senders ─────────────────────────────────────────────────

/**
 * Send a menu interactive card with an image header and a category select list.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} caption           - Pre-built caption text
 * @param {Array<{ title: string, description: string, rowId: string }>} rows
 * @param {string} botName
 * @param {Buffer|undefined} thumbBuf
 * @param {string} [thumbUrl]
 * @returns {Promise<{ ok: boolean }>}
 */
export async function sendMenuCard(sock, jid, quotedMsg, caption, rows, botName, thumbBuf, thumbUrl) {
  const mediaHeader = await prepareImageHeader(
    sock,
    thumbBuf ?? (thumbUrl ? { url: thumbUrl } : null)
  );

  return sendCard(sock, jid, quotedMsg, {
    body:    caption,
    footer:  'Powered by YuzukiMD',
    buttons: [selectButton('📂 Browse Categories', rows, 'Menu Categories')],
    mediaHeader,
    fallback: caption,
  });
}

/**
 * Send a command/plugin detail card.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} body              - Pre-built help text for this command
 * @param {string} usageText         - Full usage string (for copy button)
 * @param {string} commandName       - e.g. ".chatgpt" (for copy button)
 * @param {string} [category]        - For footer
 * @returns {Promise<{ ok: boolean }>}
 */
export async function sendCommandCard(sock, jid, quotedMsg, body, usageText, commandName, category = 'Yuzuki MD') {
  return sendCard(sock, jid, quotedMsg, {
    body,
    footer:  category,
    buttons: [
      copyButton('📋 Copy Usage', usageText),
      copyButton('📝 Copy Command', commandName),
    ],
    fallback: body,
  });
}

/**
 * Send a category listing card with a select list.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} body              - Pre-built category body text
 * @param {Array<{ title: string, description: string, rowId: string }>} rows
 * @param {string} botName
 * @param {string} categoryTitle
 * @returns {Promise<{ ok: boolean }>}
 */
export async function sendCategoryCard(sock, jid, quotedMsg, body, rows, botName, categoryTitle) {
  return sendCard(sock, jid, quotedMsg, {
    body,
    footer:  botName,
    buttons: [selectButton('📂 Command Details', rows, `${categoryTitle} Commands`)],
    fallback: body,
  });
}

/**
 * Send search results as an interactive select card.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} caption           - Pre-built results caption
 * @param {Array<{ title: string, description: string, rowId: string }>} rows
 * @param {string} query
 * @param {number} resultCount
 * @returns {Promise<{ ok: boolean }>}
 */
export async function sendSearchCard(sock, jid, quotedMsg, caption, rows, query, resultCount) {
  return sendCard(sock, jid, quotedMsg, {
    body:    caption,
    footer:  `${resultCount} result${resultCount !== 1 ? 's' : ''} found`,
    buttons: rows.length ? [selectButton('📋 View Command', rows, `Results for "${query}"`)] : [],
    fallback: caption,
  });
}
