/**
 * Plugin: dice
 * Category: game
 *
 * Roll one or more dice with optional custom sides.
 * Usage:
 *   .dice           → 1d6
 *   .dice 2d6       → two six-sided dice
 *   .dice 1d20      → one twenty-sided die
 *   .dice 3         → roll dice 3 times
 */

export default {
  name:        'dice',
  aliases:     ['roll', 'rolldice'],
  category:    'game',
  description: 'Roll dice — supports NdS notation (e.g. 2d6, 1d20)',
  usage:       '.dice | .dice <count>d<sides> | .dice 2d6',

  async execute({ reply, args }) {
    const input = (args[0] ?? '1d6').toLowerCase();
    const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];

    // Parse NdS notation
    const match = input.match(/^(\d+)d(\d+)$/) ?? input.match(/^(\d+)$/);
    let count = 1, sides = 6;

    if (match) {
      if (match[2]) { count = parseInt(match[1]); sides = parseInt(match[2]); }
      else           { count = parseInt(match[1]); }
    }

    count = Math.min(count, 10);
    sides = Math.min(Math.max(sides, 2), 100);

    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = rolls.reduce((a, b) => a + b, 0);

    // Use emoji faces for d6
    const rollStr = sides === 6
      ? rolls.map(r => faces[r - 1]).join('  ')
      : rolls.map(r => `[${r}]`).join('  ');

    const desc = count > 1 ? `${count}d${sides}` : `d${sides}`;
    const sum  = count > 1 ? `\n*Total:* ${total}` : '';

    await reply(`🎲 *Dice Roll* (${desc})\n\n${rollStr}${sum}`);
  },
};
