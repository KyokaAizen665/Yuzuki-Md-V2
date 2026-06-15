/**
 * Plugin: unitconv
 * Category: tools
 *
 * Unit conversion across Length, Weight, Temperature, Speed,
 * Area, Volume, Data, Time, Pressure, and Energy.
 *
 * Uses a built-in lookup table (no dependencies).
 * Tries mathjs if available for extended unit support.
 *
 * Usage:
 *   .convert 5.08 cm inch
 *   .convert 100 kg lb
 *   .convert 37 C F
 *   .convert 1 GB MB
 *   .convert 100 mph km/h
 */

import { sendInteractive, copyButton, selectButton } from '../../lib/interactive.js';

// ── Conversion tables ─────────────────────────────────────────────────────────
// Each entry: factor to convert TO the base unit.
// Base units: m (length), kg (mass), m/s (speed), m² (area), L (volume),
//             byte (data), second (time), Pa (pressure), J (energy)

const CATEGORIES = {

  length: {
    base: 'm',
    display: 'Length',
    units: {
      m: 1, meter: 1, meters: 1, metre: 1, metres: 1,
      km: 1000, kilometer: 1000, kilometres: 1000, kilometers: 1000,
      cm: 0.01, centimeter: 0.01, centimeters: 0.01,
      mm: 0.001, millimeter: 0.001, millimeters: 0.001,
      um: 1e-6, micrometer: 1e-6, micron: 1e-6,
      nm: 1e-9, nanometer: 1e-9,
      in: 0.0254, inch: 0.0254, inches: 0.0254, '"': 0.0254,
      ft: 0.3048, foot: 0.3048, feet: 0.3048, "'": 0.3048,
      yd: 0.9144, yard: 0.9144, yards: 0.9144,
      mi: 1609.344, mile: 1609.344, miles: 1609.344,
      nmi: 1852, 'nautical mile': 1852, 'nautical miles': 1852,
      ly: 9.461e15, 'light year': 9.461e15, 'light years': 9.461e15,
      au: 1.496e11, 'astronomical unit': 1.496e11,
    },
  },

  mass: {
    base: 'kg',
    display: 'Weight / Mass',
    units: {
      kg: 1, kilogram: 1, kilograms: 1,
      g: 0.001, gram: 0.001, grams: 0.001,
      mg: 1e-6, milligram: 1e-6, milligrams: 1e-6,
      ug: 1e-9, microgram: 1e-9, micrograms: 1e-9,
      t: 1000, ton: 1000, tonne: 1000, tonnes: 1000, 'metric ton': 1000,
      lb: 0.453592, lbs: 0.453592, pound: 0.453592, pounds: 0.453592,
      oz: 0.0283495, ounce: 0.0283495, ounces: 0.0283495,
      stone: 6.35029, st: 6.35029,
      ct: 0.0002, carat: 0.0002,
    },
  },

  speed: {
    base: 'm/s',
    display: 'Speed',
    units: {
      'ms': 1, 'm/s': 1, 'mps': 1, 'meters per second': 1,
      'km/h': 1/3.6, 'kmh': 1/3.6, 'kph': 1/3.6, 'kilometers per hour': 1/3.6,
      'mph': 0.44704, 'miles per hour': 0.44704,
      'fps': 0.3048, 'ft/s': 0.3048, 'feet per second': 0.3048,
      'knots': 0.514444, 'kn': 0.514444, 'kt': 0.514444, 'knot': 0.514444,
      'mach': 340.29, 'ma': 340.29,
    },
  },

  area: {
    base: 'm²',
    display: 'Area',
    units: {
      'm2': 1, 'm²': 1, 'sq m': 1, 'square meter': 1, 'square meters': 1,
      'km2': 1e6, 'km²': 1e6, 'square km': 1e6, 'square kilometer': 1e6,
      'cm2': 1e-4, 'cm²': 1e-4, 'square cm': 1e-4,
      'mm2': 1e-6, 'mm²': 1e-6, 'square mm': 1e-6,
      'ft2': 0.092903, 'ft²': 0.092903, 'sq ft': 0.092903, 'square foot': 0.092903, 'square feet': 0.092903,
      'in2': 6.4516e-4, 'in²': 6.4516e-4, 'sq in': 6.4516e-4, 'square inch': 6.4516e-4,
      'yd2': 0.836127, 'sq yd': 0.836127, 'square yard': 0.836127,
      'mi2': 2.59e6, 'sq mi': 2.59e6, 'square mile': 2.59e6,
      'acre': 4046.86, 'acres': 4046.86,
      'ha': 10000, 'hectare': 10000, 'hectares': 10000,
    },
  },

  volume: {
    base: 'L',
    display: 'Volume',
    units: {
      'l': 1, 'L': 1, 'liter': 1, 'litre': 1, 'liters': 1, 'litres': 1,
      'ml': 0.001, 'mL': 0.001, 'milliliter': 0.001, 'milliliters': 0.001,
      'cl': 0.01, 'centiliter': 0.01,
      'dl': 0.1, 'deciliter': 0.1,
      'm3': 1000, 'm³': 1000, 'cubic meter': 1000, 'cubic meters': 1000,
      'cm3': 0.001, 'cm³': 0.001, 'cc': 0.001, 'cubic centimeter': 0.001,
      'ft3': 28.3168, 'cubic foot': 28.3168, 'cubic feet': 28.3168,
      'in3': 0.0163871, 'cubic inch': 0.0163871,
      'gallon': 3.78541, 'gallons': 3.78541, 'gal': 3.78541, 'us gal': 3.78541,
      'uk gallon': 4.54609, 'imperial gallon': 4.54609,
      'quart': 0.946353, 'qt': 0.946353, 'quarts': 0.946353,
      'pint': 0.473176, 'pt': 0.473176, 'pints': 0.473176,
      'cup': 0.236588, 'cups': 0.236588,
      'fl oz': 0.0295735, 'floz': 0.0295735, 'fluid oz': 0.0295735, 'fluid ounce': 0.0295735,
      'tbsp': 0.0147868, 'tablespoon': 0.0147868, 'tablespoons': 0.0147868,
      'tsp': 0.00492892, 'teaspoon': 0.00492892,
    },
  },

  data: {
    base: 'B',
    display: 'Digital Storage',
    units: {
      'b': 0.125, 'bit': 0.125, 'bits': 0.125,
      'B': 1, 'byte': 1, 'bytes': 1,
      'KB': 1000, 'kB': 1000, 'kilobyte': 1000, 'kilobytes': 1000,
      'KiB': 1024, 'kibibyte': 1024,
      'MB': 1e6, 'megabyte': 1e6, 'megabytes': 1e6,
      'MiB': 1048576, 'mebibyte': 1048576,
      'GB': 1e9, 'gigabyte': 1e9, 'gigabytes': 1e9,
      'GiB': 1073741824, 'gibibyte': 1073741824,
      'TB': 1e12, 'terabyte': 1e12, 'terabytes': 1e12,
      'TiB': 1.0995e12, 'tebibyte': 1.0995e12,
      'PB': 1e15, 'petabyte': 1e15, 'petabytes': 1e15,
      'Kbps': 125, 'Mbps': 125000, 'Gbps': 125000000,
    },
  },

  time: {
    base: 's',
    display: 'Time',
    units: {
      'ns': 1e-9, 'nanosecond': 1e-9, 'nanoseconds': 1e-9,
      'us': 1e-6, 'microsecond': 1e-6, 'microseconds': 1e-6,
      'ms': 0.001, 'millisecond': 0.001, 'milliseconds': 0.001,
      's': 1, 'sec': 1, 'second': 1, 'seconds': 1,
      'min': 60, 'minute': 60, 'minutes': 60,
      'h': 3600, 'hr': 3600, 'hour': 3600, 'hours': 3600,
      'd': 86400, 'day': 86400, 'days': 86400,
      'wk': 604800, 'week': 604800, 'weeks': 604800,
      'mo': 2629800, 'month': 2629800, 'months': 2629800,
      'yr': 31557600, 'year': 31557600, 'years': 31557600,
      'decade': 315576000, 'century': 3155760000,
    },
  },

  pressure: {
    base: 'Pa',
    display: 'Pressure',
    units: {
      'Pa': 1, 'pascal': 1, 'pascals': 1,
      'kPa': 1000, 'kilopascal': 1000,
      'MPa': 1e6, 'megapascal': 1e6,
      'bar': 100000, 'bars': 100000,
      'mbar': 100, 'millibar': 100,
      'psi': 6894.76, 'PSI': 6894.76, 'pounds per square inch': 6894.76,
      'atm': 101325, 'atmosphere': 101325, 'atmospheres': 101325,
      'torr': 133.322, 'Torr': 133.322,
      'mmhg': 133.322, 'mmHg': 133.322, 'mm hg': 133.322,
      'inhg': 3386.39, 'inHg': 3386.39, 'inches of mercury': 3386.39,
    },
  },

  energy: {
    base: 'J',
    display: 'Energy',
    units: {
      'J': 1, 'joule': 1, 'joules': 1,
      'kJ': 1000, 'kilojoule': 1000, 'kilojoules': 1000,
      'MJ': 1e6, 'megajoule': 1e6,
      'cal': 4.184, 'calorie': 4.184, 'calories': 4.184,
      'kcal': 4184, 'kilocalorie': 4184, 'Calories': 4184,
      'Wh': 3600, 'watt hour': 3600, 'watt-hour': 3600,
      'kWh': 3600000, 'kilowatt hour': 3600000, 'kilowatt-hour': 3600000,
      'eV': 1.602e-19, 'electron volt': 1.602e-19,
      'BTU': 1055.06, 'btu': 1055.06, 'british thermal unit': 1055.06,
      'therm': 1.055e8,
      'ft lb': 1.35582, 'ft-lb': 1.35582, 'foot pound': 1.35582,
    },
  },
};

