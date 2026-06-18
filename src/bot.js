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
import { sendCard, urlButton, prepareImageHeader } from "./message-engine/interactive.js";
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

// ── Graceful pino logger ──────────────────────────────────────────────────────
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
      if (!cleaned || cleaned.length < 10) {
        reject(new Error("Invalid phone number (too short)"));
      } else {
        resolve(cleaned);
      }
    });
    rl.on("error", (err) => { clearTimeout(timeout); reject(err); });
  });
}

export const state = {
  connected: false,
  phoneNumber: null,
  botName: null,
  startedAt: null,
  pairingCode: null,
  waitingForPairing: false,
  socket: null,
};

let reconnectTimer = null;
let messageHandler = null;

// ── Session validator ─────────────────────────────────────────────────────────
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
// cv3inx/baileys exposes sock.waitForSocketOpen() which resolves when the
// noise-protocol handshake is confirmed complete (ws.readyState === OPEN).
// We prefer that over the QR-based approach (which was unreliable in pairing-code mode).
async function waitForPairingReady(sock, timeoutMs = 25000) {
  // ── Path 1: cv3inx/baileys — use built-in waitForSocketOpen() ────────────
  if (typeof sock.waitForSocketOpen === "function") {
    console.log("[PAIRING] Using sock.waitForSocketOpen() (cv3inx/baileys)");
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout waiting for socket open")), timeoutMs)
    );
    await Promise.race([sock.waitForSocketOpen(), timeoutPromise]);
    console.log("[PAIRING] WebSocket open confirmed via waitForSocketOpen()");
    return "socket_open";
  }

  // ── Path 2: Direct ws.readyState check (already open) ────────────────────
  if (sock.ws?.readyState === 1 /* OPEN */) {
    console.log("[PAIRING] WebSocket already OPEN — proceeding immediately");
    return "ws_already_open";
  }

  // ── Path 3: Event-based fallback ──────────────────────────────────────────
  // Listen for ws 'open' event OR the connection.update QR signal.
  console.log("[PAIRING] Waiting for socket open via event listener...");
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sock.ev.off("connection.update", connHandler);
      if (sock.ws?.removeListener) sock.ws.removeListener("open", wsOpenHandler);
      reject(new Error("Timeout waiting for pairing-ready signal"));
    }, timeoutMs);

    const done = (reason) => {
      clearTimeout(timer);
      sock.ev.off("connection.update", connHandler);
      if (sock.ws?.removeListener) sock.ws.removeListener("open", wsOpenHandler);
      console.log(`[PAIRING] Socket ready: ${reason}`);
      resolve(reason);
    };

    // WebSocket OPEN event — fires immediately after handshake on cv3inx
    const wsOpenHandler = () => done("ws_open_event");
    if (sock.ws?.on) sock.ws.on("open", wsOpenHandler);

    // connection.update QR signal — fallback for older Baileys forks
    function connHandler(update) {
      if (update.qr) done("qr_received");
      else if (update.connection === "open") done("connection_open");
    }
    sock.ev.on("connection.update", connHandler);
  });
}

// ── Text extractor ────────────────────────────────────────────────────────────
function extractText(msg) {
  const m = msg.message;
  if (!m) return "";
  if (typeof m.conversation === "string") return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.normalTextMessage?.text) return m.normalTextMessage.text;
  if (m.ephemeralMessage?.message) return extractText({ message: m.ephemeralMessage.message });
  if (m.viewOnceMessage?.message) return extractText({ message: m.viewOnceMessage.message });
  if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) {
    const rowId = m.listResponseMessage.singleSelectReply.selectedRowId;
    return rowId.replace(/_/g, " ");
  }
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

// ── Auth state provider ───────────────────────────────────────────────────────
// Supports both multi-file (default) and SQLite (SESSION_TYPE=sqlite) modes.
// SQLite mode uses WAL journaling and atomic writes — survives hard restarts.
//
// Auto-migration: if SESSION_TYPE=sqlite and existing multi-file JSON session
// files are present, they are migrated to the SQLite DB on first boot.
// A ".sqlite_migrated" marker prevents the migration from running a second time.

