/**
 * Plugin: inventory
 * Category: economy
 *
 * View your item inventory, grouped by category.
 * Shows item emojis, names, quantities, and total sell value.
 *
 * Usage:
 *   .inventory         — view your full inventory
 *   .inv               — alias
 *   .inventory fish    — show only fish items
 *   .inventory ore     — show only ores
 */

import { getInventory }              from '../../lib/games-db.js';
import { getItem, formatItem, ITEMS, sellPrice } from '../../lib/items.js';

const TYPE_LABELS = {
  fish:       '🎣 Fish',
  prey:       '🏹 Hunt Loot',
  ore:        '⛏️ Ores & Gems',
  crop:       '🌾 Harvest',
  seed:       '🌱 Seeds',
  consumable: '🧪 Consumables',
  misc:       '📦 Misc',
};

export default {
  name:        'inventory',
  aliases:     ['inv', 'bag', 'items', 'backpack'],
  category:    'economy',
  description: 'View your item inventory grouped by type with sell values',
  usage:       '.inventory [type]',

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';
    const filter = args[0]?.toLowerCase();

    const inv = getInventory(sender);
    const entries = Object.entries(inv).filter(([, qty]) => qty > 0);

    if (!entries.length) {
      await reply(
        `📦 *Your Inventory is Empty*\n\n` +
        `Start collecting items:\n` +
        `• \`${prefix}fish\` — catch fish\n` +
        `• \`${prefix}hunt\` — hunt animals\n` +
        `• \`${prefix}mine\` — mine ores\n` +
        `• \`${prefix}farm\` — grow crops\n` +
        `• \`${prefix}shop\` — buy seeds`,
      );
      return;
    }

    // Group by type
    const groups = {};
    let totalSellValue = 0;

    for (const [id, qty] of entries) {
      const item = getItem(id);
      if (!item) continue;
      if (filter && item.type !== filter) continue;
      if (!groups[item.type]) groups[item.type] = [];
      const sv = sellPrice(id) * qty;
      totalSellValue += sv;
      groups[item.type].push({ item, qty, sv });
    }

    const groupKeys = Object.keys(groups);
    if (!groupKeys.length) {
      await reply(`📦 No items of type *${filter}* in your inventory.`);
      return;
    }

    let text = `📦 *Inventory*\n${'─'.repeat(22)}\n`;

    for (const type of ['fish', 'prey', 'ore', 'crop', 'seed', 'consumable', 'misc']) {
      const group = groups[type];
      if (!group?.length) continue;
      text += `\n*${TYPE_LABELS[type] ?? type}*\n`;
      for (const { item, qty, sv } of group.sort((a, b) => b.item.value - a.item.value)) {
        text += `  ${item.emoji} ${item.name} ×${qty}  _(sell: ${sv}🪙)_\n`;
      }
    }

    text +=
      `\n${'─'.repeat(22)}\n` +
      `💰 Total sell value: *${totalSellValue} coins*\n` +
      `_Use \`${prefix}shop sell <item>\` to sell items_`;

    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
