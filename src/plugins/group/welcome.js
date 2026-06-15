/**
 * Plugin: welcome
 * Category: group
 * Migrated from commands.js case "welcome"
 */

import { isOwner } from '../../settings.js';
import { getGroupData, setGroupData } from '../../lib/protect.js';

export default {
  name:        'welcome',
  aliases:     ['setwelcome'],
  category:    'group',
  description: 'Toggle welcome messages for new members',
  usage:       '.welcome',
  permissions: ['owner', 'group'],

  async execute({ msg, reply, sender, settings }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ Group only.'); return; }
    if (!isOwner(sender, settings)) { await reply('❌ Owner only.'); return; }
    const gc = getGroupData(jid);
    gc.welcome = !gc.welcome;
    setGroupData(jid, gc);
    await reply(gc.welcome ? '✅ Welcome messages enabled.' : '❌ Welcome messages disabled.');
  },
};