// Known signal key-type prefixes — ordered longest-first to avoid partial matches.
const SIGNAL_KEY_PREFIXES = [
  "app-state-sync-version-",
  "app-state-sync-key-",
  "sender-key-memory-",
  "sender-key-",
  "pre-key-",
  "session-",
];

async function migrateToSqlite(sessionDir, mfState, sqliteResult) {
  const files = fs.readdirSync(sessionDir)
    .filter((f) => f.endsWith(".json") && f !== "creds.json");

  // Group file names into { type → [id, ...] }
  const grouped = {};
  for (const file of files) {
    const base = file.slice(0, -5); // strip .json
    for (const prefix of SIGNAL_KEY_PREFIXES) {
      if (base.startsWith(prefix)) {
        const type = prefix.slice(0, -1);             // strip trailing dash
        const id   = base.slice(prefix.length).replace(/_/g, ":"); // unescape colons
        (grouped[type] = grouped[type] ?? []).push(id);
        break;
      }
    }
  }

  // For each key type: read from multi-file store → write to SQLite store
  for (const [type, ids] of Object.entries(grouped)) {
    if (!ids.length) continue;
    let data;
    try { data = await mfState.state.keys.get(type, ids); } catch { continue; }
    const nonNull = Object.entries(data ?? {}).filter(([, v]) => v != null);
    if (!nonNull.length) continue;
    try {
      await sqliteResult.state.keys.set({ [type]: Object.fromEntries(nonNull) });
    } catch { /* best-effort */ }
  }

  // Copy credentials last (overwrites empty initAuthCreds in the fresh SQLite state)
  Object.assign(sqliteResult.state.creds, mfState.state.creds);
  await sqliteResult.saveCreds();
}

async function loadAuthState() {
  const sessionType = (process.env.SESSION_TYPE ?? "multifile").toLowerCase();
  const MIGRATION_MARKER = path.join(SESSION_DIR, ".sqlite_migrated");

  if (sessionType === "sqlite") {
    try {
      const { useSqliteAuthState } = _require("socketon");
      if (typeof useSqliteAuthState !== "function") throw new Error("useSqliteAuthState not exported");

      const dbPath = path.join(SESSION_DIR, "auth.db");

      // ── One-time auto-migration: multi-file JSON → SQLite ────────────────
      const hasJsonFiles  = fs.existsSync(SESSION_DIR) &&
        fs.readdirSync(SESSION_DIR).some((f) => f.endsWith(".json"));
      const alreadyMigrated = fs.existsSync(MIGRATION_MARKER);

      if (hasJsonFiles && !alreadyMigrated) {
        log.warn("[SESSION] Detected multi-file session — migrating to SQLite (one-time)...");
        try {
          const mfState   = await useMultiFileAuthState(SESSION_DIR);
          // cv3inx/baileys useSqliteAuthState takes { dbPath } — NOT a plain string
          const sqliteRes = await useSqliteAuthState({ dbPath });

          await migrateToSqlite(SESSION_DIR, mfState, sqliteRes);

          const jsonCount = fs.readdirSync(SESSION_DIR).filter((f) => f.endsWith(".json")).length;
          fs.writeFileSync(MIGRATION_MARKER, new Date().toISOString(), "utf8");
          log.ok(`[SESSION] Migration complete — ${chalk.green(jsonCount)} key file(s) migrated to ${chalk.dim("auth.db")}`);
          return sqliteRes;
        } catch (migErr) {
          log.warn(`[SESSION] Migration failed (${migErr.message}) — falling back to multi-file`);
          return await useMultiFileAuthState(SESSION_DIR);
        }
      }

      // cv3inx/baileys useSqliteAuthState takes { dbPath } — NOT a plain string
      const result = await useSqliteAuthState({ dbPath });
      log.ok(`[SESSION] SQLite auth state (${chalk.dim(dbPath)})`);
      return result;
    } catch (err) {
      log.warn(`[SESSION] SQLite unavailable (${err.message}) — falling back to multi-file`);
    }
  }

  // Default: multi-file JSON state
  const result = await useMultiFileAuthState(SESSION_DIR);
  log.info(`[SESSION] Multi-file auth state (${chalk.dim(SESSION_DIR)})`);
  return result;
}

