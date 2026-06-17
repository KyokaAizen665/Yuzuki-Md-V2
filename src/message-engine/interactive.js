/**
 * Message Engine — Interactive Layer
 *
 * NativeFlow interactive message builders and senders.
 * Migrated to cv3inx/baileys — all socketon aliases still resolve correctly.
 *
 * Button factories:
 *   copyButton(label, text)
 *   urlButton(label, url)
 *   callButton(label, phoneNumber)     ← NEW (cv3inx cta_call)
 *   quickReply(label, id)
 *   selectButton(label, rows, title?)
 *   selectButtonSections(label, sections)
 *
 * Interactive senders:
 *   sendCard(sock, jid, quotedMsg, opts)
 *   sendMenuCard(...)
 *   sendCommandCard(...)
 *   sendCategoryCard(...)
 *   sendSearchCard(...)
 *   prepareImageHeader(sock, imageSource)
 *   buildContent(opts)
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

/**
 * "Copy to clipboard" button.
 */
export function copyButton(label, textToCopy) {
  return {
    name: 'cta_copy',
    buttonParamsJson: JSON.stringify({ display_text: label, copy_code: String(textToCopy) }),
  };
}

/**
 * URL / link button.
 */
export function urlButton(label, url) {
  return {
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({ display_text: label, url, merchant_url: url }),
  };
}

/**
 * Phone call button (cv3inx cta_call).
 * Opens the dialer pre-filled with the given phone number.
 * @param {string} label
 * @param {string} phoneNumber  — E.164 format recommended (e.g. "+628123456789")
 */
export function callButton(label, phoneNumber) {
  return {
    name: 'cta_call',
    buttonParamsJson: JSON.stringify({ display_text: label, phone_number: String(phoneNumber) }),
  };
}

/** Alias for callButton */
export const phoneCallButton = callButton;

/**
 * Single-select dropdown button (one section of rows).
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
 * Multi-section single-select button.
 */
export function selectButtonSections(label, sections) {
  return {
    name: 'single_select',
    buttonParamsJson: JSON.stringify({ title: label, sections }),
  };
}

/**
 * Quick-reply button (sends the id as a message when tapped).
 */
export function quickReply(label, id) {
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: label, id }),
  };
}

// ─── Content builder ──────────────────────────────────────────────────────────

/**
 * Build a viewOnce interactiveMessage content object.
 *
 * @param {object} opts
 * @param {string}   opts.body
 * @param {string}   [opts.footer]
 * @param {string}   [opts.headerTitle]
 * @param {object[]} [opts.buttons]
 * @param {object}   [opts.mediaHeader]
 * @param {boolean}  [opts.asTemplate]   — wrap in templateMessage for legacy WA clients
 * @returns {object}
 */
