/**
 * Workflow: play
 *
 * Guided song-search and download experience.
 *
 * ─── Step flow ────────────────────────────────────────────────────────────────
 *
 *   search   — Search JioSaavn + YouTube, display numbered results, wait for pick
 *   format   — Ask audio or video (skipped for direct Saavn results)
 *   deliver  — Download and send the chosen track
 *
 * ─── State schema ─────────────────────────────────────────────────────────────
 *
 *   session.state = {
 *     query:    string,          // original search query
 *     results:  Track[],         // search results list
 *     picked:   Track | null,    // chosen track
 *     format:   'audio'|'video', // chosen format
 *   }
 *
 * ─── Track schema ─────────────────────────────────────────────────────────────
 *
 *   {
 *     title:     string,
 *     artists:   string,
 *     url:       string,         // direct audio URL (Saavn) or YouTube URL
 *     thumbnail: string,
 *     duration:  string,
 *     source:    'saavn'|'youtube',
 *   }
 *
 * Usage — from plugins/download/play.js:
 *   await workflowManager.start(jid, 'play', { query }, { sock, msg, settings });
 */

import { defineWorkflow, StepResult }  from '../states.js';
import { searchSaavn, ytSearch, ytmp3, ytmp4 } from '../../lib/scrape/youtube.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format duration "3:45" or seconds number → "3:45" */
function fmtDur(raw) {
  if (!raw) return '';
  if (typeof raw === 'number') {
    const m = Math.floor(raw / 60);
    const s = raw % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return String(raw);
}

/** Truncate a string to max length with ellipsis */
function trunc(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/**
 * Search both Saavn and YouTube, merge into unified Track[].
 * Saavn results come first (direct audio URL available).
 * @param {string} query
 * @returns {Promise<Track[]>}
 */
async function searchAll(query) {
  const tracks = [];

  // Saavn (fast, 320 kbps, direct URL)
  try {
    const saavn = await searchSaavn(query, 3);
    for (const s of saavn) {
      if (!s.url) continue;
      tracks.push({
        title:     s.title     ?? 'Unknown',
        artists:   s.artists   ?? '',
        url:       s.url,
        thumbnail: s.thumbnail ?? '',
        duration:  fmtDur(s.duration),
        source:    'saavn',
      });
    }
  } catch {}

  // YouTube (fallback / video support)
  try {
    const yt = await ytSearch(query, 3);
    for (const v of yt) {
      tracks.push({
        title:     v.title   ?? 'Unknown',
        artists:   v.author  ?? '',
        url:       v.url,
        thumbnail: v.thumbnail ?? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        duration:  fmtDur(v.duration),
        source:    'youtube',
      });
    }
  } catch {}

  return tracks.slice(0, 5);
}

/**
 * Build the result-list message.
 * @param {Track[]} tracks
 * @param {string}  query
 * @returns {string}
 */
function buildResultList(tracks, query) {
  const lines = [
    `🎵 *Results for:* _"${trunc(query, 50)}"_`,
    '',
  ];
  for (let i = 0; i < tracks.length; i++) {
    const t    = tracks[i];
    const icon = t.source === 'saavn' ? '🎧' : '▶️';
    const dur  = t.duration ? ` _(${t.duration})_` : '';
    lines.push(
      `*${i + 1}.* ${icon} ${trunc(t.title, 40)}${dur}`,
      `    👤 ${trunc(t.artists || 'Unknown', 30)}`,
      '',
    );
  }
  lines.push(`Reply with a *number* (1–${tracks.length}) to choose.`);
  lines.push(`Type *cancel* to abort.`);
  return lines.join('\n');
}

// ─── Workflow definition ──────────────────────────────────────────────────────

export const playWorkflow = defineWorkflow({
  name:    'play',
  timeout: 90_000, // 90 s — enough time for user to read list

  steps: [
    // ── Step 1: search ──────────────────────────────────────────────────────
    {
      name: 'search',

      async enter(session, ctx) {
        const { sock, msg } = ctx;
        const jid           = session.jid;

        // Typing indicator while searching
        try { await sock.sendPresenceUpdate('composing', jid); } catch {}

        let tracks;
        try {
          tracks = await searchAll(session.state.query);
        } catch {
          tracks = [];
        }

        try { await sock.sendPresenceUpdate('paused', jid); } catch {}

        if (!tracks.length) {
          await sock.sendMessage(jid, {
            text: `❌ No results found for *"${session.state.query}"*.\nTry a different title.`,
          }, { quoted: msg }).catch(() => {});
          return StepResult.cancel('no_results');
        }

        session.state.results = tracks;

        await sock.sendMessage(jid, {
          text: buildResultList(tracks, session.state.query),
        }, { quoted: msg }).catch(() => {});
      },

      async handle(session, input) {
        const n = parseInt(input, 10);
        const results = session.state.results ?? [];

        if (isNaN(n) || n < 1 || n > results.length) {
          return StepResult.retry(
            `❓ Please reply with a number between *1* and *${results.length}*.\n` +
            `Type *cancel* to abort.`,
          );
        }

        session.state.picked = results[n - 1];

        // Saavn results are audio-only — skip format step
        if (session.state.picked.source === 'saavn') {
          session.state.format = 'audio';
          return StepResult.next('deliver');
        }

        // YouTube results need format selection
        return StepResult.next('format');
      },

      maxRetries: 3,
    },

    // ── Step 2: format ──────────────────────────────────────────────────────
    {
      name: 'format',

      async enter(session, ctx) {
        const { sock, msg } = ctx;
        const track = session.state.picked;

        await sock.sendMessage(session.jid, {
          text:
            `🎵 *${trunc(track.title, 50)}*\n` +
            `👤 ${trunc(track.artists || 'Unknown', 40)}\n\n` +
            `Choose format:\n` +
            `*audio* — MP3 🎵\n` +
            `*video* — MP4 🎬\n\n` +
            `Type *cancel* to abort.`,
        }, { quoted: msg }).catch(() => {});
      },

      async handle(session, input) {
        const f = input.toLowerCase().trim();
        if (f === 'audio' || f === 'mp3' || f === 'a') {
          session.state.format = 'audio';
          return StepResult.next('deliver');
        }
        if (f === 'video' || f === 'mp4' || f === 'v') {
          session.state.format = 'video';
          return StepResult.next('deliver');
        }
        return StepResult.retry(
          `❓ Please type *audio* or *video*.\nType *cancel* to abort.`,
        );
      },

      maxRetries: 3,
    },

    // ── Step 3: deliver ─────────────────────────────────────────────────────
    {
      name: 'deliver',

      async enter(session, ctx) {
        const { sock, msg } = ctx;
        const jid    = session.jid;
        const track  = session.state.picked;
        const format = session.state.format;

        try { await sock.sendPresenceUpdate('composing', jid); } catch {}

        try {
          if (track.source === 'saavn') {
            // Direct Saavn audio URL — stream without re-encoding
            await sock.sendMessage(jid, {
              audio: { url: track.url },
              mimetype: 'audio/mpeg',
              contextInfo: {
                externalAdReply: {
                  title:        trunc(track.title, 60),
                  body:         trunc(track.artists || 'Yuzuki Music', 60),
                  thumbnailUrl: track.thumbnail || '',
                  mediaType:    1,
                },
              },
            }, { quoted: msg });

          } else if (format === 'audio') {
            // YouTube → MP3
            const dl = await ytmp3(track.url);
            await sock.sendMessage(jid, {
              audio: { url: dl.downloadUrl },
              mimetype: 'audio/mp4',
              contextInfo: {
                externalAdReply: {
                  title:        trunc(dl.title ?? track.title, 60),
                  body:         'Yuzuki Music',
                  thumbnailUrl: dl.thumbnail ?? track.thumbnail ?? '',
                  mediaType:    1,
                },
              },
            }, { quoted: msg });

          } else {
            // YouTube → MP4
            const dl = await ytmp4(track.url);
            await sock.sendMessage(jid, {
              video:   { url: dl.downloadUrl },
              caption:
                `🎬 *${trunc(dl.title ?? track.title, 60)}*\n` +
                `👤 ${trunc(track.artists || 'Unknown', 40)}`,
              mimetype: 'video/mp4',
            }, { quoted: msg });
          }

          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});

        } catch (err) {
          await sock.sendMessage(jid, {
            text: `❌ Download failed: ${err.message}\nTry a different result.`,
          }, { quoted: msg }).catch(() => {});
        } finally {
          try { await sock.sendPresenceUpdate('paused', jid); } catch {}
        }

        // Always done after deliver — success or failure
        return StepResult.done();
      },

      // deliver is enter()-only; handle() never called
      handle: async () => StepResult.done(),
    },
  ],

  // ── Lifecycle hooks ────────────────────────────────────────────────────────

  async onCancel(session, ctx, reason) {
    if (reason === 'no_results') return; // already sent a message
    try {
      const reasonText = {
        user:        '🚫 Workflow cancelled.',
        interrupted: '⚡ Workflow interrupted by another command.',
        max_retries: '❌ Too many invalid attempts. Workflow cancelled.',
        timeout:     '⏱️ Workflow timed out.',
      }[reason] ?? '🚫 Workflow cancelled.';

      await ctx.sock?.sendMessage(session.jid, { text: reasonText });
    } catch {}
  },

  async onTimeout(session, ctx) {
    try {
      await ctx.sock?.sendMessage(session.jid, {
        text: `⏱️ *Search timed out.*\nType *.play ${session.state.query}* to try again.`,
      });
    } catch {}
  },

  async onComplete(_session, _ctx) {
    // Nothing extra — deliver step already sent the media and ✅ reaction.
  },
});

export default playWorkflow;
