/**
 * Plugin: modrules
 * Category: group
 *
 * Full moderation ruleset overview with NativeFlow navigation to each setting.
 *
 * Usage:
 *   .modrules    — view all active moderation rules
 *   .rules       — alias
 */

import { getAutomod }                                from '../../lib/group-db.js';
import { getGroupData }                             from '../../lib/protect.js';
import { modRulesCard }                             from '../../lib/group-cards.js';
import { sendInteractive, selectButtonSections, copyButton } from '../../lib/interactive.js';

export default {
  name:        'modrules',
  aliases:     ['rules', 'modsettings', 'modstatus', 'modrule'],
  category:    'group',
  description: 'Full moderation rules overview — antilink, antispam, warns, lockdown',
  usage:       '.modrules',
  permissions: ['group'],

  async execute({ sock, msg, reply, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    let meta;
    try { meta = await sock.groupMetadata(jid); } catch { meta = { subject: 'Group' }; }

    const automod = getAutomod(jid);
    const gc      = getGroupData(jid);
    const card    = modRulesCard(meta.subject ?? 'Group', gc, automod, prefix);

    const alFlags  = Object.entries(gc?.antilink ?? {}).filter(([, v]) => v).map(([k]) => k);
    const alStr    = alFlags.length ? alFlags.join(', ') : 'none';

    const sections = [
      {
        title: '🔗 Anti-Link',
        rows: [
          { title: `All Links: ${gc?.antilink?.all ? '✅' : '❌'}`,    rowId: `${prefix}antilink all`, description: 'Toggle all-link filter' },
          { title: `WA Groups: ${gc?.antilink?.gc  ? '✅' : '❌'}`,    rowId: `${prefix}antilink gc`,  description: 'Toggle WhatsApp group link filter' },
          { title: `Action: ${gc?.antilinkAction ?? 'silent'}`,         rowId: `${prefix}antilink action`, description: 'silent / warn / kick' },
        ],
      },
      {
        title: '🔴 Auto-Mod',
        rows: [
          { title: `Anti-Spam: ${automod.antispam ? '✅' : '❌'}`,     rowId: `${prefix}antispam`,    description: `${automod.spamLimit} msgs/${automod.spamWindowMs/1000}s` },
          { title: `Lockdown: ${automod.lockdown  ? '🔒 ON' : '🔓 OFF'}`, rowId: `${prefix}lockdown`, description: 'Restrict to admins-only' },
        ],
      },
      {
        title: '⚠️ Warn System',
        rows: [
          { title: `Threshold: ${automod.warnThreshold} warns`,         rowId: `${prefix}automod warn ${automod.warnThreshold}`, description: 'Warns before auto-action' },
          { title: `Action: ${automod.warnAction}`,                     rowId: `${prefix}automod action ${automod.warnAction}`,   description: 'kick / mute' },
        ],
      },
    ];

    await sendInteractive(sock, jid, msg, {
      body:    card,
      footer:  settings?.botName ?? 'Yuzuki MD',
      buttons: [
        copyButton('📋 Copy Rules', card),
        selectButtonSections('⚙️ Configure Rule', sections),
      ],
    }, card);
  },
};
