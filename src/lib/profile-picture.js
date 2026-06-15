/**
 * Yuzuki MD — Enhanced Profile Picture System
 *
 * Ported & improved from Yuzuki MD's yuzuki-profile-picture.js.
 * Adds: in-memory caching (15 min TTL), buffer retrieval, canvas
 * rounded-avatar helper, fallback default image.
 */

const DEFAULT_PP = "https://i.ibb.co/QFzm9pSF/1546d15ce5dd2946573b3506df109d00.jpg";
const CACHE_TTL  = 15 * 60 * 1000; // 15 minutes

const _cache = new Map();

// Auto-clean expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _cache) {
    if (now - v.ts > CACHE_TTL) _cache.delete(k);
  }
}, 5 * 60 * 1000);

// ─── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Get profile picture URL for a JID.
 * Returns DEFAULT_PP if the user has no profile photo or fetch fails.
 *
 * @param {object} sock
 * @param {string} jid
 * @returns {Promise<string>}
 */
export async function getProfilePicture(sock, jid) {
  const cached = _cache.get(jid);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.url;

  let url;
  try {
    url = await sock.profilePictureUrl(jid, "image");
  } catch {
    url = DEFAULT_PP;
  }

  _cache.set(jid, { url, ts: Date.now() });
  return url;
}

/**
 * Get raw image buffer of a user's profile picture.
 * Returns null if download fails.
 *
 * @param {object} sock
 * @param {string} jid
 * @returns {Promise<Buffer|null>}
 */
export async function getProfileBuffer(sock, jid) {
  const url = await getProfilePicture(sock, jid);
  try {
    const { default: axios } = await import("axios");
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    return Buffer.from(res.data);
  } catch {
    try {
      const { default: axios } = await import("axios");
      const res = await axios.get(DEFAULT_PP, { responseType: "arraybuffer", timeout: 10000 });
      return Buffer.from(res.data);
    } catch {
      return null;
    }
  }
}

/**
 * Clear cached PP for a specific JID (or all if no JID given).
 *
 * @param {string} [jid]
 */
export function clearPPCache(jid) {
  if (jid) _cache.delete(jid);
  else _cache.clear();
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

let _canvas = null;
async function _getCanvas() {
  if (!_canvas) _canvas = await import("@napi-rs/canvas");
  return _canvas;
}

/**
 * Draw a circular clipped avatar on a canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Buffer} imgBuf     — raw image buffer (JPEG/PNG/WEBP)
 * @param {number} x          — center X
 * @param {number} y          — center Y
 * @param {number} radius     — circle radius
 * @param {{ border?, borderColor?, shadow? }} opts
 */
export async function drawCircleAvatar(ctx, imgBuf, x, y, radius, opts = {}) {
  const { createCanvas, loadImage } = await _getCanvas();
  const { border = 3, borderColor = "#FFFFFF", shadow = true } = opts;

  const img = await loadImage(imgBuf);

  if (shadow) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 12;
  }

  // Border ring
  if (border > 0) {
    ctx.beginPath();
    ctx.arc(x, y, radius + border, 0, Math.PI * 2);
    ctx.fillStyle = borderColor;
    ctx.fill();
  }

  if (shadow) ctx.restore();

  // Clip circle and draw image
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

/**
 * Generate a round avatar image buffer (standalone, no canvas context needed).
 *
 * @param {Buffer} imgBuf
 * @param {number} size      — output image size (square)
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function makeRoundAvatar(imgBuf, size = 200) {
  const { createCanvas, loadImage } = await _getCanvas();
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const img = await loadImage(imgBuf);
  const r = size / 2;

  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, 0, 0, size, size);

  return canvas.encode("png");
}
