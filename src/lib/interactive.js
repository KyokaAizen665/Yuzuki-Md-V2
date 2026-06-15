/**
 * Interactive Layer — NativeFlow helpers
 *
 * Provides a clean API for building WhatsApp native interactive messages:
 *   - Copy buttons (cta_copy)
 *   - URL buttons (cta_url)
 *   - Single-select lists (single_select)
 *   - Quick replies (quick_reply)
 *   - Full interactive message assembly
 *   - Plugin-card and category-card generators
 *
 * All builders return plain objects. Sending is done via sendInteractive().
 *
 * Usage:
 *   import { sendInteractive, copyButton, selectButton } from '../lib/interactive.js';
 *
 *   await sendInteractive(sock, jid, msg, {
 *     body:    '🤖 *ChatGPT Response*\n...',
 *     footer:  'Yuzuki MD',
 *     buttons: [copyButton('Copy', responseText)],
 *   });
 */

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { generateWAMessageFromContent, prepareWAMessageMedia } = _require('socketon');

import { getCommandsByCategory, getCategories } from './registry.js';
import { CATEGORY_META, buildCommandHelp } from './menu-builder.js';

// ─── Button factories ─────────────────────────────────────────────────────────

/**
 * Create a "copy to clipboard" NativeFlow button.
 * @param {string} displayText
 * @param {string} textToCopy
 */
export function copyButton(displayText, textToCopy) {
  return {
    name: 'cta_copy',
    buttonParamsJson: JSON.stringify({ display_text: displayText, copy_code: textToCopy }),
  };
}

/**
 * Create a URL link button.
 * @param {string} displayText
 * @param {string} url
 */
export function urlButton(displayText, url) {
  return {
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({ display_text: displayText, url, merchant_url: url }),
  };
}

/**
 * Create a single-select (dropdown list) button.
 * @param {string} title             - Button label
 * @param {Array<{ title: string, description?: string, rowId: string }>} rows
 * @param {string} [sectionTitle]    - Section header inside the list
 */
export function selectButton(title, rows, sectionTitle = 'Options') {
  return {
    name: 'single_select',
    buttonParamsJson: JSON.stringify({
      title,
      sections: [{ title: sectionTitle, rows }],
    }),
  };
}

/**
 * Create a multi-section single-select button.
 * @param {string} title
 * @param {Array<{ title: string, rows: Array<{ title: string, description?: string, rowId: string }> }>} sections
 */
export function selectButtonSections(title, sections) {
  return {
    name: 'single_select',
    buttonParamsJson: JSON.stringify({ title, sections }),
  };
}

/**
 * Create a quick-reply button.
 * @param {string} displayText
 * @param {string} id
 */
export function quickReply(displayText, id) {
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: displayText, id }),
  };
}

// ─── Message assembly ─────────────────────────────────────────────────────────

/**
 * Build a viewOnce interactiveMessage content object.
 *
 * @param {string} jid
 * @param {object} opts
 * @param {string}   opts.body             - Message body text (supports WA markdown)
 * @param {string}   [opts.footer]         - Footer text
 * @param {string}   [opts.headerTitle]    - Text header title
 * @param {object[]} [opts.buttons]        - NativeFlow button objects
 * @param {object}   [opts.mediaHeader]    - Pre-prepared media header (from prepareWAMessageMedia)
 * @param {object}   [opts.quotedMsg]      - Message to quote ({ key, message })
 * @returns {object} content object for generateWAMessageFromContent
 */
export function buildInteractiveContent(jid, opts) {
  const { body, footer = '', headerTitle, buttons = [], mediaHeader, quotedMsg } = opts;

  const header = mediaHeader
    ? { title: '', subtitle: '', hasMediaAttachment: true, ...mediaHeader }
    : headerTitle
      ? { title: headerTitle, subtitle: '', hasMediaAttachment: false }
      : undefined;

  const interactiveMessage = {
    body:   { text: body },
    footer: { text: footer },
    nativeFlowMessage: { buttons },
    ...(header ? { header } : {}),
  };

  return {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage,
      },
    },
  };
}

