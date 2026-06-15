/**
 * Plugin: stickerpack
 * Category: Owner
 *
 * Manage sticker packs as command collections and text aliases.
 *
 * Commands:
 *   .stickerpack add <pack-name> [description]   — Create a pack
 *   .stickerpack del <pack-name>                 — Remove a pack
 *   .stickerpack list                            — List all packs
 *   .stickerpack addsticker <pack-name> <cmd>    — Reply to sticker to add to pack
 *
 *   .stickeralias add <alias> <command> [args…]  — Register a text-name alias
 *   .stickeralias del <alias>                    — Remove an alias
 *   .stickeralias list                           — List all aliases
 */

import {
  addPack, removePack, listPacks, addPackCommand,
  addAlias, removeAlias, listAliases,
} from '../../sticker-intelligence/macro-store.js';
import { sha256ToHex } from '../../sticker-intelligence/parser.js';
import { isOwner, loadSettings } from '../../settings.js';
import { errorCard, successCard, infoCard, usageCard, ownerOnlyCard } from '../../message-engine/cards.js';

function getQuotedStickerSha256(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx?.quotedMessage?.stickerMessage) return null;
  return sha256ToHex(ctx.quotedMessage.stickerMessage.fileSha256);
}

function checkOwner(msg, settings) {
  const senderJid = msg.key.fromMe ? null : (msg.key.participant ?? msg.key.remoteJid ?? '');
  return msg.key.fromMe || isOwner(senderJid, settings);
}

export default {
  name: 'stickerpack',
  aliases: ['spack'],
  category: 'Owner',
  description: 'Manage sticker packs as command collections',
  usage: '.stickerpack add|del|list|addsticker',
  permissions: ['owner'],

  async execute({ sock, msg, args, reply }) {
    const jid      = msg.key.remoteJid;
    const settings = loadSettings();

    if (!checkOwner(msg, settings)) {
      return ownerOnlyCard(sock, jid, msg);
    }

    const sub = (args[0] ?? 'list').toLowerCase();

    if (sub === 'list') {
      const packs = listPacks();
      if (!packs.length) return reply('📦 *Sticker Packs*\n╰› No packs registered yet.\n\n_Use .stickerpack add <name> to create one._');
      const rows = packs.map((p, i) =>
        `│  ${i + 1}. *${p.name}* — ${p.commandCount} sticker(s)\n│     ${p.description || 'No description'}`
      );
      return reply(`╭─── 📦 STICKER PACKS (${packs.length}) ───\n${rows.join('\n')}\n╰─────────────────────`);
    }

    if (sub === 'add') {
      const packName = args.slice(1).join(' ').trim();
      if (!packName) return usageCard(sock, jid, msg, '.stickerpack add <pack-name> [description]');
      const ok = addPack(packName);
      if (!ok) return errorCard(sock, jid, msg, 'Failed to create pack');
      return successCard(sock, jid, msg, 'Pack Created', packName);
    }

    if (sub === 'del' || sub === 'remove') {
      const packName = args.slice(1).join(' ').trim();
      if (!packName) return usageCard(sock, jid, msg, '.stickerpack del <pack-name>');
      const ok = removePack(packName);
      if (!ok) return errorCard(sock, jid, msg, `Pack "${packName}" not found`);
      return successCard(sock, jid, msg, 'Pack Removed', packName);
    }

    if (sub === 'addsticker') {
      const sha256   = getQuotedStickerSha256(msg);
      if (!sha256) return usageCard(sock, jid, msg, '.stickerpack addsticker <pack-name> <command>', 'Reply to a sticker first');
      const packName = args[1];
      const command  = args[2]?.toLowerCase();
      if (!packName || !command) return usageCard(sock, jid, msg, '.stickerpack addsticker <pack-name> <command>');
      const cmdArgs = args.slice(3);
      const ok      = addPackCommand(packName, sha256, command, cmdArgs);
      if (!ok) return errorCard(sock, jid, msg, `Failed to add sticker to pack "${packName}"`);
      return successCard(sock, jid, msg, 'Sticker Added to Pack', `${packName} → .${command}`);
    }

    return usageCard(sock, jid, msg, '.stickerpack add|del|list|addsticker');
  },
};
