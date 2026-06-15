/**
 * Plugin: weather
 * Category: tools
 *
 * Current weather + 3-day forecast for any city, powered by Open-Meteo (free, no key).
 *
 * Usage:
 *   .weather <city>
 *   .weather Tokyo
 *   .weather New York
 */

import { geocode, getCurrentWeather, getWeatherInfo, windDir } from '../../lib/weather-api.js';
import { sendInteractive, copyButton, selectButton }           from '../../lib/interactive.js';

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default {
  name:        'weather',
  aliases:     ['forecast', 'temperature', 'clima', 'cuaca'],
  category:    'tools',
  description: 'Current weather and 3-day forecast for any city — Open-Meteo',
  usage:       '.weather <city>',

  async execute({ sock, msg, reply, args, settings, prefix }) {
    const jid = msg.key.remoteJid;
    if (!args.length) {
      await reply(
        `❌ Usage: \`${prefix}weather <city>\`\n\n` +
        `Examples:\n• \`${prefix}weather Tokyo\`\n• \`${prefix}weather New York\`\n• \`${prefix}weather Jakarta\``,
      );
      return;
    }

    const city = args.join(' ');
    try { await sock.sendPresenceUpdate('composing', jid); } catch {}

    let loc;
    try {
      loc = await geocode(city);
    } catch {
      await reply(`❌ Weather service unavailable. Try again later.`);
      return;
    }

    if (!loc) {
      await reply(`❌ City not found: *${city}*\nTry a different spelling or a nearby major city.`);
      return;
    }

    let data;
    try {
      data = await getCurrentWeather(loc.latitude, loc.longitude, loc.timezone);
    } catch {
      await reply(`❌ Failed to fetch weather for *${loc.name}*. Try again later.`);
      return;
    }

    try { await sock.sendPresenceUpdate('paused', jid); } catch {}

    const cur    = data.current;
    const daily  = data.daily;
    const info   = getWeatherInfo(cur.weathercode);
    const isDay  = cur.is_day === 1;

    // ── 3-day forecast ───────────────────────────────────────────────────────
    const forecastLines = [];
    for (let i = 0; i < Math.min(3, (daily.time ?? []).length); i++) {
      const date    = new Date(daily.time[i]);
      const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY_NAMES[date.getDay()];
      const fi      = getWeatherInfo(daily.weathercode[i]);
      forecastLines.push(
        `  ${fi.icon} *${dayName}:* ${daily.temperature_2m_max[i]}°↑ ${daily.temperature_2m_min[i]}°↓  💧${daily.precipitation_probability_max[i]}%`,
      );
    }

    const locationStr = [loc.admin1, loc.country].filter(Boolean).join(', ');
    const card = [
      `${info.icon} *${loc.name}, ${loc.country}*`,
      `${'─'.repeat(26)}`,
      ``,
      `🌡️ *Temp:*      ${cur.temperature_2m}°C  _(feels ${cur.apparent_temperature}°C)_`,
      `☁️ *Condition:* ${info.desc}`,
      `💧 *Humidity:*  ${cur.relative_humidity_2m}%`,
      `💨 *Wind:*      ${cur.windspeed_10m} km/h ${windDir(cur.wind_direction_10m)}`,
      `🌧️ *Precip:*    ${cur.precipitation} mm`,
      ``,
      `📅 *Forecast*`,
      ...forecastLines,
      ``,
      `📍 ${locationStr}`,
      `⏱️ _Updated just now · Open-Meteo_`,
    ].join('\n');

    await sendInteractive(sock, jid, msg, {
      body:    card,
      footer:  settings?.botName ?? 'Yuzuki MD',
      buttons: [
        copyButton('📋 Copy Forecast', card),
        selectButton('🌍 More Cities', [
          { title: '🌏 Tokyo',   rowId: `${prefix}weather Tokyo`,   description: 'Japan, Asia' },
          { title: '🌍 London',  rowId: `${prefix}weather London`,  description: 'UK, Europe' },
          { title: '🌎 New York',rowId: `${prefix}weather New York`,description: 'USA, Americas' },
          { title: '🌏 Dubai',   rowId: `${prefix}weather Dubai`,   description: 'UAE, Middle East' },
          { title: '🌏 Sydney',  rowId: `${prefix}weather Sydney`,  description: 'Australia' },
        ], 'Quick Cities'),
      ],
    }, card);
  },
};
