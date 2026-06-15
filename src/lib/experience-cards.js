/**
 * Workflow Experience Cards
 *
 * NativeFlow card builders for the Workflow Experience Layer.
 * All cards are generated purely from live data — experience-registry + registry.
 *
 * ─── Card catalogue ───────────────────────────────────────────────────────────
 *
 *   experienceBrowserCard(sock, jid, msg, opts?)
 *     All experience groups as a scrollable select list.
 *     Tapping a row fires `.discover <id>` through the normal command router.
 *
 *   experienceDetailCard(sock, jid, msg, groupId, opts?)
 *     Full breakdown of a single group: steps with usage strings and hints,
 *     a "Start" copy button, and a per-step select list.
 *     Tapping a step row fires the step's command directly.
 *
 *   experienceRecommendationCard(sock, jid, msg, commandName, opts?)
 *     Inline nudge appended after a command runs: "You used X — explore the
 *     full <group> workflow to do more."  Includes a select list of all
 *     groups that contain the command.
 *
 * ─── Return shape ─────────────────────────────────────────────────────────────
 *
 *   { ok: true,  sent: <WAMessage> }
 *   { ok: false, error: <Error>, fallbackSent?: <WAMessage> }
 */

import {
  listExperienceGroups,
  getExperienceGroup,
  resolveSteps,
  getRecommendations,
} from './experience-registry.js';

import {
  sendInteractive,
  copyButton,
  selectButton,
  selectButtonSections,
} from './interactive.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function resolveOpts({ prefix = '.', botName = 'Yuzuki MD' } = {}) {
  return { prefix, botName };
}

/** Truncate a string at word boundary to maxLen characters. */
function trunc(str, maxLen = 72) {
  if (!str || str.length <= maxLen) return str ?? '';
  return str.slice(0, maxLen - 1).replace(/\s+\S*$/, '') + '…';
}

/** Format an availability indicator for a resolved step. */
function stepStatusIcon(step) {
  if (!step.available) return '🔌'; // plugin not loaded
  if (!step.enabled)   return '⏸️'; // command disabled
  return '▶️';
}

// ── Browser card ──────────────────────────────────────────────────────────────

/**
 * Send an interactive list of all experience groups ("Workflow Browser").
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {object} [opts]
 * @param {string} [opts.prefix]
 * @param {string} [opts.botName]
 * @returns {Promise<{ok:boolean}>}
 */
export async function experienceBrowserCard(sock, jid, msg, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);
  const groups = listExperienceGroups();

  // Build select-list rows — one per group
  const rows = groups.map(g => {
    const count = g.steps.length;
    const tags  = (g.tags ?? []).slice(0, 3).join(' · ');
    return {
      title:       `${g.icon}  ${g.name}`,
      description: trunc(`${count} command${count !== 1 ? 's' : ''} • ${g.description}`, 72),
      rowId:       `${prefix}discover ${g.id}`,
    };
  });

  const body =
    `🧭  *Workflow Browser*\n` +
    `${'─'.repeat(22)}\n\n` +
    `Tap a workflow to see its commands and get started.\n` +
    `${groups.length} workflows available.\n\n` +
    `_Use \`${prefix}discover <id>\` to jump straight to any workflow._`;

  const buttons = [
    selectButton('🧭 Open a Workflow', rows, 'Workflows'),
    copyButton('📋 Copy Command', `${prefix}discover`),
  ];

  try {
    await sendInteractive(sock, jid, msg, { body, footer: botName, buttons });
    return { ok: true };
  } catch (error) {
    // Plain-text fallback
    const fallback =
      `🧭  *Workflow Browser*\n${'─'.repeat(22)}\n\n` +
      groups.map(g => `${g.icon}  *${g.name}*  \`${prefix}discover ${g.id}\`\n   _${g.description}_`).join('\n\n') +
      `\n\n_Tap a row or type a command to begin._`;
    try { await sock.sendMessage(jid, { text: fallback }, { quoted: msg }); } catch {}
    return { ok: false, error };
  }
}

// ── Detail card ───────────────────────────────────────────────────────────────

/**
 * Send a detailed workflow card for a single experience group.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {string} groupId
 * @param {object} [opts]
 * @param {string} [opts.prefix]
 * @param {string} [opts.botName]
 * @returns {Promise<{ok:boolean}>}
 */
