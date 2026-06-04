import { createCanvas, registerFont, loadImage } from "@napi-rs/canvas";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { promisify } from "util";

const execAsync = promisify(exec);

// Register fonts if available
const fontDir = path.join(path.dirname(new URL(import.meta.url).pathname), "../../media/font");
for (const [file, family] of [
  ["Aptos.ttf", "Aptos"],
  ["SFUIDisplay-Semibold.otf", "SFUI"],
]) {
  const fp = path.join(fontDir, file);
  try { if (fs.existsSync(fp)) registerFont(fp, { family }); } catch {}
}

const CONFIG = {
  bgColor: "white",
  textColor: "black",
  padding: 40,
  startFontSize: 130,
  minFontSize: 10,
};

function getFinalFontSize(text, width = 512, height = 512) {
  const maxW = width - CONFIG.padding * 2;
  const maxH = height - CONFIG.padding * 2;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  let fontSize = CONFIG.startFontSize;
  while (fontSize >= CONFIG.minFontSize) {
    ctx.font = `${fontSize}px Aptos, Arial`;
    const lineH = fontSize * 1.1;
    const words = text.replace(/\n/g, " \n ").split(" ");
    let lines = [];
    let cur = words[0] || "";

    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      if (w === "\n") { lines.push(cur); cur = ""; continue; }
      const test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width <= maxW) { cur = test; }
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);

    if (lines.length * lineH <= maxH) return fontSize;
    fontSize -= 1;
  }
  return CONFIG.minFontSize;
}

function drawFrame(text, fontSize, width = 512, height = 512) {
  const maxW = width - CONFIG.padding * 2;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = CONFIG.bgColor;
  ctx.fillRect(0, 0, width, height);

  ctx.font = `${fontSize}px Aptos, Arial`;
  ctx.fillStyle = CONFIG.textColor;
  const lineH = fontSize * 1.1;
  const words = text.replace(/\n/g, " \n ").split(" ");
  let lines = [];
  let cur = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (w === "\n") { lines.push(cur); cur = ""; continue; }
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width <= maxW) { cur = test; }
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);

  const totalH = lines.length * lineH;
  let y = (height - totalH) / 2 + fontSize;

  for (const line of lines) {
    const x = (width - ctx.measureText(line).width) / 2;
    ctx.fillText(line, x, y);
    y += lineH;
  }

  return canvas.toBuffer("image/png");
}

export async function makeBrat(text) {
  const fontSize = getFinalFontSize(text);
  const raw = drawFrame(text, fontSize);

  // Apply blur effect using sharp if available
  try {
    const { default: sharp } = await import("sharp");
    const blurred = await sharp(raw).blur(3).toBuffer();
    // Overlay blurred on white
    const base = sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } });
    return base.composite([{ input: blurred, blend: "over" }]).png().toBuffer();
  } catch {
    return raw;
  }
}

export async function makeBratVid(text, packname = "Bot", author = "Bot") {
  const tmpDir = "./temp";
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const id = crypto.randomBytes(4).toString("hex");
  const outPath = path.join(tmpDir, `brat_${id}.webp`);

  const fontSize = getFinalFontSize(text);

  // Build frames
  const frames = [];
  for (let i = 0; i <= 10; i++) {
    const buf = drawFrame(text, fontSize);
    const fp = path.join(tmpDir, `frame_${id}_${i}.png`);
    fs.writeFileSync(fp, buf);
    frames.push(fp);
  }

  await execAsync(
    `ffmpeg -r 5/3 -i ${path.join(tmpDir, `frame_${id}_%d.png`)} -vf "scale=512:512" -loop 0 ${outPath}`
  );

  const result = fs.readFileSync(outPath);
  for (const f of frames) try { fs.unlinkSync(f); } catch {}
  try { fs.unlinkSync(outPath); } catch {}

  return result;
}

export async function makeQC(text, name, ppUrl) {
  const W = 512, H = 110;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#1e1e2e";
  ctx.fillRect(0, 0, W, H);

  // Accent bar
  ctx.fillStyle = "#39d353";
  ctx.fillRect(0, 0, 4, H);

  // Avatar
  try {
    const img = await loadImage(ppUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(55, H / 2, 38, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, 17, H / 2 - 38, 76, 76);
    ctx.restore();
  } catch {}

  // Name
  ctx.font = "bold 16px Aptos, Arial";
  ctx.fillStyle = "#39d353";
  ctx.fillText(name, 105, 36);

  // Message
  ctx.font = "14px Aptos, Arial";
  ctx.fillStyle = "#c9d1d9";
  const maxW = W - 115;
  const words = text.split(" ");
  let line = "";
  let y = 58;
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW) {
      ctx.fillText(line, 105, y);
      line = word;
      y += 20;
      if (y > H - 10) break;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, 105, y);

  return canvas.toBuffer("image/png");
}