/**
 * Send a NativeFlow interactive message.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg     - The message to quote (pass msg from execute context)
 * @param {object} opts          - Same as buildInteractiveContent opts
 * @param {string} [fallback]    - Plain-text fallback if interactive send fails
 */
export async function sendInteractive(sock, jid, quotedMsg, opts, fallback) {
  try {
    const content = buildInteractiveContent(jid, opts);
    const waMsg   = generateWAMessageFromContent(jid, content, { quoted: quotedMsg });
    await sock.relayMessage(jid, waMsg.message, { messageId: waMsg.key.id });
  } catch {
    const text = fallback ?? opts.body;
    await sock.sendMessage(jid, { text }, { quoted: quotedMsg });
  }
}

// ─── Plugin cards ─────────────────────────────────────────────────────────────

/**
 * Send an interactive card for a single plugin/command.
 * Includes a "copy usage" button and a "copy command name" button.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {object} cmd      - Plugin object from registry
 * @param {string} prefix
 */
export async function sendPluginCard(sock, jid, quotedMsg, cmd, prefix) {
  const body    = buildCommandHelp(cmd, prefix);
  const usage   = (cmd.usage ?? `${prefix}${cmd.name}`).replace(/^\./, prefix);
  const buttons = [
    copyButton('📋 Copy Usage',    usage),
    copyButton('📝 Copy Name',     `${prefix}${cmd.name}`),
  ];
  await sendInteractive(sock, jid, quotedMsg, {
    body,
    footer:  cmd.category ?? 'Yuzuki MD',
    buttons,
  }, body);
}

/**
 * Send a category card with a select-list of commands.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} categoryKey
 * @param {string} botName
 * @param {string} prefix
 */
export async function sendCategoryCard(sock, jid, quotedMsg, categoryKey, botName, prefix) {
  const cmds = getCommandsByCategory(categoryKey);
  if (!cmds.length) {
    await sock.sendMessage(jid, { text: `❌ No commands found in category "${categoryKey}".` }, { quoted: quotedMsg });
    return;
  }

  const meta  = CATEGORY_META[categoryKey] ?? { icon: '📁', title: categoryKey };
  const rows  = cmds
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 10)
    .map(cmd => ({
      title:       `${prefix}${cmd.name}`,
      description: (cmd.description ?? '').slice(0, 72),
      rowId:    `${prefix}help ${cmd.name}`,
    }));

  const body = `${meta.icon} *${meta.title} Commands*\n\n` +
    cmds.map(c => `◦ *${prefix}${c.name}*${c.description ? '  _' + c.description.slice(0, 45) + '_' : ''}`).join('\n');

  const buttons = [selectButton('📂 Command Details', rows, `${meta.title} Commands`)];

  await sendInteractive(sock, jid, quotedMsg, {
    body,
    footer:      botName,
    buttons,
  }, body);
}

/**
 * Send the main menu as an interactive message with a category select.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {string} caption    - Pre-built main menu caption text
 * @param {object[]} rows     - Category rows from buildMenuRows()
 * @param {string} botName
 * @param {Buffer|undefined} thumbBuf
 * @param {string} thumbUrl
 */
export async function sendMenuInteractive(sock, jid, quotedMsg, caption, rows, botName, thumbBuf, thumbUrl) {
  let mediaHeader;
  if (thumbBuf || thumbUrl) {
    try {
      mediaHeader = await prepareWAMessageMedia(
        thumbBuf ? { image: thumbBuf } : { image: { url: thumbUrl } },
        { upload: sock.waUploadToServer }
      );
    } catch {}
  }

  const buttons = [selectButton('📂 Browse Categories', rows, 'Menu Categories')];
  await sendInteractive(sock, jid, quotedMsg, {
    body:   caption,
    footer: 'Powered by YuzukiMD',
    buttons,
    mediaHeader,
  }, caption);
}