export async function experienceDetailCard(sock, jid, msg, groupId, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);
  const group = getExperienceGroup(groupId);

  if (!group) {
    const ids = listExperienceGroups().map(g => `\`${g.id}\``).join('  ');
    try {
      await sock.sendMessage(jid,
        { text: `❌  Unknown workflow *${groupId}*.\n\nAvailable: ${ids}` },
        { quoted: msg });
    } catch {}
    return { ok: false, error: new Error(`Unknown group: ${groupId}`) };
  }

  const steps = resolveSteps(group, prefix);

  // ── Body text ────────────────────────────────────────────────────────────
  const stepLines = steps.map((s, i) => {
    const icon  = stepStatusIcon(s);
    const label = s.label;
    const usage = s.usage;
    const hint  = s.hint ? `\n      _${trunc(s.hint, 60)}_` : '';
    return `  ${i + 1}.  ${icon}  *${label}*\n      \`${usage}\`${hint}`;
  }).join('\n\n');

  const availCount  = steps.filter(s => s.available).length;
  const totalCount  = steps.length;
  const statusLine  = availCount < totalCount
    ? `_${availCount}/${totalCount} commands available — missing plugins show 🔌_`
    : `_All ${totalCount} commands available_`;

  const body =
    `${group.icon}  *${group.name} Workflow*\n` +
    `${'─'.repeat(22)}\n\n` +
    `${group.description}\n\n` +
    `*Steps:*\n\n${stepLines}\n\n` +
    statusLine;

  // ── Buttons ───────────────────────────────────────────────────────────────
  // "Start" = first available command
  const firstAvail = steps.find(s => s.available && s.enabled);
  const startUsage = firstAvail?.usage ?? steps[0]?.usage ?? `${prefix}help`;

  // Steps select list — tapping fires the command directly
  const stepRows = steps.map(s => ({
    title:       `${stepStatusIcon(s)}  ${s.label}`,
    description: trunc(s.usage + (s.hint ? `  •  ${s.hint}` : ''), 72),
    rowId:       s.usage,  // fires the command directly when tapped
  }));

  // Back-to-browser row appended as a second section
  const sections = [
    { title: `${group.icon} Steps`,   rows: stepRows },
    { title: '↩️ Navigation',          rows: [
      { title: '🧭  Back to Workflows', description: 'Browse all available workflows', rowId: `${prefix}discover` },
    ]},
  ];

  const buttons = [
    copyButton(`▶️ Start: ${firstAvail?.label ?? 'Step 1'}`, startUsage),
    selectButtonSections('📋 All Steps', sections),
  ];

  try {
    await sendInteractive(sock, jid, msg, { body, footer: botName, buttons });
    return { ok: true };
  } catch (error) {
    const fallback =
      `${group.icon}  *${group.name}*\n${'─'.repeat(22)}\n\n` +
      steps.map((s, i) =>
        `${i + 1}.  ${stepStatusIcon(s)}  *${s.label}*  —  \`${s.usage}\`\n    _${s.hint}_`,
      ).join('\n\n') +
      `\n\nType \`${prefix}discover\` to go back.`;
    try { await sock.sendMessage(jid, { text: fallback }, { quoted: msg }); } catch {}
    return { ok: false, error };
  }
}

// ── Recommendation card ───────────────────────────────────────────────────────

/**
 * Send a brief recommendation nudge after a user runs a command.
 *
 * Shows which workflows contain the command they just used, and invites
 * them to explore the broader feature set.
 *
 * Returns { ok: false, skipped: true } when no recommendations exist
 * (caller can silently ignore this — nothing is sent).
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {string} commandName    — the command just used (registry name)
 * @param {object} [opts]
 * @param {string} [opts.prefix]
 * @param {string} [opts.botName]
 * @returns {Promise<{ok:boolean, skipped?:boolean}>}
 */
export async function experienceRecommendationCard(sock, jid, msg, commandName, opts = {}) {
  const { prefix, botName } = resolveOpts(opts);
  const matches = getRecommendations(commandName);

  if (!matches.length) return { ok: false, skipped: true };

  const rows = matches.map(g => ({
    title:       `${g.icon}  ${g.name}`,
    description: trunc(g.description, 72),
    rowId:       `${prefix}discover ${g.id}`,
  }));

  const groupNames = matches.map(g => `*${g.name}*`).join(' & ');

  const body =
    `💡  *Discover More*\n` +
    `${'─'.repeat(22)}\n\n` +
    `You used \`${prefix}${commandName}\`.\n` +
    `It's part of the ${groupNames} workflow${matches.length > 1 ? 's' : ''}.\n\n` +
    `_Explore the full workflow to find related commands._`;

  const buttons = [
    selectButton('🧭 Explore Workflow', rows, 'Related Workflows'),
  ];

  try {
    await sendInteractive(sock, jid, msg, { body, footer: botName, buttons });
    return { ok: true };
  } catch (error) {
    // Recommendation is best-effort — silent failure is fine
    return { ok: false, error };
  }
}
