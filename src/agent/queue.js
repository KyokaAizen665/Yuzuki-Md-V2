/**
 * Agent Task Queue
 *
 * Manages background multi-step jobs. Each job is an ordered array of step
 * functions that share a single mutable context object. Steps run sequentially
 * by default; the queue itself runs up to `maxConcurrent` jobs in parallel.
 *
 * Design rules:
 *  - No external dependencies — pure ESM, Node builtins only.
 *  - A step failure aborts the job by default (abortOnError: true).
 *  - Set abortOnError: false on a step to continue on failure.
 *  - Completed jobs are pruned automatically after 10 minutes.
 *  - Per-JID helpers (getJobsForJid, cancelAll) keep the bot-side API simple.
 */

import { randomUUID } from 'crypto';

// ─── Job lifecycle states ──────────────────────────────────────────────────────

export const JobStatus = Object.freeze({
  QUEUED:    'queued',
  RUNNING:   'running',
  DONE:      'done',
  FAILED:    'failed',
  CANCELLED: 'cancelled',
});

// ─── TaskQueue ────────────────────────────────────────────────────────────────

class TaskQueue {
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxConcurrent=3] - Max parallel jobs across all JIDs
   */
  constructor({ maxConcurrent = 3 } = {}) {
    /** @type {Map<string, object>}  jobId → job */
    this._jobs = new Map();
    /** @type {Map<string, Set<string>>}  jid → Set<jobId> */
    this._jidJobs = new Map();
    this._maxConcurrent = maxConcurrent;
    this._running = 0;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Enqueue a multi-step background job.
   *
   * @param {object}   spec
   * @param {string}   spec.jid       - WhatsApp JID (chat or group)
   * @param {string}   spec.name      - Human-readable job name shown to the user
   * @param {Array}    spec.steps     - Ordered step objects:
   *                                     { name: string, fn: async(ctx)=>any,
   *                                       abortOnError?: boolean }
   * @param {object}   [spec.context] - Initial shared context (merged with internal fields)
   * @param {Function} [spec.onStep]  - (jobId, stepIdx, stepName, status, resultOrErr) => void
   * @param {Function} [spec.onDone]  - (jobId, finalCtx) => void
   * @param {Function} [spec.onError] - (jobId, stepIdx, error) => void
   * @returns {string} jobId — UUID for cancellation
   */
  enqueue({ jid, name, steps, context = {}, onStep, onDone, onError }) {
    const jobId = randomUUID();

    const job = {
      id:        jobId,
      jid,
      name,
      steps,
      context:   { ...context, _jobId: jobId, _jid: jid },
      status:    JobStatus.QUEUED,
      stepIdx:   0,
      createdAt: Date.now(),
      onStep,
      onDone,
      onError,
    };

    this._jobs.set(jobId, job);
    if (!this._jidJobs.has(jid)) this._jidJobs.set(jid, new Set());
    this._jidJobs.get(jid).add(jobId);

    setImmediate(() => this._dispatch(jobId));
    return jobId;
  }

  /**
   * Cancel a queued or running job.
   * @param {string} jobId
   * @returns {boolean} true if the job was found and not already terminal
   */
  cancel(jobId) {
    const job = this._jobs.get(jobId);
    if (!job) return false;
    if (job.status === JobStatus.DONE    ||
        job.status === JobStatus.FAILED  ||
        job.status === JobStatus.CANCELLED) return false;
    job.status = JobStatus.CANCELLED;
    return true;
  }

  /**
   * Cancel all active jobs for a JID.
   * @param {string} jid
   * @returns {number} number of jobs cancelled
   */
  cancelAll(jid) {
    const ids = this._jidJobs.get(jid) ?? new Set();
    let count = 0;
    for (const id of ids) { if (this.cancel(id)) count++; }
    return count;
  }

  /** @returns {object|null} */
  getJob(jobId) { return this._jobs.get(jobId) ?? null; }

  /**
   * All jobs (any state) for a given JID.
   * @param {string} jid
   * @returns {object[]}
   */
  getJobsForJid(jid) {
    const ids = this._jidJobs.get(jid) ?? new Set();
    return [...ids].map(id => this._jobs.get(id)).filter(Boolean);
  }

  /** Total tracked jobs including completed. */
  get size() { return this._jobs.size; }

  // ─── Internal ────────────────────────────────────────────────────────────────

  async _dispatch(jobId) {
    const job = this._jobs.get(jobId);
    if (!job || job.status !== JobStatus.QUEUED) return;

    if (this._running >= this._maxConcurrent) {
      setTimeout(() => this._dispatch(jobId), 300);
      return;
    }

    this._running++;
    job.status = JobStatus.RUNNING;

    try {
      for (let i = 0; i < job.steps.length; i++) {
        if (job.status === JobStatus.CANCELLED) break;

        const step     = job.steps[i];
        const stepName = step.name ?? `Step ${i + 1}`;
        job.stepIdx    = i;

        try {
          job.onStep?.(job.id, i, stepName, 'running', null);
          const result = await step.fn(job.context);
          job.context[`_step${i}_result`] = result;
          job.context._lastResult = result;
          job.onStep?.(job.id, i, stepName, 'done', result);
        } catch (stepErr) {
          job.onStep?.(job.id, i, stepName, 'error', stepErr);
          job.onError?.(job.id, i, stepErr);
          if (step.abortOnError !== false) {
            job.status = JobStatus.FAILED;
            break;
          }
        }
      }

      if (job.status === JobStatus.RUNNING) {
        job.status = JobStatus.DONE;
        job.onDone?.(job.id, job.context);
      }
    } finally {
      this._running--;
      // Auto-prune terminal jobs after 10 minutes
      setTimeout(() => {
        const j = this._jobs.get(jobId);
        if (j && j.status !== JobStatus.RUNNING && j.status !== JobStatus.QUEUED) {
          this._jobs.delete(jobId);
          this._jidJobs.get(j.jid)?.delete(jobId);
        }
      }, 10 * 60 * 1000);
    }
  }
}

export { TaskQueue };
export const taskQueue = new TaskQueue({ maxConcurrent: 3 });
