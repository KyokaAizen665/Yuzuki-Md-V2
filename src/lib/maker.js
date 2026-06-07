import { exec } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { promisify } from "util";

const execAsync = promisify(exec);

// Lazy canvas loader — prevents crash if @napi-rs/canvas native binary is
// unavailable on the host (e.g. Pterodactyl containers with mismatched glibc).
let _canvasMod = null;
let _fontsRegistered = false;

async function getCanvas() {
  if (!_canvasMod) {
    _canvasMod = await import("@napi-rs/canvas");
    if (!_fontsRegistered) {
      const fontDir = path.join(path.dirname(new URL(import.meta.url).pathname), "../../media/font");
      for (const [file, family] of [
        ["Aptos.ttf", "Aptos"],
        ["SFUIDisplay-Semibold.otf", "SFUI"],
      ]) {
        const fp = path.join(fontDir, file);
        try { if (fs.existsSync(fp)) _canvasMod.registerFont(fp, { family }); } catch {}
      }
      _fontsRegistered = true;
    }
  }
  return _canvasMod;
}

const CONFIG = {
  bgColor: "white",
  textColor: "black",
  padding: 40,
  startFontSize: 130,
  minFontSize: 10,
};

async function getFinalFontSize(text, width = 512, height = 512) {
  const { createCanvas } = await getCanvas();
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

async function drawFrame(text, fontSize, width = 512, height = 512) {
  const { createCanvas } = await getCanvas();
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
  const fontSize = await getFinalFontSize(text);
  const raw = await drawFrame(text, fontSize);

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

  const fontSize = await getFinalFontSize(text);

  // Build frames
  const frames = [];
  for (let i = 0; i <= 10; i++) {
    const buf = await drawFrame(text, fontSize);
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
  const { createCanvas, loadImage } = await getCanvas();
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
// Builds a 640×640 square card so the avatar is centred and fully visible
// when WhatsApp renders it as an externalAdReply thumbnail (which is ~square).
// Layout: background fill → avatar centred near the top → text below.

function _drawGradientBg(ctx, W, H, type) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  if (type === "welcome") {
    g.addColorStop(0,   "#0f2027");
    g.addColorStop(0.5, "#203a43");
    g.addColorStop(1,   "#2c5364");
  } else {
    g.addColorStop(0,   "#200122");
    g.addColorStop(0.5, "#6f0000");
    g.addColorStop(1,   "#200122");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// Helper: centre-aligned text
function _centreText(ctx, text, y, W) {
  ctx.fillText(text, (W - ctx.measureText(text).width) / 2, y);
}

export async function makeWelcomeCard({
  avatarUrl = null,
  name = "User",
  groupName = "Group",
  memberCount = 0,
  bgUrl = null,
  type = "welcome",
} = {}) {
  const { createCanvas, loadImage } = await getCanvas();

  // Square canvas — matches WhatsApp thumbnail display shape
  const W = 640, H = 640;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ── Background ────────────────────────────────────────────────────────────
  if (bgUrl) {
    try {
      const bg = await loadImage(bgUrl);
      // Cover-fit: scale background to fill the square, crop edges if needed
      const scale = Math.max(W / bg.width, H / bg.height);
      const bw = bg.width * scale, bh = bg.height * scale;
      ctx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
    } catch {
      _drawGradientBg(ctx, W, H, type);
    }
  } else {
    _drawGradientBg(ctx, W, H, type);
  }

  // Dark overlay so text is always readable
  ctx.fillStyle = type === "welcome" ? "rgba(0,0,0,0.55)" : "rgba(10,0,0,0.62)";
  ctx.fillRect(0, 0, W, H);

  // ── Avatar — centred horizontally, in the top half ────────────────────────
  const AX = W / 2;      // horizontal centre
  const AY = 220;        // vertical centre of avatar circle
  const RADIUS = 110;    // large so it dominates the card

  const accentColor = type === "welcome" ? "#00e5ff" : "#ff6b6b";

  // Outer glow ring
  ctx.beginPath();
  ctx.arc(AX, AY, RADIUS + 8, 0, Math.PI * 2);
  ctx.strokeStyle = type === "welcome" ? "rgba(0,229,255,0.7)" : "rgba(255,107,107,0.7)";
  ctx.lineWidth = 5;
  ctx.stroke();

  // White inner ring
  ctx.beginPath();
  ctx.arc(AX, AY, RADIUS + 3, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Clipped avatar circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(AX, AY, RADIUS, 0, Math.PI * 2);
  ctx.clip();
  try {
    const avatar = await loadImage(avatarUrl ?? "");
    ctx.drawImage(avatar, AX - RADIUS, AY - RADIUS, RADIUS * 2, RADIUS * 2);
  } catch {
    // Silhouette placeholder
    const ag = ctx.createRadialGradient(AX, AY - 20, 5, AX, AY, RADIUS);
    ag.addColorStop(0, "#5a7bff");
    ag.addColorStop(1, "#1a2a6c");
    ctx.fillStyle = ag;
    ctx.fillRect(AX - RADIUS, AY - RADIUS, RADIUS * 2, RADIUS * 2);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath(); ctx.arc(AX, AY - 34, 40, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(AX, AY + 80, 68, Math.PI, 0); ctx.fill();
  }
  ctx.restore();

  // ── Text — centred below the avatar ──────────────────────────────────────
  const label    = type === "welcome" ? "✦  WELCOME  ✦" : "✦  GOODBYE  ✦";

  // Label
  ctx.font = `bold 38px SFUI, Arial`;
  ctx.fillStyle   = accentColor;
  ctx.shadowColor = accentColor;
  ctx.shadowBlur  = 16;
  _centreText(ctx, label, 380, W);

  // Name
  ctx.shadowBlur  = 6;
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.font = `bold 32px SFUI, Arial`;
  ctx.fillStyle = "#ffffff";
  const displayName = name.length > 24 ? name.slice(0, 24) + "…" : name;
  _centreText(ctx, displayName, 428, W);

  // Divider line
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  const lineY = 448;
  ctx.beginPath();
  ctx.moveTo(W * 0.15, lineY);
  ctx.lineTo(W * 0.85, lineY);
  ctx.stroke();

  // Group name
  ctx.font = `22px SFUI, Arial`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const dispGroup = groupName.length > 30 ? groupName.slice(0, 30) + "…" : groupName;
  _centreText(ctx, "⚡ " + dispGroup, 488, W);

  // Member count
  ctx.font = `20px SFUI, Arial`;
  ctx.fillStyle = "rgba(180,210,255,0.72)";
  const memberText = type === "welcome"
    ? "👥 Member #" + memberCount
    : "👥 " + memberCount + " members remaining";
  _centreText(ctx, memberText, 528, W);

  ctx.shadowBlur = 0;
  return canvas.toBuffer("image/png");
}
