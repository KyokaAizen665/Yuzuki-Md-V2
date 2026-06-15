/**
 * Plugin: stickeralias
 * Category: Owner
 *
 * Register text-name aliases for sticker pack names.
 * When a sticker's EXIF packName matches a registered alias,
 * the aliased command is executed — no sha256 hash needed.
 *
 * Useful for sticker packs you receive repeatedly (same pack name)
 * that should always trigger a specific command.
 *
 * Commands:
 *   .stickeralias add <alias-name> <command> [args…]
 *   .stickeralias del <alias-name>
 *   .stickeralias list
 */

import { addAlias, removeAlias, listAliases } from '../../sticker-intelligence/macro-store.js';
import { isOwner, loadSettings }               from '../../settings.js';
import { errorCard, successCard, usageCard, ownerOnlyCard } from '../../message-engine/cards.js';

function checkOwner(msg, settings) {
  const senderJid = msg.key.fromMe ? null : (msg.key.participant ?? msg.key.remoteJid ?? '');
  return msg.key.fromMe || isOwner(senderJid, settings);
}

export default {
  name: 'stickeralias',
  aliases: ['salias'],
  category: 'Owner',
  description: 'Register text-name aliases for sticker EXIF pack names',
  usage: '.stickeralias add|del|list',
  permissions: ['owner'],

  async execute({ sock, msg, args, reply }) {
    const jid      = msg.key.remoteJid;
    const settings = loadSettings();

    if (!checkOwner(msg, settings)) {
      return ownerOnlyCard(sock, jid, msg);
    }

    const sub = (args[0] ?? 'list').toLowerCase();

    if (sub === 'list') {
      const aliases = listAliases();
      if (!aliases.length) return reply('🏷️ *Sticker Aliases*\n╰› No aliases registered.\n\n_Use .stickeralias add <name> <command> to create one._');
      const rows = aliases.map((a, i) =>
        `│  ${i + 1}. *${a.name}* → .${a.command}${a.args?.length ? ' ' + a.args.join(' ') : ''}`
      );
      return reply(`╭─── 🏷️ STICKER ALIASES (${aliases.length}) ───\n${rows.join('\n')}\n╰─────────────────────────`);
    }

    if (sub === 'add') {
      const aliasName = args[1];
      const command   = args[2]?.toLowerCase();
      if (!aliasName || !command) return usageCard(sock, jid, msg, '.stickeralias add <alias-name> <command> [args…]', '.stickeralias add "Cool Pack" menu');
      const aliasArgs = args.slice(3);
      const ok = addAlias(aliasName, command, aliasArgs, `${command}${aliasArgs.length ? ' ' + aliasArgs.join(' ') : ''}`);
      if (!ok) return errorCard(sock, jid, msg, 'Failed to save alias');
      return successCard(sock, jid, msg, 'Alias Registered', `"${aliasName}" → .${command}`);
    }

    if (sub === 'del' || sub === 'remove') {
      const aliasName = args.slice(1).join(' ').trim();
      if (!aliasName) return usageCard(sock, jid, msg, '.stickeralias del <alias-name>');
      const ok = removeAlias(aliasName);
      if (!ok) return errorCard(sock, jid, msg, `Alias "${aliasName}" not found`);
      return successCard(sock, jid, msg, 'Alias Removed', aliasName);
    }

    return usageCard(sock, jid, msg, '.stickeralias add|del|list');
  },
};
