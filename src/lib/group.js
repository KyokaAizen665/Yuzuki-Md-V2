/**
 * group.js
 * Handles WhatsApp group participant events.
 *
 * Events handled:
 *   add     → Welcome card  (respects gc.welcome flag)
 *   remove  → Goodbye card  (respects gc.left flag)
 *   promote → Admin notification
 *   demote  → Member notification
 */

import axios from "axios";
import { makeWelcomeCard } from "./maker.js";
import { getGroupData } from "./protect.js";
import { logger } from "../bot.js";

// Fallback static background (same as HydroMD original)
const FALLBACK_BG     = "https://raw.githubusercontent.com/AhmadAkbarID/media/main/weIcome.jpg";
const FALLBACK_AVATAR = "https://i.ibb.co/1s8T3sY/48f7ce63c7aa.jpg";
const REPO_URL        = "https://github.com/KyokaAizen665/Yuzuki-Md-V2";

/**
 * Main handler — wire to sock.ev.on("group-participants.update", ...)
 * @param {object} sock     Baileys socket
 * @param {object} update   { id, participants, action, author? }
 */
export async function participantsUpdate(sock, update) {
  try {
    const { id, participants, action, author } = update;

    // Respect per-group welcome/left toggle (set via .welcome / .left commands)
    const gc = getGroupData(id);
    if (action === "add"    && !gc.welcome) return;
    if (action === "remove" && !gc.left)    return;
    if (!["add", "remove", "promote", "demote"].includes(action)) return;

    // Fetch group metadata (name + member count)
    let metadata;
    try { metadata = await sock.groupMetadata(id); }
    catch (e) { logger.error({ e }, "[group] Failed to get group metadata"); return; }

    const groupName   = metadata.subject ?? "Group";
    const memberCount = metadata.participants?.length ?? 0;
    const actorNum    = author ? author.split("@")[0] : "System";

    for (const num of participants) {
      const userNum = num.split("@")[0];

      // Profile picture (fallback to placeholder)
      let ppUrl = FALLBACK_AVATAR;
      try { ppUrl = await sock.profilePictureUrl(num, "image"); } catch {}

      if (action === "add") {
        // ── Welcome card ──────────────────────────────────────────────────────
        let cardBuffer = await _buildCard({
          avatarUrl: ppUrl, name: userNum, groupName, memberCount,
          type: "welcome",
        });

        await sock.sendMessage(id, {
          text: `Welcome @${userNum}!\n` +
                `-----\n` +
                `Group: ${groupName}\n` +
                `Member #${memberCount}\n\n` +
                `Be respectful and enjoy your stay!`,
          contextInfo: {
            mentionedJid: [num],
            ...(cardBuffer && {
              externalAdReply: {
                title: `Welcome To ${groupName}`,
                body: `Member #${memberCount}`,
                thumbnail: cardBuffer,
                sourceUrl: REPO_URL,
                mediaType: 1,
                renderLargerThumbnail: true,
              },
            }),
          },
        });

      } else if (action === "remove") {
        // ── Goodbye card ──────────────────────────────────────────────────────
        let cardBuffer = await _buildCard({
          avatarUrl: ppUrl, name: userNum, groupName, memberCount,
          type: "left",
        });

        await sock.sendMessage(id, {
          text: `@${userNum} has left the group.\n` +
                `-----\n` +
                `${groupName}\n` +
                `${memberCount} members remaining`,
          contextInfo: {
            mentionedJid: [num],
            ...(cardBuffer && {
              externalAdReply: {
                title: `Goodbye From ${groupName}`,
                body: `${memberCount} members remaining`,
                thumbnail: cardBuffer,
                sourceUrl: REPO_URL,
                mediaType: 1,
                renderLargerThumbnail: true,
              },
            }),
          },
        });

      } else if (action === "promote") {
        await sock.sendMessage(id, {
          text: `@${userNum} has been promoted to *Admin* by @${actorNum}.`,
          contextInfo: { mentionedJid: author ? [num, author] : [num] },
        });

      } else if (action === "demote") {
        await sock.sendMessage(id, {
          text: `@${userNum} has been demoted to *Member* by @${actorNum}.`,
          contextInfo: { mentionedJid: author ? [num, author] : [num] },
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "[group] participantsUpdate error");
  }
}

/**
 * Generate a welcome/goodbye card buffer.
 * Falls back to the static HydroMD background image on canvas error.
 */
async function _buildCard({ avatarUrl, name, groupName, memberCount, type }) {
  // Try local canvas generation first
  try {
    return await makeWelcomeCard({ avatarUrl, name, groupName, memberCount, bgUrl: FALLBACK_BG, type });
  } catch (e) {
    logger.warn({ e }, "[group] makeWelcomeCard failed, using static fallback");
  }
  // Fallback: fetch the static background image
  try {
    const { data } = await axios.get(FALLBACK_BG, { responseType: "arraybuffer", timeout: 8000 });
    return Buffer.from(data);
  } catch {
    return null; // message will still send, just without the card thumbnail
  }
}
