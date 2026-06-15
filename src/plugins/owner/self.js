/**
 * Plugin: self
 * Category: owner
 * Migrated from commands.js case "self"
 */

import { setSetting, isOwner } from '../../settings.js';
import { toggle } from '../../utils/ui.js';

export default {
  name:        'self',
  aliases:     ['selfmode', 'private'],
  category:    'owner',
  description: 'Set bot to self mode — responds to owner only',
  usage:       '.self',
  permissions: ['owner'],

  async execute({ reply, sender, settings }) {
    if (!isOwner(sender, settings)) { await reply('⛔ This command is restricted to bot owners.'); return; }
    setSetting('mode', 'self');
    await reply(toggle('🔒', 'Bot Mode  •  Self', true, 'Responds to owner only'));
  },
};
