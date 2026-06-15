/**
 * Yuzuki Framework — Comprehensive Startup & Runtime Stress Test
 *
 * Validates cold-start performance, plugin loading, workflow/game/agent
 * initialization, and query performance under simulated heavy load.
 *
 * Supersedes benchmark/startup.js — reflects post-optimization state (Phase 11).
 *
 * Run: node benchmark/stress.js
 *
 * Phases:
 *   0  Cold-import timing           — module import latency per layer
 *   1  Real plugin loading          — actual loadPlugins() on disk files
 *   2  Registry stress              — 1 000 / 5 000 / 10 000 commands
 *   3  Plugin Manager pipeline      — validate + register at scale
 *   4  Workflow Engine stress        — defineWorkflow() at 100/500/1 000
 *   5  Games Engine stress           — registerGame() at 100/500/1 000
 *   6  Agent TaskQueue              — enqueue / concurrent drain / cancel
 *   7  Agent SessionMemory          — multi-JID set/get/GC at scale
 *   8  Combined full-load stress    — 1 000 plugins + 500 wfs + 500 games
 *   9  Cache validation             — verify optimization caches work correctly
 *  10  Bottleneck + Optimization report
 */

import { performance }    from 'perf_hooks';
import { fileURLToPath }  from 'url';
import path               from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// ─── ANSI colours ─────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
};

const coloured = (str, ...codes) => `${codes.join('')}${str}${C.reset}`;
const ok   = (s) => coloured(s, C.green);
const warn = (s) => coloured(s, C.yellow);
const err  = (s) => coloured(s, C.red);
const dim  = (s) => coloured(s, C.dim);
const bold = (s) => coloured(s, C.bold);
const cyan = (s) => coloured(s, C.cyan);

// ─── Layout helpers ───────────────────────────────────────────────────────────

const W = 76;

function hdr(title) {
  const inner = ` ${title} `;
  const pad   = Math.max(0, W - inner.length - 2);
  const l     = Math.floor(pad / 2);
  const r     = Math.ceil(pad / 2);
  console.log();
  console.log(coloured('╔' + '═'.repeat(W - 2) + '╗', C.cyan, C.bold));
  console.log(coloured('║', C.cyan, C.bold) +
    ' '.repeat(l) + bold(inner) + ' '.repeat(r) +
    coloured('║', C.cyan, C.bold));
  console.log(coloured('╚' + '═'.repeat(W - 2) + '╝', C.cyan, C.bold));
}

function sub(label) {
  console.log(`\n  ${bold('┌─')} ${cyan(label)}`);
}

function row(label, value, unit = '', status = 'ok') {
  const l = String(label).padEnd(38, ' ');
  const v = String(value).padStart(10, ' ');
  const u = unit.padEnd(10, ' ');
  const dot = status === 'warn'  ? warn('⚠ ')
            : status === 'error' ? err('✗ ')
            :                     ok('✓ ');
  console.log(`  │  ${dot}${l} ${bold(v)} ${dim(u)}`);
}

function infoRow(label, value, unit = '') {
  const l = String(label).padEnd(38, ' ');
  const v = String(value).padStart(10, ' ');
  console.log(`  │    ${l} ${v} ${dim(unit)}`);
}

function divider() {
  console.log(`  └${'─'.repeat(W - 5)}`);
}

// ─── Measurement helpers ──────────────────────────────────────────────────────

function mem() {
  const m = process.memoryUsage();
  return {
    heap:     +(m.heapUsed  / 1024 / 1024).toFixed(2),
    rss:      +(m.rss       / 1024 / 1024).toFixed(2),
    external: +(m.external  / 1024 / 1024).toFixed(2),
  };
}

function memDelta(before, after) {
  return {
    heap: +((after.heap - before.heap)).toFixed(2),
    rss:  +((after.rss  - before.rss )).toFixed(2),
  };
}

function fmt(n, decimals = 2) {
  if (typeof n !== 'number') return String(n);
  return n.toFixed(decimals);
}

/**
 * Synchronous micro-benchmark. Returns { totalMs, perItemMs, opsPerSec }.
 */
function bench(fn, iters = 1000) {
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn(i);
  const total = performance.now() - t0;
  return {
    totalMs:   +total.toFixed(2),
    perItemMs: +(total / iters).toFixed(4),
    opsPerSec: Math.round(iters / (total / 1000)),
  };
}

/**
 * Timed ESM import — returns { mod, importMs, error? }
 */
