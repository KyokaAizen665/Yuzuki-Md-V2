/**
 * AI Conversation Memory
 *
 * Persistent per-user conversation history for multi-turn AI chat.
 * Keyed by sender JID so each user has their own thread regardless of
 * which chat they send from.
 *
 * ─── Storage ──────────────────────────────────────────────────────────────────
 *   In-memory Map during runtime, flushed to data/ai-history.json on every
 *   write and loaded back on first access (lazy init).
 *
 * ─── Limits ───────────────────────────────────────────────────────────────────
 *   MAX_MESSAGES  — max messages kept per user (oldest trimmed first)
 *   MAX_CONTENT   — max chars per message content (truncated at storage time)
 *
 * ─── API ──────────────────────────────────────────────────────────────────────
 *
 *   getHistory(senderJid)              → Message[]
 *   addMessage(senderJid, role, text)  → void
 *   clearHistory(senderJid)            → void
 *   listUsers()                        → string[]   (jids with history)
 *   historySize(senderJid)             → number     (message count)
 *   getModel(senderJid)                → string     (preferred model)
 *   setModel(senderJid, model)         → void
 *
 * ─── Message shape ────────────────────────────────────────────────────────────
 *   { role: 'user'|'assistant'|'system', content: string, ts: number }
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = path.resolve(__dirname, '../../data/ai-history.json');
const DATA_DIR   = path.dirname(STORE_FILE);

const MAX_MESSAGES = 20;   // max messages per user (10 turns)
const MAX_CONTENT  = 4000; // max chars per message stored

// ── In-memory state ───────────────────────────────────────────────────────────

/** @type {Map<string, Array<{role:string,content:string,ts:number}>>} */
const _store = new Map();

/** @type {Map<string, string>} preferred model per user */
const _models = new Map();

let _loaded = false;

// ── Persistence ───────────────────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function _load() {
  if (_loaded) return;
  _loaded = true;
  ensureDir();
  try {
    if (!fs.existsSync(STORE_FILE)) return;
    const raw  = fs.readFileSync(STORE_FILE, 'utf8');
    const data = JSON.parse(raw);
    for (const [jid, msgs] of Object.entries(data.history ?? {})) {
      if (Array.isArray(msgs)) _store.set(jid, msgs);
    }
    for (const [jid, model] of Object.entries(data.models ?? {})) {
      if (typeof model === 'string') _models.set(jid, model);
    }
  } catch { /* corrupt file — start fresh */ }
}

function _flush() {
  ensureDir();
  try {
    const data = {
      history: Object.fromEntries(_store),
      models:  Object.fromEntries(_models),
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
  } catch { /* ignore write errors */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the conversation history for a user.
 * Returns an array of { role, content } objects ready for the AI API.
 * @param {string} senderJid
 * @returns {Array<{role:string, content:string}>}
 */
export function getHistory(senderJid) {
  _load();
  return (_store.get(senderJid) ?? []).map(({ role, content }) => ({ role, content }));
}

/**
 * Append a message to the user's history.
 * Trims oldest messages when the limit is exceeded.
 * @param {string} senderJid
 * @param {'user'|'assistant'|'system'} role
 * @param {string} content
 */
export function addMessage(senderJid, role, content) {
  _load();
  const msgs = _store.get(senderJid) ?? [];
  msgs.push({ role, content: content.slice(0, MAX_CONTENT), ts: Date.now() });
  // Keep the tail — trim from oldest
  while (msgs.length > MAX_MESSAGES) msgs.shift();
  _store.set(senderJid, msgs);
  _flush();
}

/**
 * Clear all conversation history for a user.
 * @param {string} senderJid
 */
export function clearHistory(senderJid) {
  _load();
  _store.delete(senderJid);
  _flush();
}

/**
 * Number of stored messages for a user.
 * @param {string} senderJid
 * @returns {number}
 */
export function historySize(senderJid) {
  _load();
  return _store.get(senderJid)?.length ?? 0;
}

/**
 * List all JIDs that have stored history.
 * @returns {string[]}
 */
export function listUsers() {
  _load();
  return [..._store.keys()];
}

/**
 * Get the user's preferred AI model (defaults to 'openai').
 * @param {string} senderJid
 * @returns {string}
 */
export function getModel(senderJid) {
  _load();
  return _models.get(senderJid) ?? 'openai';
}

/**
 * Set the user's preferred AI model.
 * @param {string} senderJid
 * @param {string} model
 */
export function setModel(senderJid, model) {
  _load();
  _models.set(senderJid, model);
  _flush();
}

/**
 * Get a formatted preview of the last N messages for display.
 * @param {string} senderJid
 * @param {number} [n=10]
 * @returns {string}
 */
export function previewHistory(senderJid, n = 10) {
  _load();
  const msgs = (_store.get(senderJid) ?? []).slice(-n);
  if (!msgs.length) return '_No conversation history._';
  return msgs.map((m, i) => {
    const icon    = m.role === 'user' ? '👤' : '🤖';
    const preview = m.content.length > 120 ? m.content.slice(0, 120) + '…' : m.content;
    const time    = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${icon}  _[${time}]_  ${preview}`;
  }).join('\n\n');
}
