/**
 * BaseWorkflow — abstract base class for all agent workflows.
 *
 * Each concrete workflow must implement:
 *   - get name()       → string  (shown to user in progress messages)
 *   - match(text, ctx) → { matched: boolean, vars: Record<string,string> }
 *   - buildSteps(params) → Step[]
 *
 * Step shape:
 *   {
 *     name:           string          — shown in progress updates
 *     fn:             async (ctx) => any
 *     abortOnError?:  boolean         — default true
 *   }
 *
 * The shared `ctx` object is the job's mutable context. Steps communicate
 * by writing to ctx (e.g. ctx.audioBuffer = …) so the next step can read it.
 * Built-in fields added by the queue:
 *   ctx._jobId        — UUID
 *   ctx._jid          — JID
 *   ctx._lastResult   — return value of the previous step
 *   ctx._step{N}_result — return value of step N
 */

export class BaseWorkflow {
  /**
   * Human-readable name shown in the "Working on it..." message.
   * @returns {string}
   */
  get name() { return 'Unnamed Workflow'; }

  /**
   * Return true if this workflow should handle the given message text.
   * `vars` carries any named captures extracted from the text (e.g. { query }).
   *
   * @param {string} text            - Lowercase-trimmed body (prefix already stripped)
   * @param {object} ctx
   * @param {string} ctx.prefix      - Bot prefix
   * @param {object} ctx.settings    - Current bot settings
   * @returns {{ matched: boolean, vars: Record<string, string> }}
   */
  match(_text, _ctx) { return { matched: false, vars: {} }; }

  /**
   * Build the ordered step list.
   * Called once when the job is queued, receives all runtime references.
   *
   * @param {object} params
   * @param {Record<string,string>} params.vars      - Named captures from match()
   * @param {object}  params.sock       - Baileys socket
   * @param {object}  params.msg        - WAMessage that triggered the job
   * @param {string}  params.jid        - Chat JID
   * @param {string}  params.senderJid  - Sender JID
   * @param {object}  params.settings   - Bot settings
   * @param {string}  params.prefix     - Command prefix
   * @param {Function} params.reply     - async (text) => void — sends a plain message
   * @param {object}  params.memory     - sessionMemory singleton
   * @returns {Array<{ name: string, fn: async(ctx)=>any, abortOnError?: boolean }>}
   */
  buildSteps(_params) { return []; }
}