export function buildContent({
  body, footer = '', headerTitle, buttons = [], mediaHeader, asTemplate = false,
} = {}) {
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

  // asTemplate mode wraps the interactive in a templateMessage so older WA
  // clients that do not support nativeFlowMessage still render something.
  if (asTemplate) {
    return {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          templateMessage: {
            hydratedTemplate: {
              hydratedContentText: body,
              hydratedFooterText: footer,
              hydratedButtons: buttons.map((b) => ({
                index: 0,
                urlButton: b.name === 'cta_url'
                  ? { displayText: JSON.parse(b.buttonParamsJson).display_text, url: JSON.parse(b.buttonParamsJson).url }
                  : undefined,
                callButton: b.name === 'cta_call'
                  ? { displayText: JSON.parse(b.buttonParamsJson).display_text, phoneNumber: JSON.parse(b.buttonParamsJson).phone_number }
                  : undefined,
                quickReplyButton: b.name === 'quick_reply'
                  ? { displayText: JSON.parse(b.buttonParamsJson).display_text, id: JSON.parse(b.buttonParamsJson).id }
                  : undefined,
              })).filter(b => b.urlButton || b.callButton || b.quickReplyButton),
            },
          },
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

// ─── Offer overlay builder ────────────────────────────────────────────────────

/**
 * Build an offer overlay context (economy / promo commands).
 * Attach the returned object as opts.offerInfo on sendCard.
 *
 * @param {string} offerText           — headline offer text
 * @param {string} offerUrl            — promo URL
 * @param {string} [offerCode]         — discount code (optional)
 * @param {number} [expirationUnix]    — Unix timestamp (seconds) when offer expires
 * @returns {object} offerInfo object to merge into interactiveMessage
 */
export function buildOfferInfo(offerText, offerUrl, offerCode, expirationUnix) {
  return {
    offerText,
    ...(offerUrl   ? { offerUrl }   : {}),
    ...(offerCode  ? { offerCode }  : {}),
    ...(expirationUnix ? { offerExpiration: expirationUnix } : {}),
  };
}

/**
 * Build a bottom-sheet / option overlay (shows a slide-up sheet on tap).
 *
 * @param {string} buttonText   — label on the button that opens the sheet
 * @param {string} [title]      — optional sheet title
 * @returns {object} optionInfo object to merge into interactiveMessage
 */
export function buildOptionInfo(buttonText, title) {
  return {
    optionText:  buttonText,
    ...(title ? { optionTitle: title } : {}),
  };
}

// ─── Core sender ──────────────────────────────────────────────────────────────

/**
 * Send a NativeFlow interactive card.
 * Falls back to plain text on failure so users always get a response.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {object} opts
 * @param {string}   opts.body
 * @param {string}   [opts.footer]
 * @param {string}   [opts.headerTitle]
 * @param {object[]} [opts.buttons]
 * @param {object}   [opts.mediaHeader]
 * @param {string}   [opts.fallback]
 * @param {boolean}  [opts.asTemplate]   — use templateMessage wrapper for older clients
 */
export async function sendCard(sock, jid, quotedMsg, opts) {
  const { fallback, asTemplate, offerInfo, optionInfo, ...contentOpts } = opts;
  try {
    const content = buildContent({ ...contentOpts, asTemplate: asTemplate ?? false });

    // Inject offerInfo / optionInfo into interactiveMessage if provided
    if (offerInfo || optionInfo) {
      const im = content.viewOnceMessage?.message?.interactiveMessage;
      if (im) {
        if (offerInfo)  Object.assign(im, offerInfo);
        if (optionInfo) Object.assign(im, optionInfo);
      }
    }

    const waMsg = generateWAMessageFromContent(jid, content, { quoted: quotedMsg });
    const sent  = await sock.relayMessage(jid, waMsg.message, { messageId: waMsg.key.id });
    return { ok: true, sent };
  } catch (err) {
    const fallbackText = fallback ?? opts.body;
    try {
      const fallbackSent = await sock.sendMessage(jid, { text: fallbackText }, { quoted: quotedMsg });
      return {
        ok: false,
        error: err instanceof Error ? err : new Error(String(err)),
        fallbackSent,
      };
    } catch {
      return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }
}

// ─── Media-header helper ──────────────────────────────────────────────────────

/**
 * Prepare a media header for use in sendCard.
 * @param {object} sock
 * @param {Buffer|{ url: string }} imageSource
 * @returns {Promise<object|undefined>}
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

// ─── Specialised senders ──────────────────────────────────────────────────────

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

export async function sendCommandCard(sock, jid, quotedMsg, body, usageText, commandName, category = 'Yuzuki MD') {
  return sendCard(sock, jid, quotedMsg, {
    body,
    footer:  category,
    buttons: [
      copyButton('📋 Copy Usage',   usageText),
      copyButton('📝 Copy Command', commandName),
    ],
    fallback: body,
  });
}

export async function sendCategoryCard(sock, jid, quotedMsg, body, rows, botName, categoryTitle) {
  return sendCard(sock, jid, quotedMsg, {
    body,
    footer:  botName,
    buttons: [selectButton('📂 Command Details', rows, `${categoryTitle} Commands`)],
    fallback: body,
  });
}

export async function sendSearchCard(sock, jid, quotedMsg, caption, rows, query, resultCount) {
  return sendCard(sock, jid, quotedMsg, {
    body:    caption,
    footer:  `${resultCount} result${resultCount !== 1 ? 's' : ''} found`,
    buttons: rows.length ? [selectButton('📋 View Command', rows, `Results for "${query}"`)] : [],
    fallback: caption,
  });
}
