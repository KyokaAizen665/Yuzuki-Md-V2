// Load .env if available (graceful — panels inject vars directly, no .env needed)
try { await import("dotenv/config"); } catch {}
import chalk from "chalk";
import "./server.js";
import { startBot, logger } from "./bot.js";
import { startMemoryMonitor } from "./lib/memory-monitor.js";

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

startMemoryMonitor();
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

// FIX: Don't exit immediately on unhandledRejection — many libraries (including
// Baileys / ws / node-fetch) emit transient rejections that are non-fatal.
// Log the reason; only exit if it looks like a hard crash (Error instance with
// an exit-worthy code). Continuing keeps the WhatsApp session alive.
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  logger.error({ reason }, `Unhandled rejection — ${msg}`);
  // Exit only on memory errors or explicit exit signals
  if (
    reason instanceof Error &&
    (reason.code === "ERR_OUT_OF_MEMORY" || msg.includes("out of memory"))
  ) {
    process.exit(1);
  }
  // Otherwise: log and continue — bot stays connected
});
