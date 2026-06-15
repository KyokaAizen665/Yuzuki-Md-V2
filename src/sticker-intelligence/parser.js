/**
 * Sticker Intelligence — Parser
 *
 * Extracts command text from WhatsApp sticker messages.
 *
 * Detection pipeline (in priority order):
 *  1. EXIF description field  → JSON payload or raw command string
 *  2. EXIF artist/title field → command if it starts with prefix
 *  3. Raw buffer scan         → JSON pattern with "command" key
 *
 * The sticker's fileSha256 (hex) is also returned so the caller can
 * check the macro store without re-downloading.
 *
 * Usage:
 *   import { parseStickerMeta, extractCommandFromExif } from './parser.js';
 *   const meta = await parseStickerMeta(sock, msg, prefix);
 *   // meta → { sha256, command, args, packName, packAuthor, raw }
 */

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { downloadMediaMessage } = _require('socketon');

// ─── SHA-256 hex helper ───────────────────────────────────────────────────────

/**
 * Convert a fileSha256 Buffer (from protobuf) to a lowercase hex string.
 * Returns null if input is not a valid Buffer.
 * @param {Buffer|Uint8Array|null} buf
 * @returns {string|null}
 */
export function sha256ToHex(buf) {
  if (!buf || !buf.length) return null;
  return Buffer.from(buf).toString('hex');
}

// ─── WebP EXIF parser ─────────────────────────────────────────────────────────

/**
 * Parse EXIF metadata from a WebP buffer.
 * Returns an object with any string tags found, or null on failure.
 *
 * @param {Buffer} buffer
 * @returns {{ description?: string, artist?: string, software?: string }|null}
 */
