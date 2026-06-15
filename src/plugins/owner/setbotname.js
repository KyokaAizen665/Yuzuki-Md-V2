/**
 * Plugin: setbotname
 * Category: owner
 * Migrated from commands.js case "setbotname"
 */

import { setSetting, isOwner } from '../../settings.js';
import { toast } from '../../utils/ui.js';

export default {
  name:        'setbotname',
  aliases:     ['botname'],
  category:    'owner',
  description: 'Change the bot display name',
  usage:       '.setbotname <name>',
  permissions: ['owner'],

  async execute({ reply, args, sender, settings, prefix }) {
    if (!isOwner(sender, settings)) { await reply('⛔ This command is restricted to bot owners.'); return; }
    const name = args.join(' ').trim();
    if (!name) { await reply(toast('info', 'Usage', `${prefix}setbotname <name>`)); return; }
    setSetting('botName', name);
    await reply(toast('ok', 'Bot Name Updated', name));
  },
};
