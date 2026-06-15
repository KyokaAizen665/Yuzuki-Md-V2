/**
 * Plugin: timezone
 * Category: tools
 *
 * Show current time in any city or IANA timezone identifier.
 * Uses the built-in Intl.DateTimeFormat — no external API needed.
 *
 * Usage:
 *   .time Tokyo
 *   .time America/New_York
 *   .time London
 *   .time Dubai
 */

import { sendInteractive, copyButton, selectButton } from '../../lib/interactive.js';

// ── City → IANA timezone lookup table ──────────────────────────────────────────
const CITY_TZ = {
  // Americas
  'new york':       'America/New_York',
  'los angeles':    'America/Los_Angeles',
  'chicago':        'America/Chicago',
  'toronto':        'America/Toronto',
  'vancouver':      'America/Vancouver',
  'mexico city':    'America/Mexico_City',
  'sao paulo':      'America/Sao_Paulo',
  'buenos aires':   'America/Argentina/Buenos_Aires',
  'lima':           'America/Lima',
  'bogota':         'America/Bogota',
  'santiago':       'America/Santiago',
  'miami':          'America/New_York',
  'houston':        'America/Chicago',
  'denver':         'America/Denver',
  'phoenix':        'America/Phoenix',
  'seattle':        'America/Los_Angeles',
  'san francisco':  'America/Los_Angeles',
  'new orleans':    'America/Chicago',
  'havana':         'America/Havana',
  'caracas':        'America/Caracas',

  // Europe
  'london':         'Europe/London',
  'paris':          'Europe/Paris',
  'berlin':         'Europe/Berlin',
  'madrid':         'Europe/Madrid',
  'rome':           'Europe/Rome',
  'amsterdam':      'Europe/Amsterdam',
  'brussels':       'Europe/Brussels',
  'stockholm':      'Europe/Stockholm',
  'oslo':           'Europe/Oslo',
  'copenhagen':     'Europe/Copenhagen',
  'helsinki':       'Europe/Helsinki',
  'zurich':         'Europe/Zurich',
  'geneva':         'Europe/Zurich',
  'vienna':         'Europe/Vienna',
  'warsaw':         'Europe/Warsaw',
  'prague':         'Europe/Prague',
  'budapest':       'Europe/Budapest',
  'bucharest':      'Europe/Bucharest',
  'athens':         'Europe/Athens',
  'istanbul':       'Europe/Istanbul',
  'moscow':         'Europe/Moscow',
  'kyiv':           'Europe/Kiev',
  'lisbon':         'Europe/Lisbon',

  // Asia
  'dubai':          'Asia/Dubai',
  'abu dhabi':      'Asia/Dubai',
  'riyadh':         'Asia/Riyadh',
  'kuwait':         'Asia/Kuwait',
  'doha':           'Asia/Qatar',
  'bahrain':        'Asia/Bahrain',
  'muscat':         'Asia/Muscat',
  'tehran':         'Asia/Tehran',
  'baghdad':        'Asia/Baghdad',
  'amman':          'Asia/Amman',
  'beirut':         'Asia/Beirut',
  'jerusalem':      'Asia/Jerusalem',
  'tel aviv':       'Asia/Jerusalem',
  'karachi':        'Asia/Karachi',
  'islamabad':      'Asia/Karachi',
  'lahore':         'Asia/Karachi',
  'delhi':          'Asia/Kolkata',
  'mumbai':         'Asia/Kolkata',
  'kolkata':        'Asia/Kolkata',
  'bangalore':      'Asia/Kolkata',
  'chennai':        'Asia/Kolkata',
  'hyderabad':      'Asia/Kolkata',
  'dhaka':          'Asia/Dhaka',
  'kathmandu':      'Asia/Kathmandu',
  'colombo':        'Asia/Colombo',
  'kabul':          'Asia/Kabul',
  'tashkent':       'Asia/Tashkent',
  'almaty':         'Asia/Almaty',
  'yangon':         'Asia/Rangoon',
  'bangkok':        'Asia/Bangkok',
  'ho chi minh':    'Asia/Ho_Chi_Minh',
  'hanoi':          'Asia/Bangkok',
  'phnom penh':     'Asia/Phnom_Penh',
  'vientiane':      'Asia/Vientiane',
  'singapore':      'Asia/Singapore',
  'kuala lumpur':   'Asia/Kuala_Lumpur',
  'jakarta':        'Asia/Jakarta',
  'bali':           'Asia/Makassar',
  'manila':         'Asia/Manila',
  'hong kong':      'Asia/Hong_Kong',
  'macau':          'Asia/Macau',
  'taipei':         'Asia/Taipei',
  'beijing':        'Asia/Shanghai',
  'shanghai':       'Asia/Shanghai',
  'chengdu':        'Asia/Shanghai',
  'shenzhen':       'Asia/Shanghai',
  'seoul':          'Asia/Seoul',
  'pyongyang':      'Asia/Pyongyang',
  'tokyo':          'Asia/Tokyo',
  'osaka':          'Asia/Tokyo',
  'ulaanbaatar':    'Asia/Ulaanbaatar',

  // Africa
  'cairo':          'Africa/Cairo',
  'tunis':          'Africa/Tunis',
  'algiers':        'Africa/Algiers',
  'casablanca':     'Africa/Casablanca',
  'tripoli':        'Africa/Tripoli',
  'lagos':          'Africa/Lagos',
  'nairobi':        'Africa/Nairobi',
  'addis ababa':    'Africa/Addis_Ababa',
  'johannesburg':   'Africa/Johannesburg',
  'cape town':      'Africa/Johannesburg',
  'accra':          'Africa/Accra',
  'dakar':          'Africa/Dakar',
  'abidjan':        'Africa/Abidjan',
  'kampala':        'Africa/Kampala',
  'dar es salaam':  'Africa/Dar_es_Salaam',
  'khartoum':       'Africa/Khartoum',
  'lusaka':         'Africa/Lusaka',
  'harare':         'Africa/Harare',
  'maputo':         'Africa/Maputo',
  'antananarivo':   'Indian/Antananarivo',

  // Pacific / Oceania
  'sydney':         'Australia/Sydney',
  'melbourne':      'Australia/Melbourne',
  'brisbane':       'Australia/Brisbane',
  'perth':          'Australia/Perth',
  'adelaide':       'Australia/Adelaide',
  'auckland':       'Pacific/Auckland',
  'wellington':     'Pacific/Auckland',
  'honolulu':       'Pacific/Honolulu',
  'fiji':           'Pacific/Fiji',
  'guam':           'Pacific/Guam',
  'port moresby':   'Pacific/Port_Moresby',
  'suva':           'Pacific/Fiji',
};

