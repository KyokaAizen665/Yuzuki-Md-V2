/**
 * Plugin: setowner
 * Category: owner
 * Migrated from commands.js case "setowner"
 */

import { setSetting, isOwner } from '../../settings.js';
import { toast } from '../../utils/ui.js';

export default {
  name:        'setowner',
  aliases:     [],
  category:    'owner',
  description: 'Set the primary owner phone number',
  usage:       '.setowner <phone_number>',
  permissions: ['owner'],

  async execute({ reply, args, sender, settings, prefix }) {
    if (!isOwner(sender, settings)) { await reply('⛔ This command is restricted to bot owners.'); return; }
    const num = args[0]?.replace(/[^0-9]/g, '');
    if (!num) { await reply(toast('info', 'Usage', `${prefix}setowner <phone_number>`)); return; }
    setSetting('ownerNumber', num);
    await reply(toast('ok', 'Owner Number Set', num));
  },
};
