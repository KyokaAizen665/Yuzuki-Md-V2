/**
 * Message Engine — Text Layer
 *
 * Centralizes all plain-text and reaction outgoing messages.
 * Every function wraps sock.sendMessage with consistent error handling
 * and a predictable return shape so callers never need to handle
 * raw Socketon/Baileys APIs directly.
 *
 * Return shape (all functions):
 *   { ok: true,  sent: <WAMessage> }   on success
 *   { ok: false, error: <Error> }      on failure
 *
 * Usage:
 *   import { sendText, sendReply, sendReact } from '../message-engine/text.js';
 *   await sendText(sock, jid, 'Hello!');
 *   await sendReply(sock, jid, 'Got it.', msg);
 */

// ─── Internal helper ──────────────────────────────────────────────────────────

/**
 * Wrap a sock.sendMessage call so errors never bubble up.
 * @param {Function} fn - async function that returns a WAMessage
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
async function safe(fn) {
  try {
    const sent = await fn();
    return { ok: true, sent };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

// ─── Text ─────────────────────────────────────────────────────────────────────

/**
 * Send a plain text message.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} text
 * @param {object} [opts]           - Extra fields merged into the message payload
 * @param {object} [opts.quoted]    - Message to quote
 * @param {string[]} [opts.mentions] - JIDs to mention
 * @param {boolean} [opts.linkPreview] - Whether to show a link preview (default: true)
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function sendText(sock, jid, text, { quoted, mentions, linkPreview = true } = {}) {
  return safe(() =>
    sock.sendMessage(jid, {
      text: String(text),
      ...(mentions?.length ? { mentions } : {}),
      ...(linkPreview === false ? { linkPreview: false } : {}),
    }, quoted ? { quoted } : {})
  );
}

/**
 * Send a quoted reply.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} text
 * @param {object} quotedMsg        - The original message object to quote
 * @param {object} [opts]
 * @param {string[]} [opts.mentions]
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function sendReply(sock, jid, text, quotedMsg, { mentions } = {}) {
  return safe(() =>
    sock.sendMessage(jid, {
      text: String(text),
      ...(mentions?.length ? { mentions } : {}),
    }, { quoted: quotedMsg })
  );
}

/**
 * Edit (revise) a previously sent text message.
 * Only works for messages the bot itself sent.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} originalMsgKey  - key of the message to edit ({ id, remoteJid, fromMe })
 * @param {string} newText
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function editMessage(sock, jid, originalMsgKey, newText) {
  return safe(() =>
    sock.sendMessage(jid, {
      text: String(newText),
      edit: originalMsgKey,
    })
  );
}

/**
 * Send a message that disappears (ephemeral / view-once text wrapper).
 * Note: actual disappearing-message TTL is set at the chat level, not per-message.
 * This sends with ephemeralExpiration for clients that support it.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} text
 * @param {object} [opts]
 * @param {object} [opts.quoted]
 * @param {number} [opts.ttl]    - seconds (default 86400 = 24h)
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function sendEphemeral(sock, jid, text, { quoted, ttl = 86400 } = {}) {
  return safe(() =>
    sock.sendMessage(jid, {
      text: String(text),
      ephemeralExpiration: ttl,
    }, quoted ? { quoted } : {})
  );
}

// ─── Presence ─────────────────────────────────────────────────────────────────

/**
 * Send a typing presence indicator (composing).
 * Always resolves; failures are silently ignored (non-critical).
 *
 * @param {object} sock
 * @param {string} jid
 * @param {number} [durationMs=1500] - How long to show typing before auto-stopping
 * @returns {Promise<void>}
 */
export async function sendTyping(sock, jid, durationMs = 1500) {
  try {
    await sock.sendPresenceUpdate('composing', jid);
    if (durationMs > 0) {
      await new Promise(r => setTimeout(r, durationMs));
      await sock.sendPresenceUpdate('paused', jid);
    }
  } catch {
    // Presence errors are non-fatal — never rethrow
  }
}

// ─── Reactions ────────────────────────────────────────────────────────────────

/**
 * Send an emoji reaction to a message.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} emoji             - The emoji to react with (e.g. "✅", "❌", "⏱️")
 * @param {object} msgKey            - The key of the message to react to
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function sendReact(sock, jid, emoji, msgKey) {
  return safe(() =>
    sock.sendMessage(jid, { react: { text: emoji, key: msgKey } })
  );
}

/**
 * Remove a reaction from a message (send empty emoji).
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msgKey
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function removeReact(sock, jid, msgKey) {
  return sendReact(sock, jid, '', msgKey);
}

// ─── Forwarding ───────────────────────────────────────────────────────────────

/**
 * Forward a message to a JID (preserves original content).
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} forwardedMsg     - The full WAMessage to forward
 * @param {number} [forwardScore=5] - Higher = more "forwarded many times" label
 * @returns {Promise<{ ok: boolean, sent?: object, error?: Error }>}
 */
export async function forwardMessage(sock, jid, forwardedMsg, forwardScore = 5) {
  return safe(() =>
    sock.sendMessage(jid, { forward: forwardedMsg, forwardingScore: forwardScore })
  );
}

// ─── Bulk helpers ─────────────────────────────────────────────────────────────

/**
 * Send the same text to multiple JIDs.
 * Results are returned in the same order as `jids`.
 *
 * @param {object} sock
 * @param {string[]} jids
 * @param {string} text
 * @param {object} [opts]
 * @returns {Promise<Array<{ ok: boolean, sent?: object, error?: Error }>>}
 */
export async function broadcastText(sock, jids, text, opts = {}) {
  return Promise.all(jids.map(jid => sendText(sock, jid, text, opts)));
}
