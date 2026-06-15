/**
 * Workflow: remind
 *
 * Two-step guided reminder setup.
 *
 * ─── Step flow ────────────────────────────────────────────────────────────────
 *
 *   time    — Ask "when?" and parse delay string
 *   message — Ask "what?" and save the reminder
 *
 * ─── State schema ─────────────────────────────────────────────────────────────
 *
 *   session.state = {
 *     delayMs: number,   // parsed delay
 *     fireAt:  number,   // unix ms timestamp
 *   }
 *
 * ─── Trigger ──────────────────────────────────────────────────────────────────
 *
 *   From plugins/tools/remind.js when called with no arguments:
 *   await workflowManager.start(jid, 'remind', {}, { sock, msg, settings });
 */

import { defineWorkflow, StepResult } from '../states.js';
import { parseDelay, formatDelay }    from '../../lib/utility.js';
import { addReminder }                from '../../lib/reminder-service.js';

// 30-day cap
const MAX_MS = 30 * 24 * 60 * 60 * 1000;

export const remindWorkflow = defineWorkflow({
  name:    'remind',
  timeout: 120_000,

  steps: [

    // ── Step 1: ask for time ───────────────────────────────────────────────────
    {
      name: 'time',

      async enter(session, ctx) {
        await ctx.sock?.sendMessage(session.jid, {
          text:
            `⏰ *Set a Reminder — Step 1/2*\n${'─'.repeat(24)}\n\n` +
            `⏱️ *When should I remind you?*\n\n` +
            `Examples:\n` +
            `  • \`30m\`     — 30 minutes\n` +
            `  • \`2h\`      — 2 hours\n` +
            `  • \`1h30m\`   — 1 hour 30 min\n` +
            `  • \`1d\`      — tomorrow\n` +
            `  • \`2d6h\`    — 2 days 6 hours\n\n` +
            `_Type *cancel* to abort._`,
        }, { quoted: ctx.msg }).catch(() => {});
      },

      async handle(session, input) {
        const ms = parseDelay(input.trim());

        if (!ms || ms < 10_000) {
          return StepResult.retry(
            `❓ Couldn't parse that time.\n\n` +
            `Try: \`30m\`, \`2h\`, \`1h30m\`, \`1d\`\n` +
            `_Minimum 10 seconds. Type *cancel* to abort._`,
          );
        }
        if (ms > MAX_MS) {
          return StepResult.retry(
            `❌ Maximum reminder time is *30 days*.\n_Type *cancel* to abort._`,
          );
        }

        session.state.delayMs = ms;
        session.state.fireAt  = Date.now() + ms;
        return StepResult.next('message');
      },

      maxRetries: 5,
    },

    // ── Step 2: ask for message ────────────────────────────────────────────────
    {
      name: 'message',

      async enter(session, ctx) {
        await ctx.sock?.sendMessage(session.jid, {
          text:
            `📝 *Set a Reminder — Step 2/2*\n${'─'.repeat(24)}\n\n` +
            `Reminder in: *${formatDelay(session.state.delayMs)}*\n\n` +
            `💬 *What's the message?*\n\n` +
            `_Type *cancel* to abort._`,
        }, { quoted: ctx.msg }).catch(() => {});
      },

      async handle(session, input, ctx) {
        const text = input.trim();
        if (!text) {
          return StepResult.retry(`❓ Please type a reminder message.\n_Type *cancel* to abort._`);
        }

        const r = addReminder(session.jid, session.userJid, text, session.state.fireAt);

        await ctx.sock?.sendMessage(session.jid, {
          text:
            `✅ *Reminder Saved!*\n${'─'.repeat(22)}\n\n` +
            `📝 _${text}_\n\n` +
            `⏱️ *Fire in:*  ${formatDelay(session.state.delayMs)}\n` +
            `🆔 *ID:*       \`${r.id}\`\n\n` +
            `_Use \`.cancelremind ${r.id}\` to cancel._`,
        }, { quoted: ctx.msg }).catch(() => {});

        return StepResult.done();
      },

      maxRetries: 3,
    },
  ],

  async onCancel(session, ctx, reason) {
    const MSG = {
      user:        '🚫 Reminder setup cancelled.',
      interrupted: '⚡ Reminder setup interrupted by another command.',
      max_retries: '❌ Too many invalid attempts. Reminder setup cancelled.',
      timeout:     '⏱️ Reminder setup timed out.',
    };
    try {
      await ctx.sock?.sendMessage(session.jid, { text: MSG[reason] ?? '🚫 Reminder cancelled.' });
    } catch {}
  },

  async onTimeout(session, ctx) {
    try {
      await ctx.sock?.sendMessage(session.jid, {
        text: `⏱️ Reminder setup timed out. Type *.remind* to try again.`,
      });
    } catch {}
  },
});

export default remindWorkflow;
