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
import chalk from "chalk";
import { loadSettings, setSetting } from "./settings.js";
import { handleCommand } from "./commands.js";
import { handleStickerTrigger } from "./lib/sticker-trigger.js";
import { games } from "./lib/games.js";
import { participantsUpdate } from "./lib/group.js";
import { trackMessage as _trackGroupMsg, checkGroupSpam as _checkGroupSpam } from "./lib/group-db.js";
import "./registry-bootstrap.js";
import { loadPlugins } from "./plugin-loader.js";
import { workflowManager } from "./workflows/index.js";
import { startReminderService, stopReminderService } from "./lib/reminder-service.js";
import { gamesEngine } from "./games/index.js";
import { agentRouter } from "./agent/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.resolve(__dirname, "../bot_session");

// Graceful pino — falls back to a no-op compatible logger if not installed
const _noop = () => {};
const _makeLogger = (level = "info") => ({
  level, info: _noop, warn: _noop, error: _noop,
  debug: _noop, trace: _noop, fatal: _noop,
  child: () => _makeLogger(level),
});
let _pino;
try { _pino = (await import("pino")).default; } catch { _pino = (o) => _makeLogger(o?.level); }

export const logger = _pino({ level: process.env.LOG_LEVEL ?? "info" });
const silentLogger = _pino({ level: "silent" });

// ── Styled logger ─────────────────────────────────────────────────────────────
const ocean  = chalk.hex("#0096FF");
const lBlue  = chalk.hex("#64C8FF");
const ts = () =>
  chalk.hex("#4A90D9")("❯") +
  chalk.dim(new Date().toLocaleTimeString("en-US", { hour12: false }));

const badge = (bg, fg, label) => chalk.bgHex(bg).hex(fg).bold(` ${label} `);

