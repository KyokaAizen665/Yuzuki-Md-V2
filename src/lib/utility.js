/**
 * Utility Helpers — shared across all utility plugins
 *
 * ─── HTTP ─────────────────────────────────────────────────────────────────────
 *   httpGet(url, opts?)         → Response
 *   httpGetJson(url, opts?)     → parsed JSON
 *   httpGetText(url, opts?)     → string
 *   httpGetBuffer(url, opts?)   → Buffer
 *
 * ─── RSS ──────────────────────────────────────────────────────────────────────
 *   parseRss(xml, limit?)       → [{ title, link, desc }]
 *
 * ─── Time / delay ─────────────────────────────────────────────────────────────
 *   parseDelay(str)             → ms | null   ("30m", "2h", "1h30m", "1d")
 *   formatDelay(ms)             → "1h 30m"
 *   fireAtLabel(ts)             → "in 1h 30m"
 *
 * ─── Formatters ───────────────────────────────────────────────────────────────
 *   numFmt(n, precision?)       → "12,345.67"
 */

// ── HTTP ─────────────────────────────────────────────────────────────────────

export async function httpGet(url, { timeout = 12000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { signal: ctrl.signal, headers });
  } finally {
    clearTimeout(id);
  }
}

export async function httpGetJson(url, opts) {
  const res = await httpGet(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

export async function httpGetText(url, opts) {
  const res = await httpGet(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

export async function httpGetBuffer(url, opts) {
  const res = await httpGet(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── RSS Parser ────────────────────────────────────────────────────────────────

function stripCdata(s) {
  return (s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function getXmlTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? stripCdata(m[1]).trim() : '';
}

export function parseRss(xml, limit = 8) {
  const items  = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    const block = m[1];
    const title = getXmlTag(block, 'title');
    const link  = getXmlTag(block, 'link') || getXmlTag(block, 'guid');
    const desc  = getXmlTag(block, 'description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 140);
    if (title) items.push({ title: title.slice(0, 100), link: link.slice(0, 200), desc: desc.trim() });
  }
  return items;
}

// ── Delay / time helpers ──────────────────────────────────────────────────────

/**
 * Parse a delay string into milliseconds.
 *
 * Supported formats: 10s · 5m · 2h · 1d · 1h30m · 2d6h · 1h30m20s
 * Returns null when the string is unparseable or produces zero.
 */
export function parseDelay(str) {
  const s = (str ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  const m = s.match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !s.match(/[dhms]/)) return null;
  const [, d, h, min, sec] = m.map(v => parseInt(v) || 0);
  const ms = ((d * 86400) + (h * 3600) + (min * 60) + sec) * 1000;
  return ms > 0 ? ms : null;
}

/**
 * Format milliseconds into "1h 30m", "5m", "45s", etc.
 */
export function formatDelay(ms) {
  const total = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s && !d && !h) parts.push(`${s}s`);
  return parts.join(' ') || 'now';
}

/**
 * Returns "in 1h 30m" or "1h 30m ago".
 */
export function fireAtLabel(ts) {
  const diff = ts - Date.now();
  return diff >= 0 ? `in ${formatDelay(diff)}` : `${formatDelay(-diff)} ago`;
}

// ── Number formatter ──────────────────────────────────────────────────────────

export function numFmt(n, precision = 6) {
  const num = typeof n === 'string' ? parseFloat(n) : Number(n);
  if (!isFinite(num)) return String(n);
  if (Math.abs(num) >= 1e9 || (Math.abs(num) < 1e-4 && num !== 0)) {
    return num.toExponential(precision - 1);
  }
  return parseFloat(num.toPrecision(precision)).toLocaleString('en-US');
}
