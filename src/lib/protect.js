import fs from "fs";

const DB_PATH = "./data/groups.json";

function loadGroups() {
  if (!fs.existsSync(DB_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(DB_PATH, "utf8")); } catch { return {}; }
}

function saveGroups(data) {
  const dir = "./data";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export function getGroupData(jid) {
  const groups = loadGroups();
  if (!groups[jid]) {
    groups[jid] = {
      antilink: { all: false, gc: false, ch: false, tt: false, ig: false, yt: false, fb: false, tw: false, wame: false, tagsw: false, swgc: false, toxic: false },
      antilinkAction: "silent",
      antilinkWarnLimit: 3,
      warns: {},
      welcome: true,
      left: true,
    };
    saveGroups(groups);
  }
  return groups[jid];
}

export function setGroupData(jid, data) {
  const groups = loadGroups();
  groups[jid] = data;
  saveGroups(groups);
}

const PATTERNS = {
  all: /(https?:\/\/[^\s]+)/gi,
  gc: /(chat\.whatsapp\.com\/[A-Za-z0-9]+)/gi,
  ch: /(whatsapp\.com\/channel\/[A-Za-z0-9]+)/gi,
  tt: /(tiktok\.com|vt\.tiktok\.com)/gi,
  ig: /(instagram\.com)/gi,
  yt: /(youtube\.com|youtu\.be)/gi,
  fb: /(facebook\.com|fb\.com|fb\.watch|fb\.gg)/gi,
  tw: /(twitter\.com|x\.com)/gi,
  wame: /(wa\.me\/|api\.whatsapp\.com\/)/gi,
};

export async function antilinkDetector(sock, msg, { text, type, isAdmin, isOwner, isBotAdmin, sender }) {
  if (!msg.key.remoteJid?.endsWith("@g.us")) return false;
  const jid = msg.key.remoteJid;
  const gc = getGroupData(jid);

  if (isAdmin || isOwner) return false;
  if (!isBotAdmin) return false;

  let detected = null;

  for (const [key, pattern] of Object.entries(PATTERNS)) {
    if (gc.antilink[key] && pattern.test(text || "")) {
      detected = key;
      break;
    }
  }

  let toxicWord = "";
  if (!detected && gc.antilink.toxic) {
    const badwordPath = "./data/badwords.json";
    if (fs.existsSync(badwordPath)) {
      const words = JSON.parse(fs.readFileSync(badwordPath, "utf8"));
      if (words.length) {
        const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const rx = new RegExp(`\\b(${escaped.join("|")})\\b`, "i");
        const match = (text || "").match(rx);
        if (match) { detected = "toxic"; toxicWord = match[0]; }
      }
    }
  }

  if (!detected) return false;

  const action = gc.antilinkAction || "silent";
  const senderNum = sender?.split("@")[0] || "";

  try { await sock.sendMessage(jid, { delete: msg.key }); } catch {}

  if (action === "warn") {
    if (!gc.warns) gc.warns = {};
    if (!gc.warns[sender]) gc.warns[sender] = 0;
    gc.warns[sender]++;
    setGroupData(jid, gc);

    const limit = gc.antilinkWarnLimit || 3;
    if (gc.warns[sender] >= limit) {
      try {
        await sock.groupParticipantsUpdate(jid, [sender], "remove");
        await sock.sendMessage(jid, { text: `@${senderNum} was kicked after ${limit} warnings for sending restricted links.`, mentions: [sender] });
      } catch {}
    } else {
      await sock.sendMessage(jid, {
        text: `@${senderNum} warning ${gc.warns[sender]}/${limit}: Restricted link${detected === "toxic" ? ` (toxic word: "${toxicWord}")` : ""}.`,
        mentions: [sender],
      });
    }
  } else if (action === "kick") {
    try {
      await sock.groupParticipantsUpdate(jid, [sender], "remove");
      await sock.sendMessage(jid, { text: `@${senderNum} was kicked for sending a restricted link.`, mentions: [sender] });
    } catch {}
  }

  return true;
}
