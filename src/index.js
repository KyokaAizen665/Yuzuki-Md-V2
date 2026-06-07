// ── Auto-install missing npm packages ─────────────────────────────────────────
// Uses only Node builtins (child_process, fs) — always available.
// Runs npm install if any key dependency is missing so the panel never crashes
// on a missing package after git pull.
import { execSync }   from "child_process";
import { existsSync } from "fs";

// Packages that panel installs commonly skip — if any are missing, run npm install
const _KEY_PKGS = ["chalk", "pino", "axios", "dotenv", "figlet", "cheerio", "moment-timezone", "yt-search", "file-type", "jimp", "lodash"];
if (_KEY_PKGS.some(p => !existsSync(`./node_modules/${p}`))) {
  console.log("[*] Missing packages detected — running npm install...");
  try {
    execSync("npm install --no-audit --no-fund --loglevel=error", { stdio: "inherit" });
    console.log("[+] Dependencies installed successfully.\n");
  } catch (e) {
    console.error("[!] npm install encountered errors (bot will still try to start):", e.message);
  }
}

// Load .env if available (graceful — panels inject vars directly, no .env needed)
try { await import("dotenv/config"); } catch {}

// Graceful chalk — falls back to a pass-through proxy if not installed
function _mkChalk() { const f = (...a) => String(a[0] ?? ""); return new Proxy(f, { get: () => _mkChalk() }); }
let chalk;
try { chalk = (await import("chalk")).default; } catch { chalk = _mkChalk(); }
import "./server.js";
import { startBot, logger } from "./bot.js";

// ── Validate Node version ─────────────────────────────────────────────────────
const nodeVersion = parseInt(process.version.slice(1));
if (nodeVersion < 20) {
  console.error(`❌ Node 20+ required, got ${process.version}`);
  process.exit(1);
}

// ── Blue whale startup banner ─────────────────────────────────────────────────
function printBanner() {
  const b  = chalk.hex("#0096FF");     // ocean blue
  const lb = chalk.hex("#64C8FF");     // light blue
  const w  = chalk.white.bold;
  const d  = chalk.dim;
  const c  = chalk.cyan.bold;

  const whale = [
    b("          .-'''''''''''''''''''''''''-.         "),
    b("        .'") + lb("  🐋  ") + w("Y U Z U K I  M D") + lb("  v2  ") + b("'.       "),
    b("       /") + d("   ─────────────────────────────") + b("  \\      "),
    b("      :") + d("      WhatsApp Bot  •  Baileys Fork    ") + b(":     "),
    b("      :") + d(`      Node ${process.version}  •  Powered by focashi  `) + b(":     "),
    b("      :") + d("      ") + c("github.com/KyokaAizen665/Yuzuki-Md-V2") + b(":  "),
    b("      :") + d("                                       ") + b(":___  "),
    b("       \\") + d("  ─────────────────────────────────") + b("/") + lb("~~~~"),
    b("        '.") + d("_________________________________") + b(".'        "),
    b("       ") + lb("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~") + b("         "),
  ];

  console.log();
  whale.forEach(l => console.log("  " + l));
  console.log();
}

printBanner();

// Headless env check — warn early if PHONE_NUMBER is missing and stdin is not interactive
const _phoneEnvCheck = (process.env.PHONE_NUMBER ?? "").replace(/[^0-9]/g, "");
if (!_phoneEnvCheck && !process.stdin.isTTY) {
  console.warn(
    `\n⚠️  WARNING: PHONE_NUMBER is not set and stdin is not interactive.\n` +
    `   The bot cannot pair a device without a phone number.\n` +
    `   Set PHONE_NUMBER=<digits only> in your environment variables.\n`
  );
}

startBot().catch((err) => {
  logger.error({ err }, "Fatal error starting bot");
  setTimeout(() => process.exit(1), 2000);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down...");
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down...");
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — shutting down");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection — shutting down");
  process.exit(1);
});
