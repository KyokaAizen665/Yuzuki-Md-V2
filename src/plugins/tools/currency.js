/**
 * Plugin: currency
 * Category: tools
 *
 * Real-time currency conversion via Frankfurter.app (free, no API key).
 *
 * Usage:
 *   .currency 100 USD EUR
 *   .currency 50 EUR GBP JPY    — multiple targets
 *   .currency USD               — rates vs USD
 */

import { httpGetJson }                                          from '../../lib/utility.js';
import { sendInteractive, copyButton, selectButton }           from '../../lib/interactive.js';

const CURRENCY_FLAGS = {
  USD:'🇺🇸', EUR:'🇪🇺', GBP:'🇬🇧', JPY:'🇯🇵', CNY:'🇨🇳', INR:'🇮🇳',
  AUD:'🇦🇺', CAD:'🇨🇦', CHF:'🇨🇭', HKD:'🇭🇰', SGD:'🇸🇬', MYR:'🇲🇾',
  IDR:'🇮🇩', THB:'🇹🇭', PHP:'🇵🇭', KRW:'🇰🇷', AED:'🇦🇪', SAR:'🇸🇦',
  BRL:'🇧🇷', MXN:'🇲🇽', ZAR:'🇿🇦', NGN:'🇳🇬', EGP:'🇪🇬', PKR:'🇵🇰',
  BDT:'🇧🇩', TRY:'🇹🇷', RUB:'🇷🇺', SEK:'🇸🇪', NOK:'🇳🇴', DKK:'🇩🇰',
};

function flag(code) { return CURRENCY_FLAGS[code?.toUpperCase()] ?? '💱'; }

function fmtRate(n) {
  if (n >= 1000)  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1)     return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return n.toFixed(6);
}

export default {
  name:        'currency',
  aliases:     ['forex', 'exrate', 'exchange', 'curr'],
  category:    'tools',
  description: 'Real-time currency conversion — Frankfurter.app (free, no key)',
  usage:       '.currency <amount> <FROM> <TO> [TO2 …]',

  async execute({ sock, msg, reply, args, settings, prefix }) {
    const jid = msg.key.remoteJid;

    // ── Parse args ───────────────────────────────────────────────────────────
    let amount = 1;
    let from;
    let targets;

    if (!args.length) {
      await reply(
        `❌ Usage: \`${prefix}currency <amount> <FROM> <TO>\`\n\n` +
        `Examples:\n` +
        `• \`${prefix}currency 100 USD EUR\`\n` +
        `• \`${prefix}currency 50 GBP IDR\`\n` +
        `• \`${prefix}currency USD\`  — rates from USD`,
      );
      return;
    }

    if (/^\d/.test(args[0])) {
      amount = parseFloat(args[0]);
      from   = (args[1] ?? 'USD').toUpperCase();
      targets = args.slice(2).map(a => a.toUpperCase()).filter(Boolean);
    } else {
      from    = args[0].toUpperCase();
      targets = args.slice(1).map(a => a.toUpperCase()).filter(Boolean);
    }

    if (!targets.length) targets = ['USD','EUR','GBP','JPY','AED','INR'].filter(c => c !== from);

    // ── Fetch ────────────────────────────────────────────────────────────────
    let data;
    try {
      const url = `https://api.frankfurter.app/latest?from=${from}&amount=${amount}&to=${targets.join(',')}`;
      data = await httpGetJson(url);
    } catch {
      await reply(`❌ Currency service unavailable. Try again later.`);
      return;
    }

    if (data.error || !data.rates) {
      await reply(`❌ Unknown currency code *${from}*. Use standard ISO codes (USD, EUR, GBP…).`);
      return;
    }

    // ── Build card ────────────────────────────────────────────────────────────
    const rateLines = Object.entries(data.rates).map(([code, val]) =>
      `  ${flag(code)} *${code}:*  ${fmtRate(val)}`,
    );

    const card = [
      `💱 *Currency Conversion*`,
      `${'─'.repeat(24)}`,
      ``,
      `${flag(from)} *${amount.toLocaleString()} ${from}  =*`,
      ``,
      ...rateLines,
      ``,
      `_📅 Rate date: ${data.date ?? 'latest'} · Frankfurter.app_`,
    ].join('\n');

    const popular = ['USD','EUR','GBP','JPY','AED','IDR','INR','SGD'].filter(c => c !== from).slice(0, 5);

    await sendInteractive(sock, jid, msg, {
      body:    card,
      footer:  settings?.botName ?? 'Yuzuki MD',
      buttons: [
        copyButton('📋 Copy Rates', card),
        selectButton('🔄 Quick Convert', popular.map(c => ({
          title:       `${flag(c)} ${c}`,
          description: `Convert ${amount} ${from} → ${c}`,
          rowId:       `${prefix}currency ${amount} ${from} ${c}`,
        })), 'Popular Currencies'),
      ],
    }, card);
  },
};
