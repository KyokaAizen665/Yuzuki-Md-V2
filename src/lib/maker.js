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
