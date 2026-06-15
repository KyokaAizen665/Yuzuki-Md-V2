/**
 * Agent Router
 *
 * Intercepts message text BEFORE the normal command dispatcher.
 * If the text matches a registered multi-step workflow, it:
 *   1. Sends an immediate "⏳ Working on it..." acknowledgement
 *   2. Queues the job on the TaskQueue
 *   3. Returns true (message claimed — skip handleCommand)
 *
 * If nothing matches, returns false so the normal command path runs.
 *
 * Integration point (bot.js):
 *   const claimed = await agentRouter.route(sock, msg, jid, senderJid, body, settings, prefix);
 *   if (!claimed) await handleCommand({ sock, msg, command, args });
 */

import { taskQueue, JobStatus } from './queue.js';
import { sessionMemory }        from './memory.js';
import { workflows }            from './tasks/index.js';

// ─── Step emoji sequence ──────────────────────────────────────────────────────

const STEP_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];

// ─── AgentRouter ─────────────────────────────────────────────────────────────

class AgentRouter {
  constructor() {
    this._workflows = workflows;
  }

  /**
   * Try to route a message as an autonomous agent workflow.
   *
   * @param {object} sock
   * @param {object} msg
   * @param {string} jid
   * @param {string} senderJid
   * @param {string} body        - Message body with prefix already stripped and trimmed
   * @param {object} settings
   * @param {string} prefix
   * @returns {Promise<boolean>} true if the message was claimed by a workflow
   */
  async route(sock, msg, jid, senderJid, body, settings, prefix) {
    const lc = body.toLowerCase().trim();

    const reply = async (text) =>
      sock.sendMessage(jid, { text }, { quoted: msg }).catch(() => {});

    for (const workflow of this._workflows) {
      let match;
      try {
        match = workflow.match(lc, { prefix, settings });
      } catch { continue; }

      if (!match.matched) continue;

      // ── Build steps once — reused for ACK and for the queue ─────────────
      // FIX: buildSteps() called only once to avoid double side-effects.
      const buildCtx = {
        vars:      match.vars,
        sock,
        msg,
        jid,
        senderJid,
        settings,
        prefix,
        reply,
        memory:    sessionMemory,
      };
      const builtSteps = workflow.buildSteps(buildCtx);
      const stepNames  = builtSteps.map(s => s.name ?? '…');

      // ── Acknowledge immediately ───────────────────────────────────────────
      await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } }).catch(() => {});

      const ackLines = [
        `⏳ *On it!*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📋 *Task:* ${workflow.name}`,
      ];
      if (stepNames.length > 1) {
        ackLines.push(`🔢 *Steps (${stepNames.length}):*`);
        stepNames.forEach((n, i) => ackLines.push(`  ${STEP_EMOJI[i] ?? '▸'} ${n}`));
      }
      ackLines.push(``, `_I'll send the result when it's ready._`);
      await reply(ackLines.join('\n'));

      taskQueue.enqueue({
        jid,
        name:    workflow.name,
        steps:   builtSteps,
        context: {
          sock, msg, jid, senderJid, settings, prefix, reply,
          memory: sessionMemory,
          vars:   match.vars,
        },

        onStep: async (jobId, stepIdx, stepName, status) => {
          if (status === 'running' && stepIdx > 0) {
            await sock.sendMessage(jid, {
              react: { text: STEP_EMOJI[stepIdx] ?? '🔄', key: msg.key },
            }).catch(() => {});
          }
        },

        onDone: async (_jobId, ctx) => {
          await sock.sendMessage(jid, {
            react: { text: '✅', key: msg.key },
          }).catch(() => {});
          sessionMemory.pushHistory(jid, { command: lc, result: ctx._lastResult });
        },

        onError: async (_jobId, stepIdx, err) => {
          await sock.sendMessage(jid, {
            react: { text: '❌', key: msg.key },
          }).catch(() => {});
          await reply(
            `❌ *Task failed at step ${stepIdx + 1}*\n` +
            `_(${err?.message ?? String(err)})_`,
          ).catch(() => {});
        },
      });

      return true;
    }

    return false;
  }

  // ─── Job management helpers (used by agent plugin commands) ──────────────────

  /**
   * Cancel the most recent active job for a JID.
   * @param {string} jid
   * @returns {boolean}
   */
  cancelLatest(jid) {
    const active = taskQueue
      .getJobsForJid(jid)
      .filter(j => j.status === JobStatus.QUEUED || j.status === JobStatus.RUNNING)
      .sort((a, b) => b.createdAt - a.createdAt);
    return active.length ? taskQueue.cancel(active[0].id) : false;
  }

  /**
   * Cancel all active jobs for a JID.
   * @param {string} jid
   * @returns {number}
   */
  cancelAll(jid) { return taskQueue.cancelAll(jid); }

  /**
   * Summarised job list for a JID (for .jobs command).
   * @param {string} jid
   * @returns {Array<{ id, name, status, step, total, ageS }>}
   */
  listJobs(jid) {
    return taskQueue.getJobsForJid(jid).map(j => ({
      id:     j.id.slice(0, 8),
      name:   j.name,
      status: j.status,
      step:   j.stepIdx + 1,
      total:  j.steps.length,
      ageS:   Math.round((Date.now() - j.createdAt) / 1000),
    }));
  }

  /** Clear session memory for a JID. */
  clearMemory(jid) { sessionMemory.clear(jid); }
}

export const agentRouter = new AgentRouter();
