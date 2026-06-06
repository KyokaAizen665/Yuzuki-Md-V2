import os from "os";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import {
  loadSettings,
  setSetting,
  isOwner,
  getOwners,
  addOwner,
  removeOwner,
  getKeys,
  addKey,
  removeKey,
  getResellers,
  addReseller,
  removeReseller,
  resetReseller,
  getCases,
  addCase,
  removeCase,
  editCase,
} from "./settings.js";
import { clearSession, stopBot, startBot, state as botState } from "./bot.js";
import { CATEGORIES, buildMain, buildSub, buildListPayload, MENU_BG } from "./menu.js";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import QRCode from "qrcode";
import ytdl from "@distube/ytdl-core";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const {
  downloadMediaMessage,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto,
} = _require("socketon");
// ── HydroMD merged scrapers & libs ──────────────────────────────────────────
import { tiktokDl } from "./lib/scrape/tiktok.js";
import { igdl as igDl } from "./lib/scrape/instagram.js";
import { ytmp3 as ytDlMp3, ytmp4 as ytDlMp4 } from "./lib/scrape/youtube.js";
import { spotifyScrape, searchSpotify } from "./lib/scrape/spotify.js";
import { searchPinterestAPI } from "./lib/scrape/pinterest.js";
import { searchDafont } from "./lib/scrape/dafont.js";
import { mathgpt } from "./lib/scrape/mathgpt.js";
import { FeloClient } from "./lib/scrape/feloai.js";
import { chatex } from "./lib/scrape/chatexai.js";
import { makeBrat, makeBratVid, makeQC, toSticker } from "./lib/maker.js";
import {
  initUserDB, loadDB, saveDB,
  getLimitCost, setLimitCost,
  checkLimit, useLimit,
} from "./lib/database.js";
import { antilinkDetector, getGroupData, setGroupData } from "./lib/protect.js";
const execAsync = promisify(exec);
let _openai=null,_anth=null,_genAI=null;
const getOpenAI=()=>{if(!_openai&&process.env.OPENAI_API_KEY)_openai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});return _openai;};
const getAnth=()=>{if(!_anth&&process.env.ANTHROPIC_API_KEY)_anth=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY});return _anth;};
const getGenAI=()=>{if(!_genAI&&process.env.GEMINI_API_KEY)_genAI=new GoogleGenerativeAI(process.env.GEMINI_API_KEY);return _genAI;};
async function dlQuoted(msg,jid){const ctx=msg.message?.extendedTextMessage?.contextInfo;if(!ctx?.quotedMessage)return null;const fm={key:{remoteJid:jid,id:ctx.stanzaId,fromMe:ctx.fromMe??false,participant:ctx.participant},message:ctx.quotedMessage};return{buf:await downloadMediaMessage(fm,"buffer",{}),qm:ctx.quotedMessage};}
const INVIDIOUS=["https://iv.ggtyler.dev","https://invidious.nerdvpn.de","https://invidious.perennialte.ch"];
async function ytSearch(q){for(const b of INVIDIOUS){try{const r=await fetch(`${b}/api/v1/search?q=${encodeURIComponent(q)}&type=video`,{signal:AbortSignal.timeout(7000)});if(r.ok)return await r.json();}catch{}}return null;}
async function invGet(path){for(const b of INVIDIOUS){try{const r=await fetch(`${b}${path}`,{signal:AbortSignal.timeout(7000)});if(r.ok)return await r.json();}catch{}}return null;}
function extractVid(url){const m=url?.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);return m?.[1]??null;}
function extractPid(url){const m=url?.match(/list=([a-zA-Z0-9_-]+)/);return m?.[1]??null;}
function fmtNum(n){if(!n)return "N/A";const x=parseInt(n);if(x>=1e9)return(x/1e9).toFixed(1)+"B";if(x>=1e6)return(x/1e6).toFixed(1)+"M";if(x>=1e3)return(x/1e3).toFixed(1)+"K";return x.toLocaleString();}
function fmtDur(s){const d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60),sec=s%60;if(d>0)return`${d}d ${h}h ${m}m`;if(h>0)return`${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;return`${m}:${String(sec).padStart(2,"0")}`;}
const gameStates=new Map();
function tttBoard(b){const s=(i)=>b[i]||String(i+1);return`${s(0)}|${s(1)}|${s(2)}\n-+-+-\n${s(3)}|${s(4)}|${s(5)}\n-+-+-\n${s(6)}|${s(7)}|${s(8)}`;}
function tttWin(b,p){return[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]].some(([a,c,d])=>b[a]===p&&b[c]===p&&b[d]===p);}
function tttBot(b){const e=b.map((v,i)=>v?null:i).filter(v=>v!==null);for(const i of e){const t=[...b];t[i]="O";if(tttWin(t,"O"))return i;}for(const i of e){const t=[...b];t[i]="X";if(tttWin(t,"X"))return i;}if(b[4]===null)return 4;return e[Math.floor(Math.random()*e.length)];}
const HM_WORDS=["javascript","programming","elephant","adventure","chocolate","university","basketball","watermelon","technology","friendship","butterfly","strawberry","dangerous","knowledge","dictionary","television","helicopter","constitution","multiplication","championship"];
function hmFig(w){const s=["   \n   |\n   |\n   |\n=====","  _\n  |\n   |\n   |\n=====","  _\n  | |\n  O  |\n     |\n     |\n=====","  _\n  | |\n  O  |\n  |  |\n     |\n=====","  _\n  | |\n  O  |\n /|  |\n     |\n=====","  _\n  | |\n  O  |\n /|\\ |\n     |\n=====","  _\n  | |\n  O  |\n /|\\ |\n /   |\n=====","  _\n  | |\n  O  |\n /|\\ |\n / \\ |\n====="];return"```\n"+s[Math.min(w,7)]+"\n```";}
function bjDeck(){const su=["♠","♥","♦","♣"],ra=["A","2","3","4","5","6","7","8","9","10","J","Q","K"],d=[];for(const s of su)for(const r of ra)d.push(r+s);for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}
function bjVal(h){let v=0,a=0;for(const c of h){const r=c.slice(0,-1);if(r==="A"){v+=11;a++;}else if(["J","Q","K"].includes(r))v+=10;else v+=parseInt(r);}while(v>21&&a>0){v-=10;a--;}return v;}


  /**
   * Returns a fake "verified contact" quoted context.
   * When passed as { quoted: ... } in sendMessage, WhatsApp renders
   * the reply header as a contact card — giving the bot a verified-looking badge.
   *
   * Fixes vs original snippet:
   *  - sendEphemeral was incorrectly placed inside contactMessage (invalid field) — removed
   *  - displayName and vcard now use the live bot name + number instead of hardcoded values
   */
  function getVerifiedQuoted(settings) {
    const botName = settings.botName ?? "Yuzuki MD";
    const botNumber = (botState.phoneNumber ?? "0").replace(/[^0-9]/g, "");
    return {
      key: {
        participant: "0@s.whatsapp.net",
        remoteJid: "status@broadcast",
      },
      message: {
        contactMessage: {
          displayName: `🗽 ${botName}`,
          vcard: [
            "BEGIN:VCARD",
            "VERSION:3.0",
            `N:;${botName};;;`,
            `FN:${botName}`,
            `item1.TEL;waid=13135550002:+1 (313) 555-0002`,
            "item1.X-ABLabel:Ponsel",
            "END:VCARD",
          ].join("\n"),
        },
      },
    };
  }

  const startTime = Date.now();

const OWNER_COMMANDS = new Set([
  "setprefix","setowner","addowner","delowner","setbotname",
  "public","self","antidelete","gconly","autoblock",
  "clearchat","clearsession","restart","setmenuimg",
  "setchannelid","setchannelname",
  "addreseller","delreseller","resetreseller",
  "addkey","delkey",
  "addcase","delcase","editcase",
]);

export async function handleCommand({ sock, msg, command, args }) {
  const jid = msg.key.remoteJid;
  const settings = loadSettings();
  const prefix = settings.prefix ?? ".";
  // FIX: For linked-device bots, fromMe means the owner sent this.
  // In DMs, participant is absent and remoteJid is the *other* person,
  // so use the bot's own JID when fromMe is true.
  const senderJid = msg.key.fromMe
    ? `${botState.phoneNumber ?? "0"}@s.whatsapp.net`
    : (msg.key.participant ?? msg.key.remoteJid ?? "");

  const reply = async (text) => {
    await sock.sendMessage(jid, { text }, { quoted: msg });
  };

  const channelQuote = (settings.channelId && settings.channelName)
    ? {
        key: {
          remoteJid: "status@broadcast",
          participant: "0@s.whatsapp.net",
          id: "BAE5" + Math.random().toString(36).slice(2, 10).toUpperCase(),
        },
        message: {
          newsletterAdminInviteMessage: {
            newsletterJid: settings.channelId,
            newsletterName: settings.channelName,
            caption: "Made with ♥️ By Aizen",
            inviteExpiration: Math.floor(Date.now() / 1000) + 86400 * 7,
          },
        },
      }
    : null;

  // replyChannel: use channel quote if configured; if it throws the message
  // was already delivered (newsletter ack error), so do NOT retry to avoid duplicates.
  // If no channel quote is set, fall straight to a plain reply.
  const replyChannel = async (text) => {
    if (!channelQuote) {
      return sock.sendMessage(jid, { text }, { quoted: msg });
    }
    try {
      await sock.sendMessage(jid, { text }, { quoted: channelQuote });
    } catch {
      // Channel ack failed — message already sent, skip retry to prevent double reply
    }
  };


    // Sends with verified contact card quote — falls back to plain reply if it fails
    const replyVerified = async (text) => {
      try {
        await sock.sendMessage(jid, { text }, { quoted: getVerifiedQuoted(settings) });
      } catch {
        await sock.sendMessage(jid, { text }, { quoted: msg });
      }
    };

      if (OWNER_COMMANDS.has(command)) {
    if (!isOwner(senderJid, settings)) {
      await reply("This command is restricted to bot owners.");
      return;
    }
  }

  switch (command) {


    // ── Direct sub-menu shortcuts (.ai, .tools, .fun, etc.) ──────────────────
    case "ai":
    case "tools":
    case "fun":
    case "game":
    case "general":
    case "group":
    case "owner":
    case "profile":
    case "search":
    case "youtube":
    case "downloader": {
      const botName2 = settings.botName ?? "Yuzuki";
      const imageUrl2 = settings.menuBgUrl || MENU_BG;
      const subCaption = buildSub(botName2, prefix, command);
      if (!subCaption) { await reply(`Unknown category: ${command}`); break; }

      const vq2 = getVerifiedQuoted(settings);
      let thumbnail2;
      try { const tr = await fetch("https://litter.catbox.moe/kv0mfr.jpg"); thumbnail2 = Buffer.from(await tr.arrayBuffer()); } catch { thumbnail2 = undefined; }
      const ctx2 = {
        forwardingScore: 2025, isForwarded: true,
        ...(settings.channelId && settings.channelName ? { forwardedNewsletterMessageInfo: { newsletterJid: settings.channelId, serverMessageId: null, newsletterName: settings.channelName } } : {}),
        externalAdReply: { title: botName2, body: `${botName2} Bot`, mediaType: 1, previewType: 0, thumbnail: thumbnail2, thumbnailUrl: "https://litter.catbox.moe/kv0mfr.jpg", renderLargerThumbnail: false, sourceUrl: "t.me//aizesuigetsu", mediaUrl: "https://whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326" },
        quotedMessage: vq2.message, participant: vq2.key.participant, remoteJid: vq2.key.remoteJid,
      };
      try { await sock.sendMessage(jid, { image: { url: imageUrl2 }, caption: subCaption, contextInfo: ctx2 }); }
      catch { await reply(subCaption); }
      break;
    }

    case "menu": {
      const botName = settings.botName ?? "Yuzuki";
      const sub = args[0]?.toLowerCase();

      // ── Sub-menu: .menu ai, .menu tools, etc. ──────────────────────────
      if (sub && CATEGORIES[sub]) {
        const caption = buildSub(botName, prefix, sub);
        const vq = getVerifiedQuoted(settings);
        const menuCtx = {
          forwardingScore: 2025,
          isForwarded: true,
          ...(settings.channelId && settings.channelName ? {
            forwardedNewsletterMessageInfo: {
              newsletterJid: settings.channelId,
              serverMessageId: null,
              newsletterName: settings.channelName,
            },
          } : {}),
          quotedMessage: vq.message,
          participant: vq.key.participant,
          remoteJid: vq.key.remoteJid,
        };
        try {
          await sock.sendMessage(jid, { text: caption, contextInfo: menuCtx });
        } catch {
          await reply(caption);
        }
        break;
      }

      // ── Main menu: image + rich caption with live stats ──────────────────
      // Gather runtime data
      const db = loadDB();
      const totalUsers = Object.keys(db.users ?? {}).length;
      const totalCmds = Object.values(CATEGORIES).reduce((a, c) => a + c.commands.length, 0);
      const uptimeMs = Date.now() - startTime;
      const uptimeSec = Math.floor(uptimeMs / 1000);
      const uptimeMin = Math.floor(uptimeSec / 60);
      const uptimeHr = Math.floor(uptimeMin / 60);
      const uptimeDays = Math.floor(uptimeHr / 24);
      const uptimeStr = `${uptimeDays}d ${uptimeHr % 24}h ${uptimeMin % 60}m ${uptimeSec % 60}s`;
      const pushname = msg.pushName ?? "User";
      const userRank = isOwner(senderJid, settings) ? "Owner 👑" : "User 🌟";
      const ownerNumber = (settings.ownerNumber ?? "").replace(/\D/g, "");

      const menuCaption = buildMain(botName, prefix, { pushname, userRank, uptimeStr, totalUsers, totalCmds, ownerNumber });
      const imageUrl = settings.menuBgUrl || MENU_BG;

      const vq = getVerifiedQuoted(settings);
      let menuThumb;
      try {
        const tr = await fetch(imageUrl);
        menuThumb = Buffer.from(await tr.arrayBuffer());
      } catch { menuThumb = undefined; }

      const menuCtx = {
        forwardingScore: 2025,
        isForwarded: true,
        ...(settings.channelId && settings.channelName ? {
          forwardedNewsletterMessageInfo: {
            newsletterJid: settings.channelId,
            serverMessageId: null,
            newsletterName: settings.channelName,
          },
        } : {}),
        externalAdReply: {
          title: botName,
          body: `${botName} Bot`,
          mediaType: 1,
          previewType: 0,
          thumbnail: menuThumb,
          thumbnailUrl: imageUrl,
          renderLargerThumbnail: false,
          sourceUrl: "t.me//aizesuigetsu",
          mediaUrl: "https://whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326",
        },
        quotedMessage: vq.message,
        participant: vq.key.participant,
        remoteJid: vq.key.remoteJid,
      };

      // ── Send menu with hydromd-style single_select button ──────────────
      const menuRows = Object.entries(CATEGORIES).map(([key, cat]) => ({
        title: `${cat.icon} ${cat.title}`,
        description: `${cat.commands.length} commands`,
        id: `${prefix}menu ${key}`,
      }));

      try {
        const mediaHeader = await prepareWAMessageMedia(
          menuThumb ? { image: menuThumb } : { image: { url: imageUrl } },
          { upload: sock.waUploadToServer }
        );
        const interactiveMsg = generateWAMessageFromContent(jid, {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2,
              },
              interactiveMessage: {
                body: { text: menuCaption },
                footer: { text: `Made with ♥ by Aizen | ${botName}` },
                header: {
                  title: "",
                  subtitle: "",
                  hasMediaAttachment: true,
                  ...mediaHeader,
                },
                nativeFlowMessage: {
                  buttons: [{
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                      title: "📂 Browse Categories",
                      sections: [{ title: "Menu Categories", rows: menuRows }],
                    }),
                  }],
                },
              },
            },
          },
        }, { quoted: msg }, {});
        await sock.relayMessage(interactiveMsg.key.remoteJid, interactiveMsg.message, { messageId: interactiveMsg.key.id });
      } catch {
        try {
          await sock.sendMessage(jid, { image: { url: imageUrl }, caption: menuCaption, contextInfo: menuCtx });
        } catch {
          await reply(menuCaption);
        }
      }

      // ── Product card sent alongside the main menu ──────────────────
      try {
        const cardTitle    = settings.productTitle    || botName;
        const cardDesc     = settings.productDesc     || "I'm aizen";
        const cardCurrency = settings.productCurrency || "USD";
        const cardPrice    = settings.productPrice    || 1000000000;
        const cardImgUrl   = settings.productImgUrl   || imageUrl;
        const cardImgSrc   = settings.productImgUrl
          ? { image: { url: cardImgUrl } }
          : (menuThumb ? { image: menuThumb } : { image: { url: imageUrl } });

        let productImage;
        try {
          const productMedia = await prepareWAMessageMedia(
            cardImgSrc,
            { upload: sock.waUploadToServer }
          );
          productImage = productMedia.imageMessage;
        } catch { productImage = undefined; }

        await sock.sendMessage(jid, {
          productMessage: {
            product: {
              productId: "1337",
              title: cardTitle,
              description: cardDesc,
              currencyCode: cardCurrency,
              priceAmount1000: cardPrice,
              retailerId: "yuzuki-v2",
              ...(productImage ? { productImage } : {}),
            },
            businessOwnerJid: sock.user.id,
          },
        }, { quoted: msg });
      } catch { /* silently skip if product message is unsupported */ }

      break;
    }

    case "setmenuimg": {
      const url = args.join(" ").trim();
      if (!url) {
        await reply(`Usage: ${prefix}setmenuimg <image url>\nSend a direct image URL (jpg/png). Use ${prefix}setmenuimg clear to remove it.`);
        break;
      }
      if (url === "clear") {
        setSetting("menuBgUrl", "");
        await reply("Menu background image cleared.");
        break;
      }
      if (!/^https?:\/\/.+/i.test(url)) {
        await reply("Please provide a valid http/https URL.");
        break;
      }
      setSetting("menuBgUrl", url);
      await reply(`Menu background set! Send ${prefix}menu to preview it.`);
      break;
    }

    case "setproductimg": {
      const purl = args.join(" ").trim();
      if (!purl) { await reply(`Usage: ${prefix}setproductimg <image url>\nUse *clear* to reset to the menu background.`); break; }
      if (purl === "clear") { setSetting("productImgUrl", ""); await reply("Product card image reset to menu background."); break; }
      if (!/^https?:\/\/.+/i.test(purl)) { await reply("Please provide a valid http/https URL."); break; }
      setSetting("productImgUrl", purl);
      await reply(`Product card image set! Type ${prefix}menu to see it.`);
      break;
    }

    case "setproducttitle": {
      const ptitle = body.slice(prefix.length + command.length).trim();
      if (!ptitle) { await reply(`Usage: ${prefix}setproducttitle <title>\nUse *clear* to reset to the bot name.`); break; }
      if (ptitle === "clear") { setSetting("productTitle", ""); await reply("Product card title reset to bot name."); break; }
      setSetting("productTitle", ptitle);
      await reply(`Product card title set to: *${ptitle}*`);
      break;
    }

    case "setproductdesc": {
      const pdesc = body.slice(prefix.length + command.length).trim();
      if (!pdesc) { await reply(`Usage: ${prefix}setproductdesc <description>\nUse *clear* to reset to default.`); break; }
      if (pdesc === "clear") { setSetting("productDesc", ""); await reply("Product card description reset to default."); break; }
      setSetting("productDesc", pdesc);
      await reply(`Product card description set to: *${pdesc}*`);
      break;
    }

    case "ping":
      await replyChannel("Pong!");
      break;

    case "alive":
      await replyChannel(`*${settings.botName ?? "Bot"} is alive!*\nStatus: Online\nPrefix: ${prefix}`);
      break;

    case "uptime": {
      const ms = Date.now() - startTime;
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      const d = Math.floor(h / 24);
      await replyChannel(`Uptime: ${d}d ${h % 24}h ${m % 60}m ${s % 60}s`);
      break;
    }

    case "botowner":
    case "dev":
    case "creator":
    case "developer":
    case "own":
      await replyChannel(`*𝗛𝗶 👋. 𝗧𝗵𝗶𝘀 𝗶𝘀 𝘁𝗵𝗲 𝗢𝘄𝗻𝗲𝗿 𝗮𝗻𝗱 𝗗𝗲𝘃 𝗼𝗳 𝗬𝘂𝘇𝘂𝗸𝗶 𝗠𝗗.. 𝗙𝗲𝗲𝗹 𝗳𝗿𝗲𝗲 𝘁𝗼 𝗰𝗵𝗮𝘁.*\n𝗡𝗮𝗺𝗲: Aizen\n𝗖𝗼𝗻𝘁𝗮𝗰𝘁: 233533416608\n🗽𝗙𝗼𝗜𝗜𝗼𝘄 𝗳𝗼𝗿 𝘂𝗽𝗱𝗮𝘁𝗲𝘀\nhttps://whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326`);
      break;

    case "speed": {
      const start = Date.now();
      await replyChannel(`Latency: ${Date.now() - start}ms`);
      break;
    }

    case "vpsinfo": {
      const cpus = os.cpus();
      const mem = os.totalmem();
      const free = os.freemem();
      await replyChannel(
        `VPS Info\n` +
        `CPU: ${cpus[0]?.model ?? "N/A"} (${cpus.length} cores)\n` +
        `RAM: ${Math.round(mem/1024/1024)}MB total / ${Math.round(free/1024/1024)}MB free\n` +
        `OS: ${os.platform()} ${os.arch()}`
      );
      break;
    }

    case "totalcmds": {
      const cases = getCases();
      await replyChannel(`Total custom cases: ${cases.length}`);
      break;
    }

    case "setchannelid": {
      const cid = args.join(" ").trim();
      if (!cid) { await reply(`Usage: ${prefix}setchannelid <channel_jid>\nUse clear to remove.`); break; }
      if (cid === "clear") { setSetting("channelId", ""); await reply("Channel ID cleared."); break; }
      setSetting("channelId", cid);
      await reply(`Channel ID set to: ${cid}`);
      break;
    }

    case "setchannelname": {
      const cname = args.join(" ").trim();
      if (!cname) { await reply(`Usage: ${prefix}setchannelname <name>\nUse clear to remove.`); break; }
      if (cname === "clear") { setSetting("channelName", ""); await reply("Channel name cleared."); break; }
      setSetting("channelName", cname);
      await reply(`Channel name set to: ${cname}`);
      break;
    }

    case "setprefix": {
      const np = args[0];
      if (!np) { await reply(`Usage: ${prefix}setprefix <new_prefix>`); break; }
      setSetting("prefix", np);
      await reply(`Prefix updated to *${np}*`);
      break;
    }

    case "setowner": {
      const num = args[0]?.replace(/[^0-9]/g, "");
      if (!num) { await reply(`Usage: ${prefix}setowner <phone_number>`); break; }
      setSetting("ownerNumber", num);
      await reply(`Owner number set to *${num}*`);
      break;
    }

    case "addowner": {
      const num = args[0]?.replace(/[^0-9]/g, "");
      const name = args.slice(1).join(" ") || null;
      if (!num) { await reply(`Usage: ${prefix}addowner <number> [name]`); break; }
      const ok = addOwner(num, name);
      await reply(ok ? `Owner *${num}* added.` : `Owner *${num}* already exists.`);
      break;
    }

    case "delowner": {
      const num = args[0]?.replace(/[^0-9]/g, "");
      if (!num) { await reply(`Usage: ${prefix}delowner <number>`); break; }
      const ok = removeOwner(num);
      await reply(ok ? `Owner *${num}* removed.` : `Owner *${num}* not found.`);
      break;
    }

    case "listowners": {
      const owners = getOwners();
      if (!owners.length) { await reply("No owners registered."); break; }
      await reply(`Owners:\n${owners.map((o, i) => `${i + 1}. ${o.number}${o.name ? ` (${o.name})` : ""}`).join("\n")}`);
      break;
    }

    case "setbotname": {
      const name = args.join(" ");
      if (!name) { await reply(`Usage: ${prefix}setbotname <name>`); break; }
      setSetting("botName", name);
      await reply(`Bot name set to *${name}*`);
      break;
    }

    case "public":
      setSetting("mode", "public");
      await reply("Bot mode set to *public*");
      break;

    case "self":
      setSetting("mode", "self");
      await reply("Bot mode set to *self*");
      break;

    case "antidelete": {
      const cur = loadSettings().antidelete ?? false;
      setSetting("antidelete", !cur);
      await reply(`Anti-delete is now *${!cur ? "ON" : "OFF"}*`);
      break;
    }

    case "gconly": {
        const sub = (args[0] ?? "").toLowerCase();
        const cur = loadSettings().gconly ?? false;
        if (sub === "on") {
          setSetting("gconly", true);
          await reply("Group-chat only mode is now *ON* — bot will only respond in groups.");
        } else if (sub === "off") {
          setSetting("gconly", false);
          await reply("Group-chat only mode is now *OFF* — bot will respond in DMs and groups.");
        } else {
          await reply(
            `Group-chat only is currently *${cur ? "ON" : "OFF"}*\n` +
            `Use ${prefix}gconly on / ${prefix}gconly off to change it.`
          );
        }
        break;
      }

    case "autoblock": {
      const cur = loadSettings().autoblock ?? false;
      setSetting("autoblock", !cur);
      await reply(`Auto-block is now *${!cur ? "ON" : "OFF"}*`);
      break;
    }

    case "restart":
      await reply("Restarting bot...");
      await stopBot();
      setTimeout(() => startBot().catch(console.error), 1500);
      break;

    case "clearsession":
      await reply("Clearing session and reconnecting...");
      await clearSession();
      break;

    // FIX #2: clearchat now has an actual handler
    case "clearchat": {
      try {
        await sock.chatModify({ clear: { before: { timestamp: Math.floor(Date.now() / 1000), id: "0" } } }, jid);
        await reply("Chat history cleared.");
      } catch {
        await reply("Failed to clear chat — make sure the bot has the required permissions.");
      }
      break;
    }

    case "addreseller": {
      const num = args[0]?.replace(/[^0-9]/g, "");
      const name = args[1] || null;
      const quota = parseInt(args[2] ?? "10", 10);
      if (!num) { await reply(`Usage: ${prefix}addreseller <number> [name] [quota]`); break; }
      const ok = addReseller(num, name, quota);
      await reply(ok ? `Reseller *${num}* added (quota: ${quota}).` : `Reseller *${num}* already exists.`);
      break;
    }

    case "delreseller": {
      const num = args[0]?.replace(/[^0-9]/g, "");
      if (!num) { await reply(`Usage: ${prefix}delreseller <number>`); break; }
      const ok = removeReseller(num);
      await reply(ok ? `Reseller *${num}* removed.` : `Reseller *${num}* not found.`);
      break;
    }

    case "listreseller": {
      const list = getResellers();
      if (!list.length) { await reply("No resellers."); break; }
      await reply(`Resellers:\n${list.map((r, i) => `${i + 1}. ${r.number}${r.name ? ` (${r.name})` : ""} — quota: ${r.quota} (used: ${r.usedQuota ?? 0})`).join("\n")}`);
      break;
    }

    // FIX #3: resetreseller now has an actual handler
    case "resetreseller": {
      const num = args[0]?.replace(/[^0-9]/g, "");
      const newQuota = args[1] ? parseInt(args[1], 10) : null;
      if (!num) { await reply(`Usage: ${prefix}resetreseller <number> [new_quota]`); break; }
      const ok = resetReseller(num, newQuota);
      await reply(ok
        ? `Reseller *${num}* quota reset to 0${newQuota !== null ? ` (new max: ${newQuota})` : ""}.`
        : `Reseller *${num}* not found.`
      );
      break;
    }

    case "addkey": {
      const key = args[0];
      const desc = args.slice(1).join(" ") || null;
      if (!key) { await reply(`Usage: ${prefix}addkey <key> [description]`); break; }
      const ok = addKey(key, desc);
      await reply(ok ? `Key *${key}* added.` : `Key *${key}* already exists.`);
      break;
    }

    case "delkey": {
      const key = args[0];
      if (!key) { await reply(`Usage: ${prefix}delkey <key>`); break; }
      const ok = removeKey(key);
      await reply(ok ? `Key *${key}* removed.` : `Key *${key}* not found.`);
      break;
    }

    case "listkey": {
      const keys = getKeys();
      if (!keys.length) { await reply("No keys."); break; }
      await reply(`Keys:\n${keys.map((k, i) => `${i + 1}. ${k.key}${k.description ? ` — ${k.description}` : ""}`).join("\n")}`);
      break;
    }

    case "addcase": {
      const cmd = args[0]?.toLowerCase();
      const response = args.slice(1).join(" ");
      if (!cmd || !response) { await reply(`Usage: ${prefix}addcase <command> <response>`); break; }
      const ok = addCase(cmd, response);
      await reply(ok ? `Case *${cmd}* added.` : `Case *${cmd}* already exists.`);
      break;
    }

    case "delcase": {
      const cmd = args[0]?.toLowerCase();
      if (!cmd) { await reply(`Usage: ${prefix}delcase <command>`); break; }
      const ok = removeCase(cmd);
      await reply(ok ? `Case *${cmd}* removed.` : `Case *${cmd}* not found.`);
      break;
    }

    case "getcase": {
      const cmd = args[0]?.toLowerCase();
      if (!cmd) { await reply(`Usage: ${prefix}getcase <command>`); break; }
      const c = getCases().find((c) => c.command === cmd);
      await reply(c ? `Case: ${cmd}\nResponse: ${c.response}` : `Case *${cmd}* not found.`);
      break;
    }

    case "editcase": {
      const cmd = args[0]?.toLowerCase();
      const response = args.slice(1).join(" ");
      if (!cmd || !response) { await reply(`Usage: ${prefix}editcase <command> <new_response>`); break; }
      const ok = editCase(cmd, response);
      await reply(ok ? `Case *${cmd}* updated.` : `Case *${cmd}* not found.`);
      break;
    }


      // ── Fun ──────────────────────────────────────────────────────────────────

      case "8ball": {
        const RESPONSES = [
          "It is certain.","It is decidedly so.","Without a doubt.",
          "Yes, definitely.","You may rely on it.","As I see it, yes.",
          "Most likely.","Outlook good.","Yes.","Signs point to yes.",
          "Reply hazy, try again.","Ask again later.",
          "Better not tell you now.","Cannot predict now.",
          "Concentrate and ask again.","Don't count on it.",
          "My reply is no.","My sources say no.",
          "Outlook not so good.","Very doubtful.",
        ];
        const q = args.join(" ").trim();
        if (!q) { await reply(`Usage: ${prefix}8ball <question>`); break; }
        await replyChannel(`🎱 *${RESPONSES[Math.floor(Math.random() * RESPONSES.length)]}*`);
        break;
      }

      case "coinflip":
        await replyChannel(`🪙 *${Math.random() < 0.5 ? "Heads" : "Tails"}!*`);
        break;

      case "dice": {
        const sides = Math.max(2, parseInt(args[0] ?? "6", 10) || 6);
        await replyChannel(`🎲 Rolled *${Math.floor(Math.random() * sides) + 1}* (d${sides})`);
        break;
      }

      case "rps": {
        const CHOICES = ["rock","paper","scissors"];
        const user = (args[0] ?? "").toLowerCase();
        if (!CHOICES.includes(user)) { await reply(`Usage: ${prefix}rps <rock|paper|scissors>`); break; }
        const bot = CHOICES[Math.floor(Math.random() * 3)];
        const WIN = { rock:"scissors", paper:"rock", scissors:"paper" };
        const result = user === bot ? "It's a tie! 🤝" : WIN[user] === bot ? "You win! 🎉" : "Bot wins! 🤖";
        await replyChannel(`You: *${user}* | Bot: *${bot}*\n${result}`);
        break;
      }

      case "ship": {
        const raw = args.join(" ");
        const parts = raw.split(/\s+(?:and|&|\+|x|vs?)\s+/i);
        const a = parts[0]?.trim() || "Person A";
        const b = parts[1]?.trim() || "Person B";
        const pct = Math.floor(Math.random() * 101);
        const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
        const heart = pct >= 80 ? "💕" : pct >= 50 ? "💛" : pct >= 30 ? "🤔" : "💔";
        await replyChannel(`${heart} *Ship Meter*\n${a} + ${b}\n[${bar}] *${pct}%*`);
        break;
      }

      case "truth": {
        const TRUTHS = [
          "What's the most embarrassing thing you've done?",
          "What's a secret you've never told anyone?",
          "What's the biggest lie you've ever told?",
          "Have you ever cheated on a test?",
          "What's your biggest fear?",
          "What's the most childish thing you still do?",
          "What's a bad habit you have?",
          "Who do you have a crush on?",
          "What's something you're ashamed of?",
          "What's the weirdest dream you've ever had?",
        ];
        await replyChannel(`🎯 *Truth:*\n${TRUTHS[Math.floor(Math.random() * TRUTHS.length)]}`);
        break;
      }

      case "dare": {
        const DARES = [
          "Send a voice note singing your favourite song.",
          "Text your crush 'hey' right now.",
          "Do 20 push-ups and send proof.",
          "Change your status to something embarrassing for 10 minutes.",
          "Send the last photo in your gallery.",
          "Speak in an accent for the next 5 minutes.",
          "Send a selfie with a funny face.",
          "Tell a joke — as badly as possible.",
          "Let someone in this chat send one message from your phone.",
          "Do your best impression of someone in this chat.",
        ];
        await replyChannel(`🎯 *Dare:*\n${DARES[Math.floor(Math.random() * DARES.length)]}`);
        break;
      }

      case "joke": {
        const JOKES = [
          "Why don't scientists trust atoms? Because they make up everything!",
          "I told my wife she was drawing her eyebrows too high. She looked surprised.",
          "Why don't eggs tell jokes? They'd crack each other up.",
          "I'm reading a book about anti-gravity. It's impossible to put down.",
          "Why did the scarecrow win an award? He was outstanding in his field.",
          "I would tell you a construction joke, but I'm still working on it.",
          "Why can't you give Elsa a balloon? Because she'll let it go.",
          "What do you call a fake noodle? An impasta.",
          "Why did the bicycle fall over? It was two-tired.",
          "Did you hear about the mathematician afraid of negative numbers? He'll stop at nothing to avoid them.",
        ];
        await replyChannel(`😂 ${JOKES[Math.floor(Math.random() * JOKES.length)]}`);
        break;
      }

      case "quote": {
        const QUOTES = [
          '"Be yourself; everyone else is already taken." — Oscar Wilde',
          '"Two things are infinite: the universe and human stupidity." — Einstein',
          '"The only way to do great work is to love what you do." — Steve Jobs',
          '"It does not matter how slowly you go as long as you do not stop." — Confucius',
          '"You miss 100% of the shots you dont take." — Wayne Gretzky',
          '"Get busy living or get busy dying." — Stephen King',
          '"Life is what happens when youre busy making other plans." — Lennon',
          '"The purpose of our lives is to be happy." — Dalai Lama',
          '"In the middle of difficulty lies opportunity." — Einstein',
          '"You only live once, but if you do it right, once is enough." — Mae West',
        ];
        await replyChannel(`💬 ${QUOTES[Math.floor(Math.random() * QUOTES.length)]}`);
        break;
      }

      case "fact": {
        const FACTS = [
          "Honey never spoils — 3000-year-old honey was found in Egyptian tombs.",
          "A group of flamingos is called a 'flamboyance'.",
          "Bananas are berries, but strawberries aren't.",
          "Octopuses have three hearts and blue blood.",
          "Sharks are older than trees.",
          "Cleopatra lived closer in time to the Moon landing than to the Great Pyramid.",
          "The shortest war in history lasted 38 minutes (Anglo-Zanzibar War, 1896).",
          "A day on Venus is longer than a year on Venus.",
          "The human nose can detect about 1 trillion different smells.",
          "A snail can sleep for up to 3 years.",
        ];
        await replyChannel(`🧠 *Fact:* ${FACTS[Math.floor(Math.random() * FACTS.length)]}`);
        break;
      }

      case "roast": {
        const ROASTS = [
          "You're the reason the gene pool needs a lifeguard.",
          "I'd agree with you but then we'd both be wrong.",
          "You have your whole life to be an idiot. Why not take today off?",
          "I'm not saying you're dumb, but you'd need a promotion to be an idiot.",
          "I'd explain it to you, but I left my crayons at home.",
          "Your secrets are always safe with me — I never listen to what you say.",
          "You're proof that even evolution makes mistakes.",
          "I've met some pretty dumb people in my time, then I met you.",
        ];
        const target = args.join(" ").trim() || "you";
        await replyChannel(`🔥 *For ${target}:*\n${ROASTS[Math.floor(Math.random() * ROASTS.length)]}`);
        break;
      }

      case "rizz":
      case "pickup": {
        const LINES = [
          "Are you a magician? Because whenever I look at you, everyone else disappears.",
          "Do you have a map? I keep getting lost in your eyes.",
          "Are you a parking ticket? You've got 'fine' written all over you.",
          "If you were a vegetable, you'd be a cute-cumber.",
          "Are you a bank loan? Because you've got my interest.",
          "Do you believe in love at first sight, or should I walk by again?",
          "Is your name Google? Because you have everything I've been searching for.",
          "Are you a camera? Every time I look at you, I smile.",
        ];
        await replyChannel(`😏 ${LINES[Math.floor(Math.random() * LINES.length)]}`);
        break;
      }

      case "horoscope": {
        const SIGNS = ["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces"];
        const sign = (args[0] ?? "").toLowerCase();
        if (!sign || !SIGNS.includes(sign)) {
          await reply(`Usage: ${prefix}horoscope <sign>\nSigns: ${SIGNS.join(", ")}`);
          break;
        }
        const VIBES = [
          "✨ Great things are coming your way — stay open to opportunities.",
          "⚠️ Be cautious with big decisions today. Think before you act.",
          "💰 A financial opportunity may be closer than you think.",
          "❤️ Love is in the air — don't be afraid to express yourself.",
          "🧘 Focus on your wellbeing. Rest and recharge today.",
          "🌟 Your hard work is about to pay off. Keep going!",
        ];
        const cap = sign.charAt(0).toUpperCase() + sign.slice(1);
        await replyChannel(`♈ *${cap} Horoscope*\n${VIBES[Math.floor(Math.random() * VIBES.length)]}`);
        break;
      }

      case "guess": {
        await replyChannel(
          "🎯 *Number Guess Game*\n" +
          "I'm thinking of a number between 1 and 100.\n" +
          "Reply with your guess! (Game state is not persisted between restarts.)"
        );
        break;
      }

      // ── Tools ─────────────────────────────────────────────────────────────────

      case "calc":
      case "math": {
        const expr = args.join(" ").trim();
        if (!expr) { await reply(`Usage: ${prefix}calc <expression>\nExample: ${prefix}calc 2 + 2 * 10`); break; }
        try {
          if (!/^[\d\s\+\-\*\/\.\(\)\^%]+$/.test(expr)) throw new Error("Invalid characters");
          const result = Function(`"use strict"; return (${expr.replace(/\^/g, "**")})`)();
          if (typeof result !== "number" || !isFinite(result)) throw new Error("Bad result");
          await replyChannel(`🧮 *${expr} = ${result}*`);
        } catch {
          await reply(`❌ Invalid expression: \`${expr}\``);
        }
        break;
      }

      case "base64": {
        const sub = (args[0] ?? "").toLowerCase();
        const text = args.slice(1).join(" ");
        if ((sub !== "encode" && sub !== "decode") || !text) {
          await reply(`Usage:\n${prefix}base64 encode <text>\n${prefix}base64 decode <base64>`);
          break;
        }
        try {
          const result = sub === "encode"
            ? Buffer.from(text, "utf8").toString("base64")
            : Buffer.from(text, "base64").toString("utf8");
          await replyChannel(`*Base64 ${sub}:*\n${result}`);
        } catch {
          await reply("❌ Failed. Make sure your input is valid.");
        }
        break;
      }

      case "runtime": {
        const ms = Date.now() - startTime;
        const totalSec = Math.floor(ms / 1000);
        const d = Math.floor(totalSec / 86400);
        const h = Math.floor((totalSec % 86400) / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        await replyChannel(`⏱️ *Runtime:* ${d}d ${h}h ${m}m ${s}s`);
        break;
      }

      case "about": {
        await replyChannel(
          `*${settings.botName ?? "Yuzuki"}*\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `A feature-rich WhatsApp bot built with Baileys.\n\n` +
          `🔑 *Prefix:* ${settings.prefix ?? "."}\n` +
          `👑 *Owner:* 233533416608\n` +
          `📦 *Platform:* Node.js + socketon (focashi fork)`
        );
        break;
      }

      case "help": {
        await replyChannel(
          `*${settings.botName ?? "Bot"} Help*\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `Use *${prefix}menu* to browse all commands.\n` +
          `Use *${prefix}menu <category>* for a specific list.\n\n` +
          `Categories: ai · fun · game · tools · group · search · owner`
        );
        break;
      }

      case "donate": {
        await replyChannel(
          `💖 *Support ${settings.botName ?? "this bot"}*\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `Enjoying the bot? Consider supporting the developer!\n` +
          `📞 Contact the owner: 233533416608\n` + `*Your support is appreciated💛*`
        );
        break;
      }

      // ── Group Management ──────────────────────────────────────────────────────

      case "tagall": {
        if (!jid?.endsWith("@g.us")) { await reply("This command only works in groups."); break; }
        try {
          const meta = await sock.groupMetadata(jid);
          const mentions = meta.participants.map(p => p.id);
          const text = `*\`Yuzuki MD\` tag all ${mentions.length} members*\n` + mentions.map(id => `@${id.split("@")[0]}`).join(" ");
          await sock.sendMessage(jid, { text, mentions }, { quoted: msg });
        } catch { await reply("❌ Failed to tag members — make sure I'm an admin."); }
        break;
      }

      case "groupinfo": {
        if (!jid?.endsWith("@g.us")) { await reply("This command only works in groups."); break; }
        try {
          const meta = await sock.groupMetadata(jid);
          const admins = meta.participants.filter(p => p.admin).length;
          await replyChannel(
            `👥 *Group Info*\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `📛 *Name:* ${meta.subject}\n` +
            `👤 *Members:* ${meta.participants.length} (${admins} admin${admins !== 1 ? "s" : ""})\n` +
            `📝 *Description:* ${meta.desc ?? "None"}\n` +
            `📅 *Created:* ${meta.creation ? new Date(meta.creation * 1000).toLocaleDateString() : "Unknown"}`
          );
        } catch { await reply("❌ Failed to fetch group info."); }
        break;
      }

      case "link": {
        if (!jid?.endsWith("@g.us")) { await reply("This command only works in groups."); break; }
        try {
          const code = await sock.groupInviteCode(jid);
          await replyChannel(`🔗 *Invite Link:*\nhttps://chat.whatsapp.com/${code}`);
        } catch { await reply("❌ Failed to get invite link — make sure I'm an admin."); }
        break;
      }

      case "revoke": {
        if (!jid?.endsWith("@g.us")) { await reply("This command only works in groups."); break; }
        try {
          await sock.groupRevokeInvite(jid);
          await reply(`✅ Invite link revoked. Use ${prefix}link to generate a new one.`);
        } catch { await reply("❌ Failed to revoke — make sure I'm an admin."); }
        break;
      }

      case "setdesc": {
        if (!jid?.endsWith("@g.us")) { await reply("This command only works in groups."); break; }
        const desc = args.join(" ").trim();
        if (!desc) { await reply(`Usage: ${prefix}setdesc <description>`); break; }
        try {
          await sock.groupUpdateDescription(jid, desc);
          await reply("✅ Group description updated.");
        } catch { await reply("❌ Failed — make sure I'm an admin."); }
        break;
      }

      case "setname": {
        if (!jid?.endsWith("@g.us")) { await reply("This command only works in groups."); break; }
        const name = args.join(" ").trim();
        if (!name) { await reply(`Usage: ${prefix}setname <name>`); break; }
        try {
          await sock.groupUpdateSubject(jid, name);
          await reply("✅ Group name updated.");
        } catch { await reply("❌ Failed — make sure I'm an admin."); }
        break;
      }

      case "mute": {
        if (!jid?.endsWith("@g.us")) { await reply("This command only works in groups."); break; }
        try {
          await sock.groupSettingUpdate(jid, "announcement");
          await reply("🔇 Group muted — only admins can send messages.");
        } catch { await reply("❌ Failed — make sure I'm an admin."); }
        break;
      }

      case "unmute": {
        if (!jid?.endsWith("@g.us")) { await reply("This command only works in groups."); break; }
        try {
          await sock.groupSettingUpdate(jid, "not_announcement");
          await reply("🔊 Group unmuted — everyone can send messages.");
        } catch { await reply("❌ Failed — make sure I'm an admin."); }
        break;
      }

      case "kick": {
        if (!jid?.endsWith("@g.us")) { await reply("This command only works in groups."); break; }
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
        if (!mentioned.length) { await reply(`Usage: ${prefix}kick @user`); break; }
        try {
          await sock.groupParticipantsUpdate(jid, mentioned, "remove");
          await reply(`✅ Removed ${mentioned.length} member(s).`);
        } catch { await reply("❌ Failed — make sure I'm an admin."); }
        break;
      }

      case "add": {
        if (!jid?.endsWith("@g.us")) { await reply("This command only works in groups."); break; }
        const num = args[0]?.replace(/[^0-9]/g, "");
        if (!num) { await reply(`Usage: ${prefix}add <number>`); break; }
        try {
          await sock.groupParticipantsUpdate(jid, [`${num}@s.whatsapp.net`], "add");
          await reply(`✅ Added *${num}* to the group.`);
        } catch { await reply("❌ Failed — they may not be on WhatsApp or I'm not an admin."); }
        break;
      }

      case "promote": {
        if (!jid?.endsWith("@g.us")) { await reply("This command only works in groups."); break; }
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
        if (!mentioned.length) { await reply(`Usage: ${prefix}promote @user`); break; }
        try {
          await sock.groupParticipantsUpdate(jid, mentioned, "promote");
          await reply(`✅ Promoted ${mentioned.length} member(s) to admin.`);
        } catch { await reply("❌ Failed — make sure I'm an admin."); }
        break;
      }

      case "demote": {
        if (!jid?.endsWith("@g.us")) { await reply("This command only works in groups."); break; }
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
        if (!mentioned.length) { await reply(`Usage: ${prefix}demote @user`); break; }
        try {
          await sock.groupParticipantsUpdate(jid, mentioned, "demote");
          await reply(`✅ Demoted ${mentioned.length} member(s) from admin.`);
        } catch { await reply("❌ Failed — make sure I'm an admin."); }
        break;
      }

      // ── Owner: block / unblock / broadcast ────────────────────────────────────

      case "block": {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
        const num = args[0]?.replace(/[^0-9]/g, "");
        const target = mentioned[0] ?? (num ? `${num}@s.whatsapp.net` : null);
        if (!target) { await reply(`Usage: ${prefix}block @user  or  ${prefix}block <number>`); break; }
        try {
          await sock.updateBlockStatus(target, "block");
          await reply(`✅ Blocked *${target.split("@")[0]}*.`);
        } catch { await reply("❌ Failed to block user."); }
        break;
      }

      case "unblock": {
        const num = args[0]?.replace(/[^0-9]/g, "");
        if (!num) { await reply(`Usage: ${prefix}unblock <number>`); break; }
        try {
          await sock.updateBlockStatus(`${num}@s.whatsapp.net`, "unblock");
          await reply(`✅ Unblocked *${num}*.`);
        } catch { await reply("❌ Failed to unblock user."); }
        break;
      }

      case "broadcast": {
        const text = args.join(" ").trim();
        if (!text) { await reply(`Usage: ${prefix}broadcast <message>`); break; }
        try {
          const chats = await sock.groupFetchAllParticipating();
          const groupJids = Object.keys(chats);
          let sent = 0;
          for (const g of groupJids) {
            await sock.sendMessage(g, { text }).catch(() => {});
            sent++;
            await new Promise(r => setTimeout(r, 600));
          }
          await reply(`✅ Broadcast sent to *${sent}* group(s).`);
        } catch { await reply("❌ Failed to broadcast."); }
        break;
      }

      // ── Profile ───────────────────────────────────────────────────────────────

      case "pp": {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
        const target = mentioned[0] ?? senderJid;
        try {
          const ppUrl = await sock.profilePictureUrl(target, "image");
          await sock.sendMessage(jid, {
            image: { url: ppUrl },
            caption: `📸 Profile picture of @${target.split("@")[0].split(":")[0]}`,
            mentions: [target],
          }, { quoted: msg });
        } catch { await reply("❌ No profile picture found or it's private."); }
        break;
      }

      case "bio":
      case "setbio":
      case "reg":
      case "rank":
      case "xp":
      case "leaderboard":
      case "badge":
      case "vcard":
      case "gift":
      case "redeem":
      case "setpp":
        await reply(`⚙️ *${command}* requires a database to store user profiles. Connect a database and implement profile storage to enable this command.`);
        break;

      // ── Search (free APIs — no key needed) ───────────────────────────────────

      case "github": {
        const username = args[0]?.trim();
        if (!username) { await reply(`Usage: ${prefix}github <username>`); break; }
        try {
          const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`);
          if (!res.ok) { await reply(`❌ User *${username}* not found on GitHub.`); break; }
          const u = await res.json();
          await replyChannel(
            `🐙 *GitHub: ${u.login}*\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `📛 *Name:* ${u.name ?? "—"}\n` +
            `📝 *Bio:* ${u.bio ?? "—"}\n` +
            `📦 *Repos:* ${u.public_repos}\n` +
            `👥 *Followers:* ${u.followers} | *Following:* ${u.following}\n` +
            `🌍 *Location:* ${u.location ?? "—"}\n` +
            `🔗 ${u.html_url}`
          );
        } catch { await reply("❌ Failed to fetch GitHub profile."); }
        break;
      }

      case "trivia": {
        try {
          const res = await fetch("https://opentdb.com/api.php?amount=1&type=multiple");
          const data = await res.json();
          const q = data.results?.[0];
          if (!q) { await reply("❌ Could not fetch a trivia question. Try again."); break; }
          const answers = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5);
          const labels = ["A","B","C","D"];
          const text =
            `🎯 *Trivia*\n━━━━━━━━━━━━━━━━━━━\n` +
            `*${q.question.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#039;/g,"'")}*\n\n` +
            answers.map((a, i) => `${labels[i]}. ${a.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#039;/g,"'")}`).join("\n") +
            `\n\n_Category: ${q.category} | Difficulty: ${q.difficulty}_`;
          await replyChannel(text);
        } catch { await reply("❌ Failed to fetch trivia question."); }
        break;
      }

      case "urban": {
        const term = args.join(" ").trim();
        if (!term) { await reply(`Usage: ${prefix}urban <word>`); break; }
        try {
          const res = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`);
          const data = await res.json();
          const entry = data.list?.[0];
          if (!entry) { await reply(`❌ No definition found for *${term}*.`); break; }
          const def = entry.definition.replace(/[[]]/g, "").slice(0, 400);
          const ex = entry.example.replace(/[[]]/g, "").slice(0, 200);
          await replyChannel(
            `📖 *${entry.word}*\n━━━━━━━━━━━━━━━━━━━\n${def}${ex ? `\n\n_Example: ${ex}_` : ""}`
          );
        } catch { await reply("❌ Failed to fetch definition."); }
        break;
      }

      case "wiki": {
        const query = args.join(" ").trim();
        if (!query) { await reply(`Usage: ${prefix}wiki <topic>`); break; }
        try {
          const searchRes = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`
          );
          const searchData = await searchRes.json();
          const title = searchData.query?.search?.[0]?.title;
          if (!title) { await reply(`❌ Nothing found for *${query}* on Wikipedia.`); break; }
          const summaryRes = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
          );
          const s = await summaryRes.json();
          await replyChannel(
            `📚 *${s.title}*\n━━━━━━━━━━━━━━━━━━━\n${s.extract?.slice(0, 500) ?? "No summary available."}\n\n🔗 ${s.content_urls?.desktop?.page ?? ""}`
          );
        } catch { await reply("❌ Failed to fetch Wikipedia article."); }
        break;
      }

      // ── Stubs: need external API keys or services ─────────────────────────────

      case "meme": {
        try {
          const res = await fetch("https://meme-api.com/gimme");
          const data = await res.json();
          if (!data?.url) { await reply("❌ Could not fetch a meme right now. Try again."); break; }
          await sock.sendMessage(jid, {
            image: { url: data.url },
            caption: `😂 *${data.title}*\n👍 ${data.ups} upvotes · r/${data.subreddit}`,
          }, { quoted: msg });
        } catch { await reply("❌ Failed to fetch meme."); }
        break;
      }

      case "sticker": {
        const dl=await dlQuoted(msg,jid);if(!dl?.qm?.imageMessage){await reply(`Reply to an image with ${prefix}sticker`);break;}
        try{const { default: sharp } = await import("sharp"); const webp=await sharp(dl.buf).resize(512,512,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).webp({quality:80}).toBuffer();await sock.sendMessage(jid,{sticker:webp},{quoted:msg});}catch(e){await reply(`❌ Sticker: ${e.message}`);}
        break;
      }

      case "toimg": {
        const dl=await dlQuoted(msg,jid);if(!dl?.qm?.stickerMessage){await reply(`Reply to a sticker with ${prefix}toimg`);break;}
        try{const { default: sharp } = await import("sharp"); const png=await sharp(dl.buf).png().toBuffer();await sock.sendMessage(jid,{image:png,caption:"🖼️ Converted from sticker"},{quoted:msg});}catch(e){await reply(`❌ toimg: ${e.message}`);}
        break;
      }

      case "tts": {
        const text3=args.join(" ").trim();if(!text3){await reply(`Usage: ${prefix}tts <text>`);break;}const ai=getOpenAI();if(!ai){await reply("❌ OPENAI_API_KEY not set.");break;}
        try{const resp=await ai.audio.speech.create({model:"tts-1",voice:"alloy",input:text3});const buf=Buffer.from(await resp.arrayBuffer());await sock.sendMessage(jid,{audio:buf,mimetype:"audio/mpeg",ptt:true},{quoted:msg});}catch(e){await reply(`❌ TTS: ${e.message}`);}
        break;
      }

      case "stt": {
        const dl=await dlQuoted(msg,jid);if(!dl?.qm?.audioMessage){await reply(`Reply to a voice note with ${prefix}stt`);break;}const ai=getOpenAI();if(!ai){await reply("❌ OPENAI_API_KEY not set.");break;}
        try{const file=new File([dl.buf],"audio.ogg",{type:"audio/ogg; codecs=opus"});const t=await ai.audio.transcriptions.create({file,model:"whisper-1"});await replyChannel(`🎙️ *Transcript:*\n${t.text}`);}catch(e){await reply(`❌ STT: ${e.message}`);}
        break;
      }

      case "qr": {
        const text4=args.join(" ").trim();if(!text4){await reply(`Usage: ${prefix}qr <text or URL>`);break;}
        try{const buf=await QRCode.toBuffer(text4,{width:512,margin:2});await sock.sendMessage(jid,{image:buf,caption:`📷 QR: ${text4.slice(0,60)}${text4.length>60?"...":""}`},{quoted:msg});}catch(e){await reply(`❌ QR: ${e.message}`);}
        break;
      }

      case "readqr": {
        const dl=await dlQuoted(msg,jid);if(!dl?.qm?.imageMessage){await reply("Reply to an image containing a QR code");break;}const ai=getOpenAI();if(!ai){await reply("❌ OPENAI_API_KEY not set.");break;}
        try{const b64=dl.buf.toString("base64"),mime=dl.qm.imageMessage.mimetype||"image/jpeg";const r=await ai.chat.completions.create({model:"gpt-4o",max_tokens:200,messages:[{role:"user",content:[{type:"image_url",image_url:{url:`data:${mime};base64,${b64}`}},{type:"text",text:"Read any QR code in this image. Return ONLY the decoded content, nothing else."}]}]});await replyChannel(`📷 *QR Content:*\n${r.choices[0].message.content.trim()}`);}catch(e){await reply(`❌ Read QR: ${e.message}`);}
        break;
      }

      case "short": {
        const u=args[0]?.trim();if(!u||!/^https?:\/\/.+/i.test(u)){await reply(`Usage: ${prefix}short <url>`);break;}
        try{const r=await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(u)}`);const s=await r.text();if(!s.startsWith("https://")){await reply("❌ Failed.");break;}await replyChannel(`🔗 *Shortened:*\n${s}`);}catch(e){await reply(`❌ Short: ${e.message}`);}
        break;
      }

      case "ss": {
        const u=args[0]?.trim();if(!u||!/^https?:\/\/.+/i.test(u)){await reply(`Usage: ${prefix}ss <url>`);break;}
        try{await sock.sendMessage(jid,{image:{url:`https://image.thum.io/get/width/1280/crop/800/${encodeURIComponent(u)}`},caption:`📸 ${u}`},{quoted:msg});}catch(e){await reply(`❌ Screenshot: ${e.message}`);}
        break;
      }

      case "crop": {
        const dl=await dlQuoted(msg,jid);if(!dl?.qm?.imageMessage){await reply(`Reply to an image with ${prefix}crop <WxH+X+Y>`);break;}
        const spec=args[0];if(!spec){await reply(`Usage: ${prefix}crop <WxH+X+Y>  e.g. 200x200+0+0`);break;}
        const m=spec.match(/(\d+)x(\d+)(?:\+(\d+)\+(\d+))?/);if(!m){await reply("Invalid format. Example: 200x200+0+0");break;}
        try{const { default: sharp } = await import("sharp"); const out=await sharp(dl.buf).extract({width:parseInt(m[1]),height:parseInt(m[2]),left:parseInt(m[3]||0),top:parseInt(m[4]||0)}).toBuffer();await sock.sendMessage(jid,{image:out,caption:`✂️ Cropped: ${spec}`},{quoted:msg});}catch(e){await reply(`❌ Crop: ${e.message}`);}
        break;
      }
      case "resize": {
        const dl=await dlQuoted(msg,jid);if(!dl?.qm?.imageMessage){await reply(`Reply to an image with ${prefix}resize <WxH>`);break;}
        const spec=args[0];if(!spec){await reply(`Usage: ${prefix}resize <WxH>  e.g. 512x512`);break;}
        const m=spec.match(/(\d+)x(\d+)/);if(!m){await reply("Invalid format. Example: 512x512");break;}
        try{const { default: sharp } = await import("sharp"); const out=await sharp(dl.buf).resize(parseInt(m[1]),parseInt(m[2]),{fit:"fill"}).toBuffer();await sock.sendMessage(jid,{image:out,caption:`🔄 Resized: ${spec}`},{quoted:msg});}catch(e){await reply(`❌ Resize: ${e.message}`);}
        break;
      }

      case "chatgpt": {
        const text=args.join(" ").trim();if(!text){await reply(`Usage: ${prefix}chatgpt <message>`);break;}const ai=getOpenAI();if(!ai){await reply("❌ OPENAI_API_KEY not set.");break;}
        try{const r=await ai.chat.completions.create({model:"gpt-4o",messages:[{role:"user",content:text}],max_tokens:1024});await replyChannel(`🤖 *ChatGPT:*\n${r.choices[0].message.content.trim()}`);}catch(e){await reply(`❌ ChatGPT: ${e.message}`);}
        break;
      }
      case "claude": {
        const text=args.join(" ").trim();if(!text){await reply(`Usage: ${prefix}claude <message>`);break;}const ai=getAnth();if(!ai){await reply("❌ ANTHROPIC_API_KEY not set.");break;}
        try{const r=await ai.messages.create({model:"claude-haiku-20240307",max_tokens:1024,messages:[{role:"user",content:text}]});await replyChannel(`🧠 *Claude:*\n${r.content[0].text.trim()}`);}catch(e){await reply(`❌ Claude: ${e.message}`);}
        break;
      }

      case "gemini": {
        const text=args.join(" ").trim();if(!text){await reply(`Usage: ${prefix}gemini <message>`);break;}const g=getGenAI();if(!g){await reply("❌ GEMINI_API_KEY not set.");break;}
        try{const m=g.getGenerativeModel({model:"gemini-1.5-flash"});const r=await m.generateContent(text);await replyChannel(`✨ *Gemini:*\n${r.response.text().trim()}`);}catch(e){await reply(`❌ Gemini: ${e.message}`);}
        break;
      }

      case "imagine":
      case "dalle": {
        const p=args.join(" ").trim();if(!p){await reply(`Usage: ${prefix}${command} <prompt>`);break;}const ai=getOpenAI();if(!ai){await reply("❌ OPENAI_API_KEY not set.");break;}
        try{const r=await ai.images.generate({model:"dall-e-3",prompt:p,n:1,size:"1024x1024"});await sock.sendMessage(jid,{image:{url:r.data[0].url},caption:`🎨 *${p}*`},{quoted:msg});}catch(e){await reply(`❌ Image gen: ${e.message}`);}
        break;
      }
      case "aiart": {
        const p=args.join(" ").trim();if(!p){await reply(`Usage: ${prefix}aiart <prompt>`);break;}
        if(!process.env.GEMINI_API_KEY){await reply("❌ GEMINI_API_KEY not set.");break;}
        try{
          const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${process.env.GEMINI_API_KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:p}]}],generationConfig:{responseModalities:["IMAGE","TEXT"]}})});
          const d=await r.json();const ip=d.candidates?.[0]?.content?.parts?.find(x=>x.inlineData);
          if(ip){await sock.sendMessage(jid,{image:Buffer.from(ip.inlineData.data,"base64"),caption:`🎨 *${p}*`},{quoted:msg});}else{await reply("❌ No image generated. Try a different prompt.");}
        }catch(e){await reply(`❌ AI Art: ${e.message}`);}
        break;
      }

      case "remini":
      case "enhance": {
        const dl=await dlQuoted(msg,jid);if(!dl?.qm?.imageMessage){await reply(`Reply to an image with ${prefix}${command}`);break;}const ai=getOpenAI();if(!ai){await reply("❌ OPENAI_API_KEY not set.");break;}
        try{const b64=dl.buf.toString("base64"),mime=dl.qm.imageMessage.mimetype||"image/jpeg";
          const r=await ai.chat.completions.create({model:"gpt-4o",max_tokens:600,messages:[{role:"user",content:[{type:"image_url",image_url:{url:`data:${mime};base64,${b64}`}},{type:"text",text:"1) Describe what is in this image. 2) Rate quality/lighting/sharpness out of 10. 3) Give 3 specific enhancement suggestions."}]}]});
          await replyChannel(`✨ *Image Analysis (${command}):*\n${r.choices[0].message.content.trim()}`);}catch(e){await reply(`❌ ${command}: ${e.message}`);}
        break;
      }

      case "detect":
      case "caption": {
        const dl=await dlQuoted(msg,jid);if(!dl?.qm?.imageMessage){await reply(`Reply to an image with ${prefix}${command}`);break;}const ai=getOpenAI();if(!ai){await reply("❌ OPENAI_API_KEY not set.");break;}
        try{const b64=dl.buf.toString("base64"),mime=dl.qm.imageMessage.mimetype||"image/jpeg";
          const prompt=command==="detect"?"List all objects, people, text, and notable elements visible in this image. Be specific.":"Write a creative 1-2 sentence caption for this image.";
          const r=await ai.chat.completions.create({model:"gpt-4o",max_tokens:500,messages:[{role:"user",content:[{type:"image_url",image_url:{url:`data:${mime};base64,${b64}`}},{type:"text",text:prompt}]}]});
          await replyChannel(`${command==="detect"?"🔍":"💬"} *${command==="detect"?"Detected":"Caption"}:*\n${r.choices[0].message.content.trim()}`);}catch(e){await reply(`❌ ${command}: ${e.message}`);}
        break;
      }

      case "summarize": {
        const ctx2=msg.message?.extendedTextMessage?.contextInfo;
        const qt=ctx2?.quotedMessage?.conversation||ctx2?.quotedMessage?.extendedTextMessage?.text;
        const toSum=args.join(" ").trim()||qt;
        if(!toSum){await reply(`Usage: ${prefix}summarize <text>  or reply to a message`);break;}const ai=getOpenAI();if(!ai){await reply("❌ OPENAI_API_KEY not set.");break;}
        try{const r=await ai.chat.completions.create({model:"gpt-4o",max_tokens:500,messages:[{role:"user",content:`Summarize in clear bullet points:\n\n${toSum}`}]});await replyChannel(`📝 *Summary:*\n${r.choices[0].message.content.trim()}`);}catch(e){await reply(`❌ Summarize: ${e.message}`);}
        break;
      }

      case "translate": {
        const lang=args[0]?.toLowerCase(),text2=args.slice(1).join(" ").trim();
        if(!lang||!text2){await reply(`Usage: ${prefix}translate <lang_code> <text>\nCodes: en es fr de ja zh ar pt ru ko hi`);break;}
        try{const r=await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text2)}&langpair=en|${encodeURIComponent(lang)}`);const d=await r.json();const tr=d.responseData?.translatedText;
          if(!tr||tr===text2){await reply("❌ Translation failed. Check the language code.");break;}await replyChannel(`🌐 *Translated (→${lang}):*\n${tr}`);}catch(e){await reply(`❌ Translate: ${e.message}`);}
        break;
      }

      case "ytmp3": {
        const url=args[0]?.trim();if(!url||!/youtu/.test(url)){await reply(`Usage: ${prefix}ytmp3 <YouTube URL>`);break;}
        await reply("⏳ Downloading audio...");
        try{
          const info=await ytdl.getInfo(url);
          const dur=parseInt(info.videoDetails.lengthSeconds);
          if(dur>600){await reply("❌ Video too long (max 10 min).");break;}
          const fmt=ytdl.chooseFormat(info.formats,{quality:"highestaudio",filter:"audioonly"});
          const chunks=[];await new Promise((res,rej)=>{const s=ytdl.downloadFromInfo(info,{format:fmt});s.on("data",c=>chunks.push(c));s.on("end",res);s.on("error",rej);});
          const buf=Buffer.concat(chunks);if(buf.length>64*1024*1024){await reply("❌ Too large.");break;}
          await sock.sendMessage(jid,{audio:buf,mimetype:fmt.mimeType?.split(";")[0]||"audio/webm",fileName:`${info.videoDetails.title.slice(0,40)}.webm`},{quoted:msg});
        }catch(e){await reply(`❌ ytmp3: ${e.message}`);}
        break;
      }
      case "ytmp4": {
        const url=args[0]?.trim();if(!url||!/youtu/.test(url)){await reply(`Usage: ${prefix}ytmp4 <YouTube URL>`);break;}
        await reply("⏳ Downloading video...");
        try{
          const info=await ytdl.getInfo(url);
          const dur=parseInt(info.videoDetails.lengthSeconds);
          if(dur>300){await reply("❌ Video too long (max 5 min for video).");break;}
          const fmt=ytdl.chooseFormat(info.formats,{quality:"lowestvideo",filter:f=>f.hasAudio&&f.hasVideo});
          if(!fmt){await reply("❌ No suitable format found.");break;}
          const chunks=[];await new Promise((res,rej)=>{const s=ytdl.downloadFromInfo(info,{format:fmt});s.on("data",c=>chunks.push(c));s.on("end",res);s.on("error",rej);});
          const buf=Buffer.concat(chunks);if(buf.length>64*1024*1024){await reply("❌ Too large.");break;}
          await sock.sendMessage(jid,{video:buf,caption:`🎬 ${info.videoDetails.title}`,mimetype:"video/mp4"},{quoted:msg});
        }catch(e){await reply(`❌ ytmp4: ${e.message}`);}
        break;
      }

      case "igdl": {
        const u=args[0]?.trim();if(!u||!/instagram\.com/.test(u)){await reply(`Usage: ${prefix}igdl <Instagram URL>`);break;}
        await reply("⏳ Fetching from Instagram...");
        try{
          const r=await fetch(`https://api.fastdl.app/api/convert`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:u})});
          const d=await r.json();
          if(!d?.medias?.length){
            const r2=await fetch(`https://igdownloader.app/api/ajaxSearch`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:`recaptchaToken=&q=${encodeURIComponent(u)}&t=media&lang=en`});
            const d2=await r2.json();if(!d2?.data){await reply("❌ Could not fetch. The post may be private.");break;}
            await sock.sendMessage(jid,{text:`📥 *Instagram Download*\n${d2.data.replace(/<[^>]+>/g," ").trim().slice(0,500)}`},{quoted:msg});break;
          }
          for(const m of d.medias.slice(0,3)){
            if(m.type==="video"||m.url?.includes(".mp4")){
              await sock.sendMessage(jid,{video:{url:m.url},caption:"📥 Instagram Video"},{quoted:msg});
            }else{
              await sock.sendMessage(jid,{image:{url:m.url},caption:"📥 Instagram Image"},{quoted:msg});
            }
          }
        }catch(e){await reply(`❌ igdl: ${e.message}`);}
        break;
      }

      case "tiktok": {
        const u=args[0]?.trim();if(!u||!/tiktok\.com/.test(u)){await reply(`Usage: ${prefix}tiktok <TikTok URL>`);break;}
        await reply("⏳ Fetching TikTok video...");
        try{
          const r=await fetch(`https://tikwm.com/api/?url=${encodeURIComponent(u)}`);
          const d=await r.json();
          if(d.code!==0||!d.data){await reply("❌ Could not fetch. Check the URL.");break;}
          const v=d.data;
          const vidUrl=v.play||v.hdplay||v.wmplay;
          if(!vidUrl){await reply("❌ No video found.");break;}
          await sock.sendMessage(jid,{video:{url:vidUrl},caption:`📥 *${v.title?.slice(0,100)||"TikTok Video"}*\n👤 ${v.author?.nickname||"?"}  👁 ${fmtNum(v.play_count)}  ❤️ ${fmtNum(v.digg_count)}`},{quoted:msg});
        }catch(e){await reply(`❌ tiktok: ${e.message}`);}
        break;
      }

      case "fbdl": {
        const u=args[0]?.trim();if(!u||!/facebook\.com|fb\.watch/.test(u)){await reply(`Usage: ${prefix}fbdl <Facebook video URL>`);break;}
        await reply("⏳ Fetching Facebook video...");
        try{
          const r=await fetch(`https://api.fastdl.app/api/convert`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:u})});
          const d=await r.json();
          const vid=d?.medias?.find(m=>m.type==="video")||d?.medias?.[0];
          if(!vid?.url){await reply("❌ Could not fetch. The video may be private or the URL is invalid.");break;}
          await sock.sendMessage(jid,{video:{url:vid.url},caption:`📥 Facebook Video${d.title?` — ${d.title.slice(0,80)}`:""}`},{quoted:msg});
        }catch(e){await reply(`❌ fbdl: ${e.message}`);}
        break;
      }

      case "twdl": {
        const u=args[0]?.trim();if(!u||!/twitter\.com|x\.com/.test(u)){await reply(`Usage: ${prefix}twdl <Twitter/X URL>`);break;}
        await reply("⏳ Fetching from Twitter/X...");
        try{
          const tweetId=u.match(/status\/(\d+)/)?.[1];
          if(!tweetId){await reply("❌ Could not extract tweet ID.");break;}
          const r=await fetch(`https://api.vxtwitter.com/Twitter/status/${tweetId}`);
          const d=await r.json();
          if(!d){await reply("❌ Could not fetch tweet.");break;}
          if(d.media_extended?.length){
            for(const m of d.media_extended.slice(0,2)){
              if(m.type==="video"||m.type==="gif"){
                await sock.sendMessage(jid,{video:{url:m.url},caption:`📥 @${d.user_name}: ${d.text?.slice(0,100)||""}`},{quoted:msg});
              }else{
                await sock.sendMessage(jid,{image:{url:m.url},caption:`📥 @${d.user_name}: ${d.text?.slice(0,100)||""}`},{quoted:msg});
              }
            }
          }else if(d.text){
            await reply(`📥 *@${d.user_name}:*\n${d.text}`);
          }else{await reply("❌ No media found in this tweet.");}
        }catch(e){await reply(`❌ twdl: ${e.message}`);}
        break;
      }

      case "spotdl": {
        const u=args[0]?.trim();if(!u||!/open\.spotify\.com/.test(u)){await reply(`Usage: ${prefix}spotdl <Spotify track URL>`);break;}
        await reply("⏳ Looking up track on Spotify...");
        try{
          const trackId=u.match(/track\/([a-zA-Z0-9]+)/)?.[1];
          if(!trackId){await reply("❌ Only track URLs are supported (not albums/playlists).");break;}
          const r=await fetch(`https://api.spotifydown.com/download/${trackId}`,{headers:{"Origin":"https://spotifydown.com","Referer":"https://spotifydown.com/"}});
          const d=await r.json();
          if(d.success&&d.link){
            const chunks=[];const resp=await fetch(d.link);const ab=await resp.arrayBuffer();const buf=Buffer.from(ab);
            if(buf.length>64*1024*1024){await reply("❌ File too large.");break;}
            await sock.sendMessage(jid,{audio:buf,mimetype:"audio/mpeg",fileName:`${d.metadata?.title||"spotify_track"}.mp3`},{quoted:msg});
          }else{
            await reply(`❌ Could not download. Try searching YouTube instead:\n${prefix}ytmp3 ${d.metadata?.title||"song name"}`);
          }
        }catch(e){await reply(`❌ spotdl: ${e.message}\n\n💡 Tip: Try ${prefix}ytmp3 <YouTube link of the song> instead.`);}
        break;
      }

      case "pinterest": {
        if (!text) { await reply(`📌 Usage: ${prefix}pinterest <search keyword>\nExample: ${prefix}pinterest anime girl`); break; }
        initUserDB(sender, pushname);
        const pinCost2 = getLimitCost("pinterest", 1);
        const pinLim2 = checkLimit(sender, isOwner(sender));
        if (pinLim2 !== "∞" && pinLim2 < pinCost2) { await reply(`❌ Not enough limit! Need *${pinCost2}*, you have *${pinLim2}*.`); break; }
        await sock.sendMessage(jid, { react: { text: "🔍", key: msg.key } });
        try {
          const images = await searchPinterestAPI(text, 10);
          if (!images?.length) throw new Error("No images found for that keyword.");
          const cards = await Promise.all(images.slice(0, 10).map(async (item, i) => ({
            header: proto.Message.InteractiveMessage.Header.create({
              ...(await prepareWAMessageMedia({ image: { url: item.url } }, { upload: sock.waUploadToServer })),
              title: '',
              subtitle: `Image ${i + 1} of ${images.length}`,
              hasMediaAttachment: true
            }),
            body: { text: item.title ? `📌 ${item.title}` : '' },
            nativeFlowMessage: { buttons: [] }
          })));
          const carouselMsg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
              message: {
                messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                interactiveMessage: {
                  body: { text: `📌 *Pinterest Search*\n\n🔎 Query: _${text}_\n📷 ${images.length} results found` },
                  carouselMessage: { cards, messageVersion: 1 }
                }
              }
            }
          }, { quoted: msg });
          await sock.relayMessage(jid, carouselMsg.message, { messageId: carouselMsg.key.id });
          useLimit(sender, pinCost2, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          await reply(`❌ Pinterest search failed: ${e.message}`);
        }
        break;
      }

      case "gdrive": {
        const u=args[0]?.trim();if(!u||!/drive\.google\.com/.test(u)){await reply(`Usage: ${prefix}gdrive <Google Drive file URL>`);break;}
        const fid=u.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]||u.match(/id=([a-zA-Z0-9_-]+)/)?.[1];
        if(!fid){await reply("❌ Could not extract file ID from URL.");break;}
        await reply("⏳ Fetching from Google Drive...");
        try{
          const direct=`https://drive.google.com/uc?export=download&id=${fid}&confirm=t`;
          const r=await fetch(direct,{redirect:"follow"});
          if(!r.ok){await reply("❌ File not accessible. Make sure sharing is set to 'Anyone with the link'.");break;}
          const buf=Buffer.from(await r.arrayBuffer());
          if(buf.length>64*1024*1024){await reply("❌ File too large (>64MB). WhatsApp limit.");break;}
          const ct=r.headers.get("content-type")||"";
          const ext=ct.includes("pdf")?"pdf":ct.includes("image")?"jpg":ct.includes("video")?"mp4":"bin";
          if(ct.includes("video")){
            await sock.sendMessage(jid,{video:buf,caption:"📥 Google Drive Video"},{quoted:msg});
          }else if(ct.includes("image")){
            await sock.sendMessage(jid,{image:buf,caption:"📥 Google Drive Image"},{quoted:msg});
          }else if(ct.includes("audio")){
            await sock.sendMessage(jid,{audio:buf,mimetype:ct},{quoted:msg});
          }else{
            await sock.sendMessage(jid,{document:buf,mimetype:ct||"application/octet-stream",fileName:`gdrive_${fid}.${ext}`},{quoted:msg});
          }
        }catch(e){await reply(`❌ gdrive: ${e.message}`);}
        break;
      }

      case "mediafire": {
        const u=args[0]?.trim();if(!u||!/mediafire\.com/.test(u)){await reply(`Usage: ${prefix}mediafire <Mediafire URL>`);break;}
        await reply("⏳ Fetching from Mediafire...");
        try{
          const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},redirect:"follow"});
          const html=await r.text();
          const dl=html.match(/href="(https:\/\/download[^"]+)"/)?.[1]||html.match(/aria-label="Download file"\s+href="([^"]+)"/)?.[1];
          if(!dl){await reply("❌ Could not extract download link.");break;}
          const fname=html.match(/class="filename">([^<]+)/)?.[1]||"mediafire_file";
          const fsize=html.match(/class="fileSize">([^<]+)/)?.[1]||"?";
          await replyChannel(`📥 *Mediafire Download*\n━━━━━━━━━━━━━━━━━━━\n📄 *File:* ${fname}\n📦 *Size:* ${fsize}\n🔗 ${dl}`);
        }catch(e){await reply(`❌ mediafire: ${e.message}`);}
        break;
      }

      case "apk": {
        const name=args.join(" ").trim();if(!name){await reply(`Usage: ${prefix}apk <app name>`);break;}
        try{
          const r=await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(name+" APK download apkpure.com")}&format=json&no_redirect=1&no_html=1`);
          const d=await r.json();
          const link=d.RelatedTopics?.find(t=>t.FirstURL?.includes("apkpure"))?.FirstURL;
          await replyChannel(
            `📥 *APK Search: ${name}*\n━━━━━━━━━━━━━━━━━━━\n`+
            (link?`🔗 ${link}\n\n`:"No direct APK link found.\n\n")+
            `Try these sites directly:\n`+
            `• https://apkpure.com/search?q=${encodeURIComponent(name)}\n`+
            `• https://www.apkmirror.com/?s=${encodeURIComponent(name)}`
          );
        }catch(e){await reply(`❌ apk: ${e.message}`);}
        break;
      }

      case "capcut": {
        const u=args[0]?.trim();if(!u||!/capcut/.test(u)){await reply(`Usage: ${prefix}capcut <CapCut template URL>`);break;}
        try{
          const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},redirect:"follow"});
          const html=await r.text();
          const vid=html.match(/property="og:video"\s+content="([^"]+)"/)?.[1];
          const title=html.match(/property="og:title"\s+content="([^"]+)"/)?.[1]||"CapCut Template";
          const thumb=html.match(/property="og:image"\s+content="([^"]+)"/)?.[1];
          if(vid){
            await sock.sendMessage(jid,{video:{url:vid},caption:`📥 *${title}*`},{quoted:msg});
          }else if(thumb){
            await sock.sendMessage(jid,{image:{url:thumb},caption:`📥 *${title}*\n\n_Video not extractable — here\'s the thumbnail._\n🔗 ${u}`},{quoted:msg});
          }else{
            await reply(`❌ Could not extract CapCut content. Open directly:\n🔗 ${u}`);
          }
        }catch(e){await reply(`❌ capcut: ${e.message}`);}
        break;
      }

      case "google":
      case "imgsearch": {
        const q=args.join(" ").trim();if(!q){await reply(`Usage: ${prefix}${command} <query>`);break;}
        try{
          const r=await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`);
          const d=await r.json();const abs=d.AbstractText||d.Answer;
          const rel=(d.RelatedTopics||[]).slice(0,3).filter(t=>t.FirstURL).map(t=>`• ${t.Text?.slice(0,80)}\n  🔗 ${t.FirstURL}`);
          if(!abs&&!rel.length){await reply(`❌ No results for *${q}*. Try a more specific term.`);break;}
          let txt=`🔍 *Search: ${q}*\n━━━━━━━━━━━━━━━━━━━\n`;
          if(abs)txt+=`${abs}\n\n`;
          if(rel.length)txt+=`*Related:*\n${rel.join("\n")}`;
          await replyChannel(txt);
        }catch(e){await reply(`❌ Search: ${e.message}`);}
        break;
      }
      case "ytsearch": {
        const q=args.join(" ").trim();if(!q){await reply(`Usage: ${prefix}ytsearch <query>`);break;}
        try{
          const videos=await ytSearch(q);
          if(!videos?.length){await reply("❌ No results found. Try again.");break;}
          const txt=`▶️ *YouTube: ${q}*\n━━━━━━━━━━━━━━━━━━━\n`+videos.slice(0,5).map((v,i)=>{
            const dur=v.lengthSeconds?`${Math.floor(v.lengthSeconds/60)}:${String(v.lengthSeconds%60).padStart(2,"0")}`:"?:??";
            return `${i+1}. *${v.title}*\n   ⏱ ${dur} · 👁 ${v.viewCount?.toLocaleString()??"?"} \n   🔗 https://youtu.be/${v.videoId}`;
          }).join("\n\n");
          await replyChannel(txt);
        }catch(e){await reply(`❌ YT Search: ${e.message}`);}
        break;
      }

      case "weather": {
        const city=args.join(" ").trim();if(!city){await reply(`Usage: ${prefix}weather <city>`);break;}
        try{
          const r=await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
          if(!r.ok){await reply(`❌ City not found: ${city}`);break;}const d=await r.json();
          const cur=d.current_condition[0],area=d.nearest_area[0];
          await replyChannel(`🌤️ *Weather: ${area.areaName[0].value}, ${area.country[0].value}*\n━━━━━━━━━━━━━━━━━━━\n🌡️ *Temp:* ${cur.temp_C}°C (feels ${cur.FeelsLikeC}°C)\n☁️ *Condition:* ${cur.weatherDesc[0].value}\n💧 *Humidity:* ${cur.humidity}%\n💨 *Wind:* ${cur.windspeedKmph} km/h`);
        }catch(e){await reply(`❌ Weather: ${e.message}`);}
        break;
      }

      case "news": {
        try{
          const r=await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
          const ids=await r.json();const top5=ids.slice(0,5);
          const stories=await Promise.all(top5.map(id=>fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r=>r.json())));
          const text=`📰 *Top Tech News*\n━━━━━━━━━━━━━━━━━━━\n`+stories.map((s,i)=>`${i+1}. *${s.title}*\n   🔗 ${s.url??"https://news.ycombinator.com/item?id="+s.id}`).join("\n\n");
          await replyChannel(text);
        }catch(e){await reply(`❌ News: ${e.message}`);}
        break;
      }

      case "lyrics": {
        const q=args.join(" ").trim();if(!q){await reply(`Usage: ${prefix}lyrics <artist> - <song>\nExample: ${prefix}lyrics Drake - Gods Plan`);break;}
        const parts=q.split(/\s*[\-–]\s*/);const artist=parts[0]?.trim(),song=parts[1]?.trim();
        if(!artist||!song){await reply(`Format: ${prefix}lyrics <artist> - <song>`);break;}
        try{
          const r=await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(song)}`);
          const d=await r.json();if(d.error||!d.lyrics){await reply(`❌ Lyrics not found for *${q}*`);break;}
          const lyr=d.lyrics.trim().slice(0,3000);
          await replyChannel(`🎵 *${artist} — ${song}*\n━━━━━━━━━━━━━━━━━━━\n${lyr}${d.lyrics.length>3000?"\n...(truncated)":""}`);
        }catch(e){await reply(`❌ Lyrics: ${e.message}`);}
        break;
      }

      case "define": {
        const word=args.join(" ").trim();if(!word){await reply(`Usage: ${prefix}define <word>`);break;}
        try{
          const r=await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
          if(!r.ok){await reply(`❌ No definition found for *${word}*. Try ${prefix}urban ${word}`);break;}
          const data=await r.json();const entry=data[0];
          const meanings=entry.meanings.slice(0,2).map(m=>{const d=m.definitions[0];return `*${m.partOfSpeech}*: ${d.definition}${d.example?`\n_"${d.example}"_`:""}`;}).join("\n\n");
          await replyChannel(`📖 *${entry.word}*\n━━━━━━━━━━━━━━━━━━━\n${meanings}`);
        }catch(e){await reply(`❌ Define: ${e.message}`);}
        break;
      }

      case "anime":
      case "manga":
        await reply(`🎌 *${command}*: Usage: ${prefix}${command} <title>\nRequires an anime/manga API (e.g. Jikan/MyAnimeList) to be configured.`);
        break;

      case "ttt": {
        const key=`ttt_${jid}_${senderJid}`,sub2=(args[0]??"").toLowerCase();
        if(sub2==="stop"||sub2==="end"){gameStates.delete(key);await reply("🎮 Game ended.");break;}
        let g=gameStates.get(key);
        if(!g||sub2==="new"||sub2==="start"){g={board:Array(9).fill(null)};gameStates.set(key,g);await reply(`🎮 *Tic-Tac-Toe*\nYou are ❌, bot is ⭕\n\n${tttBoard(g.board)}\n\nPick a number (1-9):`);break;}
        const mv=parseInt(args[0])-1;
        if(isNaN(mv)||mv<0||mv>8||g.board[mv]){await reply(`Invalid move.\n\n${tttBoard(g.board)}`);break;}
        g.board[mv]="X";
        if(tttWin(g.board,"X")){gameStates.delete(key);await reply(`❌ You win! 🎉\n\n${tttBoard(g.board)}`);break;}
        if(g.board.every(Boolean)){gameStates.delete(key);await reply(`Draw! 🤝\n\n${tttBoard(g.board)}`);break;}
        const bm=tttBot(g.board);g.board[bm]="O";
        if(tttWin(g.board,"O")){gameStates.delete(key);await reply(`⭕ Bot wins! 🤖\n\n${tttBoard(g.board)}`);break;}
        if(g.board.every(Boolean)){gameStates.delete(key);await reply(`Draw! 🤝\n\n${tttBoard(g.board)}`);break;}
        await reply(`${tttBoard(g.board)}\n\nYour move (1-9):`);
        break;
      }

      case "chess":
      case "wordle":
      case "akinator":
        await reply(`🎮 *${command}*: This game requires a dedicated engine. Coming soon!`);
        break;

      case "hangman": {
        const key=`hm_${jid}_${senderJid}`,inp=(args[0]??"").toLowerCase();
        if(inp==="stop"||inp==="end"){gameStates.delete(key);await reply("🎮 Game ended.");break;}
        let g=gameStates.get(key);
        if(!g||inp==="new"||inp==="start"){const w=HM_WORDS[Math.floor(Math.random()*HM_WORDS.length)];g={word:w,guessed:[],wrong:0};gameStates.set(key,g);await reply(`🔤 *Hangman!*\n\n${hmFig(0)}\n\nWord: *${w.split("").map(()=>"_").join(" ")}*\n❤️ Lives: 7\n\nGuess a letter!`);break;}
        if(!inp||inp.length!==1||!/[a-z]/.test(inp)){await reply("Send a single letter to guess!");break;}
        if(g.guessed.includes(inp)){await reply(`Already guessed *${inp}*!`);break;}
        g.guessed.push(inp);if(!g.word.includes(inp))g.wrong++;
        const disp=g.word.split("").map(l=>g.guessed.includes(l)?l:"_").join(" ");
        const solved=!disp.includes("_");
        if(g.wrong>=7){gameStates.delete(key);await reply(`${hmFig(7)}\n\nGame over! 💀 Word was *${g.word}*`);break;}
        if(solved){gameStates.delete(key);await reply(`${hmFig(g.wrong)}\n\n🎉 You got it! Word was *${g.word}*`);break;}
        const wrong=g.guessed.filter(l=>!g.word.includes(l));
        await reply(`${hmFig(g.wrong)}\n\nWord: *${disp}*\n❤️ Lives: ${7-g.wrong}\n❌ Wrong: ${wrong.join(", ")||"none"}\n\nGuess a letter!`);
        break;
      }

      case "blackjack": {
        const key=`bj_${jid}_${senderJid}`,sub3=(args[0]??"").toLowerCase();
        if(sub3==="stop"){gameStates.delete(key);await reply("🎮 Game ended.");break;}
        let g=gameStates.get(key);
        if(!g||sub3==="new"||sub3==="start"){const dk=bjDeck();const pl=[dk.pop(),dk.pop()],dl2=[dk.pop(),dk.pop()];g={deck:dk,player:pl,dealer:dl2};gameStates.set(key,g);const pv=bjVal(pl);await reply(`🃏 *Blackjack*\n━━━━━━━━━━━━━━━━━━━\n🧑 Your hand: ${pl.join(" ")} = *${pv}*\n🤖 Dealer: ${dl2[0]} 🂠\n\n${pv===21?"Blackjack! 🎉 Auto-stand...":"Reply *hit* or *stand*"}`);if(pv===21){while(bjVal(g.dealer)<17)g.dealer.push(g.deck.pop());const dv=bjVal(g.dealer);gameStates.delete(key);await reply(`🤖 Dealer: ${g.dealer.join(" ")} = *${dv}*\n\n${dv>21?"Dealer busts! You win! 🎉":21>dv?"You win! 🎉":21===dv?"Push — tie! 🤝":"Dealer wins. 🤖"}`);}break;}
        if(sub3==="hit"){g.player.push(g.deck.pop());const pv=bjVal(g.player);if(pv>21){gameStates.delete(key);await reply(`Your hand: ${g.player.join(" ")} = *${pv}*\n💥 Bust! You lose.`);break;}await reply(`Your hand: ${g.player.join(" ")} = *${pv}*\n${pv===21?"21!":"Reply *hit* or *stand*"}`);if(pv===21){while(bjVal(g.dealer)<17)g.dealer.push(g.deck.pop());const dv=bjVal(g.dealer);gameStates.delete(key);await reply(`🤖 Dealer: ${g.dealer.join(" ")} = *${dv}*\n\n${dv>21?"Dealer busts! You win! 🎉":21>dv?"You win! 🎉":21===dv?"Tie! 🤝":"Dealer wins. 🤖"}`);}break;}
        if(sub3==="stand"){while(bjVal(g.dealer)<17)g.dealer.push(g.deck.pop());const pv=bjVal(g.player),dv=bjVal(g.dealer);gameStates.delete(key);await reply(`🧑 Your hand: ${g.player.join(" ")} = *${pv}*\n🤖 Dealer: ${g.dealer.join(" ")} = *${dv}*\n\n${dv>21?"Dealer busts! You win! 🎉":pv>dv?"You win! 🎉":pv===dv?"Tie! 🤝":"Dealer wins. 🤖"}`);break;}
        await reply(`Your hand: ${g.player.join(" ")} = *${bjVal(g.player)}*\n🤖 Dealer: ${g.dealer[0]} 🂠\n\nReply *hit* or *stand*`);
        break;
      }

      case "ytinfo": {
        const url=args[0]?.trim();if(!url||!/youtu/.test(url)){await reply(`Usage: ${prefix}ytinfo <YouTube URL>`);break;}
        try{
          const info=await ytdl.getInfo(url);const d=info.videoDetails;
          const mins=Math.floor(parseInt(d.lengthSeconds)/60),secs=parseInt(d.lengthSeconds)%60;
          await replyChannel(`▶️ *${d.title}*\n━━━━━━━━━━━━━━━━━━━\n👤 *Channel:* ${d.author.name}\n⏱️ *Duration:* ${mins}:${String(secs).padStart(2,"0")}\n👁️ *Views:* ${parseInt(d.viewCount).toLocaleString()}\n📅 *Published:* ${d.publishDate??"N/A"}\n🔗 ${d.video_url}`);
        }catch(e){await reply(`❌ ytinfo: ${e.message}`);}
        break;
      }
      case "ytplaylist": {
        const u=args[0]?.trim();if(!u){await reply(`Usage: ${prefix}ytplaylist <playlist URL>`);break;}
        const pid=extractPid(u);if(!pid){await reply("❌ Could not extract playlist ID. Use a full playlist URL.");break;}
        try{
          const d=await invGet(`/api/v1/playlists/${pid}`);
          if(!d||d.error){await reply("❌ Playlist not found.");break;}
          const top3=(d.videos||[]).slice(0,3).map((v,i)=>`  ${i+1}. *${v.title}* (${fmtDur(v.lengthSeconds)})`).join("\n");
          await replyChannel(
            `📋 *${d.title}*\n━━━━━━━━━━━━━━━━━━━\n`+
            `👤 *Channel:* ${d.author}\n`+
            `📹 *Videos:* ${d.videoCount}\n`+
            `👁️ *Views:* ${fmtNum(d.viewCount)}\n\n`+
            `*Top videos:*\n${top3}\n\n`+
            `🔗 https://www.youtube.com/playlist?list=${pid}`
          );
        }catch(e){await reply(`❌ ytplaylist: ${e.message}`);}
        break;
      }

      case "yttrend": {
        const region=(args[0]?.toUpperCase())||"US";
        try{
          const d=await invGet(`/api/v1/trending?region=${region}&type=music`)||await invGet(`/api/v1/trending?region=${region}`);
          if(!d?.length){await reply("❌ Could not fetch trending videos.");break;}
          const txt=`🔥 *Trending on YouTube (${region})*\n━━━━━━━━━━━━━━━━━━━\n`+
            d.slice(0,5).map((v,i)=>
              `${i+1}. *${v.title}*\n   👤 ${v.author} · 👁 ${fmtNum(v.viewCount)} · ⏱ ${fmtDur(v.lengthSeconds)}\n   🔗 https://youtu.be/${v.videoId}`
            ).join("\n\n");
          await replyChannel(txt);
        }catch(e){await reply(`❌ yttrend: ${e.message}`);}
        break;
      }

      case "ytcomments": {
        const u=args[0]?.trim();if(!u){await reply(`Usage: ${prefix}ytcomments <YouTube URL>`);break;}
        const vid=extractVid(u);if(!vid){await reply("❌ Could not extract video ID.");break;}
        try{
          const d=await invGet(`/api/v1/comments/${vid}?sort_by=top`);
          if(!d?.comments?.length){await reply("❌ No comments found.");break;}
          const top5=d.comments.slice(0,5).map((c,i)=>
            `${i+1}. *${c.author}*\n   ${c.content?.slice(0,120)}${(c.content?.length||0)>120?"...":""}\n   👍 ${fmtNum(c.likeCount)}`
          ).join("\n\n");
          await replyChannel(`💬 *Top Comments*\n━━━━━━━━━━━━━━━━━━━\n${top5}`);
        }catch(e){await reply(`❌ ytcomments: ${e.message}`);}
        break;
      }

      case "ytlive": {
        const u=args[0]?.trim();if(!u){await reply(`Usage: ${prefix}ytlive <YouTube video or channel URL>`);break;}
        const vid=extractVid(u);if(!vid){await reply("❌ Please provide a valid YouTube video URL.");break;}
        try{
          const info=await ytdl.getInfo(u);const d=info.videoDetails;
          const isLive=d.isLive||d.isLiveContent;
          const status=isLive
            ? `🔴 *LIVE NOW*\n👁️ Watching: ${fmtNum(d.viewCount)}`
            : d.isLiveContent
              ? "⚫ Stream ended"
              : "⚫ Not a live stream";
          await replyChannel(
            `📡 *${d.title}*\n━━━━━━━━━━━━━━━━━━━\n`+
            `${status}\n`+
            `👤 *Channel:* ${d.author.name}\n`+
            `🔗 ${d.video_url}`
          );
        }catch(e){await reply(`❌ ytlive: ${e.message}`);}
        break;
      }

      case "ytsub": {
        const u=args[0]?.trim();if(!u){await reply(`Usage: ${prefix}ytsub <YouTube video URL>`);break;}
        try{
          const info=await ytdl.getInfo(u);const d=info.videoDetails;
          const subs=d.author?.subscriberCount;
          await replyChannel(
            `📊 *Channel Stats*\n━━━━━━━━━━━━━━━━━━━\n`+
            `👤 *Channel:* ${d.author.name}\n`+
            `🔔 *Subscribers:* ${subs?fmtNum(subs):"Hidden"}\n`+
            `🔗 ${d.author.channel_url??`https://www.youtube.com/channel/${d.author.id}`}`
          );
        }catch(e){await reply(`❌ ytsub: ${e.message}`);}
        break;
      }

      case "ytlike": {
        const u=args[0]?.trim();if(!u){await reply(`Usage: ${prefix}ytlike <YouTube video URL>`);break;}
        try{
          const info=await ytdl.getInfo(u);const d=info.videoDetails;
          await replyChannel(
            `👍 *Video Stats*\n━━━━━━━━━━━━━━━━━━━\n`+
            `📹 *${d.title}*\n`+
            `👍 *Likes:* ${d.likes?fmtNum(d.likes):"Hidden"}\n`+
            `👁️ *Views:* ${fmtNum(d.viewCount)}\n`+
            `🔗 ${d.video_url}`
          );
        }catch(e){await reply(`❌ ytlike: ${e.message}`);}
        break;
      }


      // ══════════════════════════════════════════════════════════════
      //  HydroMD MERGED COMMANDS — All commands ported to ESM English
      // ══════════════════════════════════════════════════════════════

      // ── Limit system helpers ─────────────────────────────────────
      case "mylimit": {
        initUserDB(sender, pushname);
        const lim = checkLimit(sender, isOwner(sender));
        if (lim === "∞") return reply("💎 You have *unlimited* limit as owner!");
        reply(`📊 *Your Remaining Limit*\n\n💳 Daily limit: *${lim}*\n\n> Limit resets every day at midnight.`);
        break;
      }
      case "setlimit":
      case "caselimit": {
        if (!isOwner(sender)) return reply("❌ Owner only.");
        if (!args[0] || !args[1]) return reply(`Usage: ${prefix}setlimit <command> <cost>\nExample: ${prefix}setlimit tiktok 2`);
        setLimitCost(args[0], parseInt(args[1]) || 0);
        reply(`✅ Set limit cost for *${args[0]}* to *${args[1]}*`);
        break;
      }

      // ── TikTok Downloader (HydroMD engine) ───────────────────────
      case "tt": {
        if (!text) return reply(`📌 Example: ${prefix}tiktok https://vt.tiktok.com/...`);
        initUserDB(sender, pushname);
        const ttCost = getLimitCost("tiktok", 2);
        const ttLim = checkLimit(sender, isOwner(sender));
        if (ttLim !== "∞" && ttLim < ttCost) return reply(`❌ Not enough limit! Need *${ttCost}*, you have *${ttLim}*.`);
        await sock.sendMessage(jid, { react: { text: "⏱️", key: msg.key } });
        try {
          const data = await tiktokDl(text);
          if (!data?.status) throw new Error("Failed to fetch data.");
          const author = data.author?.nickname || "Unknown";
          const title = data.title || "-";
          const stats = data.stats || {};
          const images = data.data.filter((v) => v.type === "photo");
          const videoObj = data.data.find((v) => v.type === "nowatermark") || data.data[0];
          const caption = `🎵 *TikTok Downloader*\n\n👤 *Author:* ${author}\n📝 *Title:* ${title}\n\n📊 Views: ${stats.views} | ❤️ ${stats.likes} | 💬 ${stats.comment} | 🔄 ${stats.share}`;

          if (images.length > 0) {
            const cards = await Promise.all(images.slice(0, 10).map(async (v, i) => ({
              header: proto.Message.InteractiveMessage.Header.create({
                ...(await prepareWAMessageMedia({ image: { url: v.url } }, { upload: sock.waUploadToServer })),
                title: '',
                subtitle: `Slide ${i + 1}/${images.length}`,
                hasMediaAttachment: true
              }),
              body: { text: '' },
              nativeFlowMessage: { buttons: [] }
            })));
            const carouselMsg = generateWAMessageFromContent(jid, {
              viewOnceMessage: {
                message: {
                  messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2,
                  },
                  interactiveMessage: {
                    body: { text: caption },
                    carouselMessage: { cards, messageVersion: 1 }
                  }
                }
              }
            }, { quoted: msg });
            await sock.relayMessage(jid, carouselMsg.message, { messageId: carouselMsg.key.id });
          } else if (videoObj?.url) {
            await sock.sendMessage(jid, { video: { url: videoObj.url }, caption }, { quoted: msg });
          }
          // Send audio too
          const audioUrl = data.music_info?.url;
          if (audioUrl) {
            try {
              await sock.sendMessage(jid, {
                audio: { url: audioUrl }, mimetype: "audio/mp4",
                contextInfo: { externalAdReply: { title: data.music_info.title || "TikTok Audio", body: data.music_info.author || "TikTok", mediaType: 1 } },
              }, { quoted: msg });
            } catch {}
          }
          useLimit(sender, ttCost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ TikTok download failed: ${e.message}`);
        }
        break;
      }

      case "ttmusic":
      case "tiktokmusic":
      case "tiktokaudio":
      case "ttaudio": {
        if (!text) return reply(`📌 Example: ${prefix}ttmusic https://vt.tiktok.com/...`);
        initUserDB(sender, pushname);
        const ttmCost = getLimitCost("ttmusic", 1);
        const ttmLim = checkLimit(sender, isOwner(sender));
        if (ttmLim !== "∞" && ttmLim < ttmCost) return reply(`❌ Not enough limit! Need *${ttmCost}*, you have *${ttmLim}*.`);
        await sock.sendMessage(jid, { react: { text: "⏱️", key: msg.key } });
        try {
          const data = await tiktokDl(text);
          const audioUrl = data.music_info?.url;
          if (!audioUrl) throw new Error("No audio found in this TikTok.");
          await sock.sendMessage(jid, {
            audio: { url: audioUrl }, mimetype: "audio/mp4",
            contextInfo: {
              externalAdReply: {
                title: data.music_info.title || "TikTok Audio",
                body: data.music_info.author || "TikTok",
                thumbnailUrl: data.music_info.cover || "",
                mediaType: 1,
              },
            },
          }, { quoted: msg });
          useLimit(sender, ttmCost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ TikTok music failed: ${e.message}`);
        }
        break;
      }

      // ── Instagram Downloader (HydroMD engine) ────────────────────
      case "instagram":
      case "ig": {
        if (!text) return reply(`📌 Example: ${prefix}igdl https://www.instagram.com/p/...`);
        initUserDB(sender, pushname);
        const igCost = getLimitCost("igdl", 2);
        const igLim = checkLimit(sender, isOwner(sender));
        if (igLim !== "∞" && igLim < igCost) return reply(`❌ Not enough limit! Need *${igCost}*, you have *${igLim}*.`);
        await sock.sendMessage(jid, { react: { text: "⏱️", key: msg.key } });
        try {
          const items = await igDl(text);
          if (!items?.length) throw new Error("No media found.");
          for (let i = 0; i < Math.min(items.length, 10); i++) {
            const item = items[i];
            const opts = item.type === "video"
              ? { video: { url: item.url }, caption: i === 0 ? `📸 *Instagram Downloader*\n\nMedia ${i + 1}/${items.length}` : `Media ${i + 1}/${items.length}` }
              : { image: { url: item.url }, caption: i === 0 ? `📸 *Instagram Downloader*\n\nMedia ${i + 1}/${items.length}` : `Media ${i + 1}/${items.length}` };
            await sock.sendMessage(jid, opts, { quoted: msg });
          }
          useLimit(sender, igCost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ Instagram download failed: ${e.message}`);
        }
        break;
      }

      // ── YouTube MP3 alias (HydroMD engine) ───────────────────────
      case "mp3": {
        if (!text) return reply(`📌 Example: ${prefix}ytmp3 https://youtu.be/...`);
        initUserDB(sender, pushname);
        const mp3Cost = getLimitCost("ytmp3", 2);
        const mp3Lim = checkLimit(sender, isOwner(sender));
        if (mp3Lim !== "∞" && mp3Lim < mp3Cost) return reply(`❌ Not enough limit! Need *${mp3Cost}*, you have *${mp3Lim}*.`);
        await sock.sendMessage(jid, { react: { text: "⏱️", key: msg.key } });
        try {
          const result = await ytDlMp3(text);
          await sock.sendMessage(jid, {
            audio: { url: result.downloadUrl }, mimetype: "audio/mp4",
            contextInfo: { externalAdReply: { title: result.title, thumbnailUrl: result.thumbnail || "", mediaType: 1 } },
          }, { quoted: msg });
          useLimit(sender, mp3Cost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ YouTube MP3 failed: ${e.message}`);
        }
        break;
      }

      case "mp4": {
        if (!text) return reply(`📌 Example: ${prefix}ytmp4 https://youtu.be/...`);
        initUserDB(sender, pushname);
        const mp4Cost = getLimitCost("ytmp4", 3);
        const mp4Lim = checkLimit(sender, isOwner(sender));
        if (mp4Lim !== "∞" && mp4Lim < mp4Cost) return reply(`❌ Not enough limit! Need *${mp4Cost}*, you have *${mp4Lim}*.`);
        await sock.sendMessage(jid, { react: { text: "⏱️", key: msg.key } });
        try {
          const result = await ytDlMp4(text, args[1] || "720");
          await sock.sendMessage(jid, {
            video: { url: result.downloadUrl },
            caption: `🎬 *${result.title}*`,
          }, { quoted: msg });
          useLimit(sender, mp4Cost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ YouTube MP4 failed: ${e.message}`);
        }
        break;
      }

      // ── Spotify ───────────────────────────────────────────────────
      case "spotifydl":
      case "spdl": {
        if (!text) return reply(`📌 Example: ${prefix}spotifydl https://open.spotify.com/track/...`);
        initUserDB(sender, pushname);
        const spCost = getLimitCost("spdl", 2);
        const spLim = checkLimit(sender, isOwner(sender));
        if (spLim !== "∞" && spLim < spCost) return reply(`❌ Not enough limit! Need *${spCost}*, you have *${spLim}*.`);
        await sock.sendMessage(jid, { react: { text: "⏱️", key: msg.key } });
        try {
          const sp = await spotifyScrape(text);
          if (!sp.downloadUrl) throw new Error("Download URL not found.");
          await sock.sendMessage(jid, {
            audio: { url: sp.downloadUrl }, mimetype: "audio/mp4",
            contextInfo: { externalAdReply: { title: sp.title, body: sp.artists, thumbnailUrl: sp.thumbnail || "", mediaType: 1 } },
          }, { quoted: msg });
          useLimit(sender, spCost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ Spotify download failed: ${e.message}`);
        }
        break;
      }

      case "spotify":
      case "spotifysearch":
      case "songs": {
        if (!text) return reply(`📌 Example: ${prefix}spotify <song name>`);
        await sock.sendMessage(jid, { react: { text: "🔍", key: msg.key } });
        try {
          const results = await searchSpotify(text);
          let out = `🎵 *Spotify Search Results*\n\n`;
          results.slice(0, 10).forEach((t, i) => {
            out += `${i + 1}. *${t.name}*\n   👤 ${t.artists}\n   ⏱️ ${t.duration || "?"} | 🔗 ${t.link}\n\n`;
          });
          reply(out.trim());
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ Spotify search failed: ${e.message}`);
        }
        break;
      }

      // ── Pinterest ─────────────────────────────────────────────────
      case "pin": {
        if (!text) return reply(`📌 Usage: ${prefix}pin <search keyword>\nExample: ${prefix}pin aesthetic room`);
        initUserDB(sender, pushname);
        const pinCost = getLimitCost("pinterest", 1);
        const pinLim = checkLimit(sender, isOwner(sender));
        if (pinLim !== "∞" && pinLim < pinCost) return reply(`❌ Not enough limit! Need *${pinCost}*, you have *${pinLim}*.`);
        await sock.sendMessage(jid, { react: { text: "🔍", key: msg.key } });
        try {
          const images = await searchPinterestAPI(text, 10);
          if (!images?.length) throw new Error("No images found for that keyword.");
          const cards = await Promise.all(images.slice(0, 10).map(async (item, i) => ({
            header: proto.Message.InteractiveMessage.Header.create({
              ...(await prepareWAMessageMedia({ image: { url: item.url } }, { upload: sock.waUploadToServer })),
              title: '',
              subtitle: `Image ${i + 1} of ${images.length}`,
              hasMediaAttachment: true
            }),
            body: { text: item.title ? `📌 ${item.title}` : '' },
            nativeFlowMessage: { buttons: [] }
          })));
          const carouselMsg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadata: {},
                  deviceListMetadataVersion: 2,
                },
                interactiveMessage: {
                  body: { text: `📌 *Pinterest Search*\n\n🔎 Query: _${text}_\n📷 ${images.length} results` },
                  carouselMessage: { cards, messageVersion: 1 }
                }
              }
            }
          }, { quoted: msg });
          await sock.relayMessage(jid, carouselMsg.message, { messageId: carouselMsg.key.id });
          useLimit(sender, pinCost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ Pinterest search failed: ${e.message}`);
        }
        break;
      }

      // ── Dafont ────────────────────────────────────────────────────
      case "dafont":
      case "font":
      case "fontdl":
      case "dafontdl": {
        if (!text) return reply(`📌 Example: ${prefix}dafont arial`);
        await sock.sendMessage(jid, { react: { text: "🔍", key: msg.key } });
        try {
          const fonts = await searchDafont(text);
          if (!fonts?.length) throw new Error("No fonts found.");
          let out = `🔤 *DaFont Search: "${text}"*\n\n`;
          fonts.slice(0, 10).forEach((f, i) => {
            out += `${i + 1}. *${f.name}*\n   👤 ${f.author} | 📥 ${f.downloads}\n   🔗 ${f.download}\n\n`;
          });
          reply(out.trim());
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ Dafont search failed: ${e.message}`);
        }
        break;
      }

      // ── Sticker Maker ─────────────────────────────────────────────
      case "stiker":
      case "tosticker": {
        initUserDB(sender, pushname);
        const stkCost = getLimitCost("sticker", 1);
        const stkLim = checkLimit(sender, isOwner(sender));
        if (stkLim !== "∞" && stkLim < stkCost) return reply(`❌ Not enough limit! Need *${stkCost}*, you have *${stkLim}*.`);
        await sock.sendMessage(jid, { react: { text: "⏱️", key: msg.key } });
        try {
          const dl = await dlQuoted(msg, jid);
          if (!dl?.buf) return reply("❌ Reply to an image or video to convert to sticker.");
          const webp = await toSticker(dl.buf, "Yuzuki", "Yuzuki Bot");
          await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
          useLimit(sender, stkCost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ Sticker failed: ${e.message}`);
        }
        break;
      }

      case "toimage": {
        await sock.sendMessage(jid, { react: { text: "⏱️", key: msg.key } });
        try {
          const dl = await dlQuoted(msg, jid);
          if (!dl?.buf) return reply("❌ Reply to a sticker to convert to image.");
          const { default: sharp } = await import("sharp"); const img = await sharp(dl.buf).png().toBuffer();
          await sock.sendMessage(jid, { image: img, caption: "✅ Converted to image." }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ Conversion failed: ${e.message}`);
        }
        break;
      }

      // ── Brat Sticker ──────────────────────────────────────────────
      case "brat": {
        if (!text) return reply(`📌 Example: ${prefix}brat your text here`);
        initUserDB(sender, pushname);
        const bratCost = getLimitCost("brat", 1);
        const bratLim = checkLimit(sender, isOwner(sender));
        if (bratLim !== "∞" && bratLim < bratCost) return reply(`❌ Not enough limit! Need *${bratCost}*, you have *${bratLim}*.`);
        await sock.sendMessage(jid, { react: { text: "⏱️", key: msg.key } });
        try {
          const png = await makeBrat(text);
          const webp = await toSticker(png, "Yuzuki", "Yuzuki Bot");
          await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
          useLimit(sender, bratCost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ Brat sticker failed: ${e.message}`);
        }
        break;
      }

      case "bratvid": {
        if (!text) return reply(`📌 Example: ${prefix}bratvid So I wasn't the only one...`);
        initUserDB(sender, pushname);
        const bvCost = getLimitCost("bratvid", 1);
        const bvLim = checkLimit(sender, isOwner(sender));
        if (bvLim !== "∞" && bvLim < bvCost) return reply(`❌ Not enough limit! Need *${bvCost}*, you have *${bvLim}*.`);
        await sock.sendMessage(jid, { react: { text: "⏱️", key: msg.key } });
        try {
          const webp = await makeBratVid(text, "Yuzuki", "Yuzuki Bot");
          await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
          useLimit(sender, bvCost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ BratVid sticker failed: ${e.message}`);
        }
        break;
      }

      // ── Quoted Card (QC) ──────────────────────────────────────────
      case "qc":
      case "quoted": {
        if (!text) return reply(`📌 Example: ${prefix}qc your message here`);
        initUserDB(sender, pushname);
        const qcCost = getLimitCost("qc", 1);
        const qcLim = checkLimit(sender, isOwner(sender));
        if (qcLim !== "∞" && qcLim < qcCost) return reply(`❌ Not enough limit! Need *${qcCost}*, you have *${qcLim}*.`);
        await sock.sendMessage(jid, { react: { text: "⏱️", key: msg.key } });
        try {
          let ppUrl;
          try { ppUrl = await sock.profilePictureUrl(sender, "image"); } catch { ppUrl = ""; }
          const img = await makeQC(text, pushname || "User", ppUrl || "");
          const webp = await toSticker(img, "Yuzuki", "Yuzuki Bot");
          await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
          useLimit(sender, qcCost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ QC failed: ${e.message}`);
        }
        break;
      }

      case "iqc": {
        if (!text) return reply(`📌 Usage: ${prefix}iqc message|time\nExample: ${prefix}iqc Hello there!|12:00`);
        initUserDB(sender, pushname);
        const iqcCost = getLimitCost("iqc", 1);
        const iqcLim = checkLimit(sender, isOwner(sender));
        if (iqcLim !== "∞" && iqcLim < iqcCost) return reply(`❌ Not enough limit! Need *${iqcCost}*, you have *${iqcLim}*.`);
        const parts = text.split("|").map((s) => s.trim());
        const pesan = parts[0];
        const jam = parts[1] || new Date().toTimeString().slice(0, 5);
        const baterai = parseInt(parts[2]) || 100;
        const sinyal = Math.min(4, Math.max(1, parseInt(parts[3]) || 4));
        await sock.sendMessage(jid, { react: { text: "⏱️", key: msg.key } });
        try {
          const url = `https://brat.siputzx.my.id/iphone-quoted?messageText=${encodeURIComponent(pesan)}&carrierName=CARRIER&batteryPercentage=${baterai}&signalStrength=${sinyal}&time=${encodeURIComponent(jam)}`;
          const { default: axios } = await import("axios");
          const { data } = await axios.get(url, { responseType: "arraybuffer" });
          await sock.sendMessage(jid, { image: Buffer.from(data), caption: "✅ iPhone Quoted Card" }, { quoted: msg });
          useLimit(sender, iqcCost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ IQC failed: ${e.message}`);
        }
        break;
      }

      // ── MathGPT AI ────────────────────────────────────────────────
      case "mathgpt":
      case "mtkgpt": {
        if (!text) return reply(`📌 Example: ${prefix}mathgpt What is the derivative of x²?`);
        initUserDB(sender, pushname);
        const mgCost = getLimitCost("mathgpt", 2);
        const mgLim = checkLimit(sender, isOwner(sender));
        if (mgLim !== "∞" && mgLim < mgCost) return reply(`❌ Not enough limit! Need *${mgCost}*, you have *${mgLim}*.`);
        await sock.sendMessage(jid, { react: { text: "🤔", key: msg.key } });
        try {
          let image = null, mime = null, ext = "jpg";
          const dl = await dlQuoted(msg, jid);
          if (dl?.buf) { image = dl.buf; mime = "image/jpeg"; }
          const answer = await mathgpt({ question: text, think: args[0] === "--think", image, mime, ext });
          reply(`🧮 *MathGPT*\n\n*Q:* ${text}\n\n*A:* ${answer}`);
          useLimit(sender, mgCost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ MathGPT error: ${e.message}`);
        }
        break;
      }

      // ── Felo AI ───────────────────────────────────────────────────
      case "felo":
      case "feloai": {
        if (!text) return reply(`📌 Example: ${prefix}felo What is the latest AI news?`);
        initUserDB(sender, pushname);
        const feloCost = getLimitCost("felo", 2);
        const feloLim = checkLimit(sender, isOwner(sender));
        if (feloLim !== "∞" && feloLim < feloCost) return reply(`❌ Not enough limit! Need *${feloCost}*, you have *${feloLim}*.`);
        await sock.sendMessage(jid, { react: { text: "🌐", key: msg.key } });
        try {
          const client = new FeloClient();
          const answer = await client.search(text);
          const answerText = typeof answer === "string" ? answer : JSON.stringify(answer, null, 2);
          reply(`🌐 *Felo AI Search*\n\n*Q:* ${text}\n\n${answerText}`);
          useLimit(sender, feloCost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ Felo AI error: ${e.message}`);
        }
        break;
      }

      // ── ChatEx AI ─────────────────────────────────────────────────
      case "chatex":
      case "chatexai": {
        if (!text) return reply(`📌 Example: ${prefix}chatex Hello, how are you?`);
        initUserDB(sender, pushname);
        const cxCost = getLimitCost("chatex", 1);
        const cxLim = checkLimit(sender, isOwner(sender));
        if (cxLim !== "∞" && cxLim < cxCost) return reply(`❌ Not enough limit! Need *${cxCost}*, you have *${cxLim}*.`);
        await sock.sendMessage(jid, { react: { text: "💬", key: msg.key } });
        try {
          const answer = await chatex(text);
          reply(`💬 *ChatEx AI*\n\n*Q:* ${text}\n\n${answer}`);
          useLimit(sender, cxCost, isOwner(sender));
          await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
        } catch (e) {
          await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
          reply(`❌ ChatEx error: ${e.message}`);
        }
        break;
      }

      // ── Group Protection Tools ────────────────────────────────────
      case "antilinkall":
      case "antilinkgc":
      case "antilinkch":
      case "antilinktt":
      case "antilinkig":
      case "antilinkyt":
      case "antilinkfb":
      case "antilinktw":
      case "antiwame":
      case "antitoxic": {
        if (!jid.endsWith("@g.us")) return reply("❌ Group only.");
        if (!isOwner(sender)) return reply("❌ Only bot owner can toggle antilink.");
        const keyMap = {
          antilinkall: "all", antilinkgc: "gc", antilinkch: "ch",
          antilinktt: "tt", antilinkig: "ig", antilinkyt: "yt",
          antilinkfb: "fb", antilinktw: "tw", antiwame: "wame", antitoxic: "toxic",
        };
        const gc = getGroupData(jid);
        const k = keyMap[command];
        gc.antilink[k] = !gc.antilink[k];
        setGroupData(jid, gc);
        reply(`${gc.antilink[k] ? "✅ Enabled" : "❌ Disabled"} *${command}* for this group.`);
        break;
      }
      case "setantilink": {
        if (!jid.endsWith("@g.us")) return reply("❌ Group only.");
        if (!isOwner(sender)) return reply("❌ Owner only.");
        const valid = ["silent", "warn", "kick"];
        const mode = args[0]?.toLowerCase();
        if (!valid.includes(mode)) return reply(`📌 Usage: ${prefix}setantilink <silent|warn|kick>`);
        const gc = getGroupData(jid);
        gc.antilinkAction = mode;
        setGroupData(jid, gc);
        reply(`✅ Antilink action set to *${mode}*.`);
        break;
      }
      case "addtoxic":
      case "addbadword": {
        if (!text) return reply(`📌 Usage: ${prefix}addbadword <word>`);
        if (!isOwner(sender)) return reply("❌ Owner only.");
        const bwPath = "./data/badwords.json";
        let bw = [];
        try { bw = JSON.parse(fs.readFileSync(bwPath, "utf8")); } catch {}
        if (!bw.includes(text.toLowerCase())) { bw.push(text.toLowerCase()); fs.writeFileSync(bwPath, JSON.stringify(bw)); }
        reply(`✅ Added *${text}* to bad words list.`);
        break;
      }
      case "deltoxic":
      case "delbadword": {
        if (!text) return reply(`📌 Usage: ${prefix}delbadword <word>`);
        if (!isOwner(sender)) return reply("❌ Owner only.");
        const bwPath = "./data/badwords.json";
        let bw = [];
        try { bw = JSON.parse(fs.readFileSync(bwPath, "utf8")); } catch {}
        bw = bw.filter((w) => w !== text.toLowerCase());
        fs.writeFileSync(bwPath, JSON.stringify(bw));
        reply(`✅ Removed *${text}* from bad words list.`);
        break;
      }
      case "listtoxic":
      case "listbadword": {
        if (!isOwner(sender)) return reply("❌ Owner only.");
        const bwPath = "./data/badwords.json";
        let bw = [];
        try { bw = JSON.parse(fs.readFileSync(bwPath, "utf8")); } catch {}
        reply(bw.length ? `🚫 *Bad Words List (${bw.length}):*\n\n${bw.map((w, i) => `${i + 1}. ${w}`).join("\n")}` : "✅ Bad words list is empty.");
        break;
      }

      // ── Welcome / Left group events (manual toggle) ───────────────
      case "welcome": {
        if (!jid.endsWith("@g.us")) return reply("❌ Group only.");
        if (!isOwner(sender)) return reply("❌ Owner only.");
        const gc = getGroupData(jid);
        gc.welcome = !gc.welcome;
        setGroupData(jid, gc);
        reply(`${gc.welcome ? "✅ Welcome messages enabled." : "❌ Welcome messages disabled."}`);
        break;
      }
      case "left": {
        if (!jid.endsWith("@g.us")) return reply("❌ Group only.");
        if (!isOwner(sender)) return reply("❌ Owner only.");
        const gc = getGroupData(jid);
        gc.left = !gc.left;
        setGroupData(jid, gc);
        reply(`${gc.left ? "✅ Leave messages enabled." : "❌ Leave messages disabled."}`);
        break;
      }

      // ── Extended group tools (HydroMD aliases) ───────────────────
      case "setnamegc": {
        if (!jid.endsWith("@g.us")) return reply("❌ Group only.");
        if (!isOwner(sender)) return reply("❌ Owner only.");
        if (!text) return reply(`📌 Usage: ${prefix}setname <new name>`);
        try { await sock.groupUpdateSubject(jid, text); reply(`✅ Group name updated to *${text}*.`); }
        catch (e) { reply(`❌ Failed: ${e.message}`); }
        break;
      }
      case "setdescgc": {
        if (!jid.endsWith("@g.us")) return reply("❌ Group only.");
        if (!isOwner(sender)) return reply("❌ Owner only.");
        if (!text) return reply(`📌 Usage: ${prefix}setdesc <new description>`);
        try { await sock.groupUpdateDescription(jid, text); reply(`✅ Group description updated.`); }
        catch (e) { reply(`❌ Failed: ${e.message}`); }
        break;
      }
      // ── Bot mode commands (HydroMD additions) ────────────────────
      case "onlygc":
      case "onlygroup": {
        if (!isOwner(sender)) return reply("❌ Owner only.");
        setSetting("mode", "group");
        reply("✅ Bot switched to *Group Only* mode.");
        break;
      }
      case "onlypc":
      case "onlyprivate":
      case "onlypm": {
        if (!isOwner(sender)) return reply("❌ Owner only.");
        setSetting("mode", "private");
        reply("✅ Bot switched to *Private Only* mode.");
        break;
      }

      // ── Bot info / status ─────────────────────────────────────────
      case "infobot":
      case "botstats":
      case "statusbot": {
        const settings = loadSettings();
        const uptime = process.uptime();
        const d = Math.floor(uptime / 86400), h = Math.floor((uptime % 86400) / 3600), m = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60);
        reply(
          `🤖 *Bot Info*\n━━━━━━━━━━━━━━━━━\n` +
          `📛 Name: *Yuzuki MD*\n` +
          `👑 Owners: *${getOwners().length}*\n` +
          `⏱️ Uptime: *${d}d ${h}h ${m}m ${s}s*\n` +
          `🖥️ Platform: *${process.platform}*\n` +
          `🔧 Node: *${process.version}*\n` +
          `💾 RAM: *${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB*\n` +
          `📂 Mode: *${settings.mode || "public"}*`
        );
        break;
      }

      // ── Standalone product message command ────────────────────────
      case "product":
      case "prodmsg":
      case "fakeshop": {
        const pArgs = body.slice(prefix.length + command.length).trim().split("|").map(s => s.trim());
        const pTitle    = pArgs[0] || settings.productTitle    || settings.botName || "Yuzuki MD";
        const pDesc     = pArgs[1] || settings.productDesc     || "I'm aizen";
        const pPrice    = pArgs[2] ? Math.round(parseFloat(pArgs[2]) * 1_000_000) : (settings.productPrice || 1_000_000_000);
        const pRetailer = pArgs[3] || "yuzuki-v2";
        const pCurrency = pArgs[4] || settings.productCurrency || "USD";
        const pImgUrl   = pArgs[5] || settings.productImgUrl   || settings.menuBgUrl || MENU_BG;

        // Try to upload product image — fall back gracefully if it fails
        let pProductImage;
        try {
          const pMedia = await prepareWAMessageMedia(
            { image: { url: pImgUrl } },
            { upload: sock.waUploadToServer }
          );
          pProductImage = pMedia.imageMessage;
        } catch { pProductImage = undefined; }

        await sock.sendMessage(jid, {
          productMessage: {
            product: {
              productId: "1337",
              title: pTitle,
              description: pDesc,
              currencyCode: pCurrency,
              priceAmount1000: pPrice,
              retailerId: pRetailer,
              ...(pProductImage ? { productImage: pProductImage } : {}),
            },
            businessOwnerJid: sock.user.id,
          },
        }, { quoted: msg });
        break;
      }

      default: {
      const cases = getCases().filter((c) => c.active);
      const match = cases.find((c) => c.command === command);
      if (match) {
        await reply(match.response);
      }
      break;
    }
  }
}


/*𝙺𝚒𝚗𝚍𝚕𝚢 𝚐𝚒𝚟𝚎 𝚌𝚛𝚎𝚍𝚒𝚝𝚜 𝚝𝚘 𝚝𝚑𝚎 𝚍𝚎𝚟 
𝗔𝗶𝘇𝗲𝗻 𝙰𝚗𝚍 team ♥ 
𝙲𝚘𝚗𝚝𝚊𝚌𝚝: +233533416608
𝚆𝚊 𝚌𝚑𝚊𝚗𝚗𝚗𝚎𝚕: https://whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326*/ 