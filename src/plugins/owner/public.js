/**
 * Plugin: public
 * Category: owner
 * Migrated from commands.js case "public"
 */

import { setSetting, isOwner } from '../../settings.js';
import { toggle } from '../../utils/ui.js';

export default {
  name:        'public',
  aliases:     ['publicmode'],
  category:    'owner',
  description: 'Set bot to public mode — responds to everyone',
  usage:       '.public',
  permissions: ['owner'],

  async execute({ reply, sender, settings }) {
    if (!isOwner(sender, settings)) { await reply('⛔ This command is restricted to bot owners.'); return; }
    setSetting('mode', 'public');
    await reply(toggle('🌍', 'Bot Mode', true, 'Responds to everyone'));
  },
};
