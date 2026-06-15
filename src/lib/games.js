import {
  getRandomItem,
  createSession,
  getSession,
  endSession,
  checkAnswerAdvanced,
  getHint,
  hasActiveSession,
  setSessionTimer,
  getRemainingTime,
  formatRemainingTime,
  isSurrender,
  isReplyToGame,
  getRandomReward,
  getProgressiveHint,
} from "./game-data.js";
import { loadDB, addXP, saveDB } from "./database.js";
const getGameContextInfo = () => ({
  externalAdReply: {
    title: "🎮 YUZUKI GAMES",
    body: "Interact and play games!",
    thumbnailUrl: "https://qu.ax/RYgoy",
    sourceUrl: "https://github.com/boyde1317-byte/YuzukiMD-Lite",
    mediaType: 1,
    renderLargerThumbnail: false
  }
});

const sendGamePreview = async (sock, jid, text, title, body, options) => {
  const result = await sock.sendMessage(jid, {
    text: text,
    contextInfo: {
      externalAdReply: {
        title: title,
        body: body,
        thumbnailUrl: "https://qu.ax/RYgoy",
        sourceUrl: "https://github.com/boyde1317-byte/YuzukiMD-Lite",
        mediaType: 1,
        renderLargerThumbnail: true       
      }
    }
  }, options);
  return result;
};

const checkFastAnswer = () => ({ isFast: false, bonus: {limit:0, koin:0, exp:0}, elapsed: 0, praise: "" });

let fetchBuffer;
try {
  fetchBuffer = (await import("./yuzuki-utils.js")).fetchBuffer;
} catch {}

const WIN_MESSAGES = [
  "🌟 *GG WP! Your brain is on fire!*",
  "✨ *IMPRESSIVE! You really nailed it!*",
  "🎉 *PERFECT! Flawless answer!*",
  "💫 *EPIC! Nobody can beat you!*",
  "🏆 *INCREDIBLE! Your brain is like Google!*",
  "🔥 *LEGENDARY! You answered like it was nothing!*",
];

const TIMEOUT_MESSAGES = [
  "⏱️ *Oh no, time's up!*",
  "⏱️ *TIME'S UP!*",
  "⏱️ *Too slow — time has run out!*",
];

