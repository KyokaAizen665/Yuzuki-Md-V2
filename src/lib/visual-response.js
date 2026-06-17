/**
 * Visual Response System (VRS)
 *
 * Provides sendHeroCard — a wrapper around sendCard that automatically
 * attaches a hero image header based on heroType, then falls back to
 * plain text if the card delivery fails.
 *
 * Exports:
 *   sendHeroCard(sock, jid, msg, opts)
 *   copyButton(label, textToCopy)   — re-exported from message-engine
 */

import { sendCard, prepareImageHeader, copyButton } from '../message-engine/interactive.js';
import { pickAndLoad } from './hero-pool.js';

export { copyButton };

// ─── Hero type → Unsplash photo IDs ──────────────────────────────────────────
// Fallback images per heroType when the hero-pool has nothing.
const TYPE_IMAGES = {
  economy:  'https://images.unsplash.com/photo-1518458028785-8fbcd101ebb9?w=800&q=85&fit=crop',
  utility:  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=85&fit=crop',
  group:    'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=85&fit=crop',
  rpg:      'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&q=85&fit=crop',
  game:     'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&q=85&fit=crop',
  tools:    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=85&fit=crop',
  default:  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=85&fit=crop',
};

/**
 * Send an interactive card with an auto-selected hero image header.
 *
 * @param {object} sock        - Baileys socket
 * @param {string} jid         - Recipient JID
 * @param {object} msg         - Original WA message (used as quoted context)
 * @param {object} opts
 * @param {string}  opts.body
 * @param {string}  [opts.footer]
 * @param {string}  [opts.heroType]   - 'economy' | 'utility' | 'group' | 'rpg' | 'game' | 'tools'
 * @param {object}  [opts.settings]
 * @param {Array}   [opts.buttons]
 * @param {boolean} [opts.forceHero]  - Skip pool, always fetch a type image
 * @param {string}  [opts.fallback]   - Plain-text fallback if card fails
 */
export async function sendHeroCard(sock, jid, msg, opts = {}) {
  const {
    body,
    footer    = opts.settings?.botName ?? 'Yuzuki MD',
    heroType  = 'default',
    buttons   = [],
    forceHero = false,
    fallback  = body,
  } = opts;

  let mediaHeader;

  try {
    if (!forceHero) {
      // Try the shared hero pool first (local assets + Unsplash CDN)
      const { buf } = await pickAndLoad();
      if (buf) {
        mediaHeader = await prepareImageHeader(sock, buf);
      }
    }

    if (!mediaHeader) {
      // Fallback to heroType-mapped URL
      const url = TYPE_IMAGES[heroType] ?? TYPE_IMAGES.default;
      mediaHeader = await prepareImageHeader(sock, { url });
    }
  } catch {
    // Image failed entirely — send as text card without header
  }

  return sendCard(sock, jid, msg, {
    body,
    footer,
    buttons,
    mediaHeader,
    fallback,
  });
}
