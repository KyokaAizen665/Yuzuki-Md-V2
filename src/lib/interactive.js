/**
 * Interactive Layer — NativeFlow helpers (low-level)
 *
 * Migrated to cv3inx/baileys (socketon alias still resolves).
 *
 * Button factories: copyButton, urlButton, callButton, quickReply,
 *   selectButton, selectButtonSections
 * Senders: sendInteractive, sendPluginCard, sendCategoryCard, sendMenuInteractive
 */

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { generateWAMessageFromContent, prepareWAMessageMedia } = _require('socketon');

import { getCommandsByCategory } from './registry.js';
import { CATEGORY_META, buildCommandHelp } from './menu-builder.js';

// ─── Button factories ─────────────────────────────────────────────────────────

export function copyButton(displayText, textToCopy) {
  return {
    name: 'cta_copy',
    buttonParamsJson: JSON.stringify({ display_text: displayText, copy_code: textToCopy }),
  };
}

export function urlButton(displayText, url) {
  return {
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({ display_text: displayText, url, merchant_url: url }),
  };
}

/**
 * Phone call button (cv3inx cta_call).
 * @param {string} displayText
 * @param {string} phoneNumber  — E.164 format recommended (e.g. "+628123456789")
 */
export function callButton(displayText, phoneNumber) {
  return {
    name: 'cta_call',
    buttonParamsJson: JSON.stringify({ display_text: displayText, phone_number: String(phoneNumber) }),
  };
}

export const phoneCallButton = callButton;

export function selectButton(title, rows, sectionTitle = 'Options') {
  return {
    name: 'single_select',
    buttonParamsJson: JSON.stringify({
      title,
      sections: [{ title: sectionTitle, rows }],
    }),
  };
}

export function selectButtonSections(title, sections) {
  return {
    name: 'single_select',
    buttonParamsJson: JSON.stringify({ title, sections }),
  };
}

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
 * @param {string}   opts.body
 * @param {string}   [opts.footer]
 * @param {string}   [opts.headerTitle]
 * @param {object[]} [opts.buttons]
 * @param {object}   [opts.mediaHeader]
 * @param {object}   [opts.quotedMsg]
 * @param {boolean}  [opts.asTemplate]   — wrap for legacy WA clients
 */
export function buildInteractiveContent(jid, opts) {
  const { body, footer = '', headerTitle, buttons = [], mediaHeader, asTemplate = false } = opts;

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

  if (asTemplate) {
    return {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          templateMessage: { hydratedTemplate: { hydratedContentText: body, hydratedFooterText: footer } },
          interactiveMessage,
        },
      },
    };
  }

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

export async function sendPluginCard(sock, jid, quotedMsg, cmd, prefix) {
  const body    = buildCommandHelp(cmd, prefix);
  const usage   = (cmd.usage ?? `${prefix}${cmd.name}`).replace(/^\./, prefix);
  const buttons = [
    copyButton('📋 Copy Usage', usage),
    copyButton('📝 Copy Name',  `${prefix}${cmd.name}`),
  ];
  await sendInteractive(sock, jid, quotedMsg, {
    body, footer: cmd.category ?? 'Yuzuki MD', buttons,
  }, body);
}

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
      rowId:       `${prefix}help ${cmd.name}`,
    }));

  const body = `${meta.icon} *${meta.title} Commands*\n\n` +
    cmds.map(c => `◦ *${prefix}${c.name}*${c.description ? '  _' + c.description.slice(0, 45) + '_' : ''}`).join('\n');

  await sendInteractive(sock, jid, quotedMsg, {
    body, footer: botName,
    buttons: [selectButton('📂 Command Details', rows, `${meta.title} Commands`)],
  }, body);
}

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
  await sendInteractive(sock, jid, quotedMsg, {
    body:   caption,
    footer: 'Powered by YuzukiMD',
    buttons: [selectButton('📂 Browse Categories', rows, 'Menu Categories')],
    mediaHeader,
  }, caption);
}
