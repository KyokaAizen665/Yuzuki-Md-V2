/**
 * Yuzuki MD — Message Tricks & Context Injection
 *
 * Ported from Yuzuki MD's serialization / context tricks.
 * Provides helpers to make messages appear forwarded, add fake
 * link-preview cards (externalAdReply), inject newsletter context,
 * and send "viral" forwarded-style messages.
 */

import { createRequire } from "module";
const _trequire = createRequire(import.meta.url);
const { generateWAMessageFromContent } = (() => {
  try { return _trequire("@whiskeysockets/baileys"); } catch {}
  try { return _trequire("socketon"); } catch {}
  return {};
})();

// ─── Forwarding tricks ───────────────────────────────────────────────────────

/**
 * Make a text message appear "heavily forwarded" (5+ times).
 * Adds the yellow "Forwarded many times" label in WA.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} text
 * @param {{ score?, quoted? }} opts
 */
export async function sendForwarded(sock, jid, text, { score = 999, quoted = null } = {}) {
  return sock.sendMessage(
    jid,
    {
      text,
      contextInfo: {
        isForwarded: true,
        forwardingScore: score,
      },
    },
    { quoted }
  );
}

// ─── externalAdReply — Fake link preview / ad card ──────────────────────────

/**
 * Send a message with a custom fake link-preview (externalAdReply).
 * Shows a thumbnail, title, body, and clickable source URL.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} text          — Main message text
 * @param {{
 *   title:       string,
 *   body?:       string,
 *   mediaType?:  1|2,          — 1 = image, 2 = video
 *   sourceUrl:   string,
 *   thumbnail?:  Buffer|null,
 *   showAdAttribution?: boolean,
 *   renderLargerThumbnail?: boolean,
 * }} adOpts
 * @param {{ quoted?, forwardingScore? }} extras
 */
export async function sendAdReply(sock, jid, text, adOpts, extras = {}) {
  const {
    title = "",
    body = "",
    mediaType = 1,
    sourceUrl = "https://github.com",
    thumbnail = null,
    showAdAttribution = false,
    renderLargerThumbnail = false,
  } = adOpts;

  const msgOpts = {
    text,
    contextInfo: {
      externalAdReply: {
        showAdAttribution,
        renderLargerThumbnail,
        title,
        body,
        mediaType,
        sourceUrl,
        thumbnailUrl: "",
        ...(thumbnail ? { thumbnail } : {}),
      },
      ...(extras.forwardingScore != null
        ? { isForwarded: true, forwardingScore: extras.forwardingScore }
        : {}),
    },
  };

  return sock.sendMessage(jid, msgOpts, { quoted: extras.quoted ?? null });
}

// ─── Newsletter / Channel context injection ──────────────────────────────────

/**
 * Send a message that appears to originate from a WA Channel/Newsletter.
 * The message header will show the channel name and icon.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} text
 * @param {{
 *   newsletterJid?:  string,   — WA newsletter JID (e.g. "120363400911374213@newsletter")
 *   newsletterName?: string,
 *   serverMessageId?: number,
 *   forwardingScore?: number,
 *   quoted?:         object,
 * }} opts
 */
export async function sendNewsletterStyle(sock, jid, text, opts = {}) {
  const {
    newsletterJid = "120363400911374213@newsletter",
    newsletterName = "Yuzuki MD",
    serverMessageId = Math.floor(Math.random() * 100) + 1,
    forwardingScore = 9,
    quoted = null,
  } = opts;

  return sock.sendMessage(
    jid,
    {
      text,
      contextInfo: {
        isForwarded: true,
        forwardingScore,
        forwardedNewsletterMessageInfo: {
          newsletterJid,
          newsletterName,
          serverMessageId,
        },
      },
    },
    { quoted }
  );
}

// ─── Styled viewOnce interactive with externalAdReply ───────────────────────

/**
 * Send a fully styled announcement card:
 *  • Large thumbnail via externalAdReply
 *  • Forwarded score for viral look
 *  • Newsletter context
 *  • Interactive native flow CTA button
 *
 * @param {object} sock
 * @param {string} jid
 * @param {{
 *   title:         string,
 *   body:          string,
 *   footer?:       string,
 *   ctaLabel?:     string,
 *   ctaUrl?:       string,
 *   thumbnail?:    Buffer,
 *   newsletterJid?:  string,
 *   newsletterName?: string,
 * }} opts
 */
export async function sendAnnouncementCard(sock, jid, opts = {}) {
  const {
    title = "📢 Announcement",
    body = "",
    footer = "",
    ctaLabel = "Learn More",
    ctaUrl = "https://github.com",
    thumbnail = null,
    newsletterJid = "120363400911374213@newsletter",
    newsletterName = "Yuzuki MD",
  } = opts;

  const contextInfo = {
    isForwarded: true,
    forwardingScore: 9,
    forwardedNewsletterMessageInfo: {
      newsletterJid,
      newsletterName,
      serverMessageId: Math.floor(Math.random() * 100) + 1,
    },
    externalAdReply: {
      showAdAttribution: false,
      renderLargerThumbnail: true,
      title,
      body,
      mediaType: 1,
      sourceUrl: ctaUrl,
      ...(thumbnail ? { thumbnail } : {}),
    },
  };

  const card = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: {
            header: { hasMediaAttachment: false },
            body: { text: body },
            footer: { text: footer },
            nativeFlowMessage: {
              messageParamsJson: "{}",
              buttons: [
                {
                  name: "cta_url",
                  buttonParamsJson: JSON.stringify({
                    display_text: ctaLabel,
                    url: ctaUrl,
                    merchant_url: ctaUrl,
                  }),
                },
              ],
            },
            contextInfo,
          },
        },
      },
    },
    {}
  );

  await sock.relayMessage(card.key.remoteJid, card.message, {
    messageId: card.key.id,
  });
  return card;
}

// ─── Premium-tagged message ──────────────────────────────────────────────────

/**
 * Send a message with the undocumented premium:1 flag.
 * Behaviour depends on the WA client version.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string|object} content  — text string or full message content object
 * @param {object} [msgOpts]
 */
export async function sendPremiumStyle(sock, jid, content, msgOpts = {}) {
  const msg = typeof content === "string" ? { text: content } : content;
  return sock.sendMessage(
    jid,
    {
      ...msg,
      contextInfo: {
        isForwarded: true,
        forwardingScore: 1,
        premium: 1,
        ...(msg.contextInfo || {}),
      },
    },
    msgOpts
  );
}
