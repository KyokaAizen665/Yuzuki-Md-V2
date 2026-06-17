/**
 * Yuzuki MD — Newsletter / Channel Integration
 *
 * Helpers for interacting with WhatsApp Channels (Newsletters) using the
 * cv3inx/baileys fork, which ships full newsletter CRUD APIs.
 *
 * Available newsletter operations (cv3inx):
 *   sock.createNewsletterChannel(name, desc, picture)  → { id, name }
 *   sock.getNewsletterInfo(jid)                        → newsletter info
 *   sock.subscribeNewsletterChannel(jid)
 *   sock.unsubscribeNewsletterChannel(jid)
 *   sock.updateNewsletterChannel(jid, { name, description })
 *   sock.sendMessage(jid@newsletter, payload)
 *
 * Usage:
 *   import { getChannelInfo, sendToChannel, subscribeChannel } from '../lib/newsletter.js';
 */

import { sendCard, urlButton, copyButton } from '../message-engine/interactive.js';

// ─── Internal guard ───────────────────────────────────────────────────────────

function normalizeJid(jid) {
  if (!jid) throw new Error("Newsletter JID is required");
  return jid.includes("@") ? jid : `${jid}@newsletter`;
}

function requireApi(sock, method) {
  if (typeof sock[method] !== "function") {
    throw new Error(
      `sock.${method} not found — ensure you are using cv3inx/baileys (socketon alias) and not an older fork`
    );
  }
}

// ─── Query ────────────────────────────────────────────────────────────────────

/**
 * Get info about a newsletter/channel.
 * @param {object} sock
 * @param {string} jid  — newsletter JID or raw ID
 * @returns {Promise<object>}
 */
export async function getChannelInfo(sock, jid) {
  requireApi(sock, "getNewsletterInfo");
  return sock.getNewsletterInfo(normalizeJid(jid));
}

/**
 * List channels the bot is subscribed to (cv3inx: listNewsletters).
 * @param {object} sock
 * @returns {Promise<object[]>}
 */
export async function listChannels(sock) {
  if (typeof sock.listNewsletters === "function") return sock.listNewsletters();
  if (typeof sock.getSubscribedNewsletters === "function") return sock.getSubscribedNewsletters();
  throw new Error("sock.listNewsletters / sock.getSubscribedNewsletters not available");
}

// ─── Subscribe / Unsubscribe ──────────────────────────────────────────────────

/**
 * Subscribe to a newsletter channel.
 */
export async function subscribeChannel(sock, jid) {
  requireApi(sock, "subscribeNewsletterChannel");
  return sock.subscribeNewsletterChannel(normalizeJid(jid));
}

/**
 * Unsubscribe from a newsletter channel.
 */
export async function unsubscribeChannel(sock, jid) {
  requireApi(sock, "unsubscribeNewsletterChannel");
  return sock.unsubscribeNewsletterChannel(normalizeJid(jid));
}

// ─── Publish ──────────────────────────────────────────────────────────────────

/**
 * Send a plain text message to a newsletter channel.
 * @param {object} sock
 * @param {string} jid
 * @param {string} text
 */
export async function sendToChannel(sock, jid, text) {
  return sock.sendMessage(normalizeJid(jid), { text });
}

/**
 * Send an image to a newsletter channel.
 * @param {object} sock
 * @param {string} jid
 * @param {Buffer|{ url: string }} image
 * @param {string} [caption]
 */
export async function sendImageToChannel(sock, jid, image, caption = "") {
  const payload = Buffer.isBuffer(image)
    ? { image, caption }
    : { image: { url: image.url }, caption };
  return sock.sendMessage(normalizeJid(jid), payload);
}

// ─── Create / Update / Delete ─────────────────────────────────────────────────

/**
 * Create a new newsletter channel.
 * @param {object} sock
 * @param {string} name
 * @param {string} [description]
 * @param {Buffer}  [picture]     — optional channel profile picture
 * @returns {Promise<{ id: string, name: string }>}
 */
export async function createChannel(sock, name, description = "", picture = null) {
  requireApi(sock, "createNewsletterChannel");
  return sock.createNewsletterChannel(name, description, picture);
}

/**
 * Update a newsletter channel's name/description.
 * @param {object} sock
 * @param {string} jid
 * @param {{ name?: string, description?: string }} updates
 */
export async function updateChannel(sock, jid, updates) {
  requireApi(sock, "updateNewsletterChannel");
  return sock.updateNewsletterChannel(normalizeJid(jid), updates);
}

/**
 * Delete (destroy) a newsletter channel you own.
 * @param {object} sock
 * @param {string} jid
 */
export async function deleteChannel(sock, jid) {
  requireApi(sock, "destroyNewsletterChannel");
  return sock.destroyNewsletterChannel(normalizeJid(jid));
}

// ─── Interactive channel info card ────────────────────────────────────────────

/**
 * Send an interactive info card about a channel to a user/group.
 *
 * @param {object} sock
 * @param {string} targetJid   — where to send the card
 * @param {object} quotedMsg
 * @param {string} channelJid  — the channel to show info about
 */
export async function sendChannelInfoCard(sock, targetJid, quotedMsg, channelJid) {
  let info;
  try {
    info = await getChannelInfo(sock, channelJid);
  } catch (err) {
    return sendCard(sock, targetJid, quotedMsg, {
      body:    `❌ *Channel not found*\n\n${err.message}`,
      footer:  'Yuzuki MD',
      buttons: [],
      fallback: `Channel not found: ${err.message}`,
    });
  }

  const normalJid = normalizeJid(channelJid);
  const inviteUrl = info.inviteLink ?? `https://whatsapp.com/channel/${normalJid.replace("@newsletter", "")}`;
  const subCount  = info.subscriberCount ?? info.memberCount ?? "unknown";

  const body =
    `📢 *${info.name ?? "Channel"}*\n\n` +
    `📝 *Description:* ${info.description ?? "(none)"}\n` +
    `👥 *Subscribers:* ${subCount}\n` +
    `🆔 *JID:* ${normalJid}`;

  return sendCard(sock, targetJid, quotedMsg, {
    body,
    footer:  'Yuzuki MD Channels',
    buttons: [
      urlButton('📢 Open Channel', inviteUrl),
      copyButton('📋 Copy JID', normalJid),
    ],
    fallback: body,
  });
}
