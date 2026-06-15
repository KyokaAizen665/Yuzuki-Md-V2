/**
 * Plugin: setprefix
 * Category: owner
 * Migrated from commands.js case "setprefix"
 */

import { setSetting, isOwner } from '../../settings.js';
import { toast } from '../../utils/ui.js';

export default {
  name:        'setprefix',
  aliases:     [],
  category:    'owner',
  description: 'Change the bot command prefix',
  usage:       '.setprefix <prefix>',
  permissions: ['owner'],

  async execute({ reply, args, sender, settings, prefix }) {
    if (!isOwner(sender, settings)) { await reply('⛔ This command is restricted to bot owners.'); return; }
    const np = args[0];
    if (!np) { await reply(toast('info', 'Usage', `${prefix}setprefix <new_prefix>`)); return; }
    setSetting('prefix', np);
    await reply(toast('ok', 'Prefix Updated', `\`${np}\``));
  },
};
