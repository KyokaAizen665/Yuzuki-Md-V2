/**
 * Plugin: search
 * Category: tools
 *
 * Full-text command search across the registry.
 * Searches names, aliases, descriptions, and usages.
 * Sends results as a NativeFlow interactive select-list card.
 * All results come from the live registry — no hardcoded content.
 */

import { searchCard } from '../../nativeflow/index.js';

export default {
  name:        'search',
  aliases:     ['find', 'lookup', 'searchcmd'],
  category:    'tools',
  description: 'Search commands by keyword across names, aliases and descriptions',
  usage:       '.search <query>',

  async execute({ sock, msg, reply, args, settings }) {
    const jid     = msg.key.remoteJid;
    const query   = args.join(' ').trim();
    const prefix  = settings?.prefix  ?? '.';
    const botName = settings?.botName ?? 'Yuzuki MD';

    if (!query) {
      await reply(
        `🔍 *Usage:* ${prefix}search <keyword>\n` +
        `_Example:_ ${prefix}search download`,
      );
      return;
    }

    await searchCard(sock, jid, msg, query, { prefix, botName, limit: 10 });
  },
};