async function timedImport(specifier) {
  const t0 = performance.now();
  try {
    const mod = await import(specifier);
    return { mod, importMs: +(performance.now() - t0).toFixed(2) };
  } catch (e) {
    return { mod: null, importMs: +(performance.now() - t0).toFixed(2), error: e.message };
  }
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const T = {
  importMs:         80,    // single-layer import
  registerPerCmd:   0.05,  // ms per registerCommand() call
  lookupMs:         0.005, // ms per getCommand() call
  searchMs:         5,     // ms for searchCommands() at 1 000 cmds
  listCachedMs:     0.005, // ms for a cached listWorkflows()/listGames()
  memPerPlugin:     0.05,  // MB per registered plugin
  stressHeapMB:     80,    // total heap growth in combined stress
  enqueuePerJob:    0.05,  // ms per enqueue() call
};

// ─── Bottleneck accumulator ───────────────────────────────────────────────────

const BOTTLENECKS = [];

function flagIf(cond, category, detail, threshold, measured, unit) {
  if (cond) BOTTLENECKS.push({ category, detail, threshold: `${threshold}${unit}`, measured: `${measured}${unit}` });
  return cond;
}

// ─── Synthetic data factories ─────────────────────────────────────────────────

const CATS = ['ai', 'tools', 'games', 'download', 'fun', 'group', 'owner', 'media'];

function makePlugin(i) {
  return {
    name:        `_bench_cmd_${i}`,
    execute:     async () => {},
    category:    CATS[i % CATS.length],
    description: `Benchmark command ${i} — stress-testing the registry and plugin pipeline`,
    usage:       `._bench_cmd_${i} [arg]`,
    aliases:     [`_bc${i}`, `_benchcmd${i}`],
    permissions: i % 3 === 0 ? ['owner'] : [],
    limit:       i % 4 === 0 ? 5 : 0,
  };
}

function makeWorkflowDef(i) {
  // Uses defineWorkflow() shape — stepMap built correctly
  const stepA = { name: 'ask',     enter:  async () => null,      handle: async () => ({ _type: 'next', next: 'process' }) };
  const stepB = { name: 'process', handle: async () => ({ _type: 'next', next: 'deliver' }) };
  const stepC = { name: 'deliver', enter:  async () => ({ _type: 'done' }),   handle: async () => ({ _type: 'done' }) };
  return Object.freeze({
    name:      `_bench_wf_${i}`,
    timeout:   60_000,
    steps:     [stepA, stepB, stepC],
    stepMap:   new Map([['ask', stepA], ['process', stepB], ['deliver', stepC]]),
    firstStep: 'ask',
    onCancel:  null,
    onTimeout: null,
    onComplete: null,
  });
}

function makeGame(i) {
  return {
    gameId:      `_bench_game_${i}`,
    name:        `Benchmark Game ${i}`,
    description: `Stress-test game ${i}`,
    minPlayers:  1,
    maxPlayers:  2,
    timeout:     120_000,
    onStart:     async () => {},
    onMove:      async () => ({ done: false }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 0 — Cold-import timing
// ═══════════════════════════════════════════════════════════════════════════════

async function phase0_ColdImport() {
  hdr('PHASE 0 — Cold-Import Timing');

  const layers = [
    { label: 'lib/registry',          path: `${ROOT}/src/lib/registry.js`         },
    { label: 'plugin-manager',        path: `${ROOT}/src/plugin-manager.js`       },
    { label: 'plugin-loader',         path: `${ROOT}/src/plugin-loader.js`        },
    { label: 'workflows/states',      path: `${ROOT}/src/workflows/states.js`     },
    { label: 'workflows/sessions',    path: `${ROOT}/src/workflows/sessions.js`   },
    { label: 'workflows/manager',     path: `${ROOT}/src/workflows/manager.js`    },
    { label: 'lib/game-engine',       path: `${ROOT}/src/lib/game-engine.js`      },
    { label: 'games/sessions',        path: `${ROOT}/src/games/sessions.js`       },
    { label: 'games/engine',          path: `${ROOT}/src/games/engine.js`         },
    { label: 'games/leaderboard',     path: `${ROOT}/src/games/leaderboard.js`    },
    { label: 'agent/queue',           path: `${ROOT}/src/agent/queue.js`          },
    { label: 'agent/memory',          path: `${ROOT}/src/agent/memory.js`         },
    { label: 'agent/router',          path: `${ROOT}/src/agent/router.js`         },
    { label: 'lib/game-store',        path: `${ROOT}/src/lib/game-store.js`       },
    { label: 'lib/menu-builder',      path: `${ROOT}/src/lib/menu-builder.js`     },
    { label: 'lib/registry-bootstrap',path: `${ROOT}/src/registry-bootstrap.js`  },
  ];

  sub('Importing all framework layers (first-time)');

  let totalMs = 0;
  let slowCount = 0;
  const results = {};

  for (const { label, path: p } of layers) {
    const { mod, importMs, error } = await timedImport(p);
    const slow  = importMs > T.importMs;
    const status = error ? 'error' : slow ? 'warn' : 'ok';
    const display = error ? `FAILED: ${error.slice(0, 55)}` : `${importMs} ms`;
    row(label, display, '', status);
    if (slow && !error) {
      flagIf(true, 'Import', label, T.importMs, importMs, 'ms');
      slowCount++;
    }
    results[label] = { mod, importMs, ok: !error };
    totalMs += importMs;
  }

  divider();
  row('Total cold-import time', fmt(totalMs) + ' ms', '', totalMs > 1000 ? 'warn' : 'ok');
  row('Slow layers (>' + T.importMs + 'ms)', slowCount, 'layers', slowCount > 0 ? 'warn' : 'ok');
  divider();

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 1 — Real plugin loading
// ═══════════════════════════════════════════════════════════════════════════════

async function phase1_RealPlugins() {
  hdr('PHASE 1 — Real Plugin Loading (Disk Files)');
  sub('Running loadPlugins() against actual src/plugins/ + src/games/plugins/');

  // Suppress GamesEngine registration logs during load
  const _log = console.log;
  const _err = console.error;
  const _warn = console.warn;
  const silenceAll = () => {
    console.log  = (...a) => { if (!String(a[0]).startsWith('[GamesEngine]') && !String(a[0]).startsWith('[PluginLoader]')) _log(...a); };
    console.error = () => {};
    console.warn  = () => {};
  };
  const restoreAll = () => { console.log = _log; console.error = _err; console.warn = _warn; };

  const { loadPlugins }     = await import(`${ROOT}/src/plugin-loader.js`);
  const { getCommandCount, getAllCommands, getCategoryIndex, getCategories } =
    await import(`${ROOT}/src/lib/registry.js`);
  const { pluginManager }   = await import(`${ROOT}/src/plugin-manager.js`);
  const { gamesEngine }     = await import(`${ROOT}/src/games/engine.js`);

  const m0 = mem();
  const t0 = performance.now();

  silenceAll();
  const { loaded, failed } = await loadPlugins();
  restoreAll();

  const loadMs = +(performance.now() - t0).toFixed(2);
  const m1     = mem();
  const d      = memDelta(m0, m1);

  const cmdCount  = getCommandCount();
  const allCmds   = getAllCommands();
  const cats      = getCategories();
  const catIdx    = getCategoryIndex();
  const pmCount   = pluginManager.size;
  const gameIds   = gamesEngine.listGames();

  row('Total load time',            loadMs,   'ms',      loadMs > 5000 ? 'warn' : 'ok');
  row('Plugins loaded (success)',    loaded,   'plugins', failed > 0 ? 'warn' : 'ok');
  row('Plugins failed',             failed,   'plugins', failed > 0 ? 'warn' : 'ok');
  row('Commands in registry',       cmdCount, 'cmds');
  row('Plugin manager entries',     pmCount,  'entries');
  row('Categories discovered',      cats.length, 'cats');
  row('Games registered',           gameIds.length, 'games');
  row('Heap growth',                d.heap,   'MB',      d.heap > 30 ? 'warn' : 'ok');
  row('RSS growth',                 d.rss,    'MB');
  divider();

  // Per-plugin load cost
  if (loaded > 0) {
    const perPlugin = +(loadMs / loaded).toFixed(2);
    const perPluginHeap = +(d.heap / Math.max(loaded, 1)).toFixed(3);
    infoRow('  Avg time per plugin',   perPlugin,     'ms/plugin');
    infoRow('  Avg heap per plugin',   perPluginHeap, 'MB/plugin');
    infoRow('  Load throughput',       Math.round(loaded / (loadMs / 1000)), 'plugins/s');
    divider();
  }

  // Category breakdown
  sub('Category breakdown after real plugin load');
  for (const cat of cats) {
    const cmdsInCat = catIdx[cat] ?? [];
    infoRow(`  ${cat}`, cmdsInCat.length, 'commands');
  }
  divider();

  // Plugin load timing verdict
  if (failed > 0)
    flagIf(true, 'Plugin Loader', `${failed} plugin(s) failed to load`, 0, failed, ' failures');

  return { loaded, failed, cmdCount, loadMs };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 2 — Registry stress (large scale)
// ═══════════════════════════════════════════════════════════════════════════════

async function phase2_RegistryStress() {
  hdr('PHASE 2 — Registry Stress (1 000 / 5 000 / 10 000 Commands)');

  const {
    registerCommand, unregisterCommand, getCommand,
    getAllCommands, searchCommands, getCategoryIndex,
    getCommandsByCategory, getCommandCount,
  } = await import(`${ROOT}/src/lib/registry.js`);

  for (const N of [1000, 5000, 10000]) {
    sub(`Bulk registration — ${N.toLocaleString()} plugins (${(N * 3).toLocaleString()} map entries incl. aliases)`);
    const offset  = N * 100; // avoid collision with real plugins
    const plugins = Array.from({ length: N }, (_, i) => makePlugin(i + offset));

    const m0  = mem();
    const reg = bench((i) => registerCommand(plugins[i % N]), N);
    const m1  = mem();
    const d   = memDelta(m0, m1);

    const isSlowReg = flagIf(
      reg.perItemMs > T.registerPerCmd,
      'Registry register', `registerCommand at N=${N}`, T.registerPerCmd, reg.perItemMs, 'ms'
    );
    const isHighMem = flagIf(
      d.heap > T.memPerPlugin * N,
      'Registry memory', `${N} plugins heap`, +(T.memPerPlugin * N).toFixed(1), d.heap, 'MB'
    );

    row(`registerCommand() — ${N.toLocaleString()} cmds (total)`, fmt(reg.totalMs) + ' ms', '', isSlowReg ? 'warn' : 'ok');
    row('  per-command time',  reg.perItemMs, 'ms/cmd',  isSlowReg ? 'warn' : 'ok');
    row('  throughput',        reg.opsPerSec, 'regs/s');
    row('  registry size',     getCommandCount(), 'cmds');
    row('  heap delta',        d.heap, 'MB', isHighMem ? 'warn' : 'ok');

    // Lookup: O(1) Map.get
    const lkp   = bench((i) => getCommand(`_bench_cmd_${i + offset}`), N);
    const aliasL = bench((i) => getCommand(`_bc${i + offset}`), N);
    row('  getCommand() per call',       lkp.perItemMs,   'ms',   lkp.perItemMs > T.lookupMs ? 'warn' : 'ok');
    row('  alias lookup per call',       aliasL.perItemMs,'ms');
    row('  lookup throughput',           lkp.opsPerSec,   'ops/s');

    // getAllCommands: O(n) spread
    const all = bench(() => getAllCommands(), 50);
    row('  getAllCommands() per call',    all.perItemMs, 'ms/call', all.perItemMs > 5 ? 'warn' : 'ok');
    row('  getAllCommands() throughput',  all.opsPerSec, 'ops/s');

    // getCategoryIndex: should be cached after first call
    const catIdx1 = bench(() => getCategoryIndex(), 200);
    row('  getCategoryIndex() (cached)', catIdx1.perItemMs, 'ms/call');

    // Invalidate cache then re-measure rebuild cost
    registerCommand(makePlugin(offset + N + 999999)); // force cache invalidation
    const t_rebuild = performance.now();
    getCategoryIndex();
    const rebuildMs = +(performance.now() - t_rebuild).toFixed(4);
    row('  getCategoryIndex() (rebuild)', rebuildMs, 'ms');
    unregisterCommand(`_bench_cmd_${offset + N + 999999}`);

    // getCommandsByCategory: reads categoryIndex directly
    const catQ = bench(() => getCommandsByCategory('ai'), 200);
    row('  getCommandsByCategory(ai)',    catQ.perItemMs, 'ms/call');

    // Search: O(n) linear scan
    if (N <= 5000) { // skip at 10k to save time
      const srch = bench(() => searchCommands('bench', { limit: 10 }), 30);
      const isSrchSlow = flagIf(srch.perItemMs > T.searchMs, 'Registry search', `searchCommands at N=${N}`, T.searchMs, srch.perItemMs, 'ms');
      row('  searchCommands("bench")',     srch.perItemMs, 'ms/call', isSrchSlow ? 'warn' : 'ok');
    }

    divider();

    // Teardown
    for (const p of plugins) unregisterCommand(p.name);
    unregisterCommand(`_bench_cmd_${offset + N + 999999}`); // safety
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 3 — Plugin Manager pipeline at scale
// ═══════════════════════════════════════════════════════════════════════════════

async function phase3_PluginManagerPipeline() {
  hdr('PHASE 3 — Plugin Manager Pipeline (Validate + Register)');

  const { pluginManager }                   = await import(`${ROOT}/src/plugin-manager.js`);
  const { registerCommand, unregisterCommand } = await import(`${ROOT}/src/lib/registry.js`);

  for (const N of [100, 500, 1000]) {
    sub(`In-memory validate + register pipeline — ${N} plugins`);
    const offset  = N * 200 + 3_000_000;
    const plugins = Array.from({ length: N }, (_, i) => makePlugin(i + offset));

    const m0 = mem();
    const t0 = performance.now();

    let passed = 0;
    let warned = 0;
    for (const p of plugins) {
      const { valid, warnings } = pluginManager.validateMetadata(p);
      if (valid) {
        pluginManager._plugins.set(p.name, {
          plugin:   p,
          filePath: `/bench/${p.name}.js`,
          status:   'loaded',
          loadedAt: new Date().toISOString(),
          error:    null,
        });
        if (Array.isArray(p.aliases)) {
          for (const a of p.aliases) pluginManager._aliases.set(a, p.name);
        }
        registerCommand(p);
        passed++;
      }
      if (warnings?.length) warned++;
    }

    const totalMs = +(performance.now() - t0).toFixed(2);
    const m1 = mem();
    const d  = memDelta(m0, m1);

    row('Pipeline time (total)',    totalMs,                  'ms');
    row('  per plugin',             +(totalMs / N).toFixed(3), 'ms/plugin');
    row('  throughput',             Math.round(N / (totalMs / 1000)), 'plugins/s');
    row('  passed validation',      passed,                   'plugins');
    row('  with warnings',          warned,                   'plugins', warned > 0 ? 'warn' : 'ok');
    row('  heap delta',             d.heap,                   'MB');
    divider();

    // Validate cost in isolation
    const valCost = bench(() => pluginManager.validateMetadata(makePlugin(7654321)), 2000);
    infoRow('  validateMetadata() per call', valCost.perItemMs, 'ms/call');
    infoRow('  validateMetadata() throughput', valCost.opsPerSec, 'validations/s');
    divider();

    // Teardown
    for (const p of plugins) {
      pluginManager._plugins.delete(p.name);
      if (Array.isArray(p.aliases)) for (const a of p.aliases) pluginManager._aliases.delete(a);
      unregisterCommand(p.name);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 4 — Workflow Engine stress
// ═══════════════════════════════════════════════════════════════════════════════

async function phase4_WorkflowEngine() {
  hdr('PHASE 4 — Workflow Engine Stress (100 / 500 / 1 000 Workflows)');

  const { workflowManager } = await import(`${ROOT}/src/workflows/manager.js`);
  const { defineWorkflow }  = await import(`${ROOT}/src/workflows/states.js`);

  // defineWorkflow() cost in isolation
  sub('defineWorkflow() construction cost (500 iterations)');
  const defCost = bench((i) => {
    try {
      defineWorkflow({
        name: `_bench_wf_cost_${i}`,
        steps: [
          { name: 'a', handle: async () => ({ _type: 'done' }) },
          { name: 'b', handle: async () => ({ _type: 'done' }) },
        ],
      });
    } catch {}
  }, 500);
  row('defineWorkflow() per call', defCost.perItemMs, 'ms/call');
  row('defineWorkflow() throughput', defCost.opsPerSec, 'defs/s');
  divider();

  // Register at scale
  for (const N of [100, 500, 1000]) {
    sub(`Bulk workflow registration — ${N} workflows`);
    const offset = N * 10 + 5_000_000;
    const wfs    = Array.from({ length: N }, (_, i) => makeWorkflowDef(i + offset));

    const m0 = mem();
    const t0 = performance.now();
    for (const wf of wfs) workflowManager.register(wf);
    const totalMs = +(performance.now() - t0).toFixed(2);
    const m1 = mem();
    const d  = memDelta(m0, m1);

    // listWorkflows() — should be cached after first call
    const list1 = bench(() => workflowManager.listWorkflows(), 500);
    // Force a re-register to invalidate cache, measure rebuild
    workflowManager.register(makeWorkflowDef(offset + N + 888888));
    const t_list2 = performance.now();
    workflowManager.listWorkflows();
    const listRebuildMs = +(performance.now() - t_list2).toFixed(4);
    workflowManager._definitions.delete(`_bench_wf_${offset + N + 888888}`);

    // getWorkflowInfo lookup
    const infoLookup = bench((i) => workflowManager.getWorkflowInfo(`_bench_wf_${i + offset}`), Math.min(N, 200));

    row(`registration (${N} workflows)`,      fmt(totalMs) + ' ms', '');
    row('  per workflow',                      +(totalMs / N).toFixed(4), 'ms/wf');
    row('  throughput',                        Math.round(N / (totalMs / 1000)), 'wfs/s');
    row('  registered count',                 workflowManager._definitions.size, 'wfs');
    row('  heap delta',                        d.heap, 'MB');
    row('  listWorkflows() cached per call',   list1.perItemMs, 'ms', list1.perItemMs > T.listCachedMs ? 'warn' : 'ok');
    row('  listWorkflows() cache rebuild',     listRebuildMs, 'ms');
    row('  getWorkflowInfo() per call',        infoLookup.perItemMs, 'ms/call');
    divider();

    if (list1.perItemMs > T.listCachedMs)
      flagIf(true, 'Workflow cache', `listWorkflows() cached at N=${N}`, T.listCachedMs, list1.perItemMs, 'ms');

    // Teardown
    for (const wf of wfs) workflowManager._definitions.delete(wf.name);
    workflowManager._namesCache = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 5 — Games Engine stress
// ═══════════════════════════════════════════════════════════════════════════════

async function phase5_GamesEngine() {
  hdr('PHASE 5 — Games Engine Stress (100 / 500 / 1 000 Games)');

  const { gamesEngine } = await import(`${ROOT}/src/games/engine.js`);

  const _log = console.log;
  const silenceGames = () => { console.log = (...a) => { if (!String(a[0]).startsWith('[GamesEngine]')) _log(...a); }; };
  const restoreLog   = () => { console.log = _log; };

  for (const N of [100, 500, 1000]) {
    sub(`Bulk game registration — ${N} games`);
    const offset = N * 10 + 7_000_000;
    const games  = Array.from({ length: N }, (_, i) => makeGame(i + offset));

    const m0 = mem();
    const t0 = performance.now();
    silenceGames();
    for (const g of games) gamesEngine.registerGame(g);
    restoreLog();
    const totalMs = +(performance.now() - t0).toFixed(2);
    const m1 = mem();
    const d  = memDelta(m0, m1);

    // listGames() — should be cached
    const list1 = bench(() => gamesEngine.listGames(), 500);

    // Force cache invalidation + rebuild
    silenceGames();
    gamesEngine.registerGame(makeGame(offset + N + 777777));
    restoreLog();
    const t_list2 = performance.now();
    gamesEngine.listGames();
    const listRebuildMs = +(performance.now() - t_list2).toFixed(4);
    gamesEngine._games.delete(`_bench_game_${offset + N + 777777}`);
    gamesEngine._gameIdCache = null;

    // getGame / hasGame lookups
    const getG = bench((i) => gamesEngine.getGame(`_bench_game_${i + offset}`), Math.min(N, 200));
    const hasG = bench((i) => gamesEngine.hasGame(`_bench_game_${i + offset}`), Math.min(N, 200));

    row(`registration (${N} games)`,         fmt(totalMs) + ' ms', '');
    row('  per game',                         +(totalMs / N).toFixed(4), 'ms/game');
    row('  throughput',                        Math.round(N / (totalMs / 1000)), 'games/s');
    row('  registered count',                 gamesEngine.listGames().length, 'games');
    row('  heap delta',                        d.heap, 'MB');
    row('  listGames() cached per call',       list1.perItemMs, 'ms', list1.perItemMs > T.listCachedMs ? 'warn' : 'ok');
    row('  listGames() cache rebuild',         listRebuildMs, 'ms');
    row('  getGame() per call',                getG.perItemMs, 'ms/call');
    row('  hasGame() per call',                hasG.perItemMs, 'ms/call');
    divider();

    if (list1.perItemMs > T.listCachedMs)
      flagIf(true, 'Games cache', `listGames() cached at N=${N}`, T.listCachedMs, list1.perItemMs, 'ms');

    // Teardown
    for (const g of games) gamesEngine._games.delete(g.gameId);
    gamesEngine._gameIdCache = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 6 — Agent TaskQueue
// ═══════════════════════════════════════════════════════════════════════════════

async function phase6_AgentQueue() {
  hdr('PHASE 6 — Agent Task Queue Stress');

  const { taskQueue, JobStatus } = await import(`${ROOT}/src/agent/queue.js`);

  // ── 6.1 enqueue() cost ────────────────────────────────────────────────────

  sub('Enqueue cost — 1 000 jobs (2-step each)');
  const makeJob = (i) => ({
    jid:   `bench_${i % 100}@s.whatsapp.net`,
    name:  `BenchJob-${i}`,
    steps: [
      { name: 'Step1', fn: async () => `result_${i}_1` },
      { name: 'Step2', fn: async () => `result_${i}_2` },
    ],
  });

  const m0 = mem();
  const t0 = performance.now();
  const ids = [];
  for (let i = 0; i < 1000; i++) ids.push(taskQueue.enqueue(makeJob(i)));
  const enqMs = +(performance.now() - t0).toFixed(2);
  const m1 = mem();
  const d  = memDelta(m0, m1);

  const perJob = +(enqMs / 1000).toFixed(4);
  flagIf(perJob > T.enqueuePerJob, 'Agent Queue', 'enqueue() per job', T.enqueuePerJob, perJob, 'ms');

  row('enqueue() 1 000 jobs (total)', enqMs,   'ms');
  row('  per job',                    perJob,  'ms/job',   perJob > T.enqueuePerJob ? 'warn' : 'ok');
  row('  throughput',                 Math.round(1000 / (enqMs / 1000)), 'enqueues/s');
  row('  queue depth',                taskQueue.size, 'jobs');
  row('  heap delta',                 d.heap,  'MB');
  divider();

  // ── 6.2 Query operations ─────────────────────────────────────────────────

  sub('Queue query operations (concurrent)');
  const qGet = bench((i) => taskQueue.getJobsForJid(`bench_${i % 100}@s.whatsapp.net`), 500);
  const qJob = bench(() => taskQueue.getJob(ids[0]), 10000);
  row('getJobsForJid() per call',  qGet.perItemMs, 'ms/call');
  row('getJob() per call',         qJob.perItemMs, 'ms/call');
  row('getJobsForJid() throughput',qGet.opsPerSec, 'ops/s');
  divider();

  // ── 6.3 Cancel operations ────────────────────────────────────────────────

  sub('Cancel — cancelAll() across 100 JIDs');
  const t_cancel = performance.now();
  let cancelled = 0;
  for (let i = 0; i < 100; i++) {
    cancelled += taskQueue.cancelAll(`bench_${i}@s.whatsapp.net`);
  }
  const cancelMs = +(performance.now() - t_cancel).toFixed(2);
  row('cancelAll() 100 JIDs (total)', cancelMs,   'ms');
  row('  jobs cancelled',             cancelled, 'jobs');
  divider();

  // ── 6.4 Drain — wait for running jobs to complete ────────────────────────

  sub('Drain — 30 fast-completion jobs (maxConcurrent=3)');

  const drain30 = Array.from({ length: 30 }, (_, i) => ({
    jid:   `drain_${i}@s.whatsapp.net`,
    name:  `Drain-${i}`,
    steps: [ { name: 'fast', fn: async () => void 0 } ],
  }));

  const t_drain = performance.now();
  const donePromises = drain30.map(job => new Promise(resolve => {
    taskQueue.enqueue({ ...job, onDone: resolve });
  }));
  await Promise.all(donePromises);
  const drainMs = +(performance.now() - t_drain).toFixed(2);

  row('30-job drain time (maxConcurrent=3)', drainMs, 'ms');
  row('  throughput',                         Math.round(30 / (drainMs / 1000)), 'jobs/s');
  divider();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 7 — Agent SessionMemory stress
// ═══════════════════════════════════════════════════════════════════════════════

async function phase7_AgentMemory() {
  hdr('PHASE 7 — Agent Session Memory Stress');

  const { sessionMemory } = await import(`${ROOT}/src/agent/memory.js`);

  // ── 7.1 Single-JID deep key store ────────────────────────────────────────

  sub('Single-JID — 10 000 keys (set/get)');
  const JID   = 'bench_deep@s.whatsapp.net';
  const KEYS  = 10_000;
  const PAYLD = { value: 42, label: 'test', data: 'x'.repeat(80) };

  const m0  = mem();
  const setB = bench((i) => sessionMemory.set(JID, `key_${i}`, PAYLD), KEYS);
  const m1  = mem();
  const d   = memDelta(m0, m1);
  const getB = bench((i) => sessionMemory.get(JID, `key_${i}`), KEYS);

  row('set() total (10k keys)',  setB.totalMs,  'ms');
  row('  per key',               setB.perItemMs,'ms/key');
  row('  throughput',            setB.opsPerSec,'sets/s');
  row('  heap delta',            d.heap,        'MB', d.heap > 20 ? 'warn' : 'ok');
  row('get() per key',           getB.perItemMs,'ms/key');
  row('get() throughput',        getB.opsPerSec,'gets/s');
  divider();

  if (d.heap > 20)
    flagIf(true, 'Agent Memory', '10k-key single-JID heap cost', 20, d.heap, 'MB');

  // ── 7.2 Multi-JID spread ──────────────────────────────────────────────────

  sub('Multi-JID — 1 000 sessions × 10 keys each');
  const JIDS   = 1000;
  const KJID   = 10;
  const m2     = mem();
  const t2     = performance.now();

  for (let j = 0; j < JIDS; j++) {
    const jid = `user_${j}@s.whatsapp.net`;
    for (let k = 0; k < KJID; k++) {
      sessionMemory.set(jid, `k${k}`, { v: j * KJID + k });
    }
  }

  const multiMs = +(performance.now() - t2).toFixed(2);
  const m3 = mem();
  const d2 = memDelta(m2, m3);

  row(`${(JIDS * KJID).toLocaleString()} set() ops (multi-JID)`, multiMs, 'ms');
  row('  per op',                +(multiMs / (JIDS * KJID)).toFixed(4), 'ms/op');
  row('  throughput',             Math.round((JIDS * KJID) / (multiMs / 1000)), 'ops/s');
  row('  live session count',    sessionMemory.sessionCount, 'sessions');
  row('  heap delta',            d2.heap, 'MB');
  divider();

  // ── 7.3 History cap enforcement ───────────────────────────────────────────

  sub('History cap enforcement (HISTORY_CAP = 20)');
  const histJid = 'hist_test@s.whatsapp.net';
  const histB   = bench((i) => sessionMemory.pushHistory(histJid, { command: `cmd_${i}`, result: i }), 500);
  const histLen = sessionMemory.getHistory(histJid).length;

  row('pushHistory() per call',      histB.perItemMs, 'ms/call');
  row('throughput',                  histB.opsPerSec, 'ops/s');
  row('history length (cap=20)',     histLen, 'entries', histLen !== 20 ? 'error' : 'ok');
  divider();

  if (histLen !== 20)
    flagIf(true, 'Agent Memory', 'History cap not enforced', 20, histLen, ' entries');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 8 — Combined full-load stress
// ═══════════════════════════════════════════════════════════════════════════════

async function phase8_CombinedStress() {
  hdr('PHASE 8 — Combined Full-Load Stress');
  sub('Simulating: 1 000 plugins + 500 workflows + 500 games simultaneously');

  const { registerCommand, unregisterCommand, getAllCommands, searchCommands, getCommandCount } =
    await import(`${ROOT}/src/lib/registry.js`);
  const { workflowManager } = await import(`${ROOT}/src/workflows/manager.js`);
  const { gamesEngine }     = await import(`${ROOT}/src/games/engine.js`);

  const NP = 1000, NW = 500, NG = 500;
  const OP = 9_100_000, OW = 9_200_000, OG = 9_300_000;

  const plugins   = Array.from({ length: NP }, (_, i) => makePlugin(i + OP));
  const workflows = Array.from({ length: NW }, (_, i) => makeWorkflowDef(i + OW));
  const games     = Array.from({ length: NG }, (_, i) => makeGame(i + OG));

  const memBase = mem();
  const tTotal0 = performance.now();

  // Register plugins
  const tP0 = performance.now();
  for (const p of plugins) registerCommand(p);
  const tPlugins = +(performance.now() - tP0).toFixed(2);

  // Register workflows
  const tW0 = performance.now();
  for (const wf of workflows) workflowManager.register(wf);
  const tWorkflows = +(performance.now() - tW0).toFixed(2);

  // Register games (suppress logs)
  const _log = console.log;
  console.log = (...a) => { if (!String(a[0]).startsWith('[GamesEngine]')) _log(...a); };
  const tG0 = performance.now();
  for (const g of games) gamesEngine.registerGame(g);
  console.log = _log;
  const tGames = +(performance.now() - tG0).toFixed(2);

  const tTotal = +(performance.now() - tTotal0).toFixed(2);
  const memFull = mem();
  const dFull   = memDelta(memBase, memFull);

  row('Plugin registration (1 000)',     tPlugins,  'ms');
  row('Workflow registration (500)',     tWorkflows,'ms');
  row('Game registration (500)',         tGames,    'ms');
  row('TOTAL setup time',               tTotal,    'ms',  tTotal > 500 ? 'warn' : 'ok');
  row('Heap delta (all registered)',     dFull.heap,'MB',  dFull.heap > T.stressHeapMB ? 'warn' : 'ok');
  row('RSS delta',                       dFull.rss, 'MB');
  row('Commands in registry',            getCommandCount(), 'cmds');
  row('Workflows registered',            workflowManager._definitions.size, 'wfs');
  row('Games registered',               gamesEngine.listGames().length, 'games');
  divider();

  flagIf(dFull.heap > T.stressHeapMB, 'Stress heap', 'Full-load heap delta', T.stressHeapMB, dFull.heap, 'MB');

  // ── Query performance at full load ────────────────────────────────────────

  sub('Query throughput under full load');

  const luFull  = bench(() => getAllCommands(),                  30);
  const sfFull  = bench(() => searchCommands('bench', { limit: 10 }), 30);
  const wfFull  = bench(() => workflowManager.listWorkflows(),  200);
  const gfFull  = bench(() => gamesEngine.listGames(),          200);

  row('getAllCommands() at 1 000 cmds',   luFull.perItemMs, 'ms/call', luFull.perItemMs > 5 ? 'warn' : 'ok');
  row('searchCommands() at 1 000 cmds',  sfFull.perItemMs, 'ms/call', sfFull.perItemMs > 15 ? 'warn' : 'ok');
  row('listWorkflows() cached (500 wfs)', wfFull.perItemMs, 'ms/call', wfFull.perItemMs > T.listCachedMs ? 'warn' : 'ok');
  row('listGames() cached (500 games)',   gfFull.perItemMs, 'ms/call', gfFull.perItemMs > T.listCachedMs ? 'warn' : 'ok');
  divider();

  flagIf(luFull.perItemMs > 5,  'Stress query', 'getAllCommands() at full load', 5,  luFull.perItemMs, 'ms');
  flagIf(sfFull.perItemMs > 15, 'Stress query', 'searchCommands() at full load', 15, sfFull.perItemMs, 'ms');

  // ── Per-plugin/workflow/game memory cost ──────────────────────────────────

  sub('Per-item memory cost at full load');
  const mbPerPlugin   = +(dFull.heap / NP).toFixed(4);
  const itemsTotal    = NP + NW + NG;
  const mbPerItem     = +(dFull.heap / itemsTotal).toFixed(4);

  infoRow('  MB per registered plugin',   mbPerPlugin,  'MB/plugin');
  infoRow('  MB per all items combined',  mbPerItem,    'MB/item');
  infoRow('  Theoretical limit (512 MB)', Math.round(512 / Math.max(mbPerPlugin, 0.001)).toLocaleString(), 'plugins at this rate');
  divider();

  // Teardown
  for (const p  of plugins)   unregisterCommand(p.name);
  for (const wf of workflows) workflowManager._definitions.delete(wf.name);
  for (const g  of games)     { gamesEngine._games.delete(g.gameId); }
  workflowManager._namesCache = null;
  gamesEngine._gameIdCache    = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 9 — Cache validation
// ═══════════════════════════════════════════════════════════════════════════════

async function phase9_CacheValidation() {
  hdr('PHASE 9 — Optimization Cache Validation');
  sub('Verifying all post-fix caches are correct and invalidate properly');

  const { registerCommand, unregisterCommand, getCategoryIndex, getAllCommands } =
    await import(`${ROOT}/src/lib/registry.js`);
  const { workflowManager } = await import(`${ROOT}/src/workflows/manager.js`);
  const { gamesEngine }     = await import(`${ROOT}/src/games/engine.js`);

  let allPassed = true;

  // ── 9.1 Registry getCategoryIndex() cache ────────────────────────────────

  const testPlugin = makePlugin(99_999_001);
  registerCommand(testPlugin);

  const idx1   = getCategoryIndex();
  const idx1b  = getCategoryIndex(); // should be same object reference
  const sameRef = idx1 === idx1b;

  // Mutate registry — cache must be invalidated
  registerCommand(makePlugin(99_999_002));
  const idx2   = getCategoryIndex();
  const newRef = idx1 !== idx2;

  const catTest1 = sameRef && newRef;
  allPassed = allPassed && catTest1;

  row('getCategoryIndex() returns same ref on repeated call',  sameRef ? 'PASS' : 'FAIL', '', sameRef ? 'ok' : 'error');
  row('getCategoryIndex() invalidated after registerCommand()',  newRef ? 'PASS' : 'FAIL', '', newRef ? 'ok' : 'error');

  unregisterCommand(testPlugin.name);
  unregisterCommand('_bench_cmd_99999002');

  if (!sameRef) flagIf(true, 'Cache', 'getCategoryIndex() not caching same object', 'same ref', 'new obj', '');
  if (!newRef)  flagIf(true, 'Cache', 'getCategoryIndex() not invalidated on register', 'new ref', 'old ref', '');

  // ── 9.2 workflowManager._namesCache ──────────────────────────────────────

  const wfA = makeWorkflowDef(88_888_001);
  const wfB = makeWorkflowDef(88_888_002);
  workflowManager.register(wfA);
  const names1 = workflowManager.listWorkflows();
  const names1b = workflowManager.listWorkflows(); // should be same array
  const wfSameArr = names1 === names1b;

  workflowManager.register(wfB); // invalidate
  const names2    = workflowManager.listWorkflows();
  const wfNewArr  = names1 !== names2;
  const wfHasBoth = names2.includes(wfA.name) && names2.includes(wfB.name);

  allPassed = allPassed && wfSameArr && wfNewArr && wfHasBoth;

  row('listWorkflows() returns same array on repeated call',    wfSameArr ? 'PASS' : 'FAIL', '', wfSameArr ? 'ok' : 'error');
  row('listWorkflows() invalidated after register()',            wfNewArr  ? 'PASS' : 'FAIL', '', wfNewArr  ? 'ok' : 'error');
  row('listWorkflows() new array includes both workflows',       wfHasBoth ? 'PASS' : 'FAIL', '', wfHasBoth ? 'ok' : 'error');

  workflowManager._definitions.delete(wfA.name);
  workflowManager._definitions.delete(wfB.name);
  workflowManager._namesCache = null;

  if (!wfSameArr) flagIf(true, 'Cache', 'listWorkflows() not caching array', 'same arr', 'new arr', '');
  if (!wfNewArr)  flagIf(true, 'Cache', 'listWorkflows() not invalidating', 'new arr', 'old arr', '');

  // ── 9.3 gamesEngine._gameIdCache ─────────────────────────────────────────

  const _l = console.log;
  console.log = (...a) => { if (!String(a[0]).startsWith('[GamesEngine]')) _l(...a); };

  const gA = makeGame(77_777_001);
  const gB = makeGame(77_777_002);
  gamesEngine.registerGame(gA);
  const gids1  = gamesEngine.listGames();
  const gids1b = gamesEngine.listGames(); // same array
  const gSame  = gids1 === gids1b;

  gamesEngine.registerGame(gB); // invalidate
  const gids2  = gamesEngine.listGames();
  const gNew   = gids1 !== gids2;
  const gBoth  = gids2.includes(gA.gameId) && gids2.includes(gB.gameId);

  console.log = _l;
  allPassed = allPassed && gSame && gNew && gBoth;

  row('listGames() returns same array on repeated call',        gSame ? 'PASS' : 'FAIL', '', gSame ? 'ok' : 'error');
  row('listGames() invalidated after registerGame()',            gNew  ? 'PASS' : 'FAIL', '', gNew  ? 'ok' : 'error');
  row('listGames() new array includes both games',               gBoth ? 'PASS' : 'FAIL', '', gBoth ? 'ok' : 'error');

  gamesEngine._games.delete(gA.gameId);
  gamesEngine._games.delete(gB.gameId);
  gamesEngine._gameIdCache = null;

  divider();
  row(
    allPassed ? 'ALL CACHE TESTS PASSED' : 'SOME CACHE TESTS FAILED',
    allPassed ? '✓' : '✗',
    '',
    allPassed ? 'ok' : 'error'
  );
  divider();

  return allPassed;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 10 — Bottleneck + Optimization Report
// ═══════════════════════════════════════════════════════════════════════════════

function phase10_Report(cachesPassed, realLoad) {
  hdr('PHASE 10 — Bottleneck & Optimization Report');

  // ── Bottlenecks ───────────────────────────────────────────────────────────

  if (BOTTLENECKS.length === 0) {
    console.log(`\n  ${ok('✓')} ${bold('No thresholds breached — all subsystems within spec.')}\n`);
  } else {
    console.log(`\n  ${warn('⚠')} ${bold(`${BOTTLENECKS.length} threshold(s) breached:`)}\n`);
    for (const b of BOTTLENECKS) {
      console.log(`  ${coloured('┌─', C.yellow)} ${bold(b.category)}`);
      console.log(`  ${coloured('│', C.yellow)}  ${b.detail}`);
      console.log(`  ${coloured('│', C.yellow)}  Threshold: ${ok(b.threshold)}  │  Measured: ${warn(b.measured)}`);
      console.log(`  ${coloured('└', C.yellow)}${'─'.repeat(W - 5)}`);
    }
  }

  // ── Optimization status (post Phase-11 fixes) ─────────────────────────────

  const OPTS = [
    {
      status: 'DONE',
      priority: 'Critical',
      area: 'bot.js — jid ReferenceError in messageHandler',
      detail: 'agentRouter.route() called with undefined jid, causing agent layer to never execute. Fixed: const msgJid = msg.key.remoteJid.',
    },
    {
      status: 'DONE',
      priority: 'High',
      area: 'agent/router.js — buildSteps() double-call',
      detail: 'Steps were built twice (once for ACK names, once for queue). Refactored to build once and reuse.',
    },
    {
      status: 'DONE',
      priority: 'High',
      area: 'games/sessions.js — _paused Set memory leak',
      detail: 'Stale JIDs accumulated in _paused when gameEngine auto-expiry removed sessions. Fixed isPaused() to verify session existence.',
    },
    {
      status: 'DONE',
      priority: 'Medium',
      area: 'index.js — unhandledRejection kills bot on transient errors',
      detail: 'Changed from process.exit(1) on every rejection to log-only; exits only on OOM.',
    },
    {
      status: 'DONE',
      priority: 'Medium',
      area: 'server.js — /push endpoint unauthenticated + no body cap',
      detail: 'Added optional PUSH_SECRET Bearer token check and 64 KB body size limit.',
    },
    {
      status: 'DONE',
      priority: 'Low',
      area: 'workflows/manager.js — listWorkflows() O(n) spread on every call',
      detail: 'Added _namesCache, invalidated on every register(). Now O(1) after first call.',
    },
    {
      status: 'DONE',
      priority: 'Low',
      area: 'games/engine.js — listGames() O(n) spread on every call',
      detail: 'Added _gameIdCache, invalidated on registerGame(). Now O(1) after first call.',
    },
    {
      status: 'VERIFIED',
      priority: 'Existing',
      area: 'lib/registry.js — getCategoryIndex() cache',
      detail: 'Already had _catIndexCache (v3). Verified working and invalidating correctly.',
    },
    {
      status: 'VERIFIED',
      priority: 'Existing',
      area: 'lib/registry.js — getAllCommands() via primaryNames Set',
      detail: 'Already O(n) map over primaryNames instead of Set construction. Verified at 10k scale.',
    },
    {
      status: 'OPEN',
      priority: 'Low',
      area: 'registry — searchCommands() O(n×8) linear scan',
      detail: 'Full table scan with 8-level scoring. At 1 000 cmds: acceptable (<5ms). Above 5 000: may slow help/search commands. Trie or inverted-index would reduce to O(k) per query.',
      recommendation: 'Build a name-prefix trie at startup; update on register/unregister. Only needed if plugin count exceeds ~2 000.',
    },
    {
      status: 'OPEN',
      priority: 'Low',
      area: 'plugin-manager — getPluginsByCategory() rebuilds index on every call',
      detail: 'Used by owner .plugins command. O(n) iteration each call. Low call frequency makes this acceptable.',
      recommendation: 'Mirror the registry categoryIndex approach — maintain a parallel category map in pluginManager.',
    },
    {
      status: 'OPEN',
      priority: 'Info',
      area: 'agent/queue — completed jobs not pruned until 10min TTL',
      detail: 'Completed jobs stay in _jobs Map for 10 minutes. Under very high throughput (1000s of jobs/hr) this could cause memory pressure.',
      recommendation: 'Acceptable for current load profile. Consider reducing TTL to 2–3 min if bot handles >500 jobs/hr.',
    },
  ];

  console.log(`\n  ${bold('📋 Optimization Status (Phase 11 Hardening):')}\n`);

  const icons = { DONE: ok('✅ DONE    '), VERIFIED: ok('🔍 VERIFIED'), OPEN: warn('🟡 OPEN    ') };
  const pIcons = { Critical: err('[CRITICAL]'), High: warn('[HIGH]    '), Medium: warn('[MEDIUM]  '), Low: dim('[LOW]     '), Existing: dim('[EXIST]   '), Info: dim('[INFO]    ') };

  for (const opt of OPTS) {
    const icon  = icons[opt.status]  ?? '';
    const pi    = pIcons[opt.priority] ?? '';
    console.log(`  ${icon} ${pi} ${bold(opt.area)}`);
    console.log(`  ${dim('│')}  ${opt.detail}`);
    if (opt.recommendation) {
      console.log(`  ${dim('│')}  ${cyan('→ Rec:')} ${opt.recommendation}`);
    }
    console.log();
  }

  // ── Cache test summary ────────────────────────────────────────────────────

  console.log(`  ${bold('🔒 Cache Correctness:')} ${cachesPassed ? ok('ALL PASS') : err('FAILURES DETECTED')}`);
  console.log();

  // ── Real plugin load summary ──────────────────────────────────────────────

  if (realLoad) {
    console.log(`  ${bold('📦 Real Plugin Loader:')} ${realLoad.loaded} loaded, ${realLoad.failed} failed, ${realLoad.cmdCount} commands, ${realLoad.loadMs}ms`);
    console.log();
  }

  // ── Final memory state ────────────────────────────────────────────────────

  const final = mem();
  console.log(`  ${bold('📊 Final memory state:')}`);
  console.log(`     Heap used:  ${bold(final.heap + ' MB')}`);
  console.log(`     RSS:        ${bold(final.rss  + ' MB')}`);
  console.log(`     External:   ${final.external} MB`);
  console.log();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const totalStart = performance.now();

  console.log('\n' + coloured('╔' + '═'.repeat(W - 2) + '╗', C.cyan, C.bold));
  console.log(coloured('║', C.cyan, C.bold) + bold('  Yuzuki Framework — Startup & Runtime Stress Test                       ') + coloured('║', C.cyan, C.bold));
  console.log(coloured('║', C.cyan, C.bold) + dim(`  Node ${process.version}  |  ${new Date().toISOString()}                    `) + coloured('║', C.cyan, C.bold));
  console.log(coloured('╚' + '═'.repeat(W - 2) + '╝', C.cyan, C.bold));

  const baseline = mem();
  console.log(`\n  ${bold('Baseline')}  heap: ${baseline.heap} MB  │  RSS: ${baseline.rss} MB\n`);

  await phase0_ColdImport();
  const realLoad = await phase1_RealPlugins();
  await phase2_RegistryStress();
  await phase3_PluginManagerPipeline();
  await phase4_WorkflowEngine();
  await phase5_GamesEngine();
  await phase6_AgentQueue();
  await phase7_AgentMemory();
  await phase8_CombinedStress();
  const cachesPassed = await phase9_CacheValidation();
  phase10_Report(cachesPassed, realLoad);

  const totalSec = ((performance.now() - totalStart) / 1000).toFixed(2);
  console.log(coloured('═'.repeat(W), C.cyan, C.bold));
  console.log(bold(` Stress test complete in ${totalSec}s`));
  console.log(coloured('═'.repeat(W), C.cyan, C.bold) + '\n');

  process.exit(BOTTLENECKS.length > 0 ? 1 : 0);
}

main().catch(e => { console.error(bold(err('Benchmark error:')), e); process.exit(2); });
