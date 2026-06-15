/**
 * Sticker Intelligence — Main Entry Point
 *
 * Exposes handleStickerTrigger, which is the single function bot.js
 * calls for every incoming sticker message.
 *
 * Resolution pipeline:
 *
 *  1. Loop prevention: skip fromMe stickers and cooldown duplicates.
 *
 *  2. Macro lookup (no download):
 *     SHA-256 of the sticker is checked against data/sticker-macros.json.
 *     If found → execute the registered command immediately.
 *
 *  3. Pack lookup (no download):
 *     Pack name from macro store is checked if the sticker's sha256 is
 *     registered in any pack's command map.
 *
 *  4. EXIF parse (requires download):
 *     Download the sticker WebP and parse EXIF metadata.
 *     - description / artist field → command text (e.g. ".menu")
 *     - JSON payload → { command: "menu", args: [] }
 *
 *  5. Alias lookup (post-EXIF):
 *     If EXIF packName is registered as an alias → use aliased command.
 *
 *  6. Raw buffer scan (fallback):
 *     Scan for JSON with a "command" key anywhere in the binary blob.
 *
 *  If all steps fail → sticker is treated as a regular (non-command) sticker
 *  and the function returns without sending anything.
 *
 * Usage (already wired in bot.js):
 *   import { handleStickerTrigger } from './lib/sticker-trigger.js';
 *   await handleStickerTrigger(sock, msg, { jid, handleCommand });
 */

import { loadSettings }        from '../settings.js';
import { parseStickerMeta, sha256ToHex } from './parser.js';
import {
  getMacro, getAlias, getPack, getPackCommand,
} from './macro-store.js';
import { executeStickerCommand, shouldSkip } from './executor.js';

// ─── Quick loop-prevention check (before any I/O) ────────────────────────────

/**
 * Fast guard that runs before any network/disk access.
 * Returns true if this sticker should definitely be skipped.
 * @param {object} msg
 * @returns {boolean}
 */
function quickSkip(msg) {
  // Skip bot's own stickers immediately — no need to check anything else
  if (msg.key.fromMe) return true;
  // Skip if there is no sticker payload
  if (!msg?.message?.stickerMessage) return true;
  return false;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

/**
 * Handle an incoming sticker message as a potential command trigger.
 *
 * @param {object} sock
 * @param {object} msg              - Full WAMessage (must contain stickerMessage)
 * @param {object} opts
 * @param {string}   opts.jid       - Chat JID
 * @param {Function} opts.handleCommand  - Command dispatcher from commands.js
 * @returns {Promise<void>}
 */
export async function handleStickerTrigger(sock, msg, { jid, handleCommand }) {
  if (quickSkip(msg)) return;

  const sticker    = msg.message.stickerMessage;
  const settings   = loadSettings();
  const prefix     = settings.prefix ?? '.';
  const sha256hex  = sha256ToHex(sticker?.fileSha256);

  // ── Step 1: Macro lookup (sha256 → command, no download) ─────────────────
  if (sha256hex) {
    const macro = getMacro(sha256hex);
    if (macro) {
      await executeStickerCommand(sock, msg, {
        command: macro.command,
        args:    macro.args ?? [],
        sha256:  sha256hex,
        packAuthor: '',
        handleCommand,
      });
      return;
    }
  }

  // ── Step 2: EXIF parse + alias + pack lookup (download required) ──────────
  let meta;
  try {
    meta = await parseStickerMeta(sock, msg, prefix);
  } catch {
    return;
  }

  // ── Step 3: Pack lookup — sticker sha256 registered inside a named pack ───
  if (sha256hex && meta.packName) {
    const packCmd = getPackCommand(meta.packName, sha256hex);
    if (packCmd) {
      await executeStickerCommand(sock, msg, {
        command:    packCmd.command,
        args:       packCmd.args ?? [],
        sha256:     sha256hex,
        packAuthor: meta.packAuthor,
        handleCommand,
      });
      return;
    }
  }

  // Also check every pack for this sha256 (even if packName didn't match)
  if (sha256hex) {
    // Iterate over macro-store packs to find a sha256 entry
    const { listPacks } = await import('./macro-store.js');
    for (const pack of listPacks()) {
      const found = getPackCommand(pack.name, sha256hex);
      if (found) {
        await executeStickerCommand(sock, msg, {
          command:    found.command,
          args:       found.args ?? [],
          sha256:     sha256hex,
          packAuthor: meta.packAuthor,
          handleCommand,
        });
        return;
      }
    }
  }

  // ── Step 4: Direct EXIF command (title/description starts with prefix) ────
  if (meta.command) {
    await executeStickerCommand(sock, msg, {
      command:    meta.command,
      args:       meta.args,
      sha256:     sha256hex,
      packAuthor: meta.packAuthor,
      handleCommand,
    });
    return;
  }

  // ── Step 5: Alias lookup on pack name / pack author ───────────────────────
  const aliasKey = meta.packName || meta.packAuthor;
  if (aliasKey) {
    const alias = getAlias(aliasKey);
    if (alias) {
      await executeStickerCommand(sock, msg, {
        command:    alias.command,
        args:       alias.args ?? [],
        sha256:     sha256hex,
        packAuthor: meta.packAuthor,
        handleCommand,
      });
      return;
    }
  }

  // ── No command found — sticker is not a command trigger ──────────────────
}

// ─── Re-exports for convenience ───────────────────────────────────────────────
export {
  getMacro, addMacro, removeMacro, listMacros, hasMacro,
  getAlias, addAlias, removeAlias, listAliases,
  getPack, addPack, addPackCommand, removePack, listPacks,
  getStats,
} from './macro-store.js';

export { parseStickerMeta, sha256ToHex } from './parser.js';
export { shouldSkip }                    from './executor.js';
