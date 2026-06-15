/**
 * Plugin: stickermacro
 * Category: Owner
 *
 * Manage sticker intelligence macros, aliases, and packs.
 * Owner-only — all subcommands require owner permission.
 *
 * Commands:
 *   .stickermacro add <command> [args…]   — Reply to a sticker to register a macro
 *   .stickermacro del                     — Reply to a sticker to remove its macro
 *   .stickermacro list                    — List all registered macros
 *   .stickermacro stats                   — Show macro/alias/pack counts
 *
 *   .stickeralias add <alias> <command> [args…]
 *   .stickeralias del <alias>
 *   .stickeralias list
 *
 *   .stickerpack add <pack-name> [description]
 *   .stickerpack del <pack-name>
 *   .stickerpack list
 *   .stickerpack addsticker <pack-name> <command> [args…]  — Reply to sticker
 */

import {
  getMacro, addMacro, removeMacro, listMacros,
  getAlias, addAlias, removeAlias, listAliases,
  addPack, removePack, listPacks, addPackCommand,
  getStats,
} from '../../sticker-intelligence/macro-store.js';
import { sha256ToHex } from '../../sticker-intelligence/parser.js';
import { isOwner, loadSettings } from '../../settings.js';
import { errorCard, successCard, infoCard, usageCard, ownerOnlyCard } from '../../message-engine/cards.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Extract the SHA-256 hex of the sticker being replied to, or null. */
function getQuotedStickerSha256(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx?.quotedMessage?.stickerMessage) return null;
  return sha256ToHex(ctx.quotedMessage.stickerMessage.fileSha256);
}

/** Check whether the sender has owner permissions. */
function checkOwner(msg, settings) {
  const senderJid = msg.key.fromMe
    ? null
    : (msg.key.participant ?? msg.key.remoteJid ?? '');
  return msg.key.fromMe || isOwner(senderJid, settings);
}

// ─── stickermacro plugin ──────────────────────────────────────────────────────

export default {
  name: 'stickermacro',
  aliases: ['smacro'],
  category: 'Owner',
  description: 'Register sticker macros, aliases, and command packs',
  usage: '.stickermacro add|del|list|stats',
  permissions: ['owner'],

  async execute({ sock, msg, args, reply }) {
    const jid      = msg.key.remoteJid;
    const settings = loadSettings();

    if (!checkOwner(msg, settings)) {
      return ownerOnlyCard(sock, jid, msg);
    }

    const sub = (args[0] ?? 'list').toLowerCase();

    // ── LIST ─────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const macros = listMacros();
      if (!macros.length) {
        return reply('📋 *Sticker Macros*\n╰› No macros registered yet.\n\n_Reply to any sticker with .stickermacro add <command> to register one._');
      }
      const rows = macros.slice(0, 20).map((m, i) =>
        `│  ${String(i + 1).padStart(2, ' ')}.  *${m.label}* → .${m.command}${m.args?.length ? ' ' + m.args.join(' ') : ''}`
      );
      return reply(
        `╭─── 📋 STICKER MACROS (${macros.length}) ───\n` +
        rows.join('\n') +
        `\n╰─────────────────────────`
      );
    }

    // ── STATS ─────────────────────────────────────────────────────────────────
    if (sub === 'stats') {
      const s = getStats();
      return infoCard(sock, jid, msg, '🎯', 'Sticker Intelligence', [
        ['Macros',    String(s.macroCount)],
        ['Aliases',   String(s.aliasCount)],
        ['Packs',     String(s.packCount)],
        ['Stickers',  String(s.totalStickers)],
      ], 'data/sticker-macros.json');
    }

    // ── ADD ──────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const sha256 = getQuotedStickerSha256(msg);
      if (!sha256) {
        return usageCard(sock, jid, msg, '.stickermacro add <command> [args…]', 'Reply to a sticker first');
      }
      const command = args[1]?.toLowerCase();
      if (!command) {
        return usageCard(sock, jid, msg, '.stickermacro add <command> [args…]', '.stickermacro add menu');
      }
      const macroArgs = args.slice(2);
      const label     = `${command}${macroArgs.length ? ' ' + macroArgs.join(' ') : ''}`;
      const senderJid = msg.key.fromMe ? '' : (msg.key.participant ?? msg.key.remoteJid ?? '');
      const ok        = addMacro(sha256, command, macroArgs, label, senderJid);
      if (!ok) return errorCard(sock, jid, msg, 'Failed to save macro');
      return successCard(sock, jid, msg, 'Macro Registered', `.${command}${macroArgs.length ? ' ' + macroArgs.join(' ') : ''}`);
    }

    // ── DEL ──────────────────────────────────────────────────────────────────
    if (sub === 'del' || sub === 'remove') {
      const sha256 = getQuotedStickerSha256(msg);
      if (!sha256) {
        return usageCard(sock, jid, msg, '.stickermacro del', 'Reply to the registered sticker');
      }
      const existing = getMacro(sha256);
      if (!existing) return errorCard(sock, jid, msg, 'No macro registered for that sticker');
      const ok = removeMacro(sha256);
      if (!ok) return errorCard(sock, jid, msg, 'Failed to remove macro');
      return successCard(sock, jid, msg, 'Macro Removed', existing.label);
    }

    return usageCard(sock, jid, msg, '.stickermacro add|del|list|stats');
  },
};
