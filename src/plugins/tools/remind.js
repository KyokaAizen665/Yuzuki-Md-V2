/**
 * Plugin: remind
 * Category: tools
 *
 * Set, list, and cancel personal reminders.
 * Short-form sets immediately; bare command starts the guided workflow.
 *
 * Usage:
 *   .remind 30m Check the oven
 *   .remind 2h Team meeting
 *   .remind 1d Call doctor
 *   .remind              — start guided setup (workflow)
 *   .reminders           — list active reminders
 *   .cancelremind <ID>   — cancel one reminder
 *   .cancelremind all    — cancel all reminders
 */

import { workflowManager }                        from '../../workflows/manager.js';
import { addReminder, listReminders,
         cancelReminder, cancelAllReminders }     from '../../lib/reminder-service.js';
import { parseDelay, formatDelay, fireAtLabel }   from '../../lib/utility.js';
import { sendInteractive, copyButton }            from '../../lib/interactive.js';

export default {
  name:        'remind',
  aliases:     ['remindme', 'reminder', 'reminders', 'cancelremind', 'delremind', 'listremind'],
  category:    'tools',
  description: 'Set, list, and cancel personal reminders',
  usage:       '.remind <time> <message>  |  .reminders  |  .cancelremind <ID>',

  async execute({ sock, msg, reply, args, settings, prefix, sender }) {
    const jid     = msg.key.remoteJid;
    const command = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '')
      .trim()
      .split(/\s+/)[0]
      .toLowerCase()
      .slice((settings?.prefix ?? '.').length);

    // ── .reminders — list active ─────────────────────────────────────────────
    if (command === 'reminders' || command === 'listremind') {
      const list = listReminders(jid);
      if (!list.length) {
        await reply(`📭 *No active reminders.*\n\nUse \`${prefix}remind <time> <message>\` to set one.`);
        return;
      }
      const lines = list.map((r, i) =>
        `*${i + 1}.* \`${r.id}\`  ${fireAtLabel(r.fireAt)}\n    _${r.message.slice(0, 80)}_`,
      );
      const card = `⏰ *Your Reminders (${list.length})*\n${'─'.repeat(22)}\n\n${lines.join('\n\n')}\n\n_Cancel with \`${prefix}cancelremind <ID>\`_`;

      await sendInteractive(sock, jid, msg, {
        body:    card,
        footer:  settings?.botName ?? 'Yuzuki MD',
        buttons: [copyButton('📋 Copy List', card)],
      }, card);
      return;
    }

    // ── .cancelremind — cancel ───────────────────────────────────────────────
    if (command === 'cancelremind' || command === 'delremind') {
      const target = args[0]?.toLowerCase();
      if (!target) {
        await reply(`❌ Usage: \`${prefix}cancelremind <ID>\` or \`${prefix}cancelremind all\``);
        return;
      }
      if (target === 'all') {
        const n = cancelAllReminders(jid);
        await reply(n ? `✅ Cancelled *${n}* reminder${n > 1 ? 's' : ''}.` : `📭 No reminders to cancel.`);
        return;
      }
      const ok = cancelReminder(jid, target);
      await reply(ok ? `✅ Reminder \`${target.toUpperCase()}\` cancelled.` : `❌ Reminder ID \`${target.toUpperCase()}\` not found.`);
      return;
    }

    // ── .remind — set or start workflow ──────────────────────────────────────
    if (!args.length) {
      // No args → start guided workflow
      const result = await workflowManager.start(jid, 'remind', {}, { sock, msg, settings });
      if (!result.ok) await reply(`❌ ${result.error}`);
      return;
    }

    // Parse first token as delay
    const ms = parseDelay(args[0]);
    if (!ms) {
      await reply(
        `❌ Couldn't parse the time: \`${args[0]}\`\n\n` +
        `Supported formats: \`30m\` \`2h\` \`1h30m\` \`1d\`\n\n` +
        `Or just type \`${prefix}remind\` for guided setup.`,
      );
      return;
    }
    if (ms < 10_000) {
      await reply(`❌ Minimum reminder time is *10 seconds*.`);
      return;
    }
    if (ms > 30 * 24 * 60 * 60 * 1000) {
      await reply(`❌ Maximum reminder time is *30 days*.`);
      return;
    }

    const message = args.slice(1).join(' ').trim();
    if (!message) {
      await reply(
        `❌ Missing message!\n\n` +
        `Usage: \`${prefix}remind ${args[0]} <your message>\`\n` +
        `Example: \`${prefix}remind 30m Take medicine\``,
      );
      return;
    }

    const r = addReminder(jid, sender, message, Date.now() + ms);

    const card =
      `✅ *Reminder Set!*\n${'─'.repeat(22)}\n\n` +
      `📝 _${message}_\n\n` +
      `⏱️ *In:*  ${formatDelay(ms)}\n` +
      `🆔 *ID:*  \`${r.id}\`\n\n` +
      `_Use \`${prefix}cancelremind ${r.id}\` to cancel._`;

    await sendInteractive(sock, jid, msg, {
      body:    card,
      footer:  settings?.botName ?? 'Yuzuki MD',
      buttons: [
        copyButton('📋 Copy', card),
      ],
    }, card);
  },
};
