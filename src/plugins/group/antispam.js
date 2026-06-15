/**
 * Plugin: antispam
 * Category: group
 *
 * Configure anti-spam protection for the group.
 * When enabled, users who send more than `limit` messages in `window` seconds
 * will have their messages deleted and receive a warning.
 *
 * Usage:
 *   .antispam              — view current anti-spam status
 *   .antispam on           — enable anti-spam
 *   .antispam off          — disable anti-spam
 *   .antispam limit <n>    — set spam message limit (default 5)
 *   .antispam window <sec> — set time window in seconds (default 5)
 */

import { getAutomod, setAutomod, isGroupAdmin } from '../../lib/group-db.js';

export default {
  name:        'antispam',
  aliases:     ['nospam', 'spamfilter', 'spamprotect'],
  category:    'group',
  description: 'Anti-spam protection — auto-delete rapid messages in a time window',
  usage:       '.antispam [on|off|limit <n>|window <sec>]',
  permissions: ['group'],

  async execute({ sock, msg, reply, args, sender, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ This command only works in groups.'); return; }

    const sub = args[0]?.toLowerCase();

    // Status view (no admin required)
    if (!sub || sub === 'status' || sub === 'check') {
      const am = getAutomod(jid);
      await reply(
        `🔴 *Anti-Spam Status*\n${'─'.repeat(22)}\n\n` +
        `Status:   *${am.antispam ? '🟢 Enabled' : '🔴 Disabled'}*\n` +
        `Limit:    *${am.spamLimit ?? 5} messages*\n` +
        `Window:   *${(am.spamWindowMs ?? 5000) / 1000} seconds*\n\n` +
        `_Commands:_\n` +
        `• \`${prefix}antispam on\` / \`off\`\n` +
        `• \`${prefix}antispam limit 5\`\n` +
        `• \`${prefix}antispam window 5\``,
      );
      return;
    }

    // Changes require admin
    const adminOk = await isGroupAdmin(sock, jid, sender);
    if (!adminOk) { await reply('❌ Only group admins can change anti-spam settings.'); return; }

    if (sub === 'on') {
      setAutomod(jid, { antispam: true });
      const am = getAutomod(jid);
      await reply(
        `✅ *Anti-Spam Enabled*\n\n` +
        `Messages deleted if *${am.spamLimit}+ msgs* sent within *${am.spamWindowMs / 1000}s*.\n` +
        `_Adjust: \`${prefix}antispam limit <n>\` · \`${prefix}antispam window <sec>\`_`,
      );
      return;
    }

    if (sub === 'off') {
      setAutomod(jid, { antispam: false });
      await reply(`🔴 *Anti-Spam Disabled.*`);
      return;
    }

    if (sub === 'limit') {
      const n = parseInt(args[1]);
      if (!n || n < 2 || n > 50) {
        await reply(`❌ Usage: \`${prefix}antispam limit <2-50>\``);
        return;
      }
      setAutomod(jid, { spamLimit: n });
      await reply(`✅ Spam message limit set to *${n}* per window.`);
      return;
    }

    if (sub === 'window') {
      const sec = parseInt(args[1]);
      if (!sec || sec < 1 || sec > 60) {
        await reply(`❌ Usage: \`${prefix}antispam window <1-60>\` (seconds)`);
        return;
      }
      setAutomod(jid, { spamWindowMs: sec * 1000 });
      await reply(`✅ Spam detection window set to *${sec} seconds*.`);
      return;
    }

    await reply(`❓ Unknown option.\nUsage: \`${prefix}antispam [on|off|limit <n>|window <sec>]\``);
  },
};
