/**
 * src/menu.js — Registry-driven menu system
 *
 * All category lists and command counts are now generated automatically
 * from the plugin registry. This file no longer contains hardcoded
 * command arrays — those are derived at runtime from registered plugins.
 *
 * Exports:
 *   MENU_BG          — path to background image asset
 *   CATEGORY_META    — presentation metadata (icon, title) per category key
 *   buildMain(...)   — main menu caption
 *   buildSub(...)    — category sub-menu caption
 *   buildListPayload(...)  — list-message payload
 *
 * All caption builders are now thin re-exports from lib/menu-builder.js.
 * If you need to customise icons or display titles, edit CATEGORY_META
 * in lib/menu-builder.js — not here.
 */

import { fileURLToPath } from 'url';
import {
  CATEGORY_META,
  buildMain,
  buildSub,
  buildListPayload,
  buildMenuRows,
  buildCommandHelp,
  buildSearchResults,
} from './lib/menu-builder.js';

// ── Background image ──────────────────────────────────────────────────────────
// Placed in src/assets/ alongside any other bot images.
export const MENU_BG = fileURLToPath(new URL('./assets/menu_bg.jpg', import.meta.url));

// ── Re-export everything from the registry-driven builder ─────────────────────
export {
  CATEGORY_META,
  buildMain,
  buildSub,
  buildListPayload,
  buildMenuRows,
  buildCommandHelp,
  buildSearchResults,
};

// Backward compatibility export — CATEGORIES mirrors CATEGORY_META
export const CATEGORIES = CATEGORY_META;
