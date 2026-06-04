import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = _require("socketon");
import path from "path";
import readline from "readline";
import fs from "fs";
import { fileURLToPath } from "url";
import pino from "pino";
import chalk from "chalk";
import { loadSettings, setSetting } from "./settings.js";
import { handleCommand } from "./commands.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.resolve(__dirname, "../bot_session");

export const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

const silentLogger = pino({ level: "silent" });

// ── Pretty chalk logger for message handling ──────────────────────────────────
const ts = () => chalk.dim(new Date().toLocaleTimeString("en-US", { hour12: false }));
const log = {
  event:   (...a) => console.log(`${ts()} ${chalk.bgCyan.black(" EVENT ")}  ${a.map(String).join(" ")}`),
  info:    (...a) => console.log(`${ts()} ${chalk.cyanBright("ℹ INFO")}    ${a.map(String).join(" ")}`),
  skip:    (...a) => console.log(`${ts()} ${chalk.yellow("⏭ SKIP")}    ${a.map(String).join(" ")}`),
  cmd:     (...a) => console.log(`${ts()} ${chalk.magentaBright("⚡ CMD")}     ${a.map(String).join(" ")}`),
  ok:      (...a) => console.log(`${ts()} ${chalk.greenBright("✔ OK")}      ${a.map(String).join(" ")}`),
  warn:    (...a) => console.log(`${ts()} ${chalk.yellowBright("⚠ WARN")}    ${a.map(String).join(" ")}`),
  err:     (...a) => console.log(`${ts()} ${chalk.redBright("✖ ERROR")}   ${a.map(String).join(" ")}`),
  connect: (...a) => console.log(`${ts()} ${chalk.bgGreen.black(" ONLINE ")} ${a.map(String).join(" ")}`),
  discon:  (...a) => console.log(`${ts()} ${chalk.bgRed.white(" OFFLINE ")} ${a.map(String).join(" ")}`),
};


// ── Interactive phone number prompt ───────────────────────────────────────────
async function promptPhone() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    // FIX: Added timeout protection to prevent hanging
    const timeout = setTimeout(() => {
      rl.close();
      reject(new Error("Phone input timeout (60s)"));
    }, 60000);

    const line = "=".repeat(44);
    console.log(`\n${line}`);
    console.log("  🔗 WhatsApp Pairing Setup");
    console.log("  Enter your WhatsApp number below");
    console.log("  (digits only, e.g. 233531234567)");
    console.log(`${line}`);
    rl.question("  Your number: ", (answer) => {
      clearTimeout(timeout);
      rl.close();
      const cleaned = answer.replace(/[^0-9]/g, "");
      // FIX: Validate phone number length
      if (!cleaned || cleaned.length < 10) {
        reject(new Error("Invalid phone number (too short)"));
      } else {
        resolve(cleaned);
      }
    });

    // FIX: Handle readline errors
    rl.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export const state = {
  connected: false,
  phoneNumber: null,
  botName: null,
  startedAt: null,
  pairingCode: null,
  socket: null,
};

let reconnectTimer = null;
let messageHandler = null; // FIX: Track event listener to prevent duplicates

/**
 * Extract plain text from any message type Baileys sends.
 * FIX: added normalTextMessage support (used by newer WhatsApp clients)
 */
function extractText(msg) {
  const m = msg.message;
  if (!m) return "";
  if (typeof m.conversation === "string") return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  // FIX: newer WhatsApp clients send plain DMs as normalTextMessage
  if (m.normalTextMessage?.text) return m.normalTextMessage.text;
  if (m.ephemeralMessage?.message) return extractText({ message: m.ephemeralMessage.message });
  if (m.viewOnceMessage?.message) return extractText({ message: m.viewOnceMessage.message });
  if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) {
    // Convert rowId e.g. "menu_ai" → ".menu ai" for command routing
    const rowId = m.listResponseMessage.singleSelectReply.selectedRowId;
    return "." + rowId.replace(/_/g, " ");
  }
  return "";
}

export function getBotState() {
  const { socket: _s, ...rest } = state;
  return rest;
}