function lookupTimezone(input) {
  const key = input.toLowerCase().trim();
  // 1. Direct city lookup
  if (CITY_TZ[key]) return CITY_TZ[key];
  // 2. Partial city match
  const partial = Object.keys(CITY_TZ).find(c => c.includes(key) || key.includes(c));
  if (partial) return CITY_TZ[partial];
  // 3. Try as IANA identifier (e.g. "Asia/Tokyo", "UTC+5", "EST")
  return input; // will throw if invalid
}

function getOffsetStr(tz) {
  try {
    const now    = new Date();
    const utcMs  = now.getTime() + (now.getTimezoneOffset() * 60000);
    const parts  = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(now);
    const tzStr  = parts.find(p => p.type === 'timeZoneName')?.value ?? '';
    return tzStr;
  } catch {
    return '';
  }
}

export default {
  name:        'time',
  aliases:     ['timezone', 'tz', 'clock', 'worldclock'],
  category:    'tools',
  description: 'Current time in any city or timezone worldwide',
  usage:       '.time <city or timezone>',

  async execute({ sock, msg, reply, args, settings, prefix }) {
    const jid = msg.key.remoteJid;

    if (!args.length) {
      await reply(
        `❌ Usage: \`${prefix}time <city>\`\n\n` +
        `Examples:\n` +
        `• \`${prefix}time Tokyo\`\n` +
        `• \`${prefix}time New York\`\n` +
        `• \`${prefix}time London\`\n` +
        `• \`${prefix}time Asia/Kolkata\`  _(IANA timezone)_`,
      );
      return;
    }

    const input = args.join(' ').trim();
    let tz;

    try {
      tz = lookupTimezone(input);
    } catch {
      await reply(`❌ Unknown city or timezone: *${input}*`);
      return;
    }

    // Validate the timezone
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
    } catch {
      await reply(
        `❌ Unknown city or timezone: *${input}*\n\n` +
        `Try using a city name (e.g. \`Tokyo\`, \`London\`) or an IANA ID (e.g. \`America/New_York\`).`,
      );
      return;
    }

    const now = new Date();

    const dateFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    });
    const time24  = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });

    const dateStr = dateFmt.format(now);
    const timeStr = timeFmt.format(now);
    const time24s = time24.format(now);
    const offset  = getOffsetStr(tz);

    // Find display name
    const displayName = Object.entries(CITY_TZ).find(([, v]) => v === tz)?.[0] ?? input;
    const cityLabel   = displayName.replace(/\b\w/g, c => c.toUpperCase());
    const tzDisplay   = tz.replace(/_/g, ' ');

    const card = [
      `🕐 *${cityLabel}*`,
      `${'─'.repeat(22)}`,
      ``,
      `🕰️ *Time:*   ${timeStr}`,
      `⏰ *24h:*    ${time24s}`,
      `📅 *Date:*   ${dateStr}`,
      `🌐 *Zone:*   ${tzDisplay}`,
      offset ? `🌍 *Offset:* ${offset}` : '',
    ].filter(Boolean).join('\n');

    const quickCities = [
      ['🇺🇸 New York', 'New York'],
      ['🇬🇧 London',   'London'],
      ['🇩🇪 Berlin',   'Berlin'],
      ['🇦🇪 Dubai',    'Dubai'],
      ['🇮🇳 Mumbai',   'Mumbai'],
      ['🇯🇵 Tokyo',    'Tokyo'],
      ['🇸🇬 Singapore','Singapore'],
      ['🇦🇺 Sydney',   'Sydney'],
    ].filter(([, c]) => c.toLowerCase() !== input.toLowerCase()).slice(0, 5);

    await sendInteractive(sock, jid, msg, {
      body:    card,
      footer:  settings?.botName ?? 'Yuzuki MD',
      buttons: [
        copyButton('📋 Copy', card),
        selectButton('🌍 World Clocks', quickCities.map(([label, city]) => ({
          title:   label,
          rowId:   `${prefix}time ${city}`,
          description: city,
        })), 'Quick Cities'),
      ],
    }, card);
  },
};
