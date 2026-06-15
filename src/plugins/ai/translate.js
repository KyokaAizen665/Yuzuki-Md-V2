/**
 * Plugin: translate
 * Category: ai
 *
 * Translate text between languages using MyMemory API (free, no key).
 * Supports auto-detection of the source language.
 *
 * Usage:
 *   .translate <target-lang> <text>
 *   .translate fr Hello, how are you?
 *   .translate es|en Bonjour tout le monde
 *   .translate <target-lang>          (reply to a text message)
 *
 * Language codes: en, es, fr, de, ar, zh, ja, ko, pt, ru, ng, ...
 * Full list: https://www.loc.gov/standards/iso639-2/php/langcodes.php
 */

import { sendInteractive, copyButton } from '../../lib/interactive.js';

const API = 'https://api.mymemory.translated.net/get';

// Common language code aliases for user convenience
const ALIASES = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de',
  arabic: 'ar', chinese: 'zh', japanese: 'ja', korean: 'ko',
  portuguese: 'pt', russian: 'ru', italian: 'it', hindi: 'hi',
  igbo: 'ig', yoruba: 'yo', hausa: 'ha', twi: 'ak', swahili: 'sw',
  pidgin: 'pcm', afrikaans: 'af', dutch: 'nl', turkish: 'tr',
};

const LANG_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', ar: 'Arabic',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese', ru: 'Russian',
  it: 'Italian', hi: 'Hindi', ig: 'Igbo', yo: 'Yoruba', ha: 'Hausa',
  sw: 'Swahili', af: 'Afrikaans', nl: 'Dutch', tr: 'Turkish', pcm: 'Pidgin',
};

function resolveCode(lang) {
  const l = lang.toLowerCase().trim();
  return ALIASES[l] ?? l;
}

async function myMemoryTranslate(text, targetLang, sourceLang = 'autodetect') {
  const langpair = `${sourceLang}|${targetLang}`;
  const url      = `${API}?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${langpair}`;
  const r        = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`Translation API error: ${r.status}`);
  const data = await r.json();
  if (data.responseStatus !== 200 && data.responseStatus !== '200') {
    throw new Error(data.responseMessage ?? 'Translation failed');
  }
  return {
    translated:  data.responseData?.translatedText ?? '',
    match:       data.responseData?.match ?? 0,
    detectedSrc: data.responseData?.detectedLanguage ?? sourceLang,
  };
}

/** Extract quoted message text if present */
function getQuotedText(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    ?.conversation
    ?? msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    ?.extendedTextMessage?.text
    ?? null;
}

export default {
  name:        'translate',
  aliases:     ['tr', 'trans', 'tl', 'lang'],
  category:    'ai',
  description: 'Translate text between languages — free via MyMemory, no key needed',
  usage:       '.translate <target-lang> <text>  or  reply to text + .translate <lang>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid     = msg.key.remoteJid;
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';

    if (!args.length) {
      await reply(
        `🌐  *Translator*\n\n` +
        `Usage:\n` +
        `• \`${prefix}translate fr Hello world\`\n` +
        `• Reply to text + \`${prefix}translate es\`\n` +
        `• \`${prefix}translate es|en Bonjour\`  _(source|target)_\n\n` +
        `Common codes: \`en\` \`es\` \`fr\` \`de\` \`ar\` \`zh\` \`ja\` \`yo\` \`ha\` \`sw\``,
      );
      return;
    }

    // Parse source|target or just target from first arg
    let sourceLang = 'autodetect';
    let targetLang;
    const firstArg = args[0].toLowerCase();
    if (firstArg.includes('|')) {
      const [src, tgt] = firstArg.split('|');
      sourceLang = resolveCode(src);
      targetLang = resolveCode(tgt);
    } else {
      targetLang = resolveCode(firstArg);
    }

    // Text: remaining args or quoted message
    let text = args.slice(1).join(' ').trim();
    if (!text) text = getQuotedText(msg) ?? '';

    if (!text) {
      await reply(`❌  No text to translate. Add text after the language code, or reply to a message.`);
      return;
    }

    await sock.sendMessage(jid, { react: { text: '🌐', key: msg.key } }).catch(() => {});

    try {
      const result = await myMemoryTranslate(text, targetLang, sourceLang);

      const srcName = LANG_NAMES[result.detectedSrc] ?? result.detectedSrc.toUpperCase();
      const tgtName = LANG_NAMES[targetLang]         ?? targetLang.toUpperCase();
      const conf    = Math.round((result.match ?? 0) * 100);

      const body =
        `🌐  *Translation*\n${'─'.repeat(22)}\n\n` +
        `*From:*  ${srcName}  →  *${tgtName}*\n\n` +
        `*Original:*\n_${text.slice(0, 300)}${text.length > 300 ? '…' : ''}_\n\n` +
        `*Translated:*\n${result.translated}` +
        (conf ? `\n\n_Confidence: ${conf}%_` : '');

      try {
        await sendInteractive(sock, jid, msg, {
          body,
          footer:  botName,
          buttons: [copyButton('📋 Copy Translation', result.translated)],
        });
      } catch {
        await sock.sendMessage(jid, { text: body }, { quoted: msg });
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  Translation failed: ${e.message}`);
    }
  },
};
