/**
 * Plugin: restart
 * Category: owner
 * Migrated from commands.js case "restart"
 */

import { stopBot, startBot } from '../../bot.js';
import { isOwner } from '../../settings.js';
import { progress } from '../../utils/ui.js';

export default {
  name:        'restart',
  aliases:     ['reboot'],
  category:    'owner',
  description: 'Restart the bot process',
  usage:       '.restart',
  permissions: ['owner'],

  async execute({ reply, sender, settings }) {
    if (!isOwner(sender, settings)) { await reply('⛔ This command is restricted to bot owners.'); return; }
    await reply(progress('♻️', 'Restarting Bot', 'Back online in a few seconds...'));
    await stopBot();
    setTimeout(() => startBot().catch(console.error), 1500);
  },
};
