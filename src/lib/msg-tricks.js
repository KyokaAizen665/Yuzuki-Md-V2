/**
 * Yuzuki MD — Message Tricks & Context Injection
 *
 * Helpers to make messages appear forwarded, add fake link-preview cards
 * (externalAdReply), inject newsletter context, and send "viral" forwarded-
 * style messages.
 *
 * Migrated to cv3inx/baileys (socketon alias).
 */

import { createRequire } from "module";
const _trequire = createRequire(import.meta.url);

// cv3inx/baileys is installed as "socketon" (package.json alias).
// We try socketon first, then @whiskeysockets/baileys as last resort.
const { generateWAMessageFromContent } = (() => {
  try { return _trequire("socketon"); } catch {}
  try { return _trequire("@whiskeysockets/baileys"); } catch {}
  return {};
})();

// ─── Forwarding tricks ───────────────────────────────────────────────────────

/**
 * Make a text message appear "heavily forwarded" (5+ times).
 */
export async function sendForwarded(sock, jid, text, { score = 999, quoted = null } = {}) {
  return sock.sendMessage(jid, {
    text,
    contextInfo: { isForwarded: true, forwardingScore: score },
  }, { quoted });
}

// ─── externalAdReply — Fake link preview / ad card ──────────────────────────

/**
 * Send a message with a custom fake link-preview (externalAdReply).
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
 */
export async function sendNewsletterStyle(sock, jid, text, opts = {}) {
  const {
    newsletterJid  = "120363400911374213@newsletter",
    newsletterName = "Yuzuki MD",
    serverMessageId = Math.floor(Math.random() * 100) + 1,
    forwardingScore = 9,
    quoted = null,
  } = opts;

  return sock.sendMessage(jid, {
    text,
    contextInfo: {
      isForwarded: true,
      forwardingScore,
      forwardedNewsletterMessageInfo: { newsletterJid, newsletterName, serverMessageId },
    },
  }, { quoted });
}

// ─── Styled announcement card ────────────────────────────────────────────────

/**
 * Send a fully styled announcement card with:
 *   • Large thumbnail via externalAdReply
 *   • Forwarded score (viral look)
 *   • Newsletter context
 *   • Native flow CTA button
 */
export async function sendAnnouncementCard(sock, jid, opts = {}) {
  const {
    title           = "📢 Announcement",
    body            = "",
    footer          = "",
    ctaLabel        = "Learn More",
    ctaUrl          = "https://github.com",
    thumbnail       = null,
    newsletterJid   = "120363400911374213@newsletter",
    newsletterName  = "Yuzuki MD",
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

  if (!generateWAMessageFromContent) {
    // Fallback: plain text if baileys exports missing
    return sock.sendMessage(jid, { text: `${title}\n\n${body}` });
  }

  const card = generateWAMessageFromContent(jid, {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
        },
        interactiveMessage: {
          header:  { hasMediaAttachment: false },
          body:    { text: body },
          footer:  { text: footer },
          nativeFlowMessage: {
            messageParamsJson: "{}",
            buttons: [{
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: ctaLabel,
                url: ctaUrl,
                merchant_url: ctaUrl,
              }),
            }],
          },
          contextInfo,
        },
      },
    },
  }, {});

  await sock.relayMessage(card.key.remoteJid, card.message, { messageId: card.key.id });
  return card;
}

// ─── Premium-tagged message ──────────────────────────────────────────────────

/**
 * Send a message with the undocumented premium:1 flag.
 */
export async function sendPremiumStyle(sock, jid, content, msgOpts = {}) {
  const msg = typeof content === "string" ? { text: content } : content;
  return sock.sendMessage(jid, {
    ...msg,
    contextInfo: {
      isForwarded: true,
      forwardingScore: 1,
      premium: 1,
      ...(msg.contextInfo || {}),
    },
  }, msgOpts);
}
