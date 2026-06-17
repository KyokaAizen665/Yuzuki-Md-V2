/**
 * NativeFlow Carousel — Registry-driven all-categories carousel
 *
 * The carousel (carouselMessage) is the only interactive type that has
 * no cv3inx/baileys helper — it must be assembled with
 * generateWAMessageFromContent + sock.relayMessage directly.
 *
 * This module is the single place in the framework where raw Socketon
 * internals are used for UI. Everything else goes through message-engine.
 *
 * Graceful fallback:
 *   If the carousel relay fails (older WA clients / relay error) the
 *   function sends a plain-text category listing instead and returns
 *   { ok: false, error }.
 *
 * Usage:
 *   import { allMenuCarousel } from '../nativeflow/carousel.js';
 *
 *   await allMenuCarousel(sock, jid, msg, {
 *     prefix, botName,
 *     thumbUrl:   'https://…/thumb.jpg',
 *     ctaButtons: [
 *       { label: '⭐ GitHub', url: 'https://github.com/…' },
 *       { label: '💬 Owner',  url: 'https://wa.me/…'     },
 *     ],
 *   });
 */

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { generateWAMessageFromContent, prepareWAMessageMedia } = _require('socketon');

import {
  getCategories,
  getCommandsByCategory,
} from '../lib/registry.js';

import { CATEGORY_META } from '../lib/menu-builder.js';

// Maximum cards WhatsApp renders in a carousel
const MAX_CARDS = 10;

// Max commands listed per category panel inside a card
const MAX_CMDS_PER_CAT = 8;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Build a cta_url NativeFlow button object. */
function ctaUrl(label, url) {
  return {
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({ display_text: label, url, merchant_url: url }),
  };
}

/** Return icon + title for a category key, with safe defaults. */
function catMeta(key) {
  const m = CATEGORY_META[key];
  return {
    icon:  m?.icon  ?? '📁',
    title: m?.title ?? key.charAt(0).toUpperCase() + key.slice(1),
  };
}

/** Group an array into chunks of at most `size` items. */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── allMenuCarousel ─────────────────────────────────────────────────────────

/**
 * Send a swipeable carousel where each card covers 1–2 registry categories.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object}   msg              - Message to quote (pass msg from execute context)
 * @param {object}   [opts]
 * @param {string}   [opts.prefix]
 * @param {string}   [opts.botName]
 * @param {string}   [opts.thumbUrl]  - Image URL used for card headers
 * @param {Array<{label: string, url: string}>} [opts.ctaButtons]
 *   Up to MAX_CARDS CTA entries — one button is shown per card in order.
 *   Cards beyond the array length get no button.
 * @returns {Promise<{ok: boolean, error?: Error}>}
 */
export async function allMenuCarousel(sock, jid, msg, {
  prefix     = '.',
  botName    = 'Yuzuki MD',
  thumbUrl   = '',
  ctaButtons = [],
} = {}) {

  // ── Group categories into pairs (2 per card, max MAX_CARDS cards) ──────────
  const cats   = getCategories();
  const groups = chunk(cats, 2).slice(0, MAX_CARDS);

  // ── Upload shared header image (best-effort) ───────────────────────────────
  let sharedMedia;
  if (thumbUrl) {
    try {
      sharedMedia = await prepareWAMessageMedia(
        { image: { url: thumbUrl } },
        { upload: sock.waUploadToServer },
      );
    } catch {
      // No image header — fall through to text-only cards
    }
  }

  // ── Build carousel cards ───────────────────────────────────────────────────
  const cards = groups.map((keys, idx) => {
    const subtitle = keys
      .map(k => { const m = catMeta(k); return `${m.icon} ${m.title}`; })
      .join('  ·  ');

    const bodyLines = [];
    for (let ki = 0; ki < keys.length; ki++) {
      const key  = keys[ki];
      const meta = catMeta(key);
      const cmds = getCommandsByCategory(key)
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, MAX_CMDS_PER_CAT);

      bodyLines.push(`${meta.icon} *${meta.title}*`);
      for (const cmd of cmds) bodyLines.push(`◦ ${prefix}${cmd.name}`);
      if (ki < keys.length - 1 && bodyLines.length > 0) bodyLines.push('─'.repeat(16));
    }

    const header = sharedMedia
      ? { ...sharedMedia, title: '', subtitle, hasMediaAttachment: true }
      : { title: botName, subtitle, hasMediaAttachment: false };

    const ctaEntry = ctaButtons[idx];
    const buttons  = ctaEntry ? [ctaUrl(ctaEntry.label, ctaEntry.url)] : [];

    return {
      header,
      body: { text: bodyLines.join('\n') || '(no commands)' },
      nativeFlowMessage: { buttons },
    };
  });

  // ── Assemble and relay the carousel ───────────────────────────────────────
  const overviewText = (
    `📋 *${botName} — Full Menu*\n` +
    `${'━'.repeat(19)}\n` +
    `Swipe the cards to browse all categories.\n` +
    `Type *${prefix}<command>* to use any command.`
  );

  try {
    const carouselMsg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
            interactiveMessage: {
              body: { text: overviewText },
              carouselMessage: { cards, messageVersion: 1 },
            },
          },
        },
      },
      { quoted: msg },
    );

    await sock.relayMessage(jid, carouselMsg.message, { messageId: carouselMsg.key.id });
    return { ok: true };

  } catch (err) {
    // ── Plain-text fallback ────────────────────────────────────────────────
    const fallbackLines = [overviewText, ''];
    for (const cat of cats) {
      const meta  = catMeta(cat);
      const count = getCommandsByCategory(cat).length;
      fallbackLines.push(`${meta.icon} *${meta.title}*  _(${count} cmds)_  →  ${prefix}menu ${cat}`);
    }
    try {
      await sock.sendMessage(jid, { text: fallbackLines.join('\n') }, { quoted: msg });
    } catch {
      // Nothing more we can do
    }
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
