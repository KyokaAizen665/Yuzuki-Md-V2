/**
 * Message Engine — Public API
 *
 * Single import point for the entire Message Engine.
 * Commands and plugins should import from here rather than
 * from the individual layer modules.
 *
 * ─── Layers ───────────────────────────────────────────────────────────────────
 *
 *  text.js        — Plain text, reactions, presence, forwarding
 *  media.js       — Image, video, audio, document, sticker, location, contact
 *  interactive.js — NativeFlow button factories + card senders
 *  cards.js       — Pre-built templates (error, success, progress, info…)
 *
 * ─── Quick reference ──────────────────────────────────────────────────────────
 *
 *  TEXT
 *    sendText(sock, jid, text, opts?)
 *    sendReply(sock, jid, text, quotedMsg, opts?)
 *    editMessage(sock, jid, originalKey, newText)
 *    sendEphemeral(sock, jid, text, opts?)
 *    sendTyping(sock, jid, durationMs?)
 *    sendReact(sock, jid, emoji, msgKey)
 *    removeReact(sock, jid, msgKey)
 *    forwardMessage(sock, jid, forwardedMsg, forwardScore?)
 *    broadcastText(sock, jids, text, opts?)
 *
 *  MEDIA
 *    sendImage(sock, jid, source, caption?, opts?)
 *    sendVideo(sock, jid, source, caption?, opts?)
 *    sendAudio(sock, jid, source, opts?)
 *    sendVoice(sock, jid, source, opts?)
 *    sendDocument(sock, jid, source, filename, mimetype?, opts?)
 *    sendSticker(sock, jid, source, opts?)
 *    sendContact(sock, jid, displayName, vcard, opts?)
 *    sendLocation(sock, jid, lat, lon, opts?)
 *    withAdReply(messagePayload, opts)
 *
 *  INTERACTIVE — Button factories
 *    copyButton(label, textToCopy)
 *    urlButton(label, url)
 *    selectButton(label, rows, sectionTitle?)
 *    selectButtonSections(label, sections)
 *    quickReply(label, id)
 *
 *  INTERACTIVE — Senders
 *    sendCard(sock, jid, quotedMsg, opts)
 *    sendMenuCard(sock, jid, quotedMsg, caption, rows, botName, thumbBuf?, thumbUrl?)
 *    sendCommandCard(sock, jid, quotedMsg, body, usageText, commandName, category?)
 *    sendCategoryCard(sock, jid, quotedMsg, body, rows, botName, categoryTitle)
 *    sendSearchCard(sock, jid, quotedMsg, caption, rows, query, resultCount)
 *    prepareImageHeader(sock, imageSource)
 *    buildContent(opts)
 *
 *  CARDS — Pre-built templates
 *    errorCard(sock, jid, quotedMsg, error, opts?)
 *    successCard(sock, jid, quotedMsg, label, value?, opts?)
 *    progressCard(sock, jid, quotedMsg, label, detail?)
 *    infoCard(sock, jid, quotedMsg, emoji, title, fields, footer?)
 *    noticeCard(sock, jid, quotedMsg, label, detail?)
 *    ownerOnlyCard(sock, jid, quotedMsg)
 *    usageCard(sock, jid, quotedMsg, usage, example?)
 *    richInfoCard(sock, jid, quotedMsg, body, footer?, buttons?)
 *    loadingSequence(sock, jid, quotedMsg, workFn, opts?)
 *
 * ─── Source descriptor (media functions) ──────────────────────────────────────
 *
 *    { url: 'https://…' }      remote URL — Socketon streams it
 *    { buffer: Buffer }        in-memory binary
 *    { path: '/abs/path' }     local file path — read as buffer
 *
 * ─── Return shape ─────────────────────────────────────────────────────────────
 *
 *  All send* functions return:
 *    { ok: true,  sent: <WAMessage> }
 *    { ok: false, error: <Error>, fallbackSent?: <WAMessage> }
 *
 * ─── Usage example ────────────────────────────────────────────────────────────
 *
 *  // Old pattern (replaced):
 *  await sock.sendMessage(jid, { text: '❌ Failed' }, { quoted: msg });
 *
 *  // New pattern:
 *  import { errorCard } from '../message-engine/index.js';
 *  await errorCard(sock, jid, msg, 'Download failed', { hint: 'Try a different URL' });
 *
 *  // Download with automatic loading indicator:
 *  import { loadingSequence, sendVideo } from '../message-engine/index.js';
 *  await loadingSequence(sock, jid, msg, async () => {
 *    const result = await downloadVideo(url);
 *    await sendVideo(sock, jid, { url: result.url }, result.title, { quoted: msg });
 *  }, { errorLabel: 'Download Failed' });
 */

// ─── Text layer ───────────────────────────────────────────────────────────────
export {
  sendText,
  sendReply,
  editMessage,
  sendEphemeral,
  sendTyping,
  sendReact,
  removeReact,
  forwardMessage,
  broadcastText,
} from './text.js';

// ─── Media layer ──────────────────────────────────────────────────────────────
export {
  sendImage,
  sendVideo,
  sendAudio,
  sendVoice,
  sendDocument,
  sendSticker,
  sendContact,
  sendLocation,
  withAdReply,
} from './media.js';

// ─── Interactive layer ────────────────────────────────────────────────────────

// Button factories
export {
  copyButton,
  urlButton,
  selectButton,
  selectButtonSections,
  quickReply,
} from './interactive.js';

// Content builder (for advanced custom payloads)
export { buildContent } from './interactive.js';

// Card senders
export {
  sendCard,
  sendMenuCard,
  sendCommandCard,
  sendCategoryCard,
  sendSearchCard,
  prepareImageHeader,
} from './interactive.js';

// ─── Cards layer ──────────────────────────────────────────────────────────────
export {
  errorCard,
  successCard,
  progressCard,
  infoCard,
  noticeCard,
  ownerOnlyCard,
  usageCard,
  richInfoCard,
  loadingSequence,
} from './cards.js';
