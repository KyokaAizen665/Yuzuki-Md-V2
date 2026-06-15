/**
 * Weather API — Open-Meteo (free, no API key)
 *
 * ─── Exports ──────────────────────────────────────────────────────────────────
 *   geocode(city)                      → location object | null
 *   getCurrentWeather(lat, lon, tz)    → weather data object
 *   getWeatherInfo(code)               → { desc, icon }
 *   windDir(degrees)                   → 'N' | 'NE' | …
 *   uvLabel(uv)                        → 'Low' | 'Moderate' | …
 */

import { httpGetJson } from './utility.js';

// ── WMO weather code table ─────────────────────────────────────────────────────
const WMO = {
  0:  { desc: 'Clear sky',             icon: '☀️'  },
  1:  { desc: 'Mainly clear',          icon: '🌤️'  },
  2:  { desc: 'Partly cloudy',         icon: '⛅'   },
  3:  { desc: 'Overcast',              icon: '☁️'  },
  45: { desc: 'Fog',                   icon: '🌫️'  },
  48: { desc: 'Freezing fog',          icon: '🌫️'  },
  51: { desc: 'Light drizzle',         icon: '🌦️'  },
  53: { desc: 'Drizzle',               icon: '🌦️'  },
  55: { desc: 'Heavy drizzle',         icon: '🌧️'  },
  56: { desc: 'Light freezing drizzle',icon: '🌧️'  },
  57: { desc: 'Freezing drizzle',      icon: '🌧️'  },
  61: { desc: 'Light rain',            icon: '🌧️'  },
  63: { desc: 'Rain',                  icon: '🌧️'  },
  65: { desc: 'Heavy rain',            icon: '🌧️'  },
  66: { desc: 'Light freezing rain',   icon: '🌨️'  },
  67: { desc: 'Freezing rain',         icon: '🌨️'  },
  71: { desc: 'Light snow',            icon: '🌨️'  },
  73: { desc: 'Snow',                  icon: '❄️'  },
  75: { desc: 'Heavy snow',            icon: '❄️'  },
  77: { desc: 'Snow grains',           icon: '🌨️'  },
  80: { desc: 'Light showers',         icon: '🌦️'  },
  81: { desc: 'Rain showers',          icon: '🌦️'  },
  82: { desc: 'Heavy showers',         icon: '⛈️'  },
  85: { desc: 'Snow showers',          icon: '🌨️'  },
  86: { desc: 'Heavy snow showers',    icon: '❄️'  },
  95: { desc: 'Thunderstorm',          icon: '⛈️'  },
  96: { desc: 'Thunderstorm + hail',   icon: '⛈️'  },
  99: { desc: 'Thunderstorm + hail',   icon: '⛈️'  },
};

export function getWeatherInfo(code) {
  return WMO[code] ?? WMO[Math.floor(code / 10) * 10] ?? { desc: 'Unknown', icon: '🌡️' };
}

// ── Geocoding ─────────────────────────────────────────────────────────────────

/**
 * Resolve a city name → { latitude, longitude, name, country, timezone, admin1 }
 * Returns null if not found.
 */
export async function geocode(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const data = await httpGetJson(url);
  return data.results?.[0] ?? null;
}

// ── Forecast ──────────────────────────────────────────────────────────────────

/**
 * Fetch current conditions + today's daily forecast.
 */
export async function getCurrentWeather(lat, lon, timezone = 'auto') {
  const params = new URLSearchParams({
    latitude:      lat,
    longitude:     lon,
    timezone,
    current:       [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'weathercode',
      'windspeed_10m',
      'wind_direction_10m',
      'precipitation',
      'is_day',
    ].join(','),
    daily:         'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode',
    forecast_days: '3',
  });
  return httpGetJson(`https://api.open-meteo.com/v1/forecast?${params}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const COMPASS_DIRS = ['N','NE','E','SE','S','SW','W','NW'];

export function windDir(deg) {
  return COMPASS_DIRS[Math.round((Number(deg) % 360) / 45) % 8] ?? 'N';
}

export function uvLabel(uv) {
  if (uv <= 2)  return 'Low';
  if (uv <= 5)  return 'Moderate';
  if (uv <= 7)  return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}
