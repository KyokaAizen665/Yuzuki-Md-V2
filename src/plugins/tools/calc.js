/**
 * Plugin: calc
 * Category: tools
 *
 * Safe expression calculator.
 * Supports: arithmetic, parentheses, exponentiation (^/**),
 *           trig (sin/cos/tan), sqrt/cbrt, log/ln, abs, floor/ceil/round,
 *           max/min, constants (PI, E).
 *
 * Tries mathjs if available; falls back to a built-in safe evaluator.
 *
 * Usage:
 *   .calc 2 + 3 * (4 - 1)
 *   .calc sqrt(144)
 *   .calc sin(PI/2)
 *   .calc 2^10
 */

import { sendInteractive, copyButton } from '../../lib/interactive.js';

// ── Safe built-in evaluator ───────────────────────────────────────────────────

const FN_MAP = {
  sin:   Math.sin,   cos:   Math.cos,   tan:  Math.tan,
  asin:  Math.asin,  acos:  Math.acos,  atan: Math.atan,  atan2: Math.atan2,
  sqrt:  Math.sqrt,  cbrt:  Math.cbrt,  pow:  Math.pow,
  log:   Math.log10, ln:    Math.log,   log2: Math.log2,
  abs:   Math.abs,   sign:  Math.sign,  trunc: Math.trunc,
  floor: Math.floor, ceil:  Math.ceil,  round: Math.round,
  max:   Math.max,   min:   Math.min,   exp:  Math.exp,
};

const CONST_MAP = { PI: Math.PI, E: Math.E, TAU: 2 * Math.PI, Infinity: Infinity };

/**
 * Evaluate a math expression safely without eval() on user content.
 * Strategy:
 *   1. Substitute known function/constant names with __fn__ tokens
 *   2. Validate the remainder contains ONLY safe characters
 *   3. Build a Function with only Math helpers in scope
 */
function safeCalc(raw) {
  // Normalise whitespace; replace ^ with **; allow × ÷
  let expr = raw
    .replace(/\s+/g, ' ')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\^/g, '**')
    .replace(/\bmod\b/gi, '%')
    .replace(/\bx\b/g, '*');

  // Substitute function names → _F_<index>( (so they won't match the char check)
  const fnArgs   = [];
  const fnNames  = Object.keys(FN_MAP).sort((a, b) => b.length - a.length); // longest first
  for (const name of fnNames) {
    const re = new RegExp(`\\b${name}\\b`, 'gi');
    if (re.test(expr)) {
      const idx = fnArgs.length;
      fnArgs.push(FN_MAP[name]);
      expr = expr.replace(new RegExp(`\\b${name}\\b`, 'gi'), `_F_${idx}`);
    }
  }

  // Substitute constants
  const constArgs  = [];
  const constNames = Object.keys(CONST_MAP).sort((a, b) => b.length - a.length);
  for (const name of constNames) {
    const re = new RegExp(`\\b${name}\\b`, 'g');
    if (re.test(expr)) {
      const idx = constArgs.length;
      constArgs.push(CONST_MAP[name]);
      expr = expr.replace(new RegExp(`\\b${name}\\b`, 'g'), `_C_${idx}`);
    }
  }

  // Now validate: only digits, operators, whitespace, parens, _, F, C, digits
  if (!/^[\d+\-*/.() %_FCe,\s]+$/i.test(expr)) {
    throw new Error('Expression contains invalid characters.');
  }

  // Build param names and values
  const paramNames = [
    ...fnArgs.map((_, i)    => `_F_${i}`),
    ...constArgs.map((_, i) => `_C_${i}`),
  ];
  const paramVals = [...fnArgs, ...constArgs];

  try {
    const fn = new Function(...paramNames, `"use strict"; return (${expr.trim()})`);
    return fn(...paramVals);
  } catch (err) {
    throw new Error(`Evaluation error: ${err.message}`);
  }
}

/**
 * Format a result number for display.
 */
function fmtResult(val) {
  if (typeof val !== 'number') return String(val);
  if (!isFinite(val))          return val > 0 ? 'Infinity' : val < 0 ? '-Infinity' : 'NaN';
  if (Number.isInteger(val) && Math.abs(val) < 1e15) return val.toLocaleString('en-US');
  const str = parseFloat(val.toPrecision(12)).toString();
  return str;
}

// ── Optional mathjs (if installed) ───────────────────────────────────────────

let _mjsEvaluate = null;
async function tryMathJs(expr) {
  if (_mjsEvaluate === false) return null;
  try {
    if (_mjsEvaluate === null) {
      const mjs = await import('mathjs');
      _mjsEvaluate = mjs.evaluate ?? mjs.default?.evaluate ?? false;
    }
    if (!_mjsEvaluate) return null;
    return _mjsEvaluate(expr);
  } catch {
    _mjsEvaluate = false;
    return null;
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export default {
  name:        'calc',
  aliases:     ['calculate', 'calculator', 'math', 'eval'],
  category:    'tools',
  description: 'Safe expression calculator with trig, sqrt, log, and more',
  usage:       '.calc <expression>',

  async execute({ sock, msg, reply, args, settings, prefix }) {
    const jid  = msg.key.remoteJid;
    const raw  = args.join(' ').trim();

    if (!raw) {
      await reply(
        `❌ Usage: \`${prefix}calc <expression>\`\n\n` +
        `Examples:\n` +
        `• \`${prefix}calc 2 + 3 * (4 - 1)\`\n` +
        `• \`${prefix}calc sqrt(144)\`\n` +
        `• \`${prefix}calc sin(PI/2)\`\n` +
        `• \`${prefix}calc 2^10\`\n` +
        `• \`${prefix}calc log(1000)\``,
      );
      return;
    }

    let result, usedMathJs = false;
    try {
      // Try mathjs first (supports more syntax like matrices, units, etc.)
      const mjsResult = await tryMathJs(raw);
      if (mjsResult !== null && mjsResult !== undefined) {
        result     = mjsResult;
        usedMathJs = true;
      } else {
        result = safeCalc(raw);
      }
    } catch (err) {
      await reply(`❌ *Calculation error*\n\n${err.message}`);
      return;
    }

    if (result === null || result === undefined) {
      await reply(`❌ Could not evaluate: \`${raw}\``);
      return;
    }

    const resultStr = usedMathJs
      ? (typeof result?.toNumber === 'function' ? fmtResult(result.toNumber()) : String(result))
      : fmtResult(result);

    const card =
      `🔢 *Calculator*\n${'─'.repeat(22)}\n\n` +
      `📥 *Input:*   \`${raw}\`\n\n` +
      `📤 *Result:*  \`${resultStr}\``;

    await sendInteractive(sock, jid, msg, {
      body:    card,
      footer:  settings?.botName ?? 'Yuzuki MD',
      buttons: [
        copyButton('📋 Copy Result', resultStr),
        copyButton('📝 Copy Full',   card),
      ],
    }, card);
  },
};