export async function startBot() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  // ── Startup: sync ownerNumber from PHONE_NUMBER env ──────────────
  // Always keeps settings.json in sync with the Pterodactyl PHONE_NUMBER.
  const envPhone = (process.env.PHONE_NUMBER ?? "").replace(/[^0-9]/g, "");
  if (envPhone) {
    const currentOwner = loadSettings().ownerNumber;
    if (currentOwner !== envPhone) {
      setSetting("ownerNumber", envPhone);
      logger.info({ envPhone }, "ownerNumber synced from PHONE_NUMBER env");
    }
  }

  const { state: authState, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  logger.info({ version }, "Using WhatsApp version");

  const sock = makeWASocket({
    version,
    auth: authState,
    printQRInTerminal: false,
    logger: silentLogger,
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  state.socket = sock;

  // Request pairing code if not yet registered
  if (!sock.authState.creds.registered) {
    // Prompt user for their phone number (interactive)
    let phoneNumber;
    try {
      phoneNumber = await promptPhone();
    } catch (err) {
      console.log(`\n[!] ${err.message}\n`);
      return;
    }

    // Save as ownerNumber automatically
    setSetting("ownerNumber", phoneNumber);
    logger.info({ phoneNumber }, "ownerNumber saved to settings.json");

    try {
      await new Promise((r) => setTimeout(r, 2000));
      const code = await sock.requestPairingCode(phoneNumber);
      state.pairingCode = code;
      const line = "=".repeat(44);
      console.log(`\n${line}`);
      console.log(`  ✅ Pairing code for +${phoneNumber}:`);
      console.log(`  📱 Code: ${code}`);
      console.log(`  WhatsApp → Settings → Linked Devices`);
      console.log(`  → Link with phone number → enter code`);
      console.log(`${line}\n`);
    } catch (err) {
      logger.error({ err }, "Failed to request pairing code — retrying in 5s");
      setTimeout(() => startBot().catch(console.error), 5000);
      return;
    }
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      state.connected = false;
      state.phoneNumber = null;
      state.startedAt = null;
      state.pairingCode = null;
      state.socket = null;

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      log.discon(`status=${chalk.yellow(statusCode)} reconnect=${chalk.cyan(shouldReconnect)}`);

      if (shouldReconnect) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          startBot().catch((err) => logger.error({ err }, "Failed to restart bot"));
        }, 5000);
      }
    }

    if (connection === "open") {
      state.connected = true;
      state.pairingCode = null;
      state.startedAt = new Date();
      const jid = sock.user?.id ?? null;
      state.phoneNumber = jid ? jid.split(":")[0] ?? null : null;
      state.botName = sock.user?.name ?? null;
      log.connect(`${chalk.greenBright(state.botName ?? "Bot")} ${chalk.dim("phone=")}${chalk.green(state.phoneNumber ?? "?")}`);

      // ── HARD FIX: always sync ownerNumber from the real connected JID ────
      // This ensures the owner check never fails due to number format mismatch.
      // The JID from sock.user.id is the ground truth — no +, no leading 0, just digits.
      if (state.phoneNumber) {
        const savedOwner = loadSettings().ownerNumber;
        if (savedOwner !== state.phoneNumber) {
          setSetting("ownerNumber", state.phoneNumber);
          log.ok(`ownerNumber synced ${chalk.dim(savedOwner)} ${chalk.greenBright("→")} ${chalk.green(state.phoneNumber)}`);
        }
      }

      // ── WhatsApp startup notification to owner ────────────────────
      const startupCfg = loadSettings();
      // FIX: Simplified redundant phone number extraction
      const ownerPhone = startupCfg.ownerNumber || (process.env.PHONE_NUMBER ?? "").replace(/[^0-9]/g, "");
      const ownerJid = ownerPhone ? `${ownerPhone}@s.whatsapp.net` : null;
      
      if (ownerJid) {
        const botName = state.botName || startupCfg.botName || "Yuzuki MD";
        // FIX: Use local timezone instead of hardcoded en-US
        const now = new Date().toLocaleString(undefined, {
          weekday: "short", month: "short", day: "numeric",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        });
        //Next upgrage add contextInfo to this message for a thumbnail (small)
        sock.sendMessage(ownerJid, {
          text:
            `⚡ *${botName} MD is now online!*\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `✅ *Status:* Connected\n` +
            `📱 *Bot Number:* ${state.phoneNumber ?? "unknown"}\n` +
            `👑 *Owner:* ${ownerPhone}\n` +
            `🔑 *Prefix:* ${startupCfg.prefix ?? "."}\n` +
            `🕐 *Time:* ${now}\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `_Type ${startupCfg.prefix ?? "."}menu to get started_`,
        }).catch(() => {}); // silent if owner hasn't messaged bot yet
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // FIX: Remove old listener before adding new one to prevent duplicates
  if (messageHandler) {
    sock.ev.off("messages.upsert", messageHandler);
  }

  // FIX: Cache settings to avoid reloading on every message
  let cachedSettings = null;
  let settingsCacheTime = 0;
  const CACHE_TTL = 30000; // 30 seconds

  messageHandler = async ({ messages, type }) => {
    log.event(`messages.upsert ${chalk.white("type=")}${chalk.cyan(type)} ${chalk.white("count=")}${chalk.cyan(messages.length)}`);

    if (type !== "notify") {
      log.skip(`type ${chalk.dim(type)} is not ${chalk.cyan("notify")}`);
      return;
    }

    // FIX: Cache settings to reduce file I/O
    const now = Date.now();
    if (!cachedSettings || now - settingsCacheTime > CACHE_TTL) {
      cachedSettings = loadSettings();
      settingsCacheTime = now;
    }
    const settings = cachedSettings;

    for (const msg of messages) {
      const msgTypes = msg.message ? Object.keys(msg.message) : [];
      log.info(`Processing ${chalk.white("from=")}${chalk.cyan(msg.key.remoteJid?.split("@")[0] ?? "?")} ${chalk.white("fromMe=")}${chalk.cyan(msg.key.fromMe)} ${chalk.dim(msgTypes.join(", "))}`);

      if (msg.key.fromMe) {
        // Linked-device bot: owner's own typing also arrives as fromMe.
        // Let command-like messages through; skip bot's own replies.
        const quickText = extractText(msg);
        const quickPrefix = settings.prefix ?? ".";
        if (!quickText || !quickText.startsWith(quickPrefix)) {
          log.skip(`fromMe non-command ${chalk.dim("(bot reply)")}`);
          continue;
        }
        log.info(`fromMe command detected ${chalk.greenBright("→ processing")}`);
      }
      if (!msg.message) {
        log.skip("no message object");
        continue;
      }

      const text = extractText(msg);
      log.info(`Extracted: ${chalk.white(text || chalk.dim("(empty)"))}`);

      if (!text) {
        log.skip("empty text");
        continue;
      }

      try {
        const prefix = settings.prefix ?? ".";
        const mode = settings.mode ?? "public";

        log.info(`Settings ${chalk.white("prefix=")}${chalk.cyan(prefix)} ${chalk.white("mode=")}${chalk.cyan(mode)} ${chalk.white("gconly=")}${chalk.cyan(settings.gconly)}`);

        if (!text.startsWith(prefix)) {
          log.skip(`no prefix ${chalk.dim(text.slice(0, 30))}`);
          continue;
        }

        const isGroup = msg.key.remoteJid?.endsWith("@g.us") ?? false;
        if (settings.gconly && !isGroup) {
          log.skip("gconly enabled — DM ignored");
          continue;
        }

        if (mode === "self" && !msg.key.fromMe) {
          // fromMe messages are always from the owner (linked device),
          // so skip this gate for them.
          const senderJid = msg.key.participant ?? msg.key.remoteJid ?? "";
          const ownerNum = settings.ownerNumber;
          if (!ownerNum || !senderJid.startsWith(ownerNum)) {
            log.skip(`self mode — ${chalk.dim(senderJid.split("@")[0])} is not owner`);
            continue;
          }
        }

        const body = text.slice(prefix.length).trim();
        const parts = body.split(/\s+/);
        const command = (parts[0] ?? "").toLowerCase();
        const args = parts.slice(1).filter(Boolean);

        if (!command) continue;

        log.cmd(`${chalk.white(".")}${chalk.magentaBright(command)} ${chalk.dim(args.join(" "))}`);
        // FIX: Better error handling for command execution
        try {
          await handleCommand({ sock, msg, command, args });
          log.ok(`${chalk.greenBright("." + command)} completed`);
        } catch (cmdErr) {
          log.err(`Command failed: ${chalk.redBright(cmdErr?.message ?? cmdErr)}`);
          logger.error({ err: cmdErr, command }, "Command execution failed");
        }
      } catch (err) {
        log.err(`${chalk.redBright(err?.message ?? err)}`);
      }
    }
  };

  sock.ev.on("messages.upsert", messageHandler);
}

export async function stopBot() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (state.socket) {
    // FIX: Remove message handler before closing
    if (messageHandler) {
      state.socket.ev.off("messages.upsert", messageHandler);
      messageHandler = null;
    }
    await state.socket.logout().catch(() => {});
    state.socket = null;
  }
  state.connected = false;
  state.phoneNumber = null;
  state.startedAt = null;
  state.pairingCode = null;
}

export async function clearSession() {
  await stopBot();
  if (fs.existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  }
  await startBot();
}
