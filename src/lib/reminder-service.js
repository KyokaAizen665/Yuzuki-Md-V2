/**
 * Reminder Service
 *
 * Persists reminders to data/reminders.json and fires them via the bot socket.
 * A 30-second polling interval checks for due reminders.
 *
 * ─── Lifecycle ────────────────────────────────────────────────────────────────
 *   startReminderService(sock)   — start/restart the polling loop
 *   stopReminderService()        — clear the interval (on disconnect)
 *
 * ─── CRUD ─────────────────────────────────────────────────────────────────────
 *   addReminder(jid, senderJid, message, fireAt)  → reminder object
 *   listReminders(jid)                            → reminder[]
 *   cancelReminder(jid, id)                       → boolean
 *   cancelAllReminders(jid)                       → number removed
 *
 * ─── Reminder record ──────────────────────────────────────────────────────────
 * {
 *   id:        string (6-char uppercase),
 *   jid:       string (chat JID to send to),
 *   senderJid: string (user who set it),
 *   message:   string,
 *   fireAt:    number (ms timestamp),
 *   created:   number (ms timestamp),
 * }
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE   = path.resolve(__dirname, '../../data/reminders.json');
const DATA_DIR  = path.dirname(DB_FILE);

let _sock  = null;
let _timer = null;

// ── Storage ───────────────────────────────────────────────────────────────────

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) return [];
  try   { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return []; }
}

function save(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function genId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ── Polling ───────────────────────────────────────────────────────────────────

async function _tick() {
  if (!_sock) return;
  try {
    const db  = load();
    const now = Date.now();
    const due = db.filter(r => r.fireAt <= now);
    if (!due.length) return;

    save(db.filter(r => r.fireAt > now));

    for (const r of due) {
      try {
        const when = new Date(r.created).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
        await _sock.sendMessage(r.jid, {
          text:
            `⏰ *Reminder!*\n${'─'.repeat(22)}\n\n` +
            `${r.message}\n\n` +
            `_Set on ${when}_`,
        });
      } catch {}
    }
  } catch {}
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startReminderService(sock) {
  _sock = sock;
  if (_timer) clearInterval(_timer);
  _timer = setInterval(() => { _tick().catch(() => {}); }, 30_000);
  _tick().catch(() => {});
}

export function stopReminderService() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  _sock = null;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function addReminder(jid, senderJid, message, fireAt) {
  const db = load();
  const r  = { id: genId(), jid, senderJid, message: message.slice(0, 500), fireAt, created: Date.now() };
  db.push(r);
  save(db);
  return r;
}

export function listReminders(jid) {
  return load()
    .filter(r => r.jid === jid)
    .sort((a, b) => a.fireAt - b.fireAt);
}

export function cancelReminder(jid, id) {
  const db      = load();
  const before  = db.length;
  const updated = db.filter(r => !(r.jid === jid && r.id.toUpperCase() === id.toUpperCase().trim()));
  if (updated.length === before) return false;
  save(updated);
  return true;
}

export function cancelAllReminders(jid) {
  const db      = load();
  const updated = db.filter(r => r.jid !== jid);
  save(updated);
  return db.length - updated.length;
}
