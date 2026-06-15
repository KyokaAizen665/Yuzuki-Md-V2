/**
 * Sticker Trigger Bridge
 *
 * bot.js imports handleStickerTrigger from this path.
 * This file is a thin re-export so the lib/ directory stays
 * clean and all real logic lives in src/sticker-intelligence/.
 */
export { handleStickerTrigger } from '../sticker-intelligence/index.js';
