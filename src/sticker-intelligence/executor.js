/**
 * Sticker Intelligence — Executor
 *
 * Routes a resolved sticker command through the same handleCommand
 * pipeline that text commands use, preserving all context (jid,
 * sender, permissions, settings) so sticker-triggered commands
 * behave identically to text-triggered ones.
 *
 * Loop prevention:
 *   - fromMe stickers are never executed (bot's own stickers)
 *   - Stickers with EXIF author matching the bot name are skipped
 *   - An in-memory cooldown set prevents the same sticker from
 *     re-triggering within 3 seconds (handles delivery duplicates)
 *
 * Usage:
 *   import { executeStickerCommand } from './executor.js';
 *   await executeStickerCommand(sock, msg, { command, args, handleCommand });
 */

import { loadSettings } from '../settings.js';

// ─── Cooldown store (in-memory, keyed by "jid:sha256:timestamp-bucket") ───────

const _cooldowns = new Map();
const COOLDOWN_MS = 3000; // 3 seconds

/**
 * Check if a sticker+jid pair is currently on cooldown.
 * @param {string} jid
 * @param {string} sha256hex
 * @returns {boolean} true if still on cooldown
 */
function isOnCooldown(jid, sha256hex) {
  if (!sha256hex) return false;
  const key    = `${jid}:${sha256hex}`;
  const lastTs = _cooldowns.get(key);
  if (!lastTs) return false;
  return Date.now() - lastTs < COOLDOWN_MS;
}

/**
 * Record a sticker trigger in the cooldown store.
 * Old entries are lazily cleaned up to prevent memory growth.
 * @param {string} jid
 * @param {string} sha256hex
 */
function recordCooldown(jid, sha256hex) {
  if (!sha256hex) return;
  const key = `${jid}:${sha256hex}`;
  _cooldowns.set(key, Date.now());

  // Lazy cleanup: purge entries older than COOLDOWN_MS
  if (_cooldowns.size > 500) {
    const now = Date.now();
    for (const [k, ts] of _cooldowns) {
      if (now - ts > COOLDOWN_MS) _cooldowns.delete(k);
    }
  }
}

// ─── Loop-prevention guard ────────────────────────────────────────────────────

/**
 * Decide whether this sticker message should be processed as a command.
 *
 * @param {object} msg        - Full WAMessage
 * @param {string} packAuthor - EXIF author string from the sticker
 * @param {string} sha256hex  - Sticker hash for cooldown checking
 * @returns {{ skip: boolean, reason: string }}
 */
export function shouldSkip(msg, packAuthor, sha256hex) {
  const jid = msg.key.remoteJid;

  // 1. Never execute bot's own stickers (fromMe = bot sent it)
  if (msg.key.fromMe) {
    return { skip: true, reason: 'fromMe sticker — bot-generated, skipping to prevent loop' };
  }

  // 2. Check cooldown — prevent duplicate delivery processing
  if (isOnCooldown(jid, sha256hex)) {
    return { skip: true, reason: 'cooldown — same sticker triggered too recently' };
  }

  // 3. Check EXIF author vs bot name (catches stickers the bot itself created/sent)
  if (packAuthor) {
    const settings = loadSettings();
    const botName  = (settings.botName ?? 'Yuzuki MD').toLowerCase();
    if (packAuthor.toLowerCase() === botName) {
      return { skip: true, reason: `EXIF author matches bot name "${botName}"` };
    }
  }

  return { skip: false, reason: '' };
}

// ─── Synthetic message builder ────────────────────────────────────────────────

/**
 * Build a synthetic message object from a real sticker WAMessage.
 * The synthetic msg is passed to handleCommand so it can be used for
 * quoting, sender detection, and permission checks — all identical to
 * a real text command invocation.
 *
 * @param {object} msg           - Original sticker WAMessage
 * @param {string} commandText   - Full command string (e.g. ".menu" or "menu")
 * @param {string} prefix
 * @returns {object}             - Synthetic WAMessage-like object
 */
export function buildSyntheticMessage(msg, commandText, prefix) {
  // Reconstruct message.conversation so extractText() in bot.js would yield this text.
  // We reuse the original message's key/metadata so replies quote the sticker correctly.
  const fullText = commandText.startsWith(prefix)
    ? commandText
    : `${prefix}${commandText}`;

  return {
    ...msg,
    _isStickerTrigger: true, // marker so plugins can detect sticker origin
    message: {
      ...msg.message,
      conversation: fullText,
      // Keep the stickerMessage so plugins can access the raw sticker if needed
      _originalStickerMessage: msg.message?.stickerMessage,
    },
  };
}

// ─── Command executor ─────────────────────────────────────────────────────────

/**
 * Execute a resolved sticker command through the normal command handler.
 *
 * @param {object} sock
 * @param {object} msg              - Original sticker WAMessage
 * @param {object} opts
 * @param {string}   opts.command   - Resolved command name (without prefix)
 * @param {string[]} opts.args      - Resolved args
 * @param {string}   opts.sha256    - Sticker hash (for cooldown tracking)
 * @param {string}   opts.packAuthor
 * @param {Function} opts.handleCommand  - The main command dispatcher from commands.js
 * @returns {Promise<{ ok: boolean, skipped: boolean, reason?: string }>}
 */
export async function executeStickerCommand(sock, msg, {
  command, args, sha256, packAuthor, handleCommand,
}) {
  const jid = msg.key.remoteJid;

  // Guard: should we process this?
  const { skip, reason } = shouldSkip(msg, packAuthor ?? '', sha256 ?? '');
  if (skip) {
    return { ok: false, skipped: true, reason };
  }

  // Record cooldown before executing (prevents re-entry from slow async)
  recordCooldown(jid, sha256);

  try {
    const settings = loadSettings();
    const prefix   = settings.prefix ?? '.';

    // Validate against mode/gconly/self settings
    const isGroup = jid?.endsWith('@g.us') ?? false;
    if (settings.gconly && !isGroup) {
      return { ok: false, skipped: true, reason: 'gconly: DM sticker commands disabled' };
    }

    await handleCommand({ sock, msg, command, args });
    return { ok: true, skipped: false };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
