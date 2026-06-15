/**
 * Greeting Manager — Dynamic Time-Based Greetings
 *
 * Generates a personalised greeting based on the local server hour.
 * Each time slot has multiple variants so the message feels fresh
 * even when the same user opens the menu multiple times a day.
 *
 * ─── Time slots ───────────────────────────────────────────────────────────────
 *
 *   morning    05:00 – 11:59   🌅
 *   afternoon  12:00 – 17:59   ☀️
 *   evening    18:00 – 20:59   🌇
 *   night      21:00 – 04:59   🌙
 *
 * ─── API ──────────────────────────────────────────────────────────────────────
 *
 *   getSlot(hour?)            → 'morning' | 'afternoon' | 'evening' | 'night'
 *   getGreeting(opts?)        → full greeting string (ready to embed in caption)
 *   GREETING_SLOTS            → slot metadata (icon, label, variants) for themes
 *
 * ─── Future theme integration ─────────────────────────────────────────────────
 *
 *   getGreeting() accepts an optional `theme` string. Themes can override the
 *   variant pool per slot via GREETING_SLOTS before calling getGreeting().
 *   The API surface is stable — adding themes requires no changes here.
 */

// ── Slot definitions ──────────────────────────────────────────────────────────
//
// `variants` are template strings. Available tokens:
//   {name}    → display name of the user
//   {botName} → name of the bot
//
// Each variant is picked randomly — the pool can be extended freely.

export const GREETING_SLOTS = {
  morning: {
    icon:     '🌅',
    label:    'Good Morning',
    variants: [
      '🌅 Good Morning, *{name}*! Ready to start the day?',
      '☕ Rise and shine, *{name}*! *{botName}* is here for you.',
      '🌄 Good Morning, *{name}*! What can I help you with today?',
      '🌞 Hey *{name}*, good morning! Hope you slept well.',
    ],
  },

  afternoon: {
    icon:     '☀️',
    label:    'Good Afternoon',
    variants: [
      '☀️ Good Afternoon, *{name}*! Hope your day is going great.',
      '🌤️ Hey *{name}*, good afternoon! Need anything?',
      '😊 Good Afternoon, *{name}*! *{botName}* is at your service.',
      '🌻 Afternoon, *{name}*! What can I do for you?',
    ],
  },

  evening: {
    icon:     '🌇',
    label:    'Good Evening',
    variants: [
      '🌇 Good Evening, *{name}*! Winding down for the day?',
      '🌆 Evening, *{name}*! *{botName}* is here whenever you need.',
      '🌃 Good Evening, *{name}*! What can I do for you tonight?',
      '🌉 Hey *{name}*, good evening! Hope you had a great day.',
    ],
  },

  night: {
    icon:     '🌙',
    label:    'Good Night',
    variants: [
      '🌙 Still up, *{name}*? *{botName}* never sleeps!',
      '⭐ Hey *{name}*, burning the midnight oil? I\'m here.',
      '🌌 Late night, *{name}*? *{botName}* is always on.',
      '🦉 Night owl mode, *{name}*! What do you need?',
    ],
  },
};

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Resolve the greeting slot for a given hour (0–23).
 * Falls back to the current local hour when no argument is supplied.
 *
 * @param {number} [hour]  0–23
 * @returns {'morning'|'afternoon'|'evening'|'night'}
 */
export function getSlot(hour) {
  const h = hour ?? new Date().getHours();
  if (h >= 5  && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 21) return 'evening';
  return 'night';
}

/**
 * Pick a random variant string from a slot's variant pool.
 * @param {string[]} variants
 * @returns {string}
 */
function pickVariant(variants) {
  return variants[Math.floor(Math.random() * variants.length)];
}

/**
 * Interpolate `{name}` and `{botName}` tokens in a variant template.
 * @param {string} template
 * @param {string} name
 * @param {string} botName
 * @returns {string}
 */
function interpolate(template, name, botName) {
  return template
    .replace(/\{name\}/g,    name)
    .replace(/\{botName\}/g, botName);
}

/**
 * Build a personalised, time-based greeting string.
 *
 * @param {object} [opts]
 * @param {string} [opts.name='User']           - Display name of the user
 * @param {string} [opts.botName='Yuzuki MD']   - Bot display name
 * @param {number} [opts.hour]                  - Override hour (0–23); defaults to now
 * @param {string} [opts.theme]                 - Reserved for future theme support
 * @param {string} [opts.fallback]              - Fallback string if slot is missing
 * @returns {string}
 */
export function getGreeting({
  name     = 'User',
  botName  = 'Yuzuki MD',
  hour,
  theme,
  fallback = '👋 Hello, *{name}*! *{botName}* is ready.',
} = {}) {
  const slot = getSlot(hour);
  const slotData = GREETING_SLOTS[slot];

  if (!slotData?.variants?.length) {
    return interpolate(fallback, name, botName);
  }

  const template = pickVariant(slotData.variants);
  return interpolate(template, name, botName);
}
