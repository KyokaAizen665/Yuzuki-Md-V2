/**
 * Plugin: automod
 * Category: group
 *
 * View and configure all auto-moderation settings for the group.
 * Uses NativeFlow for interactive rule navigation.
 *
 * Usage:
 *   .automod             — view all automod settings
 *   .automod warn <n>    — set warn threshold
 *   .automod action kick|mute   — set warn action
 *   .automod warninfo    — warn system summary
 */

import { getAutomod, setAutomod, isGroupAdmin }      from '../../lib/group-db.js';
import { getGroupData }                              from '../../lib/protect.js';
import { modRulesCard }                              from '../../lib/group-cards.js';
import { sendInteractive, selectButton, copyButton } from '../../lib/interactive.js';

export default {
  name:        'automod',
  aliases:     ['modconfig', 'modsetup', 'automodconfig'],
  category:    'group',
  description: 'View and configure all auto-moderation rules for the group',
  usage:       '.automod  |  .automod warn <n>  |  .automod action kick|mute',
  permissions: ['group'],

  async execute({ sock, msg, reply, args, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    const sub = args[0]?.toLowerCase();

    // Config changes require admin
    if (sub && sub !== 'warninfo') {
      const adminOk = await isGroupAdmin(sock, jid, sender);
      if (!adminOk) { await reply('❌ Only group admins can change automod settings.'); return; }
    }

    // ── Set warn threshold ───────────────────────────────────────────────────
    if (sub === 'warn') {
      const n = parseInt(args[1]);
      if (!n || n < 1 || n > 20) {
        await reply(`❌ Usage: \`${prefix}automod warn <1-20>\`\n_e.g. \`${prefix}automod warn 3\`_`);
        return;
      }
      setAutomod(jid, { warnThreshold: n });
      await reply(`✅ Warn threshold set to *${n}*. Members will be actioned after ${n} warnings.`);
      return;
    }

    // ── Set warn action ──────────────────────────────────────────────────────
    if (sub === 'action') {
      const action = args[1]?.toLowerCase();
      if (!['kick', 'mute', 'warn'].includes(action ?? '')) {
        await reply(`❌ Usage: \`${prefix}automod action kick|mute\``);
        return;
      }
      setAutomod(jid, { warnAction: action });
      await reply(`✅ Warn action set to *${action}*.`);
      return;
    }

    // ── View overview ────────────────────────────────────────────────────────
    let meta;
    try { meta = await sock.groupMetadata(jid); } catch { meta = { subject: 'Group' }; }

    const automod = getAutomod(jid);
    const gc      = getGroupData(jid);
    const card    = modRulesCard(meta.subject ?? 'Group', gc, automod, prefix);

    const rows = [
      { title: '🔴 Anti-Spam',    rowId: `${prefix}antispam`,  description: `${automod.antispam   ? '✅ Enabled' : '❌ Disabled'} — ${automod.spamLimit} msgs/${automod.spamWindowMs/1000}s` },
      { title: '🔒 Lockdown',     rowId: `${prefix}lockdown`,  description: automod.lockdown ? '✅ Active' : '❌ Inactive' },
      { title: '⚠️ Warn Config',   rowId: `${prefix}automod warn ${automod.warnThreshold}`, description: `Threshold: ${automod.warnThreshold} · Action: ${automod.warnAction}` },
      { title: '📋 Mod Rules',     rowId: `${prefix}modrules`,  description: 'View all active moderation rules' },
    ];

    await sendInteractive(sock, jid, msg, {
      body:    card,
      footer:  settings?.botName ?? 'Yuzuki MD',
      buttons: [
        copyButton('📋 Copy Rules', card),
        selectButton('⚙️ Configure', rows, 'Auto-Mod Settings'),
      ],
    }, card);
  },
};