// ── Temperature (special: non-proportional) ───────────────────────────────────

const TEMP_UNITS = new Set(['c','celsius','°c','f','fahrenheit','°f','k','kelvin','r','rankine','°r']);

function convertTemp(val, from, to) {
  const f = from.toLowerCase().replace('°','');
  const t = to.toLowerCase().replace('°','');
  // Convert from → Celsius first
  let celsius;
  switch (f) {
    case 'c': case 'celsius':   celsius = val;               break;
    case 'f': case 'fahrenheit':celsius = (val - 32) * 5/9; break;
    case 'k': case 'kelvin':    celsius = val - 273.15;      break;
    case 'r': case 'rankine':   celsius = (val - 491.67) * 5/9; break;
    default: return null;
  }
  // Convert Celsius → target
  switch (t) {
    case 'c': case 'celsius':    return celsius;
    case 'f': case 'fahrenheit': return celsius * 9/5 + 32;
    case 'k': case 'kelvin':     return celsius + 273.15;
    case 'r': case 'rankine':    return (celsius + 273.15) * 9/5;
    default: return null;
  }
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

function findUnit(str) {
  const key = str.trim().toLowerCase();
  for (const [catName, cat] of Object.entries(CATEGORIES)) {
    // exact match
    if (cat.units[key] !== undefined)  return { cat: catName, factor: cat.units[key], display: cat.display, base: cat.base };
    // case-insensitive
    const k = Object.keys(cat.units).find(u => u.toLowerCase() === key);
    if (k) return { cat: catName, factor: cat.units[k], display: cat.display, base: cat.base };
  }
  // temperature special
  if (TEMP_UNITS.has(key)) return { cat: 'temperature', factor: 1, display: 'Temperature', base: '°C' };
  return null;
}

function fmtVal(n) {
  if (!isFinite(n)) return String(n);
  if (Math.abs(n) >= 1e10 || (Math.abs(n) < 1e-5 && n !== 0)) return n.toExponential(4);
  return parseFloat(n.toPrecision(8)).toLocaleString('en-US');
}

export default {
  name:        'convert',
  aliases:     ['unitconv', 'unit', 'unitconvert', 'conv'],
  category:    'tools',
  description: 'Convert between units — length, weight, temp, speed, data, and more',
  usage:       '.convert <value> <from> <to>',

  async execute({ sock, msg, reply, args, settings, prefix }) {
    const jid = msg.key.remoteJid;

    if (args.length < 3) {
      await reply(
        `❌ Usage: \`${prefix}convert <value> <from> <to>\`\n\n` +
        `Examples:\n` +
        `• \`${prefix}convert 5.08 cm inch\`\n` +
        `• \`${prefix}convert 100 kg lb\`\n` +
        `• \`${prefix}convert 37 C F\`\n` +
        `• \`${prefix}convert 1 GB MB\`\n` +
        `• \`${prefix}convert 100 mph km/h\`\n\n` +
        `_Categories: length, weight, temp, speed, area, volume, data, time, pressure, energy_`,
      );
      return;
    }

    const valStr = args[0];
    const val    = parseFloat(valStr);
    if (isNaN(val)) {
      await reply(`❌ Invalid value: \`${valStr}\`\nFirst argument must be a number.`);
      return;
    }

    // Allow multi-word units: .convert 1 sq ft m2
    // Try 1-word, 2-word for from/to
    let fromUnit, toUnit, fromStr, toStr;
    for (let split = 1; split <= 2; split++) {
      fromStr = args.slice(1, 1 + split).join(' ');
      toStr   = args.slice(1 + split).join(' ');
      fromUnit = findUnit(fromStr);
      toUnit   = findUnit(toStr);
      if (fromUnit && toUnit) break;
    }

    // ── Temperature special path ─────────────────────────────────────────────
    if (fromUnit?.cat === 'temperature' || toUnit?.cat === 'temperature') {
      if (fromUnit?.cat !== 'temperature' || toUnit?.cat !== 'temperature') {
        await reply(`❌ Cannot mix temperature and non-temperature units.`);
        return;
      }
      const result = convertTemp(val, fromStr, toStr);
      if (result === null) {
        await reply(`❌ Unknown temperature unit. Use: C, F, K, R`);
        return;
      }

      const fromLabel = fromStr.toUpperCase().replace('CELSIUS','°C').replace('FAHRENHEIT','°F').replace('KELVIN','K').replace('RANKINE','°R');
      const toLabel   = toStr.toUpperCase().replace('CELSIUS','°C').replace('FAHRENHEIT','°F').replace('KELVIN','K').replace('RANKINE','°R');

      const card =
        `🌡️ *Temperature Conversion*\n${'─'.repeat(24)}\n\n` +
        `📥 *Input:*   ${fmtVal(val)} ${fromLabel}\n` +
        `📤 *Result:*  ${fmtVal(result)} ${toLabel}\n\n` +
        `_Category: Temperature_`;

      await sendInteractive(sock, jid, msg, {
        body:    card,
        footer:  settings?.botName ?? 'Yuzuki MD',
        buttons: [
          copyButton('📋 Copy Result', fmtVal(result)),
          selectButton('🌡️ More Temps', [
            { title: '→ °F',  rowId: `${prefix}convert ${val} ${fromStr} F`,  description: 'Fahrenheit' },
            { title: '→ °C',  rowId: `${prefix}convert ${val} ${fromStr} C`,  description: 'Celsius' },
            { title: '→ K',   rowId: `${prefix}convert ${val} ${fromStr} K`,  description: 'Kelvin' },
          ].filter(o => !o.title.includes(toLabel)), 'Convert To'),
        ],
      }, card);
      return;
    }

    if (!fromUnit) {
      await reply(`❌ Unknown unit: \`${fromStr}\`\nTry \`${prefix}convert\` without arguments to see examples.`);
      return;
    }
    if (!toUnit) {
      await reply(`❌ Unknown unit: \`${toStr}\`\nTry \`${prefix}convert\` without arguments to see examples.`);
      return;
    }
    if (fromUnit.cat !== toUnit.cat) {
      await reply(
        `❌ Incompatible units.\n` +
        `\`${fromStr}\` is *${fromUnit.display}* but \`${toStr}\` is *${toUnit.display}*.`,
      );
      return;
    }

    const baseVal = val * fromUnit.factor;
    const result  = baseVal / toUnit.factor;

    const card =
      `📐 *Unit Conversion*\n${'─'.repeat(22)}\n\n` +
      `📥 *Input:*    ${fmtVal(val)} ${fromStr}\n` +
      `📤 *Result:*   ${fmtVal(result)} ${toStr}\n\n` +
      `_Category: ${fromUnit.display}_`;

    await sendInteractive(sock, jid, msg, {
      body:    card,
      footer:  settings?.botName ?? 'Yuzuki MD',
      buttons: [
        copyButton('📋 Copy Result', fmtVal(result)),
        copyButton('📝 Copy Full',   card),
      ],
    }, card);
  },
};
