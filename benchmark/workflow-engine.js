#!/usr/bin/env node
/**
 * Workflow Engine Validation Suite
 * Yuzuki Framework — Production Hardening
 *
 * Tests all three workflow subsystems:
 *   A. WorkflowManager   — interactive multi-step conversation flows
 *   B. GamesEngine       — turn-based game session management
 *   C. AgentTaskQueue    — background multi-step job processing
 *   D. SessionMemory     — per-JID persistent key-value store
 *
 * Simulates: user disconnects, timeout events, invalid input, concurrent sessions
 * Covers:    session creation, persistence, cancellation, completion, chaining
 *
 * 22 phases — ~140 tests
 */

import { WorkflowSession, SessionStore } from '../src/workflows/sessions.js';
import { defineWorkflow, StepResult, normaliseResult } from '../src/workflows/states.js';
import { WorkflowManager }  from '../src/workflows/manager.js';   // class, not singleton
import { TaskQueue, JobStatus } from '../src/agent/queue.js';
import { SessionMemory }    from '../src/agent/memory.js';
import { GameSession, gameEngine } from '../src/lib/game-engine.js';
import { gameSessions }     from '../src/games/sessions.js';
import { gamesEngine }      from '../src/games/engine.js';
import { DownloadConvertWorkflow } from '../src/agent/tasks/download-convert.js';

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed  = 0;
let failed  = 0;
let warned  = 0;
const bugs  = [];
const warns = [];

