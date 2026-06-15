/**
 * Plugin: shop
 * Category: economy
 *
 * Browse the item shop, buy items with coins, or sell inventory items.
 *
 * Usage:
 *   .shop              — browse shop catalog
 *   .shop buy <item> [qty]   — purchase item(s)
 *   .shop sell <item> [qty]  — sell from inventory (60% base value)
 *   .shop sell all           — sell entire inventory
 *
 * Buy items: seeds for farming, consumables
 * Sell items: any item in inventory
 */

import { loadDB, addCoins, spendCoins, initUserDB } from '../../lib/database.js';
import { addItem, removeItem, getInventory, getGU } from '../../lib/games-db.js';
import {
  SHOP_CATALOG, ITEMS, getItem, formatItem, sellPrice,
} from '../../lib/items.js';

const SHOP_BY_ID = Object.fromEntries(SHOP_CATALOG.map(e => [e.itemId, e]));

function groupedShop() {
  const groups = {};
  for (const entry of SHOP_CATALOG) {
    const item = ITEMS[entry.itemId];
    if (!item) continue;
    if (!groups[entry.category]) groups[entry.category] = [];
    groups[entry.category].push({ ...entry, item });
  }
  return groups;
}

export default {
  name:        'shop',
  aliases:     ['store', 'market', 'buy', 'sell'],
  category:    'economy',
  description: 'Buy items with coins or sell inventory for coins',
  usage:       '.shop  |  .shop buy <item> [qty]  |  .shop sell <item> [qty]',

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';
    const sub    = args[0]?.toLowerCase();

    // ── Browse ────────────────────────────────────────────────────────────────
    if (!sub || sub === 'browse' || sub === 'list') {
      const groups = groupedShop();
      const db     = loadDB();
      initUserDB(sender);
      const coins  = db.users[sender]?.money ?? 0;

      let text = `🛒 *Shop*\n${'─'.repeat(22)}\n💰 Your balance: *${coins} coins*\n`;
      for (const [cat, entries] of Object.entries(groups)) {
        text += `\n*${cat}*\n`;
        for (const { item, price, itemId } of entries) {
          text += `  ${item.emoji} ${item.name}  — *${price}🪙*  (\`${prefix}shop buy ${itemId}\`)\n`;
        }
      }
      text +=
        `\n${'─'.repeat(22)}\n` +
        `_Sell any item at 60% value:_\n` +
        `\`${prefix}shop sell <item> [qty]\`\n` +
        `\`${prefix}shop sell all\` — sell everything`;
      await sock.sendMessage(jid, { text }, { quoted: msg });
      return;
    }

    // ── Buy ───────────────────────────────────────────────────────────────────
    if (sub === 'buy') {
      const itemId = args[1]?.toLowerCase();
      const qty    = Math.max(1, parseInt(args[2]) || 1);

      if (!itemId) {
        await reply(`❌ Usage: \`${prefix}shop buy <item> [qty]\`\n_e.g. \`${prefix}shop buy wheat_seed 5\`_`);
        return;
      }

      const entry = SHOP_BY_ID[itemId] ?? SHOP_CATALOG.find(e => ITEMS[e.itemId]?.name.toLowerCase() === itemId);
      if (!entry) {
        await reply(`❌ *${itemId}* is not for sale in the shop.\nBrowse items: \`${prefix}shop\``);
        return;
      }

      const totalCost = entry.price * qty;
      initUserDB(sender);
      const db    = loadDB();
      const coins = db.users[sender]?.money ?? 0;

      if (coins < totalCost) {
        await reply(
          `❌ Not enough coins!\n\n` +
          `Cost:      *${totalCost} coins* (${qty} × ${entry.price})\n` +
          `Balance:   *${coins} coins*\n` +
          `Needed:    *${totalCost - coins} more coins*`,
        );
        return;
      }

      spendCoins(sender, totalCost);
      addItem(sender, entry.itemId, qty);

      const item = ITEMS[entry.itemId];
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
      await reply(
        `✅ *Purchase Successful!*\n\n` +
        `${item.emoji} *${item.name}* ×${qty}\n` +
        `💰 Paid: *${totalCost} coins*\n` +
        `💳 Remaining: *${coins - totalCost} coins*`,
      );
      return;
    }

    // ── Sell ──────────────────────────────────────────────────────────────────
    if (sub === 'sell') {
      const itemArg = args[1]?.toLowerCase();
      const qtyArg  = parseInt(args[2]) || null;

      if (!itemArg) {
        await reply(`❌ Usage: \`${prefix}shop sell <item> [qty]\`  or  \`${prefix}shop sell all\``);
        return;
      }

      initUserDB(sender);
      const inv = getInventory(sender);

      // Sell ALL
      if (itemArg === 'all') {
        const entries = Object.entries(inv).filter(([, q]) => q > 0);
        if (!entries.length) { await reply(`📦 Your inventory is empty.`); return; }
        let total = 0;
        const sold = [];
        for (const [id, qty] of entries) {
          const sp = sellPrice(id);
          if (!sp) continue;
          total += sp * qty;
          sold.push(`${ITEMS[id]?.emoji ?? '📦'} ${ITEMS[id]?.name ?? id} ×${qty} (+${sp * qty}🪙)`);
          removeItem(sender, id, qty);
        }
        addCoins(sender, total);
        const db = loadDB();
        await reply(
          `🛒 *Sold All Items!*\n${'─'.repeat(22)}\n\n` +
          sold.slice(0, 10).join('\n') +
          (sold.length > 10 ? `\n…and ${sold.length - 10} more` : '') +
          `\n\n💰 Total earned: *+${total} coins*\n` +
          `💳 New balance: *${db.users[sender]?.money ?? 0} coins*`,
        );
        return;
      }

      // Sell specific item
      const item   = getItem(itemArg) ?? Object.values(ITEMS).find(i => i.name.toLowerCase() === itemArg);
      if (!item) { await reply(`❌ Unknown item: *${itemArg}*`); return; }

      const inInv  = inv[item.id] ?? 0;
      if (!inInv)  { await reply(`❌ You don't have any *${item.name}* to sell.`); return; }

      const qty    = Math.min(qtyArg ?? inInv, inInv);
      const sp     = sellPrice(item.id);
      const total  = sp * qty;

      removeItem(sender, item.id, qty);
      addCoins(sender, total);
      const db = loadDB();

      await sock.sendMessage(jid, { react: { text: '💰', key: msg.key } }).catch(() => {});
      await reply(
        `💰 *Sold!*\n\n` +
        `${item.emoji} ${item.name} ×${qty}\n` +
        `💰 Earned: *+${total} coins* _(${sp}🪙 each)_\n` +
        `💳 Balance: *${db.users[sender]?.money ?? 0} coins*`,
      );
      return;
    }

    await reply(`❓ Unknown subcommand.\nUse: \`${prefix}shop\` · \`${prefix}shop buy\` · \`${prefix}shop sell\``);
  },
};
