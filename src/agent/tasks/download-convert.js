/**
 * Workflow: Download & Convert to Voice Note
 *
 * Triggered by natural-language phrases such as:
 *   "download despacito and convert to voice note"
 *   "send despacito as voice note"
 *   "ptt of shape of you"
 *   "voice note: blinding lights"
 *
 * Steps:
 *   1. Resolve YouTube URL from query (ytsr / search)
 *   2. Download audio stream to in-memory buffer
 *   3. Send buffer as PTT voice note (ptt: true)
 */

import { BaseWorkflow } from './_base.js';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);

// ─── Pattern definitions ───────────────────────────────────────────────────────

const PATTERNS = [
  // "download X and convert to voice note / ptt"
  /(?:download|get|fetch)\s+(.+?)\s+(?:and\s+)?(?:convert\s+(?:to\s+)?|as\s+)(?:voice\s*note|ptt|audio\s*message)/i,
  // "send X as voice note / ptt"
  /(?:send|play)\s+(.+?)\s+as\s+(?:voice\s*note|ptt)/i,
  // "voice note of X" / "voice note: X" / "voice note:X"
  /voice\s*note\s*(?:of\s+|for\s+|:\s*)(.+)/i,
  // "ptt of X" / "ptt: X" / "ptt:X"
  /\bptt\s*(?:of\s+|for\s+|:\s*)(.+)/i,
  // "X as voice note"
  /(.+?)\s+as\s+(?:a\s+)?(?:voice\s*note|ptt)/i,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _resolveYtUrl(query) {
  // Try to find a YouTube URL for the query using ytsr (if available)
  // Falls back to constructing a search URL for ytdl-core's auto-search
  try {
    const ytsr = _require('ytsr');
    const results = await ytsr(query, { limit: 1 });
    if (results.items?.[0]?.url) return results.items[0].url;
  } catch { /* ytsr not installed — fall back */ }

  // ytdl-core accepts "ytsearch:query" natively
  return `ytsearch:${query}`;
}

async function _downloadAudio(ytUrl) {
  const ytdl = _require('@distube/ytdl-core');

  const info   = await ytdl.getInfo(ytUrl);
  const format = ytdl.chooseFormat(info.formats, {
    quality:  'lowestaudio',
    filter:   'audioonly',
  });

  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = ytdl.downloadFromInfo(info, { format });
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// ─── Workflow class ───────────────────────────────────────────────────────────

export class DownloadConvertWorkflow extends BaseWorkflow {
  get name() { return 'Download & Convert to Voice Note'; }

  match(text, _ctx) {
    for (const re of PATTERNS) {
      const m = text.match(re);
      if (m) {
        const query = (m[1] ?? '').trim();
        if (query.length > 1) return { matched: true, vars: { query } };
      }
    }
    return { matched: false, vars: {} };
  }

  buildSteps({ vars, sock, msg, jid, reply }) {
    const { query } = vars;

    return [
      {
        name: `🔍 Find "${query}" on YouTube`,
        abortOnError: true,
        fn: async (ctx) => {
          const ytUrl = await _resolveYtUrl(query);
          ctx.ytUrl = ytUrl;
          return ytUrl;
        },
      },

      {
        name: '⬇️ Download audio',
        abortOnError: true,
        fn: async (ctx) => {
          await reply(`🎵 Found it! Downloading *${query}*...`);
          const buffer = await _downloadAudio(ctx.ytUrl);
          ctx.audioBuffer = buffer;
          return { size: buffer.length };
        },
      },

      {
        name: '🎙️ Send as voice note',
        abortOnError: false,
        fn: async (ctx) => {
          if (!ctx.audioBuffer) throw new Error('Audio buffer missing');
          await sock.sendMessage(
            jid,
            { audio: ctx.audioBuffer, mimetype: 'audio/mpeg', ptt: true },
            { quoted: msg },
          );
          return { sent: true };
        },
      },
    ];
  }
}