export async function startBot() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  console.log("[PAIRING] Socket created");
  validateSession(SESSION_DIR);

  await loadPlugins();

  // Sync ownerNumber from PHONE_NUMBER env
  const envPhone = (process.env.PHONE_NUMBER ?? "").replace(/[^0-9]/g, "");
  if (envPhone) {
    const currentOwner = loadSettings().ownerNumber;
    if (currentOwner !== envPhone) {
      setSetting("ownerNumber", envPhone);
      logger.info({ envPhone }, "ownerNumber synced from PHONE_NUMBER env");
    }
  }

  const { state: authState, saveCreds } = await loadAuthState();
  const { version } = await fetchLatestBaileysVersion();

  logger.info({ version }, "Using WhatsApp version");

  const sock = makeWASocket({
    version,
    auth: authState,
    printQRInTerminal: false,
    logger: silentLogger,
    syncFullHistory: false,
    markOnlineOnConnect: true,
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

    setSetting("ownerNumber", phoneNumber);
    logger.info({ phoneNumber }, "ownerNumber saved to settings.json");

    // Retry pairing code with exponential backoff
    const PAIRING_RETRY_DELAYS = [3000, 5000, 10000];
    let pairingCode = null;

    for (let attempt = 1; attempt <= PAIRING_RETRY_DELAYS.length; attempt++) {
      console.log(`[PAIRING] Requesting pairing code — attempt ${attempt}/${PAIRING_RETRY_DELAYS.length}`);
      try {
        const onRender = !!(process.env.RENDER || process.env.IS_PULL_REQUEST);
        const readyTimeout = onRender ? 35000 : 25000;

        await waitForPairingReady(sock, readyTimeout).catch(async (err) => {
          const fallback = onRender ? 8000 : 5000;
          log.warn(`[PAIRING] waitForPairingReady error — ${err.message} — fallback wait ${fallback}ms`);
          await new Promise((r) => setTimeout(r, fallback));
        });

        // Guard: refuse to call requestPairingCode if WS is not OPEN
        const wsState = sock.ws?.readyState;
        if (wsState !== undefined && wsState !== 1) {
          throw new Error(`Socket not ready (ws.readyState=${wsState}) — cannot pair`);
        }

        console.log(`[PAIRING] Requesting pairing code for +${phoneNumber}`);
        pairingCode = await sock.requestPairingCode(phoneNumber);
state.waitingForPairing = true;
console.log(`[PAIRING] Pairing code received ✓`);
        break;

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

    if (update.qr)                        console.log("[PAIRING] Connection update: open (QR/handshake signal received)");
    if (connection === "connecting")       console.log("[PAIRING] Connection update: connecting");
    if (connection === "open")             console.log("[PAIRING] Connection update: open");

    if (connection === "close") {
      state.connected  = false;
      state.phoneNumber = null;
      state.startedAt  = null;
      state.pairingCode = null;
      state.socket     = null;
      stopReminderService();

      // ── Structured disconnect diagnostics ───────────────────────────────────
      const err        = lastDisconnect?.error;
      const statusCode = err?.output?.statusCode ?? err?.output?.payload?.statusCode;
      const errMsg     = err?.message ?? err?.output?.payload?.message ?? String(err ?? "unknown");
      const errPayload = err?.output?.payload ?? {};
      const errStack   = err?.stack;

      console.log(`[DISCONNECT] ${"─".repeat(48)}`);
      console.log(`[DISCONNECT] Status Code : ${chalk.yellow(statusCode ?? "undefined")}`);
      console.log(`[DISCONNECT] Error Msg   : ${chalk.red(errMsg)}`);
      if (Object.keys(errPayload).length)
        console.log(`[DISCONNECT] Payload     : ${chalk.dim(JSON.stringify(errPayload))}`);
      if (errStack)
        console.log(`[DISCONNECT] Stack       :\n${chalk.dim(errStack)}`);
      console.log(`[DISCONNECT] ${"─".repeat(48)}`);

      // ── Disconnect reason routing ──────────────────────────────────────────
      //   401 / loggedOut   → clear session, restart (user must re-pair)
      //   403 / forbidden   → account banned; do NOT reconnect
      //   500 / badSession  → corrupted session; wipe and restart
      //   515 / restartReq  → server-side restart required; reconnect immediately
      //   default           → generic reconnect with 5 s delay

      if (statusCode === 401 || statusCode === DisconnectReason.loggedOut) {

  const registered = !!sock?.authState?.creds?.registered;

  console.log("[DEBUG-401]", {
    registered,
    waitingForPairing: state.waitingForPairing,
    statusCode
  });

  if (state.waitingForPairing && !registered) {
    log.warn(
      "[DISCONNECT] 401 received during pairing flow — preserving session"
    );

    setTimeout(() => startBot().catch(console.error), 3000);
    return;
  }

  log.err(
    "[DISCONNECT] Real logout detected — clearing session and restarting"
  );

  if (fs.existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  }

  setTimeout(() => startBot().catch(console.error), 3000);
  return;
}

      if (statusCode === 403) {
        log.err("[DISCONNECT] Account forbidden/banned — NOT reconnecting");
        return;
      }

      if (statusCode === 500) {
        log.err("[DISCONNECT] Bad session (500) — wiping session and restarting");
        if (fs.existsSync(SESSION_DIR)) fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        setTimeout(() => startBot().catch(console.error), 3000);
        return;
      }

      if (statusCode === 515 || statusCode === DisconnectReason.restartRequired) {
        log.warn("[DISCONNECT] Restart required by server — reconnecting in 1s");
        setTimeout(() => startBot().catch(console.error), 1000);
        return;
      }

      if (statusCode === 516) {
        log.warn("[DISCONNECT] Connection replaced (another session opened) — reconnecting in 5s");
        setTimeout(() => startBot().catch(console.error), 5000);
        return;
      }

      // Default: reconnect unless explicitly logged out
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 403;
      log.discon(`status=${chalk.yellow(statusCode)} reconnect=${chalk.cyan(shouldReconnect)}`);

      if (shouldReconnect) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          startBot().catch((e) => logger.error({ err: e }, "Failed to restart bot"));
        }, 5000);
      }
    }

    if (connection === "open") {
  state.waitingForPairing = false;
      state.connected   = true;
      state.pairingCode = null;
      state.startedAt   = new Date();
      const jid         = sock.user?.id ?? null;
      state.phoneNumber = jid ? jid.split(":")[0] ?? null : null;
      state.botName     = sock.user?.name ?? null;
      log.connect(`${chalk.greenBright(state.botName ?? "Bot")} ${chalk.dim("phone=")}${chalk.green(state.phoneNumber ?? "?")}`);

      // Sync ownerNumber from real connected JID
      if (state.phoneNumber) {
        const savedOwner = loadSettings().ownerNumber;
        if (savedOwner !== state.phoneNumber) {
          setSetting("ownerNumber", state.phoneNumber);
          log.ok(`ownerNumber synced ${chalk.dim(savedOwner)} ${chalk.greenBright("→")} ${chalk.green(state.phoneNumber)}`);
        }
      }

      // Startup notification to owner
      const startupCfg = loadSettings();
      const ownerPhone = startupCfg.ownerNumber || (process.env.PHONE_NUMBER ?? "").replace(/[^0-9]/g, "");
      const ownerJid   = ownerPhone ? `${ownerPhone}@s.whatsapp.net` : null;

      if (ownerJid) {
        const now = new Date().toLocaleString(undefined, {
          weekday: "short", month: "short", day: "numeric",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        });
        const heroUrl = "https://www.upload.ee/image/19419994/file.jpg";

        (async () => {
          try {
            const mediaHeader = await prepareImageHeader(sock, { url: heroUrl });
            await sendCard(sock, ownerJid, null, {
              body:
                `⚡ *Yuzuki MD is now online!*\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `✅ *Status:* Connected\n` +
                `📱 *Bot Number:* ${state.phoneNumber ?? "unknown"}\n` +
                `👑 *Owner:* ${ownerPhone}\n` +
                `🔑 *Prefix:* ${startupCfg.prefix ?? "."}\n` +
                `🕐 *Time:* ${now}\n` +
                `━━━━━━━━━━━━━━━━━━━\n\n` +
                `🌸 Yuzuki is ready to serve users.\n\n` +
                `_Type ${startupCfg.prefix ?? "."}menu to get started._`,
              footer: "Yuzuki MD",
              mediaHeader,
              buttons: [urlButton("📢 Join Channel", "https://whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326")],
              fallback: `⚡ Yuzuki MD is now online!\nStatus: Connected`,
            });
          } catch { /* owner may not have messaged bot yet */ }
        })();
      }

      startReminderService(sock);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("group-participants.update", (update) => participantsUpdate(sock, update));

  // Remove old listener before registering new one (prevents duplicates)
  if (messageHandler) {
    sock.ev.off("messages.upsert", messageHandler);
  }

  // Settings cache (30 s) to reduce file I/O
  let cachedSettings = null;
  let settingsCacheTime = 0;
  const CACHE_TTL = 30000;

  messageHandler = async ({ messages, type }) => {
    log.event(`messages.upsert ${chalk.white("type=")}${chalk.cyan(type)} ${chalk.white("count=")}${chalk.cyan(messages.length)}`);

    if (type !== "notify") {
      log.skip(`type ${chalk.dim(type)} is not ${chalk.cyan("notify")}`);
      return;
    }

    const now2 = Date.now();
    if (!cachedSettings || now2 - settingsCacheTime > CACHE_TTL) {
      cachedSettings = loadSettings();
      settingsCacheTime = now2;
    }
    const settings = cachedSettings;

    for (const msg of messages) {
      const msgTypes = msg.message ? Object.keys(msg.message) : [];
      const msgFrom  = msg.key.remoteJid?.split("@")[0] ?? "?";
      log.msg(msgFrom, msgTypes[0] ?? "unknown", extractText(msg));

      if (msg.key.fromMe) {
        const quickText   = extractText(msg);
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

      // Group activity tracker + anti-spam
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

      if (!text) { log.skip("empty text"); continue; }

      // Sticker trigger
      const _stickerMsg = msg?.message?.stickerMessage;
      if (_stickerMsg) {
        try { await handleStickerTrigger(sock, msg, { jid: msg.key.remoteJid, handleCommand }); } catch {}
      }

      // Workflow intercept
      if (workflowManager.has(msg.key.remoteJid)) {
        const _wfHandled = await workflowManager.resume(
          msg.key.remoteJid, text, { sock, msg, settings },
        ).catch(() => false);
        if (_wfHandled) continue;
      }

      // Games Engine input router
      if (text && !text.startsWith(settings?.prefix ?? ".")) {
        const _jid    = msg.key.remoteJid;
        const _sender = msg.key.participant || msg.key.remoteJid;
        if (gamesEngine.isActive(_jid)) {
          const _engineHandled = await gamesEngine.routeInput(
            _jid, text, { sock, msg, sender: _sender, settings },
          ).catch(() => false);
          if (_engineHandled) continue;
        }
      }

      // YuzukiGames legacy Q&A handler
      if (text && !text.startsWith(settings?.prefix ?? ".")) {
        try {
          const _chatId   = msg.key.remoteJid;
          const _sender   = msg.key.participant || msg.key.remoteJid;
          const _ctxInfo  = msg.message?.extendedTextMessage?.contextInfo;
          const _mAdapt   = {
            chat: _chatId, body: text, sender: _sender,
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
        const mode   = settings.mode   ?? "public";

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
          const senderJid = msg.key.participant ?? msg.key.remoteJid ?? "";
          const ownerNum  = settings.ownerNumber;
          if (!ownerNum || !senderJid.startsWith(ownerNum)) {
            log.skip(`self mode — ${chalk.dim(senderJid.split("@")[0])} is not owner`);
            continue;
          }
        }

        const body    = text.slice(prefix.length).trim();
        const parts   = body.split(/\s+/);
        const command = (parts[0] ?? "").toLowerCase();
        const args    = parts.slice(1).filter(Boolean);

        if (!command) continue;

        log.cmd(`${chalk.white(".")}${chalk.magentaBright(command)} ${chalk.dim(args.join(" "))}`);

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
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (state.socket) {
    if (messageHandler) {
      state.socket.ev.off("messages.upsert", messageHandler);
      messageHandler = null;
    }
    await state.socket.logout().catch(() => {});
    state.socket = null;
  }
  state.connected   = false;
  state.phoneNumber = null;
  state.startedAt   = null;
  state.pairingCode = null;
}

export async function clearSession() {
  await stopBot();
  if (fs.existsSync(SESSION_DIR)) fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  await startBot();
}