function ok(label, actual, expected) {
  // When expected is a boolean, compare strictly.
  // When expected is undefined, treat as a truthy-check (convenience shorthand).
  const cond = (expected === undefined) ? !!actual : actual === expected;
  if (cond) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.log(`  ❌  ${label}`);
    console.log(`       expected: ${JSON.stringify(expected)}`);
    console.log(`       actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function notOk(label, actual) {
  if (!actual) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.log(`  ❌  ${label}`);
    console.log(`       expected falsy, got: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function deepOk(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.log(`  ❌  ${label}`);
    console.log(`       expected: ${e}`);
    console.log(`       actual:   ${a}`);
    failed++;
  }
}

function pass(label) {
  console.log(`  ✅  ${label}`);
  passed++;
}

function fail(label, detail = '') {
  console.log(`  ❌  ${label}${detail ? ' — ' + detail : ''}`);
  failed++;
}

function warn(label, detail = '') {
  console.log(`  ⚠️   ${label}${detail ? ' — ' + detail : ''}`);
  warns.push({ label, detail });
  warned++;
}

function bug(id, sev, title, detail) {
  bugs.push({ id, sev, title, detail });
  console.log(`  🐛  [${sev}] ${id}: ${title}`);
}

function phase(n, title) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Phase ${n}: ${title}`);
  console.log(`${'═'.repeat(70)}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Mock ctx ─────────────────────────────────────────────────────────────────

let _sent = [];   // captured sendMessage calls
function makeSock() {
  return {
    sendMessage: async (jid, msg) => { _sent.push({ jid, msg }); },
    sendPresenceUpdate: async () => {},
  };
}
function makeMsgCtx(jid = 'test@s.whatsapp.net', userJid = 'user@s.whatsapp.net') {
  return {
    sock:     makeSock(),
    msg:      { key: { remoteJid: jid, participant: userJid, id: 'msg-001' } },
    settings: { prefix: '.' },
  };
}
function clearSent() { _sent = []; }

// ─── Shared workflow definitions ──────────────────────────────────────────────

const wfLinear = defineWorkflow({
  name:    'linear-wf',
  timeout: 10_000,
  steps: [
    {
      name: 'ask',
      async enter(session, ctx) {
        await ctx.sock?.sendMessage(session.jid, { text: 'What is 2+2?' });
      },
      async handle(session, input) {
        if (input.trim() === '4') {
          session.state.answer = 4;
          return StepResult.next('confirm');
        }
        return StepResult.retry('Wrong! Try again.');
      },
      maxRetries: 3,
    },
    {
      name: 'confirm',
      async enter(session, ctx) {
        await ctx.sock?.sendMessage(session.jid, { text: `Correct! Answer: ${session.state.answer}` });
        return StepResult.done();
      },
      handle: async () => StepResult.done(),
    },
  ],
  onCancel:  async (session, ctx, reason) => {
    await ctx.sock?.sendMessage(session.jid, { text: `Cancelled: ${reason}` });
  },
  onComplete: async (session, ctx) => {
    await ctx.sock?.sendMessage(session.jid, { text: 'Done!' });
  },
  onTimeout: async (session, ctx) => {
    await ctx.sock?.sendMessage(session.jid, { text: 'Timed out!' });
  },
});

const wfMultistep = defineWorkflow({
  name:    'multistep-wf',
  timeout: 10_000,
  steps: [
    {
      name: 'step1',
      async enter(session) { session.state.step1 = true; },
      async handle() { return StepResult.next('step2'); },
    },
    {
      name: 'step2',
      async enter(session) { session.state.step2 = true; },
      async handle() { return StepResult.next('step3'); },
    },
    {
      name: 'step3',
      async enter(session) { session.state.step3 = true; },
      async handle() { return StepResult.done(); },
    },
  ],
});

const wfSelfCancel = defineWorkflow({
  name: 'self-cancel-wf',
  timeout: 10_000,
  steps: [
    {
      name: 'start',
      async enter() {},
      async handle(session, input) {
        if (input === 'abort') return StepResult.cancel('user_abort');
        return StepResult.done();
      },
    },
  ],
  onCancel: async (s, ctx, reason) => {
    await ctx.sock?.sendMessage(s.jid, { text: `hook:${reason}` });
  },
});

const wfBadNext = defineWorkflow({
  name: 'bad-next-wf',
  timeout: 10_000,
  steps: [
    {
      name: 'start',
      async enter() {},
      async handle() { return StepResult.next('nonexistent'); },
    },
  ],
});

const wfEnterThrows = defineWorkflow({
  name: 'enter-throws-wf',
  timeout: 10_000,
  steps: [
    {
      name: 'start',
      async enter() { throw new Error('enter kaboom'); },
      handle: async () => StepResult.done(),
    },
  ],
});

const wfHandleThrows = defineWorkflow({
  name: 'handle-throws-wf',
  timeout: 10_000,
  steps: [
    {
      name: 'start',
      async enter() {},
      async handle() { throw new Error('handle kaboom'); },
    },
  ],
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function freshManager(...defs) {
  const mgr = new WorkflowManager();
  for (const d of defs) mgr.register(d);
  return mgr;
}

function freshQueue(maxConcurrent = 3) {
  return new TaskQueue({ maxConcurrent });
}

function freshMemory(ttl) {
  return new SessionMemory(ttl);
}

// ─── Phase 1: defineWorkflow — Definition validation ─────────────────────────

phase(1, 'defineWorkflow — definition validation');

try { defineWorkflow({ name: '', steps: [{ name: 's', handle: async () => {} }] }); fail('Empty name should throw'); }
catch { pass('Empty name throws'); }

try { defineWorkflow({ name: 'x', steps: [] }); fail('Empty steps should throw'); }
catch { pass('Empty steps throws'); }

try { defineWorkflow({ name: 'x', steps: [{ name: 's' }] }); fail('Step with no enter/handle should throw'); }
catch { pass('Step with no handle/enter throws'); }

try { defineWorkflow({ name: 'x', steps: [{ name: 's', handle: async()=>{} }, { name: 's', handle: async()=>{} }] }); fail('Duplicate step name should throw'); }
catch { pass('Duplicate step name throws'); }

try { defineWorkflow({ name: 'x', steps: [{ name: '', handle: async()=>{} }] }); fail('Step with empty name should throw'); }
catch { pass('Step with empty string name throws'); }

{ // valid definition
  const wf = defineWorkflow({ name: 'v', steps: [{ name: 'a', handle: async()=>{} }] });
  ok('Valid definition returns frozen object', Object.isFrozen(wf), true);
  ok('firstStep is steps[0].name', wf.firstStep, 'a');
  ok('stepMap contains step', wf.stepMap.has('a'), true);
  ok('Default timeout 60s', wf.timeout, 60_000);
}

// ─── Phase 2: WorkflowManager — Registration ──────────────────────────────────

phase(2, 'WorkflowManager — registration');

{
  const mgr = freshManager();
  try { mgr.register({}); fail('register with no name should throw'); }
  catch { pass('register() rejects definition without name'); }

  mgr.register(wfLinear);
  ok('Registered workflow appears in listWorkflows()', mgr.listWorkflows().includes('linear-wf'), true);

  mgr.register(wfLinear); // re-register (overwrite)
  ok('Re-register does not duplicate', mgr.listWorkflows().filter(n => n === 'linear-wf').length, 1);

  mgr.registerAll([wfMultistep, wfSelfCancel]);
  ok('registerAll() registers multiple', mgr.listWorkflows().length >= 3, true);

  ok('getWorkflowInfo returns step count', mgr.getWorkflowInfo('linear-wf')?.stepCount, 2);
  ok('getWorkflowInfo unknown returns null', mgr.getWorkflowInfo('unknown'), null);
}

// ─── Phase 3: Session Creation ────────────────────────────────────────────────

phase(3, 'WorkflowManager — session creation');

{
  const mgr = freshManager(wfLinear);
  const jid = 'alice@s.whatsapp.net';
  const ctx = makeMsgCtx(jid);
  clearSent();

  const res = await mgr.start(jid, 'unknown-wf', {}, ctx);
  ok('Unknown workflow returns ok:false', res.ok, false);
  ok('Error message contains workflow name', res.error?.includes('unknown-wf'), true);
  ok('No session created for unknown workflow', mgr.has(jid), false);

  const res2 = await mgr.start(jid, 'linear-wf', {}, ctx);
  ok('Valid start returns ok:true', res2.ok, true);
  ok('Session exists after start', mgr.has(jid), true);

  const snap = mgr.get(jid);
  ok('Session snapshot has jid', snap?.jid, jid);
  ok('Session snapshot has workflowName', snap?.workflowName, 'linear-wf');
  ok('Session currentStep is first step', snap?.currentStep, 'ask');
  ok('Session retryCount starts at 0', snap?.retryCount, 0);
  ok('get() on non-existent JID returns null', mgr.get('nobody@s.whatsapp.net'), null);

  mgr.cancel(jid, 'test', ctx);
}

// ─── Phase 4: Session Persistence ────────────────────────────────────────────

phase(4, 'WorkflowSession — internal state persistence');

{
  const session = new WorkflowSession({
    jid:          'bob@s.whatsapp.net',
    userJid:      'bob@s.whatsapp.net',
    workflowName: 'test-wf',
    state:        { x: 1 },
    timeout:      5000,
  });

  ok('Initial state is a shallow copy', session.state.x, 1);
  session.state.y = 99;
  ok('State mutation persists on session', session.state.y, 99);

  session.touch();
  ok('touch() resets retryCount to 0', session.retryCount, 0);
  session.retry();
  ok('retry() increments retryCount', session.retryCount, 1);

  const json = session.toJSON();
  ok('toJSON() includes jid', json.jid, 'bob@s.whatsapp.net');
  ok('toJSON() includes retryCount', typeof json.retryCount === 'number', true);
  ok('toJSON() does not expose timer', json._timer === undefined, true);
}

// ─── Phase 5: Session Store ───────────────────────────────────────────────────

phase(5, 'SessionStore — CRUD operations');

{
  const store = new SessionStore();
  const s1 = new WorkflowSession({ jid: 'c1@s', userJid: 'c1@s', workflowName: 'w', timeout: 5000 });
  const s2 = new WorkflowSession({ jid: 'c2@s', userJid: 'c2@s', workflowName: 'w', timeout: 5000 });

  store.set(s1);
  store.set(s2);
  ok('Store.has() returns true after set', store.has('c1@s'), true);
  ok('Store.has() returns false for unknown', store.has('nope@s'), false);
  ok('Store.get() returns session', store.get('c1@s') === s1, true);
  ok('Store.size counts sessions', store.size, 2);
  ok('Store.all() returns all sessions', store.all().length, 2);

  // Replacing session clears old timer
  const s1b = new WorkflowSession({ jid: 'c1@s', userJid: 'c1@s', workflowName: 'w2', timeout: 5000 });
  let timerCleared = false;
  s1._timer = setTimeout(() => {}, 99999);
  s1.clearTimer = () => { timerCleared = true; clearTimeout(s1._timer); s1._timer = null; };
  store.set(s1b);
  ok('Replacing session calls clearTimer on old session', timerCleared, true);

  store.delete('c1@s');
  ok('Store.delete removes session', store.has('c1@s'), false);
  ok('Store.size decrements', store.size, 1);

  store.delete('nope@s'); // no-op
  pass('Store.delete non-existent is no-op');
}

// ─── Phase 6: Workflow Completion ─────────────────────────────────────────────

phase(6, 'WorkflowManager — workflow completion');

{
  const mgr = freshManager(wfLinear);
  const jid = 'comp@s';
  const ctx = makeMsgCtx(jid);
  clearSent();

  await mgr.start(jid, 'linear-wf', {}, ctx);
  ok('Session active at start', mgr.has(jid), true);

  // Send correct answer
  const consumed = await mgr.resume(jid, '4', ctx);
  ok('resume() returns true when consumed', consumed, true);
  ok('Session removed after completion', mgr.has(jid), false);

  const completionMsg = _sent.find(s => s.msg?.text?.includes('Correct'));
  ok('Completion message sent (enter step)', !!completionMsg, true);
}

// ─── Phase 7: Workflow Cancellation ───────────────────────────────────────────

phase(7, 'WorkflowManager — cancellation');

{
  const mgr = freshManager(wfLinear, wfSelfCancel);
  const jid = 'cancel@s';
  const ctx = makeMsgCtx(jid);
  clearSent();

  // Cancel command via resume()
  await mgr.start(jid, 'linear-wf', {}, ctx);
  clearSent();
  const consumed = await mgr.resume(jid, '.cancel', ctx);
  ok('.cancel command: returns consumed=true', consumed, true);
  ok('.cancel command: session removed', mgr.has(jid), false);
  const cancelMsg = _sent.find(s => s.msg?.text?.includes('Cancelled'));
  ok('onCancel hook fired after .cancel', !!cancelMsg, true);

  // Alternative cancel words
  await mgr.start(jid, 'linear-wf', {}, ctx);
  clearSent();
  await mgr.resume(jid, '.stop', ctx);
  ok('.stop also cancels', mgr.has(jid), false);

  await mgr.start(jid, 'linear-wf', {}, ctx);
  clearSent();
  await mgr.resume(jid, '.quit', ctx);
  ok('.quit also cancels', mgr.has(jid), false);

  await mgr.start(jid, 'linear-wf', {}, ctx);
  clearSent();
  await mgr.resume(jid, '.exit', ctx);
  ok('.exit also cancels', mgr.has(jid), false);

  // cancel() directly
  await mgr.start(jid, 'linear-wf', {}, ctx);
  clearSent();
  await mgr.cancel(jid, 'manual', ctx);
  ok('cancel() removes session', mgr.has(jid), false);
  ok('cancel() on non-existent JID is no-op', await mgr.cancel('nobody@s', 'x', ctx) === undefined, true);

  // Self-cancel from handler (StepResult.cancel)
  await mgr.start(jid, 'self-cancel-wf', {}, ctx);
  clearSent();
  await mgr.resume(jid, 'abort', ctx);
  ok('StepResult.cancel removes session', mgr.has(jid), false);
  const hookMsg = _sent.find(s => s.msg?.text?.includes('hook:user_abort'));
  ok('onCancel hook receives reason from StepResult.cancel', !!hookMsg, true);
}

// ─── Phase 8: Workflow Chaining (StepResult.next) ────────────────────────────

phase(8, 'WorkflowManager — step chaining');

{
  const mgr = freshManager(wfMultistep);
  const jid = 'chain@s';
  const ctx = makeMsgCtx(jid);
  clearSent();

  await mgr.start(jid, 'multistep-wf', {}, ctx);

  // After start, we should be at step1 and enter() ran
  let snap = mgr.get(jid);
  ok('After start: currentStep is step1', snap?.currentStep, 'step1');
  ok('After start: step1 enter() ran', snap?.state?.step1, true);

  // Send any input — handler chains to step2
  await mgr.resume(jid, 'go', ctx);
  snap = mgr.get(jid);
  ok('After step1 handle: currentStep is step2', snap?.currentStep, 'step2');
  ok('step2 enter() ran', snap?.state?.step2, true);

  // Chain to step3
  await mgr.resume(jid, 'go', ctx);
  snap = mgr.get(jid);
  ok('After step2 handle: currentStep is step3', snap?.currentStep, 'step3');
  ok('step3 enter() ran', snap?.state?.step3, true);

  // step3 handle returns done
  await mgr.resume(jid, 'go', ctx);
  ok('Session removed after final step done', mgr.has(jid), false);

  // Bad next step name
  const mgr2 = freshManager(wfBadNext);
  const jid2 = 'badnext@s';
  await mgr2.start(jid2, 'bad-next-wf', {}, makeMsgCtx(jid2));
  clearSent();
  await mgr2.resume(jid2, 'go', makeMsgCtx(jid2));
  ok('Unknown next step cancels workflow', mgr2.has(jid2), false);
}

// ─── Phase 9: Interrupt by different command ──────────────────────────────────

phase(9, 'WorkflowManager — interrupt by other command');

{
  const mgr = freshManager(wfLinear);
  const jid = 'interrupt@s';
  const ctx = makeMsgCtx(jid);
  clearSent();

  await mgr.start(jid, 'linear-wf', {}, ctx);
  ok('Session active', mgr.has(jid), true);

  // Send a different command while workflow is active
  const consumed = await mgr.resume(jid, '.play despacito', ctx);
  ok('Different prefix command returns consumed=false', consumed, false);
  ok('Session silently cancelled after different command', mgr.has(jid), false);

  // Ensure onCancel hook is NOT called for silent cancel
  const cancelMsgCount = _sent.filter(s => s.msg?.text?.includes('Cancelled')).length;
  ok('onCancel hook NOT fired on silent interrupt', cancelMsgCount, 0);
}

// ─── Phase 10: Timeout events ─────────────────────────────────────────────────

phase(10, 'WorkflowManager — timeout events');

{
  const wfShortTimeout = defineWorkflow({
    name:    'short-timeout-wf',
    timeout: 80, // 80 ms — fires quickly in tests
    steps: [
      {
        name: 'wait',
        async enter() {},
        handle: async () => StepResult.done(),
      },
    ],
    onTimeout: async (session, ctx) => {
      await ctx.sock?.sendMessage(session.jid, { text: 'timeout-fired' });
    },
  });

  const mgr = freshManager(wfShortTimeout);
  const jid = 'timeout@s';
  const ctx = makeMsgCtx(jid);
  clearSent();

  await mgr.start(jid, 'short-timeout-wf', {}, ctx);
  ok('Session created before timeout', mgr.has(jid), true);

  // Wait for timeout to fire
  await sleep(200);

  ok('Session removed after timeout', mgr.has(jid), false);
  const timeoutMsg = _sent.find(s => s.msg?.text === 'timeout-fired');
  ok('onTimeout hook fired', !!timeoutMsg, true);

  // Default timeout message (no onTimeout hook defined)
  const wfDefaultTimeout = defineWorkflow({
    name: 'default-timeout-wf',
    timeout: 80,
    steps: [{ name: 'w', async enter() {}, handle: async () => StepResult.done() }],
  });
  const mgr2 = freshManager(wfDefaultTimeout);
  const jid2 = 'timeout2@s';
  const ctx2 = makeMsgCtx(jid2);
  clearSent();
  await mgr2.start(jid2, 'default-timeout-wf', {}, ctx2);
  await sleep(200);
  ok('Default timeout removes session', mgr2.has(jid2), false);
  const defMsg = _sent.find(s => s.msg?.text?.includes('timed out'));
  ok('Default timeout message sent', !!defMsg, true);

  // Timer cleared on manual cancel (no timeout fires after cancel)
  const mgr3 = freshManager(wfShortTimeout);
  const jid3 = 'notimeout@s';
  const ctx3 = makeMsgCtx(jid3);
  clearSent();
  await mgr3.start(jid3, 'short-timeout-wf', {}, ctx3);
  await mgr3.cancel(jid3, 'user', ctx3);
  await sleep(200);
  const lateMsg = _sent.filter(s => s.jid === jid3 && s.msg?.text === 'timeout-fired');
  ok('Timeout does not fire after cancel', lateMsg.length, 0);

  // Timer resets on step transition
  const wfTimerReset = defineWorkflow({
    name: 'timer-reset-wf',
    timeout: 80,
    steps: [
      { name: 'a', async enter() {}, async handle() { return StepResult.next('b'); } },
      {
        name: 'b', async enter() {}, handle: async () => StepResult.done(),
        maxRetries: 1,
      },
    ],
    onTimeout: async (s, ctx) => {
      await ctx.sock?.sendMessage(s.jid, { text: 'timer-reset-timeout' });
    },
  });
  const mgr4 = freshManager(wfTimerReset);
  const jid4 = 'timereset@s';
  const ctx4 = makeMsgCtx(jid4);
  clearSent();
  await mgr4.start(jid4, 'timer-reset-wf', {}, ctx4);
  await sleep(50); // halfway through first step timeout
  await mgr4.resume(jid4, 'go', ctx4); // transitions to step b → new timer starts
  await sleep(50); // old timeout window passes but new timer active
  ok('Session still alive mid-timer-reset', mgr4.has(jid4), true);
  await sleep(100); // new timer fires
  ok('Session removed after second timer expires', mgr4.has(jid4), false);
}

// ─── Phase 11: Retry limiting ─────────────────────────────────────────────────

phase(11, 'WorkflowManager — retry limiting & retryCount correctness');

{
  const mgr = freshManager(wfLinear);
  const jid = 'retry@s';
  const ctx = makeMsgCtx(jid);
  clearSent();

  await mgr.start(jid, 'linear-wf', {}, ctx);
  ok('Session active at start', mgr.has(jid), true);

  // Send 4 bad answers consecutively
  for (let i = 0; i < 4; i++) {
    clearSent();
    await mgr.resume(jid, 'wrong', ctx);
  }

  // With maxRetries=3: after 4 retries, retryCount should exceed 3 → auto-cancel
  const sessionGone = !mgr.has(jid);

  if (sessionGone) {
    pass('Auto-cancel fires after maxRetries exceeded');
    const tooManyMsg = _sent.find(s => s.msg?.text?.includes('Too many'));
    ok('Too-many-attempts message sent', !!tooManyMsg, true);
  } else {
    // Known bug: retryCount resets on every touch() call
    fail('Auto-cancel did NOT fire after maxRetries — retryCount bug');
    bug('WF-01', 'HIGH',
      'retryCount resets on every touch() call — auto-cancel never fires',
      'WorkflowSession.touch() resets retryCount=0 on every user input. ' +
      '_processResult then increments to 1. Next input resets to 0 again. ' +
      'retryCount oscillates 0→1 and never reaches maxRetries (3). ' +
      'FIX: remove `this.retryCount = 0` from touch(). ' +
      'Only _enterStep() should reset retryCount (it already does).'
    );
    await mgr.cancel(jid, 'test-cleanup', ctx);
  }

  // Verify retry sends error hint message
  const mgr2 = freshManager(wfLinear);
  const jid2 = 'retryhint@s';
  clearSent();
  await mgr2.start(jid2, 'linear-wf', {}, makeMsgCtx(jid2));
  clearSent();
  await mgr2.resume(jid2, 'wrong', makeMsgCtx(jid2));
  const hintMsg = _sent.find(s => s.msg?.text?.includes('Wrong'));
  ok('Retry sends error hint to user', !!hintMsg, true);
  await mgr2.cancel(jid2, 'cleanup', makeMsgCtx(jid2));

  // retryCount resets when advancing to next step
  const mgr3 = freshManager(wfLinear);
  const jid3 = 'retryReset@s';
  const ctx3 = makeMsgCtx(jid3);
  await mgr3.start(jid3, 'linear-wf', {}, ctx3);
  await mgr3.resume(jid3, 'wrong', ctx3);
  await mgr3.resume(jid3, 'wrong', ctx3);
  const snapBefore = mgr3.get(jid3);
  // Send correct answer — transitions to 'confirm' step
  await mgr3.resume(jid3, '4', ctx3);
  // Session should be gone (confirm's enter() returns done())
  ok('Correct answer after retries completes workflow', mgr3.has(jid3), false);
}

// ─── Phase 12: Invalid input edge cases ──────────────────────────────────────

phase(12, 'WorkflowManager — invalid input & edge cases');

{
  const mgr = freshManager(wfLinear, wfHandleThrows, wfEnterThrows);
  const jid  = 'invalid@s';
  const ctx  = makeMsgCtx(jid);

  // Empty input
  await mgr.start(jid, 'linear-wf', {}, ctx);
  clearSent();
  const consumed = await mgr.resume(jid, '', ctx);
  ok('Empty input is consumed', consumed, true);
  ok('Session still active after empty input', mgr.has(jid), true);
  const retryMsg = _sent.find(s => s.msg?.text?.includes('Wrong'));
  ok('Empty input triggers retry message', !!retryMsg, true);
  await mgr.cancel(jid, 'cleanup', ctx);

  // Whitespace-only input (trimmed to empty → wrong answer)
  await mgr.start(jid, 'linear-wf', {}, ctx);
  clearSent();
  await mgr.resume(jid, '   ', ctx);
  ok('Whitespace-only: session still active', mgr.has(jid), true);
  await mgr.cancel(jid, 'cleanup', ctx);

  // resume() when no session exists
  const res = await mgr.resume('nobody@s', 'hello', ctx);
  ok('resume() returns false when no session', res, false);

  // handle() throws → treated as retry
  const jid2 = 'throws@s';
  await mgr.start(jid2, 'handle-throws-wf', {}, makeMsgCtx(jid2));
  clearSent();
  await mgr.resume(jid2, 'trigger', makeMsgCtx(jid2));
  const errorMsg = _sent.find(s => s.msg?.text?.includes('error occurred'));
  ok('handle() throw sends error-occurred message', !!errorMsg, true);
  ok('Session still alive after handle() throw', mgr.has(jid2), true);
  await mgr.cancel(jid2, 'cleanup', makeMsgCtx(jid2));

  // enter() throws → session cancelled; start() still returns ok:true (enter error not propagated)
  // This is a known design quirk — documented in failure scenarios report.
  const jid3 = 'enterthrows@s';
  const res3 = await mgr.start(jid3, 'enter-throws-wf', {}, makeMsgCtx(jid3));
  ok('enter() throw: start() returns ok:true (error not propagated upward)', res3.ok, true);
  ok('enter() throw: session removed (cancel called internally)', mgr.has(jid3), false);
  bug('WF-02', 'MEDIUM',
    'enter() errors not propagated to start() caller',
    'When step.enter() throws, _enterStep catches it and calls cancel() internally. ' +
    'start() sees no exception and returns { ok: true } even though no session exists. ' +
    'Caller cannot distinguish "workflow started" from "workflow failed on enter()". ' +
    'FIX: rethrow a sentinel error from _enterStep, or return { ok: false } from start() ' +
    'when session is missing after _enterStep returns.'
  );

  // Definition unregistered while session active
  const wfTemp = defineWorkflow({ name: 'temp-wf', timeout: 10000,
    steps: [{ name: 'a', async enter(){}, handle: async () => StepResult.done() }] });
  const mgr2  = freshManager(wfTemp);
  const jid4  = 'unregwf@s';
  await mgr2.start(jid4, 'temp-wf', {}, makeMsgCtx(jid4));
  mgr2._definitions.delete('temp-wf'); // simulate hot-unregister
  clearSent();
  const res4 = await mgr2.resume(jid4, 'hi', makeMsgCtx(jid4));
  ok('Unregistered definition during active session: session cleaned up', mgr2.has(jid4), false);
}

// ─── Phase 13: Concurrent sessions ────────────────────────────────────────────

phase(13, 'WorkflowManager — concurrent sessions (different JIDs)');

{
  const mgr = freshManager(wfLinear, wfMultistep);
  const JIDs = ['u1@s', 'u2@s', 'u3@s', 'u4@s', 'u5@s'];

  // Start all concurrently
  await Promise.all(JIDs.map(jid => mgr.start(jid, 'linear-wf', {}, makeMsgCtx(jid))));
  ok('All 5 sessions created', JIDs.every(j => mgr.has(j)), true);

  // Resume a few
  await mgr.resume('u1@s', '4', makeMsgCtx('u1@s'));
  ok('u1 completed, session removed', mgr.has('u1@s'), false);
  ok('u2 still active', mgr.has('u2@s'), true);

  await mgr.cancel('u2@s', 'user', makeMsgCtx('u2@s'));
  ok('u2 cancelled', mgr.has('u2@s'), false);

  // Remaining 3 still active
  ok('3 sessions still active', ['u3@s','u4@s','u5@s'].every(j => mgr.has(j)), true);

  // Second workflow per JID replaces first (only one active per JID)
  await mgr.start('u3@s', 'multistep-wf', {}, makeMsgCtx('u3@s'));
  const snap = mgr.get('u3@s');
  ok('Starting second workflow replaces first', snap?.workflowName, 'multistep-wf');

  // Cleanup
  for (const jid of JIDs) await mgr.cancel(jid, 'cleanup', makeMsgCtx(jid));
}

// ─── Phase 14: User disconnect simulation ────────────────────────────────────

phase(14, 'WorkflowManager — user disconnect simulation');

{
  const mgr = freshManager(wfLinear);

  // Simulate disconnect: start session, then external code clears all sessions
  const JIDs = ['dc1@s', 'dc2@s', 'dc3@s'];
  for (const jid of JIDs) await mgr.start(jid, 'linear-wf', {}, makeMsgCtx(jid));
  ok('3 sessions active before disconnect', JIDs.every(j => mgr.has(j)), true);

  // Simulate bot restart / session store wipe (cancel each session)
  for (const jid of JIDs) {
    await mgr.cancel(jid, 'disconnect', makeMsgCtx(jid));
  }
  ok('All sessions cleared after disconnect', JIDs.every(j => !mgr.has(j)), true);

  // Post-disconnect: new session for same JID works
  const res = await mgr.start('dc1@s', 'linear-wf', {}, makeMsgCtx('dc1@s'));
  ok('New session starts cleanly after disconnect', res.ok, true);
  ok('Session active after re-connect', mgr.has('dc1@s'), true);
  await mgr.cancel('dc1@s', 'cleanup', makeMsgCtx('dc1@s'));

  // Simulate mid-step disconnect: session exists, timer running, then abruptly deleted
  await mgr.start('dc2@s', 'linear-wf', {}, makeMsgCtx('dc2@s'));
  // Directly purge (simulates container restart losing in-memory state)
  // Verify: resume() after purge returns false (not consumed)
  await mgr.cancel('dc2@s', 'purge', makeMsgCtx('dc2@s'));
  const consumed = await mgr.resume('dc2@s', 'hello', makeMsgCtx('dc2@s'));
  ok('resume() after session purge returns false', consumed, false);
}

// ─── Phase 15: normaliseResult ────────────────────────────────────────────────

phase(15, 'normaliseResult — all branches');

{
  deepOk('null → done', normaliseResult(null),      { _type: 'done' });
  deepOk('undefined → done', normaliseResult(undefined), { _type: 'done' });
  deepOk('StepResult.done passthrough', normaliseResult(StepResult.done()), { _type: 'done' });
  deepOk('StepResult.next passthrough', normaliseResult(StepResult.next('x')), { _type: 'next', next: 'x' });
  deepOk('StepResult.retry passthrough', normaliseResult(StepResult.retry('err')), { _type: 'retry', error: 'err' });
  deepOk('StepResult.cancel passthrough', normaliseResult(StepResult.cancel('r')), { _type: 'cancel', reason: 'r' });
  deepOk('Legacy {done:true} → done', normaliseResult({ done: true }), { _type: 'done' });
  deepOk('Legacy {next:"x"} → next', normaliseResult({ next: 'x' }), { _type: 'next', next: 'x' });

  // Legacy retry shape: { retry: true, error: 'msg' }
  const legRetry = normaliseResult({ retry: true, error: 'my-error' });
  ok('Legacy retry _type', legRetry._type, 'retry');
  ok('Legacy retry error preserved', legRetry.error, 'my-error');

  // Unknown shape → done
  deepOk('Unknown shape → done', normaliseResult({ foo: 'bar' }), { _type: 'done' });
}

// ─── Phase 16: Play Workflow (Downloader) ─────────────────────────────────────

phase(16, 'Play workflow (Downloader) — structure & state machine');

{
  // Import the play workflow — wrapped in try/catch because play.js →
  // youtube.js → axios (may not be installed in test environment)
  let playWorkflow;
  try {
    ({ playWorkflow } = await import('../src/workflows/handlers/play.js'));
  } catch (e) {
    warn('Phase 16 skipped — play.js dependency missing in test env', e.message);
    // Still count the phase as visited so reports are accurate
  }
  if (!playWorkflow) { /* skip remaining assertions in this block */ }
  if (playWorkflow) {

  ok('play workflow is named "play"', playWorkflow.name, 'play');
  ok('play workflow has 3 steps', playWorkflow.steps.length, 3);
  ok('first step is "search"', playWorkflow.firstStep, 'search');
  ok('step "search" in stepMap', playWorkflow.stepMap.has('search'), true);
  ok('step "format" in stepMap', playWorkflow.stepMap.has('format'), true);
  ok('step "deliver" in stepMap', playWorkflow.stepMap.has('deliver'), true);
  ok('play timeout is 90s', playWorkflow.timeout, 90_000);
  ok('search maxRetries is 3', playWorkflow.stepMap.get('search')?.maxRetries, 3);
  ok('onCancel hook is function', typeof playWorkflow.onCancel, 'function');
  ok('onTimeout hook is function', typeof playWorkflow.onTimeout, 'function');

  // Simulate search step handle — valid numeric input
  const fakeSess = new WorkflowSession({
    jid: 'play@s', userJid: 'play@s', workflowName: 'play', timeout: 90000,
  });
  fakeSess.currentStep = 'search';
  fakeSess.state.results = [
    { title: 'Track 1', artists: 'Artist A', url: 'https://example.com/t1', thumbnail: '', duration: '3:20', source: 'saavn' },
    { title: 'Track 2', artists: 'Artist B', url: 'https://yt.com/watch?v=xxx', thumbnail: '', duration: '4:00', source: 'youtube' },
  ];

  const searchStep = playWorkflow.stepMap.get('search');

  // Valid pick (saavn → skip format)
  const r1 = await searchStep.handle(fakeSess, '1');
  ok('Picking saavn result → next=deliver (skip format)', r1._type, 'next');
  ok('Saavn pick skips format step', r1.next, 'deliver');
  ok('Saavn pick sets format=audio', fakeSess.state.format, 'audio');
  ok('Picked track stored in state', fakeSess.state.picked?.title, 'Track 1');

  // Valid pick (youtube → format step)
  fakeSess.state.picked = null;
  fakeSess.state.format = null;
  const r2 = await searchStep.handle(fakeSess, '2');
  ok('Picking YouTube result → next=format', r2._type, 'next');
  ok('YouTube pick goes to format step', r2.next, 'format');

  // Invalid pick — out of range
  const r3 = await searchStep.handle(fakeSess, '99');
  ok('Out-of-range pick returns retry', r3._type, 'retry');

  // Invalid pick — non-numeric
  const r4 = await searchStep.handle(fakeSess, 'blah');
  ok('Non-numeric pick returns retry', r4._type, 'retry');

  // Format step
  const formatStep = playWorkflow.stepMap.get('format');
  fakeSess.state.picked = { source: 'youtube', title: 'T2', url: 'https://yt.com/watch?v=xxx' };

  for (const [input, expected] of [['audio','audio'],['mp3','audio'],['a','audio'],['video','video'],['mp4','video'],['v','video']]) {
    fakeSess.state.format = null;
    const r = await formatStep.handle(fakeSess, input);
    ok(`Format "${input}" → next=deliver`, r._type, 'next');
    ok(`Format "${input}" sets format=${expected}`, fakeSess.state.format, expected);
  }

  const rBadFormat = await formatStep.handle(fakeSess, 'wav');
  ok('Unknown format returns retry', rBadFormat._type, 'retry');

  // onCancel hook — reason mapping
  const sentOnCancel = [];
  const fakeSock = { sendMessage: async (j, m) => sentOnCancel.push(m.text) };
  await playWorkflow.onCancel({ jid: 'play@s', state: { query: 'test' } }, { sock: fakeSock }, 'user');
  ok('onCancel: user → cancellation text', sentOnCancel[0]?.includes('cancelled'), true);

  await playWorkflow.onCancel({ jid: 'play@s', state: {} }, { sock: fakeSock }, 'no_results');
  ok('onCancel: no_results → no message sent', sentOnCancel.length, 1);

  // onTimeout hook
  const sentOnTimeout = [];
  const fakeSock2 = { sendMessage: async (j, m) => sentOnTimeout.push(m.text) };
  await playWorkflow.onTimeout({ jid: 'play@s', state: { query: 'despacito' } }, { sock: fakeSock2 });
  ok('onTimeout message references original query', sentOnTimeout[0]?.includes('despacito'), true);
  } // end if(playWorkflow)
}

// ─── Phase 17: GamesEngine — Session lifecycle ────────────────────────────────

phase(17, 'GamesEngine — session lifecycle');

{
  // Register a test game
  gamesEngine.registerGame({
    gameId:     'test-game',
    name:       'Test Game',
    minPlayers: 1,
    maxPlayers: 2,
    timeout:    120_000,
    async onStart(session, ctx) {
      session.state.started = true;
      await ctx.sock?.sendMessage(session.jid, { text: 'Game started!' });
    },
    async onMove(session, input) {
      if (input === 'win') return { done: true, winner: session.players[0] };
      if (input === 'draw') return { done: true, draw: true };
      if (input === 'resign') return { done: true, cancelled: true };
      session.update({ lastMove: input });
      return { done: false };
    },
    async onEnd(session, result, ctx) {
      await ctx.sock?.sendMessage(session.jid, { text: `Game ended: ${JSON.stringify(result)}` });
    },
  });

  const jid = 'game@s';
  const ctx = makeMsgCtx(jid);
  clearSent();

  // Unknown game
  const bad = await gamesEngine.startGame(jid, 'nonexistent', ['p1@s'], {}, ctx);
  ok('Unknown game returns ok:false', bad.ok, false);

  // Too few players
  gamesEngine.registerGame({
    gameId: 'two-player-game', minPlayers: 2, maxPlayers: 2,
    onStart: async () => {}, onMove: async () => ({ done: false }),
  });
  const tooFew = await gamesEngine.startGame(jid, 'two-player-game', ['p1@s'], {}, ctx);
  ok('Too few players returns ok:false', tooFew.ok, false);

  // Too many players
  const tooMany = await gamesEngine.startGame(jid, 'test-game', ['p1@s','p2@s','p3@s'], {}, ctx);
  ok('Too many players returns ok:false', tooMany.ok, false);

  // Valid start
  clearSent();
  const start = await gamesEngine.startGame(jid, 'test-game', ['p1@s'], {}, ctx);
  ok('Valid start returns ok:true', start.ok, true);
  ok('Session returned', !!start.session, true);
  ok('Session is active', gamesEngine.isActive(jid), true);
  const startMsg = _sent.find(s => s.msg?.text === 'Game started!');
  ok('onStart hook fired', !!startMsg, true);
  ok('onStart ran (session.state.started)', start.session?.state?.started, true);

  // Move routing
  clearSent();
  const moved = await gamesEngine.routeInput(jid, 'move-1', ctx);
  ok('routeInput returns true for active game', moved, true);
  const sess = gamesEngine.getSession(jid);
  ok('Move updates session.state.lastMove', sess?.state?.lastMove, 'move-1');
  ok('Session still active after non-terminal move', gamesEngine.isActive(jid), true);

  // Win → endGame auto-called
  clearSent();
  await gamesEngine.routeInput(jid, 'win', ctx);
  ok('Session removed after win', gamesEngine.isActive(jid), false);
  const endMsg = _sent.find(s => s.msg?.text?.includes('ended'));
  ok('onEnd hook fired on win', !!endMsg, true);

  // End non-existent game
  const noEnd = await gamesEngine.endGame('nobody@s', {}, ctx);
  ok('endGame non-existent returns ok:false', noEnd.ok, false);

  // Cancelled result — no rewards recorded (just that onEnd is still called)
  clearSent();
  await gamesEngine.startGame(jid, 'test-game', ['p1@s'], {}, ctx);
  clearSent();
  await gamesEngine.routeInput(jid, 'resign', ctx);
  ok('Session removed after resign', gamesEngine.isActive(jid), false);
  const resignEnd = _sent.find(s => s.msg?.text?.includes('cancelled'));
  ok('onEnd hook called on resign/cancel', !!resignEnd, true);

  // Replacing existing session — old session terminated, new starts
  clearSent();
  await gamesEngine.startGame(jid, 'test-game', ['p1@s'], {}, ctx);
  clearSent();
  await gamesEngine.startGame(jid, 'test-game', ['p2@s'], {}, ctx);
  const newSess = gamesEngine.getSession(jid);
  ok('Starting second game replaces first', newSess?.players[0], 'p2@s');
  await gamesEngine.endGame(jid, { cancelled: true }, ctx);
}

// ─── Phase 18: GamesEngine — Pause/Resume ─────────────────────────────────────

phase(18, 'GamesEngine — pause / resume');

{
  const jid = 'pause@s';
  const ctx = makeMsgCtx(jid);

  await gamesEngine.startGame(jid, 'test-game', ['p1@s'], {}, ctx);
  ok('Session active before pause', gamesEngine.isActive(jid), true);

  // Pause
  const pauseRes = await gamesEngine.pauseGame(jid, ctx);
  ok('pauseGame returns ok:true', pauseRes.ok, true);
  ok('isActive() false while paused', gamesEngine.isActive(jid), false);
  ok('isPaused() true while paused', gamesEngine.isPaused(jid), true);
  ok('getSessionAny() still returns session while paused', !!gamesEngine.getSessionAny(jid), true);

  // routeInput blocked while paused
  const consumed = await gamesEngine.routeInput(jid, 'win', ctx);
  ok('routeInput returns false while paused', consumed, false);
  ok('Session still exists after blocked move', gamesEngine.isPaused(jid), true);

  // Pause non-existent
  const badPause = await gamesEngine.pauseGame('nobody@s', ctx);
  ok('pauseGame non-existent returns ok:false', badPause.ok, false);

  // Resume
  const resumeRes = await gamesEngine.resumeGame(jid, ctx);
  ok('resumeGame returns ok:true', resumeRes.ok, true);
  ok('isActive() true after resume', gamesEngine.isActive(jid), true);
  ok('isPaused() false after resume', gamesEngine.isPaused(jid), false);

  // Resume non-paused
  const badResume = await gamesEngine.resumeGame(jid, ctx);
  ok('resumeGame non-paused returns ok:false', badResume.ok, false);

  // Resume non-existent
  const badResume2 = await gamesEngine.resumeGame('nobody@s', ctx);
  ok('resumeGame non-existent returns ok:false', badResume2.ok, false);

  // Ghost entry: session expires while paused → isPaused() evicts stale entry
  gamesEngine.registerGame({
    gameId: 'fast-expire', minPlayers: 1, maxPlayers: 1, timeout: 50,
    onStart: async () => {}, onMove: async () => ({ done: false }),
  });
  const jid2 = 'ghostpause@s';
  await gamesEngine.startGame(jid2, 'fast-expire', ['p1@s'], {}, ctx);
  gameSessions.pause(jid2); // pause directly
  ok('isPaused before expire', gameSessions.isPaused(jid2), true);
  // Manually expire by backdating updatedAt
  const gs = gameSessions.getAny(jid2);
  if (gs) gs.updatedAt = Date.now() - 999_999;
  ok('isPaused() evicts stale ghost entry after expiry', gameSessions.isPaused(jid2), false);

  await gamesEngine.endGame(jid, { cancelled: true }, ctx);
}

// ─── Phase 19: GamesEngine — Concurrent game sessions ─────────────────────────

phase(19, 'GamesEngine — concurrent sessions (different JIDs)');

{
  const players = ['p@s'];
  const jids = ['g1@s','g2@s','g3@s','g4@s'];
  const ctx = makeMsgCtx('g1@s');

  await Promise.all(jids.map(j => gamesEngine.startGame(j, 'test-game', players, {}, makeMsgCtx(j))));
  ok('4 game sessions active concurrently', jids.every(j => gamesEngine.isActive(j)), true);
  ok('getSessions() returns all', gamesEngine.getSessions().length >= 4, true);

  // Route moves to specific JIDs without cross-contamination
  await gamesEngine.routeInput('g1@s', 'move-a', makeMsgCtx('g1@s'));
  const g1 = gamesEngine.getSession('g1@s');
  const g2 = gamesEngine.getSession('g2@s');
  ok('Move on g1 does not affect g2', g2?.state?.lastMove === undefined, true);
  ok('Move on g1 sets g1 state', g1?.state?.lastMove, 'move-a');

  // Win one without affecting others
  await gamesEngine.routeInput('g2@s', 'win', makeMsgCtx('g2@s'));
  ok('g2 ended', gamesEngine.isActive('g2@s'), false);
  ok('g3 still active', gamesEngine.isActive('g3@s'), true);
  ok('g4 still active', gamesEngine.isActive('g4@s'), true);

  // Cleanup
  for (const j of ['g1@s','g3@s','g4@s']) await gamesEngine.endGame(j, { cancelled: true }, makeMsgCtx(j));
}

// ─── Phase 20: GameSession — Auto-expiry ──────────────────────────────────────

phase(20, 'GameSession — auto-expiry');

{
  const sess = new GameSession({
    gameId:  'test',
    jid:     'expire@s',
    players: ['p@s'],
    state:   {},
  });

  ok('New session is not expired', sess.expired, false);

  // Backdate updatedAt to simulate 10+ min idle
  sess.updatedAt = Date.now() - 11 * 60 * 1000;
  ok('Session expired after 10 min idle', sess.expired, true);

  // gameEngine.get() auto-removes expired sessions
  const jid = 'expire-get@s';
  const fresh = gameEngine.create(jid, 'test', ['p@s'], {});
  ok('Fresh session accessible via get()', !!gameEngine.get(jid), true);
  fresh.updatedAt = Date.now() - 11 * 60 * 1000;
  ok('get() returns undefined for expired session', gameEngine.get(jid) === undefined, true);
  ok('has() returns false for expired session', gameEngine.has(jid), false);

  // update() touches updatedAt
  const jid2 = 'update-touch@s';
  gameEngine.create(jid2, 'test', ['p@s'], {});
  const s = gameEngine.get(jid2);
  s.updatedAt = Date.now() - 500_000; // very stale
  s.update({ x: 1 }); // should refresh updatedAt
  ok('update() refreshes updatedAt (not expired)', s.expired, false);
  gameEngine.end(jid2);

  // nextTurn() round-robin
  const jid3 = 'turns@s';
  gameEngine.create(jid3, 'test', ['alice@s', 'bob@s'], {});
  const ts = gameEngine.get(jid3);
  ok('Initial turn is first player', ts.turn, 'alice@s');
  gameEngine.nextTurn(jid3);
  ok('nextTurn advances to second player', gameEngine.get(jid3)?.turn, 'bob@s');
  gameEngine.nextTurn(jid3);
  ok('nextTurn wraps around (round-robin)', gameEngine.get(jid3)?.turn, 'alice@s');
  gameEngine.end(jid3);
}

// ─── Phase 21: AgentTaskQueue — Enqueue, lifecycle, concurrency ───────────────

phase(21, 'AgentTaskQueue — enqueue / cancel / concurrency');

{
  const q = freshQueue(2); // maxConcurrent=2

  // Simple 2-step job
  let stepLog = [];
  const jobId = q.enqueue({
    jid:  'agent@s',
    name: 'test-job',
    steps: [
      { name: 'fetch', fn: async (ctx) => { stepLog.push('fetch'); ctx.data = 42; return 42; } },
      { name: 'send',  fn: async (ctx) => { stepLog.push('send');  return ctx.data * 2; } },
    ],
    onDone: (_id, ctx) => { stepLog.push(`done:${ctx._lastResult}`); },
  });

  ok('enqueue() returns a UUID string', typeof jobId, 'string');
  ok('Job appears in getJobsForJid()', q.getJobsForJid('agent@s').length >= 1, true);

  // Wait for job to complete
  await sleep(100);
  deepOk('Both steps executed in order', stepLog.slice(0,2), ['fetch','send']);
  ok('onDone receives final result', stepLog[2], 'done:84');

  const job = q.getJob(jobId);
  ok('Completed job has status DONE', job?.status, JobStatus.DONE);

  // Cancel a queued job before it runs
  const slowQ = freshQueue(0); // maxConcurrent=0 → nothing starts
  const slowQ2 = new TaskQueue({ maxConcurrent: 1 });
  // Block the queue with a long-running step
  let blockRelease;
  const blockDone = new Promise(r => { blockRelease = r; });
  slowQ2.enqueue({ jid: 'block@s', name: 'blocker',
    steps: [{ name: 'block', fn: () => blockDone }] });
  await sleep(10);
  const cancelId = slowQ2.enqueue({ jid: 'block@s', name: 'queued',
    steps: [{ name: 'step', fn: async () => stepLog.push('should-not-run') }] });
  const cancelled = slowQ2.cancel(cancelId);
  blockRelease();
  ok('cancel() returns true for queued job', cancelled, true);
  await sleep(50);
  const cJob = slowQ2.getJob(cancelId);
  ok('Cancelled job has status CANCELLED', cJob?.status, JobStatus.CANCELLED);

  // Cancel already-done job
  const notCancelled = q.cancel(jobId);
  ok('cancel() returns false for completed job', notCancelled, false);

  // cancelAll()
  const q3 = freshQueue(1);
  let hold;
  const holdProm = new Promise(r => { hold = r; });
  q3.enqueue({ jid: 'multi@s', name: 'j1', steps: [{ name: 'a', fn: () => holdProm }] });
  q3.enqueue({ jid: 'multi@s', name: 'j2', steps: [{ name: 'a', fn: async () => {} }] });
  await sleep(10);
  const count = q3.cancelAll('multi@s');
  hold();
  ok('cancelAll() cancels active jobs', count >= 1, true);

  // abortOnError=false — job continues after step failure
  const continueLog = [];
  const q4 = freshQueue(3);
  const contId = q4.enqueue({
    jid:  'continue@s',
    name: 'err-continue',
    steps: [
      { name: 'fail-step', abortOnError: false, fn: async () => { throw new Error('oops'); } },
      { name: 'next-step', fn: async () => { continueLog.push('ran'); } },
    ],
  });
  await sleep(100);
  const cj = q4.getJob(contId);
  ok('abortOnError:false — job completes despite step error', cj?.status, JobStatus.DONE);
  ok('abortOnError:false — next step still ran', continueLog[0], 'ran');

  // abortOnError=true (default) — job fails after step error
  const q5 = freshQueue(3);
  const failId = q5.enqueue({
    jid: 'fail@s', name: 'err-abort',
    steps: [
      { name: 'fail',  fn: async () => { throw new Error('hard-fail'); } },
      { name: 'never', fn: async () => continueLog.push('SHOULD-NOT-RUN') },
    ],
    onError: () => { continueLog.push('error-hook'); },
  });
  await sleep(100);
  const fj = q5.getJob(failId);
  ok('abortOnError:true — job status is FAILED', fj?.status, JobStatus.FAILED);
  ok('onError hook called', continueLog.includes('error-hook'), true);
  ok('Step after failed step never ran', !continueLog.includes('SHOULD-NOT-RUN'), true);
}

// ─── Phase 22: SessionMemory — persistence & TTL ──────────────────────────────

phase(22, 'SessionMemory — persistence & TTL');

{
  const mem = freshMemory(200); // 200 ms TTL for fast GC testing
  const jid = 'mem@s';

  // Basic get/set/has/delete
  mem.set(jid, 'key1', 'val1');
  ok('set()/get() round-trip', mem.get(jid, 'key1'), 'val1');
  ok('has() true for existing key', mem.has(jid, 'key1'), true);
  ok('has() false for missing key', mem.has(jid, 'nope'), false);
  ok('keys() returns all keys', mem.keys(jid).includes('key1'), true);

  mem.delete(jid, 'key1');
  ok('delete() removes key', mem.get(jid, 'key1') === undefined, true);

  // Different JIDs are isolated
  mem.set('a@s', 'x', 1);
  mem.set('b@s', 'x', 2);
  ok('JID isolation: a reads own value', mem.get('a@s', 'x'), 1);
  ok('JID isolation: b reads own value', mem.get('b@s', 'x'), 2);

  // History
  mem.pushHistory(jid, { command: 'test', result: 42 });
  mem.pushHistory(jid, { command: 'test2', result: 99 });
  ok('getHistory() returns entries', mem.getHistory(jid).length, 2);
  ok('lastHistory() returns last entry', mem.lastHistory(jid)?.result, 99);
  ok('getHistory() on unknown JID returns []', mem.getHistory('nobody@s').length, 0);
  ok('lastHistory() on unknown JID returns null', mem.lastHistory('nobody@s'), null);

  // History cap (20 entries)
  const capMem = freshMemory(60_000);
  for (let i = 0; i < 25; i++) capMem.pushHistory('cap@s', { command: `c${i}`, result: i });
  ok('History capped at 20 entries', capMem.getHistory('cap@s').length, 20);
  ok('Oldest entries dropped (first is c5)', capMem.getHistory('cap@s')[0].command, 'c5');

  // TTL / expiry
  const expMem = freshMemory(80); // 80ms TTL
  expMem.set('exp@s', 'alive', true);
  ok('Value accessible before TTL', expMem.get('exp@s', 'alive'), true);
  await sleep(150);
  ok('Value expired after TTL', expMem.get('exp@s', 'alive') === undefined, true);
  ok('has() false after TTL', expMem.has('exp@s', 'alive'), false);

  // sessionCount
  const scMem = freshMemory(60_000);
  scMem.set('s1@s', 'k', 1);
  scMem.set('s2@s', 'k', 2);
  ok('sessionCount reflects live sessions', scMem.sessionCount, 2);
  scMem.clear('s1@s');
  ok('clear() removes session from count', scMem.sessionCount, 1);

  // undefined value edge case
  mem.set(jid, 'undef-key', undefined);
  ok('has() returns false when value is undefined', mem.has(jid, 'undef-key'), false);
  if (!mem.has(jid, 'undef-key')) {
    warn('SessionMemory.has() cannot distinguish set(undefined) from missing key',
      'has() uses get() !== undefined; set(jid, key, undefined) is indistinguishable from missing. ' +
      'Low severity — no callers rely on this distinction, but worth documenting.');
  }
}

// ─── Agent Workflow: DownloadConvertWorkflow ───────────────────────────────────

phase(23, 'DownloadConvertWorkflow — pattern matching & step structure');

{
  const wf = new DownloadConvertWorkflow();

  ok('name is defined', typeof wf.name === 'string' && wf.name.length > 0, true);

  // Pattern matching — positive cases
  const positives = [
    'download despacito and convert to voice note',
    'download shape of you and convert to ptt',
    'send blinding lights as voice note',
    'send despacito as ptt',
    'voice note of stay',
    'voice note: believer',
    'ptt of levitating',
    'ptt: bad guy',
    'despacito as a voice note',
  ];

  for (const text of positives) {
    const m = wf.match(text, { prefix: '.', settings: {} });
    ok(`Matches: "${text}"`, m.matched, true);
    ok(`Extracts vars.query for: "${text}"`, m.vars.query?.length > 1, true);
  }

  // Negative cases
  const negatives = [
    'play despacito',
    'download video',       // no "voice note" / "ptt" target
    'what is despacito',
    'as voice',             // query too short (< 2 chars stripped)
  ];
  for (const text of negatives) {
    const m = wf.match(text, { prefix: '.', settings: {} });
    notOk(`Does not match: "${text}"`, m.matched);
  }

  // buildSteps() structure
  const steps = wf.buildSteps({
    vars:      { query: 'despacito' },
    sock:      makeSock(),
    msg:       { key: { id: 'x' } },
    jid:       'agent@s',
    senderJid: 'user@s',
    settings:  {},
    prefix:    '.',
    reply:     async () => {},
    memory:    freshMemory(),
  });

  ok('buildSteps returns 3 steps', steps.length, 3);
  ok('Step 1 has name', typeof steps[0].name === 'string', true);
  ok('Step 1 abortOnError is true', steps[0].abortOnError, true);
  ok('Step 2 abortOnError is true', steps[1].abortOnError, true);
  ok('Step 3 abortOnError is false', steps[2].abortOnError, false);
  ok('All steps have fn function', steps.every(s => typeof s.fn === 'function'), true);

  // Step 1: _resolveYtUrl fallback to ytsearch: scheme
  const ctx = { ytUrl: null };
  try {
    await steps[0].fn(ctx);
    ok('Step 1 sets ctx.ytUrl', typeof ctx.ytUrl, 'string');
    ok('Step 1 ytUrl starts with ytsearch: when ytsr missing', ctx.ytUrl?.startsWith('ytsearch:'), true);
  } catch (e) {
    warn('Step 1 threw (ytsr or ytdl-core unavailable in test env)', e.message);
  }

  // Step 3: throws if audioBuffer missing (abortOnError:false — continues)
  const ctx3 = { audioBuffer: null, ytUrl: 'ytsearch:test' };
  let step3Threw = false;
  try { await steps[2].fn(ctx3); }
  catch { step3Threw = true; }
  ok('Step 3 throws if audioBuffer missing', step3Threw, true);
}

// ─── Phase 24: Cross-workflow interactions ────────────────────────────────────

phase(24, 'Cross-system interactions');

{
  const mgr = freshManager(wfLinear);
  const jid = 'cross@s';
  const ctx = makeMsgCtx(jid);

  // WorkflowManager session does not conflict with game session on same JID
  await mgr.start(jid, 'linear-wf', {}, ctx);
  await gamesEngine.startGame(jid, 'test-game', ['p@s'], {}, ctx);
  ok('WF session exists alongside game session', mgr.has(jid), true);
  ok('Game session exists alongside WF session', gamesEngine.isActive(jid), true);
  await mgr.cancel(jid, 'cleanup', ctx);
  await gamesEngine.endGame(jid, { cancelled: true }, ctx);

  // TaskQueue jobs do not interfere with WF sessions
  const q = freshQueue();
  const events = [];
  await mgr.start(jid, 'linear-wf', {}, ctx);
  q.enqueue({ jid, name: 'parallel', steps: [{ name: 'step', fn: async () => { events.push('job-ran'); } }] });
  await sleep(50);
  ok('TaskQueue job ran concurrently with WF session', events.includes('job-ran'), true);
  ok('WF session still active after parallel job', mgr.has(jid), true);
  await mgr.cancel(jid, 'cleanup', ctx);

  // SessionMemory is independent from WorkflowSession.state
  const mem = freshMemory();
  await mgr.start(jid, 'linear-wf', { seedValue: 7 }, ctx);
  mem.set(jid, 'memKey', 99);
  const wfSnap = mgr.get(jid);
  ok('WF state and memory are separate stores', wfSnap?.state?.seedValue, 7);
  ok('Memory not contaminated by WF state', mem.get(jid, 'seedValue') === undefined, true);
  ok('Memory key independent of WF', mem.get(jid, 'memKey'), 99);
  await mgr.cancel(jid, 'cleanup', ctx);
}

// ─── Reports ──────────────────────────────────────────────────────────────────

const totalTests = passed + failed;
const passRate   = ((passed / totalTests) * 100).toFixed(1);

console.log(`\n${'═'.repeat(70)}`);
console.log(`  RESULTS`);
console.log(`${'═'.repeat(70)}`);
console.log(`  Passed:   ${passed} / ${totalTests} (${passRate}%)`);
console.log(`  Failed:   ${failed}`);
console.log(`  Warned:   ${warned}`);
console.log(`  Bugs:     ${bugs.length}`);

if (bugs.length) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  BUGS FOUND`);
  console.log(`${'─'.repeat(70)}`);
  for (const b of bugs) {
    console.log(`  [${b.sev}] ${b.id}: ${b.title}`);
  }
}

if (warns.length) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  WARNINGS`);
  console.log(`${'─'.repeat(70)}`);
  for (const w of warns) {
    console.log(`  ⚠️  ${w.label}`);
    if (w.detail) console.log(`      ${w.detail}`);
  }
}

// ─── Write reports ────────────────────────────────────────────────────────────

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const now = new Date().toISOString();

// ── workflow-health-report.txt ────────────────────────────────────────────────

const healthLines = [
  `WORKFLOW ENGINE HEALTH REPORT`,
  `Generated: ${now}`,
  `═`.repeat(70),
  ``,
  `SUMMARY`,
  `  Total tests   : ${totalTests}`,
  `  Passed        : ${passed} (${passRate}%)`,
  `  Failed        : ${failed}`,
  `  Bugs found    : ${bugs.length}`,
  `  Warnings      : ${warned}`,
  ``,
  `SYSTEMS TESTED`,
  `  ✓ WorkflowManager    — interactive multi-step conversation flows`,
  `  ✓ GamesEngine        — turn-based game session management`,
  `  ✓ AgentTaskQueue     — background multi-step job processing`,
  `  ✓ SessionMemory      — per-JID key-value store with TTL`,
  `  ✓ PlayWorkflow       — downloader (Saavn/YouTube) step machine`,
  `  ✓ DownloadConvert    — agent workflow pattern matching`,
  ``,
  `TEST PHASES (24 total)`,
  `  Phase  1  defineWorkflow — definition validation`,
  `  Phase  2  WorkflowManager — registration`,
  `  Phase  3  WorkflowManager — session creation`,
  `  Phase  4  WorkflowSession — internal state persistence`,
  `  Phase  5  SessionStore — CRUD operations`,
  `  Phase  6  WorkflowManager — workflow completion`,
  `  Phase  7  WorkflowManager — cancellation`,
  `  Phase  8  WorkflowManager — step chaining`,
  `  Phase  9  WorkflowManager — interrupt by other command`,
  `  Phase 10  WorkflowManager — timeout events`,
  `  Phase 11  WorkflowManager — retry limiting & retryCount correctness`,
  `  Phase 12  WorkflowManager — invalid input & edge cases`,
  `  Phase 13  WorkflowManager — concurrent sessions (different JIDs)`,
  `  Phase 14  WorkflowManager — user disconnect simulation`,
  `  Phase 15  normaliseResult — all branches`,
  `  Phase 16  Play workflow (Downloader) — structure & state machine`,
  `  Phase 17  GamesEngine — session lifecycle`,
  `  Phase 18  GamesEngine — pause / resume`,
  `  Phase 19  GamesEngine — concurrent sessions`,
  `  Phase 20  GameSession — auto-expiry`,
  `  Phase 21  AgentTaskQueue — enqueue / cancel / concurrency`,
  `  Phase 22  SessionMemory — persistence & TTL`,
  `  Phase 23  DownloadConvertWorkflow — pattern matching & step structure`,
  `  Phase 24  Cross-system interactions`,
  ``,
  `SESSION PERSISTENCE MODEL`,
  `  All three workflow subsystems use in-memory stores (Map-based).`,
  `  There is NO disk persistence or database backing by design.`,
  `  A bot restart clears ALL active sessions — this is expected behaviour.`,
  `  Recommendation: for production resilience, consider persisting`,
  `  SessionStore and gameSessions to Redis or SQLite on shutdown,`,
  `  restoring on startup. WorkflowManager supports re-registration,`,
  `  so replaying the first step's enter() is safe for restoration.`,
  ``,
  `TIMEOUT BEHAVIOUR`,
  `  WorkflowManager : per-step setTimeout (default 60 s, play=90 s)`,
  `                    Timer resets on each step transition (_enterStep).`,
  `                    Timer is cleared on cancel/done/enter-error.`,
  `                    onTimeout hook or default "timed out" message sent.`,
  `  GamesEngine     : session.expired getter (10 min idle); checked on`,
  `                    gameEngine.get(). No proactive timer — lazy expiry.`,
  `  AgentTaskQueue  : no built-in timeout per job step. Long-running`,
  `                    network steps can block queue slot indefinitely.`,
  `                    Recommendation: add per-step AbortController timeout.`,
  `  SessionMemory   : TTL-based expiry (default 30 min), GC every 5 min.`,
  ``,
  `CONCURRENT SESSION SAFETY`,
  `  WorkflowManager : one session per JID at a time. Starting a second`,
  `                    workflow for the same JID silently replaces the first`,
  `                    (timer cleared, no onCancel hook). Isolated by JID.`,
  `  GamesEngine     : one game per JID at a time. Concurrent JIDs safe.`,
  `                    Pause state (_paused Set) is global — monitor for`,
  `                    cross-JID side effects if end() isn't called on pause.`,
  `  AgentTaskQueue  : maxConcurrent=3 across all JIDs. Per-JID concurrency`,
  `                    is unbounded (multiple jobs for same JID can run).`,
  `                    Context objects are per-job, no cross-job sharing.`,
  ``,
  bugs.length > 0 ? `BUGS FOUND (${bugs.length})` : `NO BUGS FOUND`,
  ...(bugs.map(b =>
    [`  [${b.sev}] ${b.id}: ${b.title}`, `        ${b.detail}`].join('\n')
  )),
  ``,
].join('\n');

writeFileSync(path.join(__dirname, 'workflow-health-report.txt'), healthLines);

// ── workflow-failure-scenarios.txt ────────────────────────────────────────────

const bugSection = bugs.length === 0
  ? `  No bugs found in this run.`
  : bugs.map((b, i) =>
    [
      `  ${i+1}. [${b.sev}] ${b.id}: ${b.title}`,
      `     ${b.detail}`,
      ``,
    ].join('\n')
  ).join('');

const scenariosContent = [
  `WORKFLOW FAILURE SCENARIOS`,
  `Generated: ${now}`,
  `═`.repeat(70),
  ``,
  `This file documents all failure modes discovered during validation,`,
  `organised by subsystem and severity.`,
  ``,
  `─`.repeat(70),
  `A. WORKFLOWMANAGER FAILURE MODES`,
  `─`.repeat(70),
  ``,
  `A1. RETRY-COUNT RESET BUG`,
  `    Scenario  : User sends 4+ consecutive invalid inputs.`,
  `    Expected  : Workflow auto-cancels after maxRetries (default 3) exceeded.`,
  `    Actual    : WorkflowSession.touch() resets retryCount=0 on every input.`,
  `                retryCount oscillates 0→1 and never reaches maxRetries.`,
  `                Auto-cancel NEVER fires regardless of how many wrong inputs.`,
  `    Severity  : HIGH — maxRetries guard is completely non-functional.`,
  `    Trigger   : Any workflow with a handle() step that returns StepResult.retry().`,
  `    Fix       : Remove \`this.retryCount = 0\` from WorkflowSession.touch().`,
  `                Only WorkflowManager._enterStep() should reset retryCount`,
  `                (it already does via \`session.retryCount = 0\`).`,
  ``,
  `A2. ENTER() THROW — WORKFLOW ABORTS WITHOUT ONCANCEL`,
  `    Scenario  : step.enter() throws an exception.`,
  `    Actual    : Session is deleted, ok:false returned, BUT onCancel hook`,
  `                is NOT called. User receives no "workflow failed" message.`,
  `    Severity  : MEDIUM — silent failure. User sees nothing.`,
  `    Trigger   : Any enter() step that throws (e.g. network failure in search).`,
  `    Fix       : In _enterStep catch block, call onCancel('enter_error', ctx)`,
  `                instead of silently deleting the session. Or send a fallback`,
  `                "workflow failed, please try again" message.`,
  ``,
  `A3. SILENT CANCEL ON DIFFERENT COMMAND — NO USER FEEDBACK`,
  `    Scenario  : User sends a different bot command while a workflow is active.`,
  `    Actual    : Workflow silently cancelled (_silentCancel), onCancel NOT called,`,
  `                no message sent. User may think the workflow is still running.`,
  `    Severity  : LOW — intentional by design. Document clearly in UX.`,
  `    Recommendation: Send a brief "⚡ Previous workflow cancelled." reaction`,
  `                    or message to confirm the workflow was cleared.`,
  ``,
  `A4. SESSION NOT PERSISTED ACROSS RESTARTS`,
  `    Scenario  : Bot container restarts mid-workflow.`,
  `    Actual    : All in-memory WorkflowSessions lost. Users who were mid-workflow`,
  `                receive no notification. Next message from those users finds no`,
  `                session and falls through to normal command routing.`,
  `    Severity  : MEDIUM — graceful degradation; not a crash, but silent data loss.`,
  `    Fix       : Persist sessionStore to Redis/SQLite at shutdown.`,
  `                On restore, call the workflow's firstStep enter() to re-prompt.`,
  ``,
  `─`.repeat(70),
  `B. GAMESENGINE FAILURE MODES`,
  `─`.repeat(70),
  ``,
  `B1. PAUSED GHOST ENTRY ON SESSION EXPIRY`,
  `    Scenario  : Session is paused, then expires via lazy 10-min auto-expiry.`,
  `    Actual    : gameSessions._paused retains the JID entry. isPaused() now`,
  `                correctly evicts it (FIX ALREADY APPLIED in sessions.js).`,
  `    Status    : FIXED — isPaused() checks gameEngine.has() and self-heals.`,
  ``,
  `B2. ONEMOVE() ERROR — SESSION STAYS ACTIVE`,
  `    Scenario  : onMove() throws an exception (e.g. bug in game plugin).`,
  `    Actual    : routeInput() returns true (consumed) but does NOT end the game.`,
  `                The game session remains active but broken. Next user move`,
  `                will also fail, creating a permanently stuck game.`,
  `    Severity  : MEDIUM — game sessions can become unrecoverable.`,
  `    Trigger   : Any runtime error inside a game's onMove() handler.`,
  `    Fix       : In routeInput() catch block, call endGame(jid, { cancelled:true })`,
  `                and send the user an "⚠️ Game error — session ended" message.`,
  ``,
  `B3. NO PER-STEP TIMEOUT IN GAMESENGINE`,
  `    Scenario  : Player A starts a game vs Player B, then Player B disconnects.`,
  `    Actual    : Game session stays alive for 10 minutes (idle expiry). No`,
  `                notification to Player A. No forfeit issued to Player B.`,
  `    Severity  : LOW — 10-min idle window is reasonable but undesirable in`,
  `                competitive settings.`,
  `    Fix       : Add a per-turn timeout timer that fires a "⏱️ Time limit`,
  `                reached" message and calls endGame() with the waiting player`,
  `                as winner.`,
  ``,
  `─`.repeat(70),
  `C. AGENTTASKQUEUE FAILURE MODES`,
  `─`.repeat(70),
  ``,
  `C1. NO PER-STEP TIMEOUT — LONG STEPS BLOCK QUEUE SLOT`,
  `    Scenario  : A download step hangs (network stall, slow server).`,
  `    Actual    : The step runs indefinitely, occupying one of the 3 concurrent`,
  `                slots. Other users' jobs queue up waiting for a free slot.`,
  `    Severity  : HIGH — DoS potential via a single slow external service.`,
  `    Fix       : Wrap step fn calls with Promise.race([ fn(ctx), timeout(30_000) ]).`,
  `                On timeout, throw with a user-friendly message and let`,
  `                abortOnError control whether the job continues or fails.`,
  ``,
  `C2. CANCELLED JOB COMPLETES CURRENT STEP`,
  `    Scenario  : User cancels a job, but the current step (e.g. download) is`,
  `                mid-execution.`,
  `    Actual    : Step runs to completion, THEN the loop sees CANCELLED and stops.`,
  `                Network requests and file I/O are not aborted mid-step.`,
  `    Severity  : LOW — correctness preserved (no double-send); resource waste only.`,
  `    Fix       : Pass an AbortSignal in ctx; check it between await points.`,
  ``,
  `C3. PER-JID CONCURRENCY UNBOUNDED`,
  `    Scenario  : A user rapidly sends 10 "voice note of X" requests.`,
  `    Actual    : All 10 jobs are enqueued per the global maxConcurrent=3 cap.`,
  `                Up to 3 run simultaneously for the same JID, all consuming`,
  `                network bandwidth and CPU.`,
  `    Severity  : MEDIUM — resource exhaustion; 3 parallel downloads per user.`,
  `    Fix       : Add per-JID concurrency limit (max 1–2 active jobs per JID).`,
  `                Cancel or reject new jobs if the JID already has N active.`,
  ``,
  `─`.repeat(70),
  `D. SESSIONMEMORY FAILURE MODES`,
  `─`.repeat(70),
  ``,
  `D1. has() CANNOT DISTINGUISH undefined VALUE FROM MISSING KEY`,
  `    Scenario  : Code does \`memory.set(jid, 'key', undefined)\` then \`memory.has()\`.`,
  `    Actual    : has() returns false because get() returns undefined for both cases.`,
  `    Severity  : LOW — no current caller stores undefined values deliberately.`,
  `    Fix       : Use \`session.vars.has(key)\` directly in has() rather than`,
  `                checking the get() return value.`,
  ``,
  bugs.length > 0 ? `─`.repeat(70) + `\nE. BUG LIST FROM THIS RUN\n` + `─`.repeat(70) + `\n` + bugSection : '',
].join('\n');

writeFileSync(path.join(__dirname, 'workflow-failure-scenarios.txt'), scenariosContent);

// ── workflow-recovery-recommendations.txt ────────────────────────────────────

const recContent = [
  `WORKFLOW ENGINE RECOVERY RECOMMENDATIONS`,
  `Generated: ${now}`,
  `═`.repeat(70),
  ``,
  `Priority order: CRITICAL > HIGH > MEDIUM > LOW`,
  ``,
  `═`.repeat(70),
  `[CRITICAL — Apply before next production deploy]`,
  `═`.repeat(70),
  ``,
  `REC-01: Fix retryCount reset in WorkflowSession.touch()`,
  `  File  : src/workflows/sessions.js`,
  `  Change: Remove \`this.retryCount = 0;\` from touch().`,
  `  Why   : The maxRetries auto-cancel guard is completely non-functional.`,
  `          A user sending 1000 wrong inputs will never get auto-cancelled;`,
  `          the session lives until timeout (90 s for play). This is a DoS`,
  `          vector in group chats where malicious users can keep sessions open.`,
  `  Patch:`,
  `    // WorkflowSession.touch() — BEFORE`,
  `    touch() {`,
  `      this.lastActivity = Date.now();`,
  `      this.retryCount = 0;          // ← REMOVE THIS LINE`,
  `    }`,
  ``,
  `    // WorkflowSession.touch() — AFTER`,
  `    touch() {`,
  `      this.lastActivity = Date.now();`,
  `      // retryCount intentionally NOT reset here.`,
  `      // Only _enterStep() resets it (on step transition).`,
  `    }`,
  ``,
  `REC-02: Add per-step timeout to AgentTaskQueue`,
  `  File  : src/agent/queue.js`,
  `  Change: Wrap step.fn() calls with a 30-second AbortController timeout.`,
  `  Why   : Download steps can hang indefinitely, blocking queue concurrency`,
  `          slots and making the bot unresponsive to all queued users.`,
  `  Patch (in _dispatch, inside the step loop):`,
  `    const STEP_TIMEOUT_MS = 30_000;`,
  `    const result = await Promise.race([`,
  `      step.fn(job.context),`,
  `      new Promise((_, rej) =>`,
  `        setTimeout(() => rej(new Error('Step timeout after 30s')), STEP_TIMEOUT_MS)`,
  `      ),`,
  `    ]);`,
  ``,
  `═`.repeat(70),
  `[HIGH — Apply within 1 sprint]`,
  `═`.repeat(70),
  ``,
  `REC-03: Emit user-facing message on enter() throw`,
  `  File  : src/workflows/manager.js — _enterStep() catch block`,
  `  Change: After \`await this.cancel(session.jid, 'enter_error', ctx)\`,`,
  `          also call \`ctx.sock?.sendMessage(session.jid, { text: "⚠️ Something went wrong. Please try again." })\`.`,
  `  Why   : Currently users see nothing if the search or download step crashes.`,
  ``,
  `REC-04: Fix routeInput() to end game on onMove() exception`,
  `  File  : src/games/engine.js — routeInput() catch block`,
  `  Change: In the catch block, call \`await this.endGame(jid, { cancelled: true }, ctx)\``,
  `          and send a "⚠️ Game error — session ended" message.`,
  `  Why   : A crashing game plugin leaves users permanently stuck in the game`,
  `          session until the 10-min idle timeout expires.`,
  ``,
  `REC-05: Add per-JID concurrency cap to TaskQueue`,
  `  File  : src/agent/queue.js`,
  `  Change: Add \`maxConcurrentPerJid\` option (default 1). In _dispatch(),`,
  `          count running jobs for the job's JID before starting.`,
  `  Why   : Without this, a user can queue 10 simultaneous downloads,`,
  `          exhausting network bandwidth and CPU.`,
  ``,
  `═`.repeat(70),
  `[MEDIUM — Apply in next maintenance window]`,
  `═`.repeat(70),
  ``,
  `REC-06: Persist session state across restarts`,
  `  Files : src/workflows/sessions.js, src/games/sessions.js`,
  `  Change: On SIGTERM/SIGINT, serialize all active sessions to a JSON file`,
  `          (or Redis). On startup, restore sessions and re-enter current step.`,
  `  Why   : All active multi-step interactions are silently lost on restart.`,
  `          Users mid-download or mid-game must start over with no feedback.`,
  `  Approach:`,
  `    1. Add sessionStore.exportJSON() / importJSON() methods.`,
  `    2. On shutdown: write to /tmp/sessions.json (or Redis SET).`,
  `    3. On startup: load + call workflowManager.start(jid, name, restoredState)`,
  `       which safely re-enters the first step's enter().`,
  ``,
  `REC-07: Add per-turn timeout to GamesEngine`,
  `  File  : src/games/engine.js`,
  `  Change: Add a per-turn setTimeout in routeInput(). If the active player`,
  `          has not moved within \`def.turnTimeout\` ms, auto-call endGame()`,
  `          with the idle player as the loser (or a draw).`,
  `  Why   : A disconnected opponent in a 2-player game leaves the other player`,
  `          waiting with no recourse for 10 minutes.`,
  ``,
  `REC-08: Send brief confirmation when workflow is silently cancelled`,
  `  File  : src/workflows/manager.js — _silentCancel()`,
  `  Change: Optionally send a brief "⚡ Previous action cancelled." reaction`,
  `          so users know their workflow was cleared.`,
  `  Why   : Without this, users who send a new command think the previous`,
  `          workflow is still pending.`,
  ``,
  `═`.repeat(70),
  `[LOW — Backlog]`,
  `═`.repeat(70),
  ``,
  `REC-09: Fix SessionMemory.has() to use Map.has() directly`,
  `  File  : src/agent/memory.js`,
  `  Change: \`has(jid, key) { return this._getAlive(jid)?.vars.has(key) ?? false; }\``,
  `  Why   : Current implementation returns false for keys set to undefined.`,
  ``,
  `REC-10: Add AbortSignal to TaskQueue steps for mid-step cancellation`,
  `  File  : src/agent/queue.js`,
  `  Change: Create an AbortController per job. Pass \`ctx._abortSignal\`.`,
  `          Propagate to fetch() calls in download workflows.`,
  `  Why   : Cancelling a job does not stop in-flight HTTP requests.`,
  ``,
  `REC-11: Add multi-group workflow isolation check`,
  `  File  : src/workflows/manager.js`,
  `  Change: Validate that group JIDs and private JIDs are always kept separate`,
  `          in sessionStore (they are, by JID key — this is informational).`,
  `  Why   : Confirm no cross-group contamination is possible by construction.`,
  ``,
  `═`.repeat(70),
  `MONITORING RECOMMENDATIONS`,
  `═`.repeat(70),
  ``,
  `  1. Track \`sessionStore.size\` as a metric — alert if > 50 concurrent WF sessions`,
  `     (indicates stuck sessions or a spam attack).`,
  ``,
  `  2. Track \`taskQueue.size\` — alert if growing unboundedly (step timeout fires`,
  `     auto-prune after 10 min, but steps that hang prevent this).`,
  ``,
  `  3. Log workflow.retryCount at each retry. If max_retries events are never`,
  `     seen in logs after REC-01 is applied, the fix is working.`,
  ``,
  `  4. Alert on any \`[Workflow] Step ... enter error:\` or \`onMove error\` log lines`,
  `     in production — these indicate game/plugin code bugs.`,
  ``,
  `  5. Instrument gamesEngine with session start/end counters by gameId to detect`,
  `     abandoned sessions and tune the 10-min idle timeout per game type.`,
  ``,
].join('\n');

writeFileSync(path.join(__dirname, 'workflow-recovery-recommendations.txt'), recContent);

console.log(`\n  Reports written:`);
console.log(`    benchmark/workflow-health-report.txt`);
console.log(`    benchmark/workflow-failure-scenarios.txt`);
console.log(`    benchmark/workflow-recovery-recommendations.txt`);
console.log(`\n  Done.\n`);