const log = {
  event:   (...a) => console.log(`${ts()} ${badge("#0096FF","#ffffff","EVENT")}  ${lBlue(a.map(String).join(" "))}`),
  info:    (...a) => console.log(`${ts()} ${badge("#1E3A5F","#64C8FF","INFO ")}  ${chalk.dim(a.map(String).join(" "))}`),
  skip:    (...a) => console.log(`${ts()} ${badge("#2D2D00","#FFD700","SKIP ")}  ${chalk.hex("#888")(a.map(String).join(" "))}`),
  cmd:     (...a) => console.log(`${ts()} ${badge("#3D006E","#DA8FFF","CMD  ")}  ${chalk.hex("#DA8FFF").bold(a.map(String).join(" "))}`),
  ok:      (...a) => console.log(`${ts()} ${badge("#003D00","#4AFF4A"," OK  ")}  ${chalk.hex("#4AFF4A")(a.map(String).join(" "))}`),
  warn:    (...a) => console.log(`${ts()} ${badge("#3D2600","#FFB347","WARN ")}  ${chalk.hex("#FFB347")(a.map(String).join(" "))}`),
  err:     (...a) => console.log(`${ts()} ${badge("#4A0000","#FF6B6B","ERROR")}  ${chalk.hex("#FF6B6B").bold(a.map(String).join(" "))}`),
  connect: (...a) => console.log(`${ts()} ${badge("#003D1F","#00FF87","ONLINE")} ${chalk.hex("#00FF87").bold(a.map(String).join(" "))}`),
  discon:  (...a) => console.log(`${ts()} ${badge("#4A0000","#FF6B6B","OFFLINE")} ${chalk.hex("#FF6B6B")(a.map(String).join(" "))}`),
  msg:     (from, type, text) => {
    const sender = ocean.bold(from.padEnd(15));
    const kind   = chalk.dim(`[${type}]`).padEnd(20);
    const body   = chalk.white(text ? text.slice(0, 60) + (text.length > 60 ? "…" : "") : chalk.dim("(no text)"));
    console.log(`${ts()} ${badge("#0096FF","#ffffff","MSG  ")}  ${sender} ${kind} ${body}`);
  },
  push:    (...a) => console.log(`${ts()} ${badge("#004080","#AADDFF","PUSH ")}  ${lBlue(a.map(String).join(" "))}`),
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

// ── Session validator ─────────────────────────────────────────────────────────
// Removes corrupted JSON files from the session directory before Baileys tries
// to load them — a corrupted creds.json or pre-key file causes silent failures
// that look identical to network errors during pairing.
function validateSession(sessionDir) {
  if (!fs.existsSync(sessionDir)) return;
  let removed = 0;
  for (const file of fs.readdirSync(sessionDir)) {
    if (!file.endsWith(".json")) continue;
    const fPath = path.join(sessionDir, file);
    try {
      JSON.parse(fs.readFileSync(fPath, "utf8"));
    } catch {
      fs.unlinkSync(fPath);
      removed++;
      log.warn(`[PAIRING] Removed corrupted session file: ${chalk.dim(file)}`);
    }
  }
  if (removed > 0) {
    log.warn(`[PAIRING] Cleaned ${chalk.yellow(removed)} corrupted file(s) — fresh pairing required`);
  }
}

// ── Pairing readiness helper ──────────────────────────────────────────────────
// Waits until the noise-protocol handshake is confirmed complete.
// The reliable signal is `update.qr` (WhatsApp sends the QR payload once the
// handshake is done — this is the same moment pairing codes can be requested).
// Resolving on `connection === "connecting"` is WRONG: that fires the instant
// the TCP connection opens, before the handshake, causing 428 errors.
function waitForPairingReady(sock, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    // Race condition guard: WebSocket may already be open before we subscribe.
    // socketon exposes sock.ws (a standard WebSocket).
    if (sock.ws?.readyState === 1 /* OPEN */) {
      console.log("[PAIRING] WebSocket already OPEN — proceeding immediately");
      return resolve("ws_already_open");
    }

    const timer = setTimeout(() => {
      sock.ev.off("connection.update", handler);
      reject(new Error("Timeout waiting for pairing-ready signal"));
    }, timeoutMs);

    function handler(update) {
      if (update.connection === "connecting") {
        console.log("[PAIRING] Connection update: connecting");
      }
      // qr → handshake done, server is waiting for auth input
      if (update.qr) {
        clearTimeout(timer);
        sock.ev.off("connection.update", handler);
        console.log("[PAIRING] Connection update: open (QR event — noise handshake complete)");
        resolve("qr_received");
        return;
      }
      // open → already authenticated (rare on fresh session, but handle it)
      if (update.connection === "open") {
        clearTimeout(timer);
        sock.ev.off("connection.update", handler);
        console.log("[PAIRING] Connection update: open");
        resolve("connection_open");
      }
    }

    sock.ev.on("connection.update", handler);
  });
}

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
    // rowIds are stored with the prefix already embedded (e.g. ".menu ai", ".plugininfo ping").
    // Do NOT prepend another dot — just normalise underscores to spaces.
    const rowId = m.listResponseMessage.singleSelectReply.selectedRowId;
    return rowId.replace(/_/g, " ");
  }
  // FIX: handle nativeFlowMessage button taps (interactiveResponseMessage)
  if (m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
    try {
      return JSON.parse(m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id ?? "";
    } catch { return ""; }
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

  // Scrub corrupted session files before Baileys loads them.
  // A corrupted creds.json causes useMultiFileAuthState to throw or return
  // an invalid auth state that silently breaks the pairing handshake.
  console.log("[PAIRING] Socket created");
  validateSession(SESSION_DIR);

  await loadPlugins();

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
    // "Ubuntu" + Chrome is the most reliable platform string for pairing-code
    // mode across WhatsApp versions. "Android" can cause 428s on some WA builds
    // because the server expects a web/desktop handshake for pairing codes.
    browser: ["Ubuntu", "Chrome", "114.0.0.0"],
    patchMessageBeforeSending: (message) => {
      const requiresPatch = !!(
        message.buttonsMessage ||
        message.templateMessage ||
        message.listMessage
      );
      if (requiresPatch) {
        message = {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadataVersion: 2,
                deviceListMetadata: {},
              },
              ...message,
            },
          },
        };
      }
      return message;
    },
  });

  state.socket = sock;

  // Request pairing code if not yet registered
  if (!sock.authState.creds.registered) {
    // Use PHONE_NUMBER env (headless / cloud mode) or fall back to interactive prompt.
    // On Railway / Render / Fly.io / Docker stdin is not a TTY — promptPhone() would
    // hang for 60 seconds then crash.  If PHONE_NUMBER is set we skip the prompt.
    let phoneNumber;
    const _envPhone = (process.env.PHONE_NUMBER ?? "").replace(/[^0-9]/g, "");
    if (_envPhone) {
      phoneNumber = _envPhone;
      const line = "=".repeat(44);
      console.log(`\n${line}`);
      console.log("  🔗 WhatsApp Pairing Setup (headless mode)");
      console.log(`  📱 Using PHONE_NUMBER from env: ${phoneNumber}`);
      console.log(`  A pairing code will appear below — enter it in WhatsApp.`);
      console.log(`${line}`);
    } else {
      try {
        phoneNumber = await promptPhone();
      } catch (err) {
        console.log(`\n[!] ${err.message}\n`);
        return;
      }
    }

    // Save as ownerNumber automatically
    setSetting("ownerNumber", phoneNumber);
    logger.info({ phoneNumber }, "ownerNumber saved to settings.json");

    // ── Pairing code request with exponential backoff ─────────────────────────
    // Attempt 1 → wait 3 s before retry
    // Attempt 2 → wait 5 s before retry
    // Attempt 3 → wait 10 s then give up and restart the bot
    // This prevents request storms on Render / Railway cold starts where
    // the WS handshake can take significantly longer than on local machines.
    const PAIRING_RETRY_DELAYS = [3000, 5000, 10000];
    let pairingCode = null;

    for (let attempt = 1; attempt <= PAIRING_RETRY_DELAYS.length; attempt++) {
      console.log(`[PAIRING] Requesting pairing code — attempt ${attempt}/${PAIRING_RETRY_DELAYS.length}`);
      try {
        // Wait until the noise-protocol handshake is confirmed done.
        // On Render cold starts this can take up to 15-20 s — use a generous timeout.
        const onRender = !!(process.env.RENDER || process.env.IS_PULL_REQUEST);
        const readyTimeout = onRender ? 30000 : 20000;

        await waitForPairingReady(sock, readyTimeout).catch(async (err) => {
          // Fallback: if the event never fires (edge case), wait a bit and try anyway.
          // Cold-start Render boxes sometimes swallow the first connection.update.
          const fallback = onRender ? 8000 : 5000;
          log.warn(`[PAIRING] Request blocked — ${err.message} — fallback wait ${fallback}ms`);
          await new Promise((r) => setTimeout(r, fallback));
        });

        // Guard: refuse to call requestPairingCode if the WebSocket is not open.
        // readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
        const wsState = sock.ws?.readyState;
        if (wsState !== undefined && wsState !== 1) {
          throw new Error(`Socket not ready (ws.readyState=${wsState}) — cannot pair`);
        }

        console.log(`[PAIRING] Requesting pairing code for +${phoneNumber}`);
        pairingCode = await sock.requestPairingCode(phoneNumber);
        console.log(`[PAIRING] Pairing code received ✓`);
        break; // success — exit retry loop

      } catch (err) {
        const retryDelay = PAIRING_RETRY_DELAYS[attempt - 1];
        log.err(`[PAIRING] Attempt ${attempt} failed: ${chalk.red(err.message ?? err)}`);

        if (attempt < PAIRING_RETRY_DELAYS.length) {
          log.warn(`[PAIRING] Retrying in ${retryDelay / 1000}s...`);
          await new Promise((r) => setTimeout(r, retryDelay));
        }
      }
    }

    if (!pairingCode) {
      log.err("[PAIRING] All retry attempts exhausted — restarting bot in 12s");
      setTimeout(() => startBot().catch(console.error), 12000);
      return;
    }

    state.pairingCode = pairingCode;
    const line = "=".repeat(44);
    console.log(`\n${line}`);
    console.log(`  ✅ Pairing code for +${phoneNumber}:`);
    console.log(`  📱 Code: ${pairingCode}`);
    console.log(`  WhatsApp → Settings → Linked Devices`);
    console.log(`  → Link with phone number → enter code`);
    console.log(`${line}\n`);
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    // ── Structured [PAIRING] lifecycle logs ──────────────────────────────────
    if (update.qr) {
      console.log("[PAIRING] Connection update: open (QR/handshake signal received)");
    }
    if (connection === "connecting") {
      console.log("[PAIRING] Connection update: connecting");
    }
    if (connection === "open") {
      console.log("[PAIRING] Connection update: open");
    }

    if (connection === "close") {
      state.connected = false;
      state.phoneNumber = null;
      state.startedAt = null;
      state.pairingCode = null;
      state.socket = null;
      stopReminderService();

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
            `⚡ *Yuzuki MD is now online!*\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `✅ *Status:* Connected\n` +
            `📱 *Bot Number:* ${state.phoneNumber ?? "unknown"}\n` +
            `👑 *Owner:* ${ownerPhone}\n` +
            `🔑 *Prefix:* ${startupCfg.prefix ?? "."}\n` +
            `🕐 *Time:* ${now}\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `_Type ${startupCfg.prefix ?? "."}menu or .allmenu to get started_`,
        }).catch(() => {}); // silent if owner hasn't messaged bot yet
      }

      // ── Start background reminder service ───────────────────────────────────
      startReminderService(sock);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // ── Group participant events: welcome / goodbye cards ─────────────────
  sock.ev.on("group-participants.update",
    (update) => participantsUpdate(sock, update)
  );


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
      const msgFrom  = msg.key.remoteJid?.split("@")[0] ?? "?";
      log.msg(msgFrom, msgTypes[0] ?? "unknown", extractText(msg));

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

      // ── Group activity tracker + anti-spam ─────────────────────────────────
      if (msg.key.remoteJid?.endsWith("@g.us") && !msg.key.fromMe && msg.message) {
        const _gJid    = msg.key.remoteJid;
        const _tSender = msg.key.participant ?? "";
        if (_tSender) {
          _trackGroupMsg(_gJid, _tSender).catch(() => {});
          const _isSpam = _checkGroupSpam(_gJid, _tSender);
          if (_isSpam) {
            sock.sendMessage(_gJid, { delete: msg.key }).catch(() => {});
            sock.sendMessage(_gJid, {
              text: `@${_tSender.split("@")[0]} ⚠️ Anti-spam triggered. Please slow down!`,
              mentions: [_tSender],
            }).catch(() => {});
          }
        }
      }

      if (!text) {
        log.skip("empty text");
        continue;
      }
      // ── Sticker command trigger (feature 6) ───────────────────────────────
      const _stickerMsg = msg?.message?.stickerMessage;
      if (_stickerMsg) {
        try {
          await handleStickerTrigger(sock, msg, { jid: msg.key.remoteJid, handleCommand });
        } catch {}
      }

      // ── Workflow intercept ────────────────────────────────────────────────
      // Runs before the game handler and prefix check so workflow steps receive
      // both plain text ("1", "audio") and prefixed commands (".cancel").
      // resume() returns true  → message consumed; skip all further processing.
      // resume() returns false → no active workflow (or an interrupting command);
      //                          continue to normal routing below.
      if (workflowManager.has(msg.key.remoteJid)) {
        const _wfHandled = await workflowManager.resume(
          msg.key.remoteJid,
          text,
          { sock, msg, settings },
        ).catch(() => false);
        if (_wfHandled) continue;
      }

      // ── Games Engine input router ─────────────────────────────────────────
      // Routes unprefixed messages to any active game session (battles, ttt, etc.)
      // Returns true if consumed — skips legacy YuzukiGames handler and prefix check.
      if (text && !text.startsWith(settings?.prefix ?? ".")) {
        const _jid    = msg.key.remoteJid;
        const _sender = msg.key.participant || msg.key.remoteJid;
        if (gamesEngine.isActive(_jid)) {
          const _engineHandled = await gamesEngine.routeInput(
            _jid, text,
            { sock, msg, sender: _sender, settings },
          ).catch(() => false);
          if (_engineHandled) continue;
        }
      }

      // ── YuzukiGames answer handler (legacy — Q&A games via lib/games.js) ─────
      if (text && !text.startsWith(settings?.prefix ?? ".")) {
        try {
          const _chatId = msg.key.remoteJid;
          const _sender = msg.key.participant || msg.key.remoteJid;
          const _ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
          const _mAdapt = {
            chat: _chatId,
            body: text,
            sender: _sender,
            pushName: msg.pushName || "",
            quoted: _ctxInfo ? { id: _ctxInfo.stanzaId, fromMe: _ctxInfo.fromMe ?? false, isBaileys: false } : null,
            reply: async (txt, _opts) => {
              await sock.sendMessage(_chatId, { text: String(txt), ...(_opts?.mentions ? { mentions: _opts.mentions } : {}) }).catch(() => {});
            },
            react: async (emoji) => { try { await sock.sendMessage(_chatId, { react: { text: emoji, key: msg.key } }); } catch {} },
          };
          for (const [, cfg] of games.registry) {
            const { answerHandler } = games.createHandler(cfg.gameType);
            const handled = await answerHandler(_mAdapt, sock).catch(() => false);
            if (handled) break;
          }
        } catch {}
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
        // ── Agent layer: try multi-step workflow before single command ────────
        // agentRouter.route() receives the full body (prefix stripped) so it
        // can match natural-language patterns that span multiple words.
        // Returns true if a workflow claimed the message; false to fall through.
        // FIX: declare msgJid locally — `jid` is not in scope inside messageHandler
        const msgJid = msg.key.remoteJid;
        const _agentClaimed = await agentRouter.route(
          sock, msg, msgJid,
          msg.key.participant ?? msgJid ?? "",
          body, settings, prefix,
        ).catch(() => false);
        if (_agentClaimed) {
          log.ok(`${chalk.cyanBright("agent")} claimed ${chalk.dim(body.slice(0, 40))}`);
          continue;
        }
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
