import "dotenv/config";
import chalk from "chalk";
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
