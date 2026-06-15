/**
 * Hero Image Pool — Menu Hero Randomization
 *
 * Manages the global fallback hero image pool for the .menu command.
 * Theme-specific pools live in theme-registry.js — this file is only used
 * when no theme is active or the active theme's heroPool is empty.
 *
 * ─── Pool format ──────────────────────────────────────────────────────────────
 *
 *   { type: 'local', value: '/absolute/path/to/image.jpg' }
 *   { type: 'url',   value: 'https://example.com/image.jpg' }
 *
 * ─── Source reliability policy ────────────────────────────────────────────────
 *
 *   All remote URLs MUST come from high-availability, permanent sources:
 *
 *   ✅ images.unsplash.com/photo-{id}  — Imgix CDN, photo IDs never expire
 *   ✅ picsum.photos/id/{n}/{w}/{h}    — Stable Lorem Picsum CDN by photo ID
 *   ✅ upload.wikimedia.org            — Wikimedia Commons, permanent archives
 *   ✅ Local file assets               — Always available, no network needed
 *
 *   ❌ upload.ee / imgur / telegra.ph / tmpfiles — Temporary hosts, avoid
 *
 * ─── Fallback behaviour ───────────────────────────────────────────────────────
 *
 *   pickAndLoad() tries the randomly selected entry first. On failure it cycles
 *   through the remaining pool in order. If every entry fails, returns
 *   { buf: undefined } — the menu sends without an image header, never crashes.
 */

import fs      from 'fs/promises';
import path    from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Unsplash CDN — Imgix-backed, photo IDs are permanent. */
function us(id, label) {
  return { type: 'url', value: `https://images.unsplash.com/photo-${id}?w=800&q=85&fit=crop`, label };
}

/** Picsum Photos — stable CDN wrapper around Unsplash, accessed by numeric ID. */
function ps(id, label) {
  return { type: 'url', value: `https://picsum.photos/id/${id}/800/450`, label };
}

// ─── Global hero pool ─────────────────────────────────────────────────────────

export const HERO_POOL = [

  // ── Local asset — instant, no network dependency ───────────────────────────
  {
    type:  'local',
    value: path.resolve(__dirname, '../assets/menu_bg.jpg'),
    label: 'Default Background (local)',
  },

  // ── Tech / bot aesthetic (Unsplash CDN) ───────────────────────────────────
  us('1518770660439-4636190af475', 'Circuit Board Close-up'),
  us('1504384308090-c894fdcc538d', 'Tech Abstract Blue'),
  us('1526374965328-7f61d4dc18c5', 'Digital Matrix Green'),
  us('1557672172-298e090bd0f1',    'Purple Gradient Abstract'),
  us('1579546929518-9e396f3cc809', 'Blue-Purple Gradient'),
  us('1535378917042-10a22c95931a', 'AI Robot Concept'),

  // ── Stable Picsum fallbacks (numeric IDs, always available) ───────────────
  ps(10,  'Picsum — Architecture'),
  ps(15,  'Picsum — Abstract Colours'),
  ps(1067,'Picsum — Night City Lights'),

];

// ─── Core helpers ─────────────────────────────────────────────────────────────

/**
 * Pick a random entry from the pool.
 * @returns {{ type: string, value: string, label?: string }}
 */
export function pickHero() {
  if (!HERO_POOL.length) return null;
  return HERO_POOL[Math.floor(Math.random() * HERO_POOL.length)];
}

/**
 * Load a single hero entry as a Buffer.
 * Returns undefined if the load fails (missing file, HTTP error, timeout).
 *
 * @param {{ type: string, value: string }} hero
 * @param {number} [timeoutMs=6000]
 * @returns {Promise<Buffer|undefined>}
 */
export async function loadHeroBuf(hero, timeoutMs = 6000) {
  if (!hero) return undefined;
  try {
    if (hero.type === 'local') {
      return await fs.readFile(hero.value);
    }
    const r = await fetch(hero.value, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return undefined;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return undefined;
  }
}

/**
 * Pick a random hero and load its Buffer.
 * Cycles through remaining entries on failure before giving up.
 * Always returns — never throws.
 *
 * @param {number} [timeoutMs=6000]
 * @returns {Promise<{ buf: Buffer|undefined, hero: object|null }>}
 */
export async function pickAndLoad(timeoutMs = 6000) {
  if (!HERO_POOL.length) return { buf: undefined, hero: null };

  const startIdx = Math.floor(Math.random() * HERO_POOL.length);

  for (let i = 0; i < HERO_POOL.length; i++) {
    const hero = HERO_POOL[(startIdx + i) % HERO_POOL.length];
    const buf  = await loadHeroBuf(hero, timeoutMs);
    if (buf) return { buf, hero };
  }

  return { buf: undefined, hero: null };
}

/**
 * Load a hero from a plain URL string (used for the settings.menuBgUrl override).
 * Returns undefined on any failure.
 *
 * @param {string} url
 * @param {number} [timeoutMs=6000]
 * @returns {Promise<Buffer|undefined>}
 */
export async function loadFromUrl(url, timeoutMs = 6000) {
  return loadHeroBuf({ type: 'url', value: url }, timeoutMs);
}
