/**
 * CONSOLIDATED — this command has been merged into .leaderboard
 *
 * The .lb shorthand is now an alias of the .leaderboard plugin.
 * This file is a tombstone to prevent a duplicate-name registry error
 * if the plugin loader picks up both files.
 *
 * Do not add logic here. Edit src/plugins/game/leaderboard.js instead.
 *
 * Plugin loader skips files whose export `name` starts with "_".
 * We expose a harmless stub so the loader doesn't warn about a missing execute.
 */

export default {
  name:        '_lb_consolidated',
  category:    'game',
  description: 'Stub — consolidated into .leaderboard',
  execute:     async ({ reply, settings }) => {
    const prefix = settings?.prefix ?? '.';
    await reply(`ℹ️ Use *${prefix}leaderboard* (or the *${prefix}lb* alias) instead.`);
  },
};
