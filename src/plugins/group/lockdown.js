/**
 * Plugin: lockdown
 * Category: group
 *
 * Put the group in lockdown mode — only admins can send messages.
 * Requires both sender to be admin AND bot to be admin.
 *
 * Usage:
 *   .lockdown          — toggle lockdown
 *   .lockdown on       — enable lockdown
 *   .lockdown off      — disable lockdown
 *   .lockdown status   — current status
 */

import { getAutomod, setAutomod, isGroupAdmin, isBotGroupAdmin } from '../../lib/group-db.js';

export default {
  name:        'lockdown',
  aliases:     ['lock', 'grouplock', 'closechat', 'lockgroup'],
  category:    'group',
  description: 'Lock the group so only admins can send messages (requires bot admin)',
  usage:       '.lockdown [on|off|status]',
  permissions: ['admin', 'group'],

  async execute({ sock, msg, reply, args, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    const sub = args[0]?.toLowerCase();

    // Status (no admin required)
    if (sub === 'status' || sub === 'check') {
      const am = getAutomod(jid);
      await reply(`🔒 *Lockdown Status:* ${am.lockdown ? '🔴 *LOCKED*' : '🟢 *Open*'}`);
      return;
    }

    // Admin check
    const adminOk  = await isGroupAdmin(sock, jid, sender);
    if (!adminOk) { await reply('❌ Only group admins can toggle lockdown.'); return; }
    const botOk    = await isBotGroupAdmin(sock, jid);
    if (!botOk)   { await reply('❌ I need to be a group admin to change group settings.'); return; }

    const am      = getAutomod(jid);
    const current = am.lockdown ?? false;

    // Determine intent
    let enable;
    if (sub === 'on')  enable = true;
    else if (sub === 'off') enable = false;
    else enable = !current; // toggle

    if (enable === current) {
      await reply(`ℹ️ Lockdown is already *${current ? 'ON' : 'OFF'}*.`);
      return;
    }

    try {
      await sock.groupSettingUpdate(jid, enable ? 'announcement' : 'not_announcement');
      setAutomod(jid, { lockdown: enable });
      await sock.sendMessage(jid, { react: { text: enable ? '🔒' : '🔓', key: msg.key } }).catch(() => {});
      await reply(
        enable
          ? `🔒 *Group Locked!*\nOnly admins can send messages now.\n_Use \`${prefix}lockdown off\` to unlock._`
          : `🔓 *Group Unlocked!*\nAll members can send messages again.`,
      );
    } catch {
      await reply('❌ Failed to update group settings. Make sure I have admin permissions.');
    }
  },
};
