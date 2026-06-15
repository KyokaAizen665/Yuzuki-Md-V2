/**
 * Message Engine — Media Layer
 *
 * Centralizes all outgoing media messages: images, videos, audio,
 * documents, and stickers. Accepts flexible source descriptors so
 * callers never need to construct raw Socketon payloads.
 *
 * Source descriptor (used by all media functions):
 *   { url: string }         — remote URL (Socketon streams it)
 *   { buffer: Buffer }      — in-memory binary
 *   { path: string }        — absolute local file path (read as buffer)
 *
 * Return shape (all functions):
 *   { ok: true,  sent: <WAMessage> }
 *   { ok: false, error: <Error> }
 *
 * Usage:
 *   import { sendImage, sendAudio } from '../message-engine/media.js';
 *   await sendImage(sock, jid, { url: 'https://…/img.jpg' }, 'Caption here');
 *   await sendAudio(sock, jid, { buffer: audioBuffer }, { ptt: true });
 */

import fs from 'fs';

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function safe(fn) {
  try {
    const sent = await fn();
    return { ok: true, sent };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Normalize a source descriptor into a Socketon-compatible media value.
 * Socketon accepts: Buffer | { url: string } — so we map our descriptor.
 *
 * @param {{ url?: string, buffer?: Buffer, path?: string }} source
 * @returns {Buffer | { url: string }}
 */
function resolveSource(source) {
  if (!source) throw new Error('Media source is required (url, buffer, or path)');
  if (source.buffer instanceof Buffer) return source.buffer;
  if (typeof source.path === 'string') {
    return fs.readFileSync(source.path); // synchronous — acceptable for small media
  }
  if (typeof source.url === 'string') return { url: source.url };
  throw new Error('Invalid media source: must have url, buffer, or path');
}

// ─── Image ────────────────────────────────────────────────────────────────────

/**
 * Send an image message.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {{ url?: string, buffer?: Buffer, path?: string }} source
 * @param {string} [caption]
 * @param {object} [opts]
 * @param {object} [opts.quoted]       - Message to quote
 * @param {string[]} [opts.mentions]
 * @param {boolean} [opts.viewOnce]    - Send as view-once
 * @param {object}  [opts.contextInfo] - Extra context (link preview, etc.)
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function sendImage(sock, jid, source, caption = '', {
  quoted, mentions, viewOnce = false, contextInfo,
} = {}) {
  const media = resolveSource(source);
  return safe(() =>
    sock.sendMessage(jid, {
      image: media,
      ...(caption ? { caption } : {}),
      ...(mentions?.length ? { mentions } : {}),
      ...(viewOnce ? { viewOnce: true } : {}),
      ...(contextInfo ? { contextInfo } : {}),
    }, quoted ? { quoted } : {})
  );
}

// ─── Video ────────────────────────────────────────────────────────────────────

/**
 * Send a video message.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {{ url?: string, buffer?: Buffer, path?: string }} source
 * @param {string} [caption]
 * @param {object} [opts]
 * @param {object} [opts.quoted]
 * @param {string[]} [opts.mentions]
 * @param {boolean} [opts.gifPlayback]  - Loop as GIF
 * @param {boolean} [opts.viewOnce]
 * @param {number}  [opts.seconds]      - Duration hint (for UI display)
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function sendVideo(sock, jid, source, caption = '', {
  quoted, mentions, gifPlayback = false, viewOnce = false, seconds,
} = {}) {
  const media = resolveSource(source);
  return safe(() =>
    sock.sendMessage(jid, {
      video: media,
      ...(caption ? { caption } : {}),
      ...(mentions?.length ? { mentions } : {}),
      ...(gifPlayback ? { gifPlayback: true } : {}),
      ...(viewOnce ? { viewOnce: true } : {}),
      ...(seconds != null ? { seconds } : {}),
    }, quoted ? { quoted } : {})
  );
}

// ─── Audio ────────────────────────────────────────────────────────────────────

/**
 * Send an audio message.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {{ url?: string, buffer?: Buffer, path?: string }} source
 * @param {object} [opts]
 * @param {object} [opts.quoted]
 * @param {boolean} [opts.ptt]           - Voice note (push-to-talk) rendering
 * @param {string}  [opts.mimetype]      - MIME type (default: 'audio/mp4')
 * @param {number}  [opts.seconds]       - Duration hint
 * @param {object}  [opts.contextInfo]   - External ad reply / link preview
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function sendAudio(sock, jid, source, {
  quoted, ptt = false, mimetype = 'audio/mp4', seconds, contextInfo,
} = {}) {
  const media = resolveSource(source);
  return safe(() =>
    sock.sendMessage(jid, {
      audio: media,
      mimetype,
      ...(ptt ? { ptt: true } : {}),
      ...(seconds != null ? { seconds } : {}),
      ...(contextInfo ? { contextInfo } : {}),
    }, quoted ? { quoted } : {})
  );
}

/**
 * Send a voice note (PTT shorthand).
 *
 * @param {object} sock
 * @param {string} jid
 * @param {{ url?: string, buffer?: Buffer, path?: string }} source
 * @param {object} [opts]
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function sendVoice(sock, jid, source, opts = {}) {
  return sendAudio(sock, jid, source, { ...opts, ptt: true, mimetype: 'audio/ogg; codecs=opus' });
}

// ─── Document ─────────────────────────────────────────────────────────────────

/**
 * Send a document / file attachment.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {{ url?: string, buffer?: Buffer, path?: string }} source
 * @param {string} filename           - Display filename (e.g. "report.pdf")
 * @param {string} [mimetype]         - MIME type (default: 'application/octet-stream')
 * @param {object} [opts]
 * @param {string} [opts.caption]
 * @param {object} [opts.quoted]
 * @param {Buffer} [opts.thumbnail]   - Cover thumbnail buffer
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function sendDocument(sock, jid, source, filename, mimetype = 'application/octet-stream', {
  caption, quoted, thumbnail,
} = {}) {
  const media = resolveSource(source);
  return safe(() =>
    sock.sendMessage(jid, {
      document: media,
      mimetype,
      fileName: filename,
      ...(caption ? { caption } : {}),
      ...(thumbnail ? { thumbnail } : {}),
    }, quoted ? { quoted } : {})
  );
}

// ─── Sticker ──────────────────────────────────────────────────────────────────

/**
 * Send a sticker.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {{ url?: string, buffer?: Buffer, path?: string }} source
 * @param {object} [opts]
 * @param {object} [opts.quoted]
 * @param {boolean} [opts.isAnimated]
 * @param {string}  [opts.stickerName]
 * @param {string}  [opts.stickerAuthor]
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function sendSticker(sock, jid, source, {
  quoted, isAnimated = false, stickerName = 'Yuzuki', stickerAuthor = 'MD',
} = {}) {
  const media = resolveSource(source);
  return safe(() =>
    sock.sendMessage(jid, {
      sticker: media,
      ...(isAnimated ? { isAnimated: true } : {}),
      stickerName,
      stickerAuthor,
    }, quoted ? { quoted } : {})
  );
}

// ─── Contact ──────────────────────────────────────────────────────────────────

/**
 * Send a contact card (vCard).
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} displayName
 * @param {string} vcard             - Full vCard string
 * @param {object} [opts]
 * @param {object} [opts.quoted]
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function sendContact(sock, jid, displayName, vcard, { quoted } = {}) {
  return safe(() =>
    sock.sendMessage(jid, {
      contacts: {
        displayName,
        contacts: [{ vcard }],
      },
    }, quoted ? { quoted } : {})
  );
}

// ─── Location ─────────────────────────────────────────────────────────────────

/**
 * Send a location pin.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {number} latitude
 * @param {number} longitude
 * @param {object} [opts]
 * @param {string} [opts.name]       - Place name
 * @param {string} [opts.address]    - Place address
 * @param {object} [opts.quoted]
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function sendLocation(sock, jid, latitude, longitude, {
  name, address, quoted,
} = {}) {
  return safe(() =>
    sock.sendMessage(jid, {
      location: {
        degreesLatitude: latitude,
        degreesLongitude: longitude,
        ...(name    ? { name }    : {}),
        ...(address ? { address } : {}),
      },
    }, quoted ? { quoted } : {})
  );
}

// ─── Media with ad-reply (link preview style) ──────────────────────────────────

/**
 * Attach an external ad reply (preview card) to any message payload.
 * Used to give bot messages a small thumbnail + title strip.
 *
 * @param {object} messagePayload    - Any Socketon message payload object
 * @param {object} opts
 * @param {string}  opts.title
 * @param {string}  [opts.body]
 * @param {string}  [opts.sourceUrl]
 * @param {string}  [opts.thumbnailUrl]
 * @param {Buffer}  [opts.thumbnail]
 * @param {boolean} [opts.largeThumb]
 * @returns {object}                 - New payload with contextInfo merged in
 */
export function withAdReply(messagePayload, {
  title, body = '', sourceUrl = '', thumbnailUrl, thumbnail, largeThumb = false,
}) {
  return {
    ...messagePayload,
    contextInfo: {
      ...(messagePayload.contextInfo ?? {}),
      externalAdReply: {
        title,
        body,
        mediaType: 1,
        previewType: 0,
        renderLargerThumbnail: largeThumb,
        ...(thumbnail    ? { thumbnail }    : {}),
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        sourceUrl: sourceUrl || thumbnailUrl || '',
      },
    },
  };
}
