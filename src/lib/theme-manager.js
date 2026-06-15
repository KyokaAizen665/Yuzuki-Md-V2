/**
 * Theme Manager — Runtime Theme Resolution
 *
 * Resolves the active theme from settings and provides theme-aware
 * versions of greeting and hero image selection.
 *
 * Everything here delegates to the registry and the lower-level
 * greeting/hero-pool modules — this is the single wiring point
 * so the menu plugin stays clean.
 *
 * ─── API ──────────────────────────────────────────────────────────────────────
 *
 *   getActiveTheme(settings)
 *     Reads settings.menuTheme, returns the matching ThemeObject.
 *     Falls back to 'default' when the key is missing or unknown.
 *
 *   resolveGreeting(theme, opts?)
 *     Returns a personalised, time-based greeting string using:
 *       1. Theme-specific variants for the current slot (if defined)
 *       2. Global GREETING_SLOTS defaults from greeting.js (fallback)
 *
 *   resolveHero(theme, timeoutMs?)
 *     Picks a random image from the theme's heroPool.
 *     Cycles through remaining entries on failure.
 *     Returns Buffer | undefined.
 */

import { getTheme }        from './theme-registry.js';
import { GREETING_SLOTS, getSlot } from './greeting.js';
import { loadHeroBuf }     from './hero-pool.js';

// ── Active theme ──────────────────────────────────────────────────────────────

/**
 * Resolve the active theme from settings.
 * @param {object} [settings]
 * @returns {object} ThemeObject
 */
export function getActiveTheme(settings) {
  return getTheme(settings?.menuTheme ?? 'default');
}

// ── Greeting ──────────────────────────────────────────────────────────────────

/**
 * Pick a random string from an array.
 * @param {string[]} arr
 * @returns {string}
 */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Interpolate {name} and {botName} tokens.
 * @param {string} tpl
 * @param {string} name
 * @param {string} botName
 * @returns {string}
 */
function fill(tpl, name, botName) {
  return tpl
    .replace(/\{name\}/g,    name)
    .replace(/\{botName\}/g, botName);
}

/**
 * Build a personalised, time-based greeting for the given theme.
 *
 * Resolution order for the active time slot:
 *   1. theme.greetings[slot]  — theme-specific variants (if non-empty array)
 *   2. GREETING_SLOTS[slot].variants — global defaults from greeting.js
 *   3. opts.fallback          — last-resort plain string
 *
 * @param {object} theme                         - ThemeObject from theme-registry
 * @param {object} [opts]
 * @param {string} [opts.name='User']
 * @param {string} [opts.botName='Yuzuki MD']
 * @param {number} [opts.hour]                   - Override hour (0–23)
 * @param {string} [opts.fallback]               - Hard fallback string
 * @returns {string}
 */
export function resolveGreeting(theme, {
  name     = 'User',
  botName  = 'Yuzuki MD',
  hour,
  fallback = '👋 Hello, *{name}*! *{botName}* is ready.',
} = {}) {
  const slot = getSlot(hour);

  // 1. Theme-specific overrides
  const themeVariants = theme?.greetings?.[slot];
  if (Array.isArray(themeVariants) && themeVariants.length) {
    return fill(pick(themeVariants), name, botName);
  }

  // 2. Global defaults
  const globalVariants = GREETING_SLOTS[slot]?.variants;
  if (Array.isArray(globalVariants) && globalVariants.length) {
    return fill(pick(globalVariants), name, botName);
  }

  // 3. Hard fallback
  return fill(fallback, name, botName);
}

// ── Hero image ────────────────────────────────────────────────────────────────

/**
 * Pick and load a hero image Buffer from the theme's heroPool.
 *
 * Tries the randomly chosen entry first, then cycles through remaining
 * entries in order. Returns undefined when every entry fails.
 *
 * @param {object} theme
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<Buffer|undefined>}
 */
export async function resolveHero(theme, timeoutMs = 5000) {
  const pool = theme?.heroPool;
  if (!Array.isArray(pool) || !pool.length) return undefined;

  const startIdx = Math.floor(Math.random() * pool.length);
  for (let i = 0; i < pool.length; i++) {
    const entry = pool[(startIdx + i) % pool.length];
    const buf   = await loadHeroBuf(entry, timeoutMs);
    if (buf) return buf;
  }
  return undefined;
}

/**
 * Load a hero image from a plain URL (used for the settings.menuBgUrl override).
 * Returns undefined on any failure.
 *
 * @param {string} url
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<Buffer|undefined>}
 */
export async function resolveHeroFromUrl(url, timeoutMs = 5000) {
  return loadHeroBuf({ type: 'url', value: url }, timeoutMs);
}
