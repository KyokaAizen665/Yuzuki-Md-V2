/**
 * Workflow: Sticker from URL
 *
 * Triggered by natural-language phrases such as:
 *   "make a sticker from https://example.com/image.jpg"
 *   "create sticker: https://..."
 *   "sticker from https://..."
 *   "convert https://... to sticker"
 *
 * Steps:
 *   1. Fetch the image from the URL into a buffer
 *   2. Convert to WebP via the @ffmpeg/ffmpeg or sharp library (graceful fallback)
 *   3. Send as a sticker message
 */

import { BaseWorkflow } from './_base.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s]+/i;

/** Fetch a remote URL into a Buffer. */
async function _fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Convert image buffer to WebP.
 * Tries `sharp` first (fast), falls back to sending raw buffer if unavailable.
 * Returns { buffer, converted: boolean }.
 */
async function _toWebP(inputBuffer, mimeHint = 'image/jpeg') {
  try {
    const { default: sharp } = await import('sharp');
    const buffer = await sharp(inputBuffer).webp({ quality: 80 }).toBuffer();
    return { buffer, converted: true };
  } catch {
    // sharp not installed — send raw and let WhatsApp handle it
    return { buffer: inputBuffer, converted: false };
  }
}

// ─── Pattern definitions ───────────────────────────────────────────────────────

const PATTERNS = [
  // "make/create sticker from <url>"
  /(?:make|create|generate)\s+(?:a\s+)?sticker\s+(?:from|out\s+of|of)\s+(https?:\/\/\S+)/i,
  // "sticker from <url>" / "sticker: <url>"
  /sticker\s+(?:from\s+|:\s*)(https?:\/\/\S+)/i,
  // "convert <url> to sticker"
  /convert\s+(https?:\/\/\S+)\s+to\s+sticker/i,
  // "<url> as sticker" / "<url> make sticker"
  /(https?:\/\/\S+)\s+(?:as\s+(?:a\s+)?sticker|make\s+sticker)/i,
];

// ─── Workflow class ───────────────────────────────────────────────────────────

export class StickerFromUrlWorkflow extends BaseWorkflow {
  get name() { return 'Create Sticker from URL'; }

  match(text, _ctx) {
    for (const re of PATTERNS) {
      const m = text.match(re);
      if (m) {
        const url = (m[1] ?? '').trim();
        if (URL_RE.test(url)) return { matched: true, vars: { url } };
      }
    }
    return { matched: false, vars: {} };
  }

  buildSteps({ vars, sock, msg, jid, reply }) {
    const { url } = vars;

    return [
      {
        name: '⬇️ Download image',
        abortOnError: true,
        fn: async (ctx) => {
          await reply(`🖼️ Downloading image...`);
          ctx.rawBuffer = await _fetchBuffer(url);
          return { size: ctx.rawBuffer.length };
        },
      },

      {
        name: '🔄 Convert to WebP',
        abortOnError: false,
        fn: async (ctx) => {
          const { buffer, converted } = await _toWebP(ctx.rawBuffer);
          ctx.stickerBuffer  = buffer;
          ctx.wasConverted   = converted;
          return { converted };
        },
      },

      {
        name: '🎨 Send sticker',
        abortOnError: true,
        fn: async (ctx) => {
          if (!ctx.stickerBuffer) throw new Error('Sticker buffer missing');
          await sock.sendMessage(
            jid,
            { sticker: ctx.stickerBuffer },
            { quoted: msg },
          );
          return { sent: true };
        },
      },
    ];
  }
}