export function parseWebPExif(buffer) {
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
    // Validate RIFF/WEBP header
    if (buffer.slice(0, 4).toString('ascii') !== 'RIFF') return null;
    if (buffer.slice(8, 12).toString('ascii') !== 'WEBP') return null;

    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const chunkId   = buffer.slice(offset, offset + 4).toString('ascii');
      const chunkSize = buffer.readUInt32LE(offset + 4);
      offset += 8;

      if (chunkId === 'EXIF') {
        const exifBuf = buffer.slice(offset, offset + chunkSize);
        return parseTiffExif(exifBuf);
      }

      // Advance past chunk data (padded to even boundary)
      offset += chunkSize + (chunkSize & 1);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse a raw TIFF/EXIF buffer and extract string tags relevant to sticker metadata.
 * @param {Buffer} buf
 * @returns {{ description?: string, artist?: string }|null}
 */
function parseTiffExif(buf) {
  try {
    // Some embedders prepend "Exif\0\0" (6 bytes) — skip if present
    let start = 0;
    if (buf.slice(0, 6).toString('ascii') === 'Exif\0\0') start = 6;

    const slice = buf.slice(start);
    if (slice.length < 8) return null;

    const byteOrder = slice.slice(0, 2).toString('ascii');
    const isLE      = byteOrder === 'II';
    if (byteOrder !== 'II' && byteOrder !== 'MM') return null;

    const readU16 = (o) => isLE ? slice.readUInt16LE(o) : slice.readUInt16BE(o);
    const readU32 = (o) => isLE ? slice.readUInt32LE(o) : slice.readUInt32BE(o);

    const magic = readU16(2);
    if (magic !== 42) return null; // Not valid TIFF

    const ifdOffset = readU32(4);
    if (ifdOffset + 2 > slice.length) return null;

    const entryCount = readU16(ifdOffset);
    const result     = {};

    for (let i = 0; i < entryCount; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      if (entryOffset + 12 > slice.length) break;

      const tag       = readU16(entryOffset);
      const type      = readU16(entryOffset + 2);
      const count     = readU32(entryOffset + 4);

      // Type 2 = ASCII, Type 7 = UNDEFINED (often used for UTF-8 text)
      if (type === 2 || type === 7) {
        let dataOffset = entryOffset + 8;
        if (count > 4) {
          const ptr = readU32(entryOffset + 8);
          if (ptr + count > slice.length) continue;
          dataOffset = ptr;
        }
        const len = type === 2 ? Math.max(0, count - 1) : count;
        const str = slice.slice(dataOffset, dataOffset + len).toString('utf8').replace(/\0/g, '').trim();
        if (!str) continue;

        // Tag 0x010E = ImageDescription, 0x013B = Artist, 0x9C9C = XPComment
        if (tag === 0x010E) result.description = str;
        if (tag === 0x013B) result.artist       = str;
        if (tag === 0x9C9C) result.xpComment    = str;
      }
    }

    return Object.keys(result).length ? result : null;
  } catch {
    return null;
  }
}

// ─── JSON/command extractor from EXIF fields ──────────────────────────────────

/**
 * Try to parse a JSON sticker payload from a string field.
 * WhatsApp sticker packs often embed:
 *   { "pack-name": "…", "author": "…", "description": ".menu" }
 *
 * @param {string} str
 * @returns {object|null}
 */
function tryParseJson(str) {
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Extract a command string from parsed EXIF data.
 *
 * @param {{ description?: string, artist?: string, xpComment?: string }|null} exif
 * @param {string} prefix  - Bot prefix (e.g. ".")
 * @returns {{ command: string, args: string[], packName?: string, packAuthor?: string }|null}
 */
export function extractCommandFromExif(exif, prefix) {
  if (!exif) return null;

  const candidates = [exif.description, exif.xpComment, exif.artist].filter(Boolean);

  for (const candidate of candidates) {
    // Try JSON payload first
    const json = tryParseJson(candidate);
    if (json) {
      // JSON can embed command in "description", "command", or "pack-name" fields
      const cmdText = json.description ?? json.command ?? json['pack-name'] ?? '';
      const result  = parseCommandText(String(cmdText).trim(), prefix);
      if (result) {
        return {
          ...result,
          packName:   json['pack-name']  ?? json.packName   ?? exif.artist ?? '',
          packAuthor: json.author        ?? json.packAuthor ?? '',
        };
      }
    }

    // Try raw command text
    const result = parseCommandText(candidate.trim(), prefix);
    if (result) return result;
  }

  return null;
}

/**
 * Parse a command text string into { command, args }.
 * Accepts text with or without the prefix (prefix is stripped if present).
 *
 * @param {string} text
 * @param {string} prefix
 * @returns {{ command: string, args: string[] }|null}
 */
export function parseCommandText(text, prefix) {
  if (!text) return null;
  const stripped = text.startsWith(prefix) ? text.slice(prefix.length).trim() : text.trim();
  if (!stripped) return null;
  const parts   = stripped.split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args    = parts.slice(1).filter(Boolean);
  if (!command) return null;
  return { command, args };
}

// ─── Raw buffer scan ──────────────────────────────────────────────────────────

/**
 * Fallback: scan raw buffer bytes for embedded JSON with a "command" or "description" key.
 * This catches stickers that embed metadata in non-standard locations.
 *
 * @param {Buffer} buffer
 * @param {string} prefix
 * @returns {{ command: string, args: string[] }|null}
 */
export function scanBufferForCommand(buffer, prefix) {
  try {
    const text  = buffer.toString('latin1');
    // Find JSON-like objects containing a command field
    const match = text.match(/\{[^{}]{0,500}\}/g);
    if (!match) return null;
    for (const jsonStr of match) {
      try {
        const obj = JSON.parse(jsonStr);
        const raw = obj.command ?? obj.description ?? obj['pack-name'] ?? '';
        if (typeof raw === 'string') {
          const result = parseCommandText(raw.trim(), prefix);
          if (result) return result;
        }
      } catch { /* skip */ }
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Main metadata extractor ──────────────────────────────────────────────────

/**
 * Full sticker metadata extraction pipeline.
 * Downloads the sticker media and parses EXIF + raw buffer.
 *
 * @param {object} sock
 * @param {object} msg                 - Full WAMessage
 * @param {string} prefix              - Bot prefix
 * @returns {Promise<{
 *   sha256:     string|null,
 *   command:    string|null,
 *   args:       string[],
 *   packName:   string,
 *   packAuthor: string,
 *   isAnimated: boolean,
 *   buffer:     Buffer|null,
 * }>}
 */
export async function parseStickerMeta(sock, msg, prefix) {
  const sticker   = msg?.message?.stickerMessage;
  const sha256    = sha256ToHex(sticker?.fileSha256);
  const isAnimated = !!sticker?.isAnimated;

  const base = { sha256, command: null, args: [], packName: '', packAuthor: '', isAnimated, buffer: null };

  if (!sticker) return base;

  // Download the sticker
  let buffer = null;
  try {
    buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: console });
  } catch {
    // Download failed — still return sha256 for macro lookup
    return { ...base };
  }

  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return { ...base, buffer };

  // EXIF path
  const exif   = parseWebPExif(buffer);
  const result = extractCommandFromExif(exif, prefix);

  if (result) {
    return {
      sha256,
      command:    result.command,
      args:       result.args,
      packName:   result.packName   ?? '',
      packAuthor: result.packAuthor ?? '',
      isAnimated,
      buffer,
    };
  }

  // Raw buffer fallback
  const rawResult = scanBufferForCommand(buffer, prefix);
  if (rawResult) {
    return {
      sha256,
      command:    rawResult.command,
      args:       rawResult.args,
      packName:   '',
      packAuthor: '',
      isAnimated,
      buffer,
    };
  }

  return { ...base, buffer };
}
