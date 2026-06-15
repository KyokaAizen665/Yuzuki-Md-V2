/**
 * Plugin: shutdown
 * Category: owner
 *
 * Gracefully stops the bot and exits the Node.js process.
 * The bot must be manually restarted (or via a process manager like PM2).
 */

import { stopBot } from '../../bot.js';
import { isOwner } from '../../settings.js';
import { progress } from '../../utils/ui.js';

export default {
  name:        'shutdown',
  aliases:     ['off'],
  category:    'owner',
  description: 'Shut the bot down completely (requires manual restart)',
  usage:       '.shutdown',
  permissions: ['owner'],

  async execute({ reply, sender, settings }) {
    if (!isOwner(sender, settings)) { await reply('⛔ This command is restricted to bot owners.'); return; }
    await reply(progress('🛑', 'Shutting Down', 'Bot is going offline. Restart manually or via PM2 to bring it back.'));
    await new Promise(r => setTimeout(r, 1200));
    try { await stopBot(); } catch {}
    process.exit(0);
  },
};
