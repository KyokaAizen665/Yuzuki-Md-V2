/**
 * Plugin: register
 * Category: rpg
 *
 * Register your profile so you appear on the leaderboard.
 * Sets registered: true, assigns a display name, and awards starter coins.
 *
 * Usage:
 *   .reg <name>       — register with a custom display name
 *   .register <name>  — alias
 */

import { loadDB, saveDB, initUserDB } from '../../lib/database.js';

const MAX_NAME = 20;

export default {
  name:        'register',
  aliases:     ['reg', 'signup', 'join'],
  category:    'rpg',
  description: 'Register your profile to appear on the leaderboard',
  usage:       '.reg <your name>',

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';
    const name   = args.join(' ').trim();

    if (!name) {
      await reply(
        `❌ *No name provided.*\n\n` +
        `Usage: \`${prefix}reg <your name>\`\n` +
        `Example: \`${prefix}reg Aizen\``,
      );
      return;
    }

    if (name.length > MAX_NAME) {
      await reply(`❌ Name too long — maximum ${MAX_NAME} characters.`);
      return;
    }

    // Ensure user record exists
    initUserDB(sender, msg.pushName ?? 'User');
    const db = loadDB();
    const u  = db.users[sender];

    // Already registered
    if (u.registered) {
      await sock.sendMessage(jid, {
        text:
          `✅ *Already Registered*\n` +
          `${'─'.repeat(22)}\n\n` +
          `📛 Name:   *${u.name}*\n` +
          `⭐ Level:  ${u.level ?? 0}\n` +
          `💰 Coins:  ${u.money ?? 0}\n\n` +
          `_Use \`${prefix}profile\` to view your full card._`,
      }, { quoted: msg });
      return;
    }

    // Register
    u.name       = name;
    u.registered = true;
    if (!Array.isArray(u.badges)) u.badges = [];
    if (!u.badges.includes('🌱 Newcomer')) u.badges.push('🌱 Newcomer');
    u.money = (u.money ?? 0) + 100;   // starter coin bonus

    saveDB(db);

    await sock.sendMessage(jid, {
      text:
        `🌸 *Welcome to Yuzuki MD, ${name}!*\n` +
        `${'─'.repeat(22)}\n\n` +
        `✅ Registration complete!\n\n` +
        `🌱 Badge:      🌱 Newcomer\n` +
        `💰 Starter:    +100 coins\n` +
        `⭐ Level:      ${u.level ?? 0}\n` +
        `✨ XP:         ${u.exp ?? 0}\n\n` +
        `_You now appear on the leaderboard!_\n\n` +
        `\`${prefix}profile\`  ·  \`${prefix}rank\`  ·  \`${prefix}leaderboard\``,
    }, { quoted: msg });
  },
};
