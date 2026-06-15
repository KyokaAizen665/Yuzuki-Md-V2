/**
 * Plugin: pay
 * Category: economy
 *
 * Transfer coins from your wallet to another user.
 *
 * Usage:
 *   .pay @user <amount>      — send coins to a mentioned user
 *   .transfer @user <amount> — alias
 *
 * Constraints:
 *   - Cannot pay yourself
 *   - Amount must be ≥ 1 and ≤ your wallet balance
 *   - Target must be a registered user
 */

import { loadDB, addCoins, spendCoins, initUserDB } from '../../lib/database.js';

export default {
  name:        'pay',
  aliases:     ['transfer', 'send', 'givecoin', 'sendcoins'],
  category:    'economy',
  description: 'Send coins to another user',
  usage:       '.pay @user <amount>',

  async execute({ sock, msg, reply, sender, args, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    const targetJid = mentioned[0];

    const amountArg = args.find(a => /^\d+$/.test(a));
    const amount    = amountArg ? parseInt(amountArg) : 0;

    if (!targetJid || !amount) {
      await reply(
        `💸 *Pay*\n\nUsage: \`${prefix}pay @user <amount>\`\n\n` +
        `_Example:_ \`${prefix}pay @friend 500\``,
      );
      return;
    }

    if (targetJid === sender) {
      await reply(`❌ You cannot pay yourself!`);
      return;
    }

    if (amount < 1) {
      await reply(`❌ Amount must be at least *1 coin*.`);
      return;
    }

    initUserDB(sender);
    initUserDB(targetJid);
    const db    = loadDB();
    const aUser = db.users[sender]    ?? {};
    const bUser = db.users[targetJid] ?? {};

    if (!bUser.registered && !bUser.name) {
      await reply(`❌ That user has not registered yet. They need to use the bot first!`);
      return;
    }

    const balance = aUser.money ?? 0;
    if (balance < amount) {
      await reply(
        `❌ Insufficient coins!\n\n` +
        `Your balance: *${balance} coins*\n` +
        `Requested:    *${amount} coins*`,
      );
      return;
    }

    spendCoins(sender, amount);
    addCoins(targetJid, amount);

    const freshDB   = loadDB();
    const newBal    = freshDB.users[sender]?.money ?? 0;
    const targetName = bUser.name ?? 'User';

    await sock.sendMessage(jid, { react: { text: '💸', key: msg.key } }).catch(() => {});
    await reply(
      `💸 *Payment Sent!*\n${'─'.repeat(22)}\n\n` +
      `To:       *${targetName}*\n` +
      `Amount:   *${amount} coins*\n` +
      `Balance:  *${newBal} coins* remaining`,
    );
  },
};