const SURRENDER_MESSAGES = [
  "🏳️ *Oh well, giving up...*",
  "🏳️ *SURRENDERED!*",
  "🏳️ *Shame to give up, but alright...*",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

class YuzukiGames {
  constructor() {
    this.registry = new Map();
  }

  register(gameType, cfg) {
    const defaults = {
      dataFile: `${gameType}.json`,
      questionField: "soal",
      answerField: "jawaban",
      emoji: "🎮",
      title: gameType.toUpperCase(),
      description: `${gameType} game`,
      timeout: 60000,
      cooldown: 5,
      hasImage: false,
      imageField: "img",
      alias: [],
      hintCount: 2,
    };
    this.registry.set(gameType, { ...defaults, ...cfg, gameType });
  }

  get(gameType) {
    return this.registry.get(gameType);
  }

  createHandler(gameType) {
    const cfg = this.registry.get(gameType);
    if (!cfg) throw new Error(`Game "${gameType}" not registered`);

    const handler = async (m, { sock }) => {
      const chatId = m.chat;

      if (hasActiveSession(chatId)) {
        const session = getSession(chatId);
        if (session && session.gameType === gameType) {
          const remaining = getRemainingTime(chatId);
          const answer = session.question[cfg.answerField];
          let text = `⚠️ *A game is already running — answer it first!*\n\n`;
          if (cfg.questionField && session.question[cfg.questionField]) {
            text += `\`\`\`${session.question[cfg.questionField]}\`\`\`\n\n`;
          }
          text += `💡 Hint: *${getHint(answer, cfg.hintCount)}*\n`;
          text += `⏱️ Time left: *${formatRemainingTime(remaining)}*\n\n`;
          text += `_Reply directly with your answer or type "surrender"\nEach wrong answer reveals more of the hint_`;
          await m.reply(text);
          return;
        }
      }

      const question = getRandomItem(cfg.dataFile);
      if (!question) {
        await m.reply(
          "❌ *ɴᴏ ᴅᴀᴛᴀ ᴀᴠᴀɪʟᴀʙʟᴇ*\n\n> Game data could not be loaded!",
        );
        return;
      }

      const answer = question[cfg.answerField];
      let sentMsg;

      if (cfg.hasImage && fetchBuffer) {
        let imageBuffer;
        try {
          imageBuffer = await fetchBuffer(question[cfg.imageField]);
        } catch {
          await m.reply("❌ *ꜰᴀɪʟᴇᴅ ᴛᴏ ʟᴏᴀᴅ ɪᴍᴀɢᴇ*\n\n> Please try again later!");
          return;
        }

        let caption = `${cfg.emoji} *${cfg.title}*\n\n`;
        if (cfg.questionField && question[cfg.questionField]) {
          caption += `> ${question[cfg.questionField]}\n`;
        }
        caption += `💡 Hint: *${getHint(answer, cfg.hintCount)}*\n`;
        caption += `⏱️ Time: *${cfg.timeout / 1000} seconds*\n`;
        caption += `🎁 Reward: *Limit, Coins, EXP (random)*\n\n`;
        caption += `_Reply directly with your answer or type "surrender"\nEach wrong answer reveals more of the hint_`;

        sentMsg = await sock.sendMessage(
          chatId,
          {
            image: imageBuffer,
            caption,
            contextInfo: getGameContextInfo(),
          },
          { quoted: m },
        );
      } else {
        let text = `${cfg.emoji} *${cfg.title}*\n\n`;
        if (cfg.questionField && question[cfg.questionField]) {
          text += `\`\`\`${question[cfg.questionField]}\`\`\`\n\n`;
        }
        text += `💡 Hint: *${getHint(answer, cfg.hintCount)}*\n`;
        text += `⏱️ Time: *${cfg.timeout / 1000} seconds*\n`;
        text += `🎁 Reward: *Limit, Coins, EXP (random)*\n\n`;
        text += `_Reply directly with your answer or type "surrender"\nEach wrong answer reveals more of the hint_`;

        sentMsg = await sendGamePreview(
          sock,
          chatId,
          text,
          `${cfg.emoji} ${cfg.title}`,
          "Answer the question!",
          { quoted: m },
        );
      }

      createSession(chatId, gameType, question, sentMsg.key, cfg.timeout);

      setSessionTimer(chatId, async () => {
        let text = `${pick(TIMEOUT_MESSAGES)}\n\n`;
        text += `Answer: *${answer}*\n\n`;
        text += `_Nobody could answer this one!_`;
        await m.reply(text);
      });
    };

    const answerHandler = async (m, sock) => {
      const chatId = m.chat;
      const session = getSession(chatId);

      if (!session || session.gameType !== gameType) return false;

      const userAnswer = (m.body || "").trim();
      if (!userAnswer || userAnswer.startsWith(".")) return false;

      if (isSurrender(userAnswer)) {
        endSession(chatId);
        const answer = session.question[cfg.answerField];
        let text = `${pick(SURRENDER_MESSAGES)}\n\n`;
        text += `Answer: *${answer}*\n\n`;
        text += `_@${m.sender.split("@")[0]} has surrendered_`;
        await m.reply(text, { mentions: [m.sender] });
        return true;
      }

      if (!isReplyToGame(m, session)) return false;

      session.attempts++;

      const answer = session.question[cfg.answerField];
      const result = checkAnswerAdvanced(answer, userAnswer);

      if (result.status === "correct") {
        endSession(chatId);

        let db = loadDB();
        let user = db.users[m.sender];
        if (!user) {
          user = { exp: 0, money: 0, limitfree: 15 };
          db.users[m.sender] = user;
        }

        let totalLimit = 0;
        let totalBalance = 0;
        let totalExp = 0;

        if (cfg.rewards === false || cfg.rewards === null) {
          // no reward configured for this game
        } else if (cfg.rewards) {
          totalLimit = cfg.rewards.limit || cfg.rewards.energi || 0;
          totalBalance = cfg.rewards.koin || cfg.rewards.balance || 0;
          totalExp = cfg.rewards.exp || 0;
        } else {
          const reward = getRandomReward();
          totalLimit = reward.limit;
          totalBalance = reward.koin;
          totalExp = reward.exp;
        }

        let bonusText = "";

        const fastResult = checkFastAnswer(session);
        if (
          fastResult.isFast &&
          cfg.rewards !== false &&
          cfg.rewards !== null
        ) {
          totalLimit += fastResult.bonus.limit;
          totalBalance += fastResult.bonus.koin;
          totalExp += fastResult.bonus.exp;
          bonusText = `\n\n${fastResult.praise}\n⚡ *SPEED BONUS:* +${fastResult.bonus.limit} Limit, +${fastResult.bonus.koin} Coins\n⏱️ Time: *${(fastResult.elapsed / 1000).toFixed(1)}s*`;
        }

        if (totalLimit > 0) user.limitfree = (user.limitfree || 0) + totalLimit;
        if (totalBalance > 0) user.money = (user.money || 0) + totalBalance;
        saveDB(db);

        if (totalExp > 0) {
          addXP(m.sender, totalExp);
        }

        let text = `${pick(WIN_MESSAGES)}\n\n`;
        text += `Answer: *${answer}*\n`;
        text += `Winner: *@${m.sender.split("@")[0]}*\n`;
        text += `Attempts: *${session.attempts}x*\n\n`;

        if (totalLimit > 0 || totalBalance > 0 || totalExp > 0) {
          let parts = [];
          if (totalLimit > 0) parts.push(`+${totalLimit} Limit`);
          if (totalBalance > 0) parts.push(`+${totalBalance} Coins`);
          if (totalExp > 0) parts.push(`+${totalExp} EXP`);
          text += `🎁 ${parts.join(", ")}`;
        }
        text += bonusText;

        await m.reply(text, { mentions: [m.sender] });
        return true;
      }

      if (result.status === "close") {
        const remaining = getRemainingTime(chatId);
        const percent = Math.round(result.similarity * 100);
        await m.react("🔥");
        await m.reply(
          `🔥 *So close!* Your answer is *${percent}%* similar!\n_Time left: *${formatRemainingTime(remaining)}*_`,
        );
        return false;
      }

      const remaining = getRemainingTime(chatId);
      if (remaining > 0 && session.attempts < 10) {
        await m.react("❌");
        const hint = getProgressiveHint(answer, session.attempts);
        await m.reply(
          `❌ Not quite! Hint: *${hint}*\n_Time left: *${formatRemainingTime(remaining)}*_`,
        );
      }

      return false;
    };

    return { handler, answerHandler };
  }

  createPlugin(gameType, overrides = {}) {
    const cfg = this.registry.get(gameType);
    if (!cfg) throw new Error(`Game "${gameType}" not registered`);

    const { handler, answerHandler } = this.createHandler(gameType);

    return {
      config: {
        name: gameType,
        alias: cfg.alias,
        category: "game",
        description: cfg.description,
        usage: `.${gameType}`,
        example: `.${gameType}`,
        isOwner: false,
        isPremium: false,
        isGroup: false,
        isPrivate: false,
        cooldown: cfg.cooldown,
        energi: 0,
        isEnabled: true,
        ...overrides,
      },
      handler,
      answerHandler,
    };
  }
}

const games = new YuzukiGames();

export { YuzukiGames, games };