export async function toSticker(buffer, packname = "Bot", author = "Bot") {
  // Use sharp + webpmux to create a proper WhatsApp sticker
  const tmpDir = "./temp";
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const id = crypto.randomBytes(4).toString("hex");
  const inPath = path.join(tmpDir, `sticker_in_${id}.png`);
  const outPath = path.join(tmpDir, `sticker_out_${id}.webp`);

  fs.writeFileSync(inPath, buffer);

  try {
    await execAsync(
      `ffmpeg -i ${inPath} -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0" -quality 80 ${outPath}`
    );
    const result = fs.readFileSync(outPath);
    try { fs.unlinkSync(inPath); fs.unlinkSync(outPath); } catch {}
    return result;
  } catch {
    // Fallback: use sharp
    const { default: sharp } = await import("sharp");
    const result = await sharp(buffer)
      .resize(512, 512, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .webp({ quality: 80 })
      .toBuffer();
    try { fs.unlinkSync(inPath); } catch {}
    return result;
  }
}


// ── Welcome / Goodbye card generator ─────────────────────────────────────────
// Builds a 900x300 card: background (or gradient) + circular avatar + text.
// Used by src/lib/group.js when a member joins or leaves a group.

function _drawGradientBg(ctx, W, H, type) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  if (type === "welcome") {
    g.addColorStop(0, "#0f2027");
    g.addColorStop(0.5, "#203a43");
    g.addColorStop(1, "#2c5364");
  } else {
    g.addColorStop(0, "#200122");
    g.addColorStop(0.5, "#6f0000");
    g.addColorStop(1, "#200122");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export async function makeWelcomeCard({
  avatarUrl = null,
  name = "User",
  groupName = "Group",
  memberCount = 0,
  bgUrl = null,
  type = "welcome",
} = {}) {
  const W = 900, H = 300;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background
  if (bgUrl) {
    try {
      const bg = await loadImage(bgUrl);
      ctx.drawImage(bg, 0, 0, W, H);
    } catch {
      _drawGradientBg(ctx, W, H, type);
    }
  } else {
    _drawGradientBg(ctx, W, H, type);
  }
  ctx.fillStyle = type === "welcome" ? "rgba(0,0,0,0.58)" : "rgba(10,0,0,0.65)";
  ctx.fillRect(0, 0, W, H);

  // Avatar
  const AX = 150, AY = 150, RADIUS = 100;
  const ringColor = type === "welcome" ? "rgba(0,229,255,0.75)" : "rgba(255,107,107,0.75)";

  ctx.beginPath();
  ctx.arc(AX, AY, RADIUS + 6, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(AX, AY, RADIUS + 2, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(AX, AY, RADIUS, 0, Math.PI * 2);
  ctx.clip();
  try {
    const avatar = await loadImage(avatarUrl ?? "");
    ctx.drawImage(avatar, AX - RADIUS, AY - RADIUS, RADIUS * 2, RADIUS * 2);
  } catch {
    const ag = ctx.createRadialGradient(AX, AY - 20, 5, AX, AY, RADIUS);
    ag.addColorStop(0, "#5a7bff");
    ag.addColorStop(1, "#1a2a6c");
    ctx.fillStyle = ag;
    ctx.fillRect(AX - RADIUS, AY - RADIUS, RADIUS * 2, RADIUS * 2);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath(); ctx.arc(AX, AY - 28, 34, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(AX, AY + 72, 58, Math.PI, 0); ctx.fill();
  }
  ctx.restore();

  // Text
  const TX = 290;
  const label    = type === "welcome" ? "\u2736  WELCOME  \u2736" : "\u2736  GOODBYE  \u2736";
  const labelClr = type === "welcome" ? "#00e5ff" : "#ff6b6b";

  ctx.font = `bold 36px SFUI, Arial`;
  ctx.fillStyle   = labelClr;
  ctx.shadowColor = labelClr;
  ctx.shadowBlur  = 14;
  ctx.fillText(label, TX, 78);

  ctx.shadowBlur  = 6;
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.font = `bold 30px SFUI, Arial`;
  ctx.fillStyle = "#ffffff";
  const displayName = name.length > 22 ? name.slice(0, 22) + "..." : name;
  ctx.fillText(displayName, TX, 128);

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(TX, 144); ctx.lineTo(W - 30, 144); ctx.stroke();

  ctx.font = `22px SFUI, Arial`;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  const dispGroup = groupName.length > 32 ? groupName.slice(0, 32) + "..." : groupName;
  ctx.fillText("Group: " + dispGroup, TX, 182);

  ctx.font = `20px SFUI, Arial`;
  ctx.fillStyle = "rgba(180,210,255,0.68)";
  const memberText = type === "welcome"
    ? "Member #" + memberCount
    : memberCount + " members remaining";
  ctx.fillText(memberText, TX, 222);

  ctx.shadowBlur = 0;
  return canvas.toBuffer("image/png");
}
