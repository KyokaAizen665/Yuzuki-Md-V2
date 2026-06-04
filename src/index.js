import "dotenv/config";
import "./server.js";
import { startBot, logger } from "./bot.js";

// Validate Node version
const nodeVersion = parseInt(process.version.slice(1));
if (nodeVersion < 20) {
  console.error(`❌ Node 20+ required, got ${process.version}`);
  process.exit(1);
}

logger.info("🐋 Starting bot...");
logger.info("Tip: Scan the QR code that appears in the console with WhatsApp > Linked Devices");

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
