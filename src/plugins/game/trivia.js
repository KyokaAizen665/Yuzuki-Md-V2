/**
 * CONSOLIDATED — legacy trivia plugin
 *
 * The full trivia game is now provided by src/games/plugins/trivia.js,
 * which uses the Games Framework engine (sessions, leaderboard, rewards).
 *
 * This file is a tombstone to prevent the old plugin from registering
 * a duplicate "trivia" command and overriding the new engine version.
 *
 * Do not add logic here. Edit src/games/plugins/trivia.js instead.
 */

export default {
  name:        '_trivia_legacy',
  category:    'game',
  description: 'Stub — superseded by games framework trivia',
  execute:     async ({ reply, settings }) => {
    const prefix = settings?.prefix ?? '.';
    await reply(`🎯 Use *${prefix}trivia* to play trivia via the Games Framework.`);
  },
};
