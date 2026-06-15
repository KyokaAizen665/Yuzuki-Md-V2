/**
 * Plugin: goodbye
 * Category: group
 * Migrated from commands.js case "left"
 * Alias "left" preserved for backward compatibility.
 */

import { isOwner } from '../../settings.js';
import { getGroupData, setGroupData } from '../../lib/protect.js';

export default {
  name:        'goodbye',
  aliases:     ['left', 'setgoodbye', 'farewell'],
  category:    'group',
  description: 'Toggle goodbye messages when members leave',
  usage:       '.goodbye',
  permissions: ['owner', 'group'],

  async execute({ msg, reply, sender, settings }) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us')) { await reply('❌ Group only.'); return; }
    if (!isOwner(sender, settings)) { await reply('❌ Owner only.'); return; }
    const gc = getGroupData(jid);
    gc.left = !gc.left;
    setGroupData(jid, gc);
    await reply(gc.left ? '✅ Goodbye messages enabled.' : '❌ Goodbye messages disabled.');
  },
};
