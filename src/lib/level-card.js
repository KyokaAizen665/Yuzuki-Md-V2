/**
 * Yuzuki MD — Level-Up Notification Cards
 * Sends a styled canvas card when a user levels up.
 */

import { loadSettings } from "../settings.js";
import { getProfileBuffer, drawCircleAvatar } from "./profile-picture.js";

let _canvas = null;
async function _getCanvas() {
  if (!_canvas) _canvas = await import("@napi-rs/canvas");
  return _canvas;
}

export function xpForLevel(level) {
  return (level + 1) * 100;
}

export function computeLevel(xp) {
  let level = 0;
  while (xp >= xpForLevel(level)) level++;
  return Math.max(0, level - 1);
}

export async function generateLevelCard(data) {
  const { createCanvas, loadImage } = await _getCanvas();
  const { name, oldLevel, newLevel, xp, avatarBuf = null } = data;

  const W = 600, H = 200;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#1a1a2e");
  grad.addColorStop(1, "#16213e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createLinearGradient(0, 0, W, 4);
  glow.addColorStop(0, "#e94560");
  glow.addColorStop(0.5, "#f5a623");
  glow.addColorStop(1, "#e94560");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 4);

  const avatarX = 100, avatarY = H / 2, avatarR = 55;
  if (avatarBuf) {
    await drawCircleAvatar(ctx, avatarBuf, avatarX, avatarY, avatarR, {
      border: 4,
      borderColor: "#f5a623",
    });
  } else {
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
    ctx.fillStyle = "#e94560";
    ctx.fill();
    ctx.font = "bold 32px Arial";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.charAt(0).toUpperCase(), avatarX, avatarY);
    ctx.textBaseline = "alphabetic";
  }

  ctx.textAlign = "left";
  ctx.font = "bold 13px Arial";
  ctx.fillStyle = "#f5a623";
  ctx.fillText("⬆  LEVEL UP!", 180, 55);

  ctx.font = "bold 26px Arial";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(name.length > 18 ? name.slice(0, 18) + "…" : name, 180, 90);

  const oldLvlText = `Level ${oldLevel}`;
  ctx.font = "bold 18px Arial";
  ctx.fillStyle = "#AAAAAA";
  ctx.fillText(oldLvlText, 180, 120);
  ctx.fillStyle = "#f5a623";
  ctx.fillText(` → ${newLevel}`, 180 + ctx.measureText(oldLvlText).width, 120);

  const barX = 180, barY = 140, barW = 380, barH = 14;
  const nextXP   = xpForLevel(newLevel);
  const prevXP   = xpForLevel(Math.max(0, newLevel - 1));
  const progress = Math.min((xp - prevXP) / Math.max(nextXP - prevXP, 1), 1);

  ctx.fillStyle = "#2D2D4A";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(barX, barY, barW, barH, 7);
  else ctx.rect(barX, barY, barW, barH);
  ctx.fill();

  const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  barGrad.addColorStop(0, "#e94560");
  barGrad.addColorStop(1, "#f5a623");
  ctx.fillStyle = barGrad;
  ctx.beginPath();
  const filled = Math.max(barW * progress, barH);
  if (ctx.roundRect) ctx.roundRect(barX, barY, filled, barH, 7);
  else ctx.rect(barX, barY, filled, barH);
  ctx.fill();

  ctx.font = "12px Arial";
  ctx.fillStyle = "#AAAAAA";
  ctx.fillText(`${Math.max(0, xp - prevXP)} / ${Math.max(1, nextXP - prevXP)} XP`, barX, barY + barH + 16);

  return canvas.encode("png");
}

/**
 * Send a level-up card image to a chat.
 *
 * @param {object} sock
 * @param {string} jid     — chat JID
 * @param {string} sender  — sender JID
 * @param {string} name    — display name
 * @param {number} oldLevel
 * @param {number} newLevel
 * @param {number} xp      — current XP
 */
export async function sendLevelUpCard(sock, jid, sender, name, oldLevel, newLevel, xp) {
  try {
    const avatarBuf = await getProfileBuffer(sock, sender).catch(() => null);
    const cardBuf = await generateLevelCard({ name, oldLevel, newLevel, xp, avatarBuf });
    const settings = loadSettings();
    await sock.sendMessage(jid, {
      image: cardBuf,
      caption:
        `🎉 *LEVEL UP!*\n\n` +
        `👤 *${name}* reached *Level ${newLevel}!*\n` +
        `✨ Next level in ${Math.max(0, xpForLevel(newLevel) - xp)} XP`,
      contextInfo: {
        isForwarded: true,
        forwardingScore: 999,
        ...(settings.channelId && settings.channelName ? {
          forwardedNewsletterMessageInfo: {
            newsletterJid: settings.channelId,
            newsletterName: settings.channelName,
            serverMessageId: Math.floor(Math.random() * 1000) + 1,
          },
        } : {}),
      },
    });
  } catch (err) {
    // Fallback: plain text
    await sock.sendMessage(jid, {
      text:
        `🎉 *LEVEL UP!*\n` +
        `👤 *${name}* → Level *${newLevel}*!\n` +
        `🏆 Keep going!`,
    }).catch(() => {});
  }
}
