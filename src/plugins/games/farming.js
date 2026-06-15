/**
 * Plugin: farming
 * Category: games
 *
 * Plant seeds, water crops, and harvest produce.
 * 4 farm slots per user. Grow time reduced 40% by watering.
 * Seeds must be bought from the shop first.
 *
 * Usage:
 *   .farm                        — view farm status
 *   .farm plant <crop> [slot]    — plant a seed (uses seed from inventory)
 *   .farm water [slot]           — water all or a specific slot
 *   .farm harvest                — harvest all ready crops
 *   .farm help                   — show all crop types
 *
 * Crops: wheat, carrot, tomato, corn, strawberry, sunflower
 */

import { loadDB, addXP, addCoins, initUserDB }  from '../../lib/database.js';
import {
  getFarmSlots, setFarmSlot, removeItem, hasItem,
  updateStat, updateQuestProgress, addItem, getGU,
} from '../../lib/games-db.js';
import {
  CROPS, ITEMS, SEED_TO_CROP, formatItem, getItem,
} from '../../lib/items.js';
import { checkAchievements }                    from '../../lib/rpg.js';

const WATER_REDUCTION = 0.6; // watering reduces grow time to 60%

function isReady(slot) {
  if (!slot) return false;
  const crop    = CROPS[slot.crop];
  if (!crop) return false;
  const growMs  = slot.wateredAt ? crop.growMs * WATER_REDUCTION : crop.growMs;
  return Date.now() - slot.plantedAt >= growMs;
}

function timeLeft(slot) {
  const crop   = CROPS[slot.crop];
  const growMs = slot.wateredAt ? crop.growMs * WATER_REDUCTION : crop.growMs;
  const left   = (slot.plantedAt + growMs) - Date.now();
  return Math.max(0, left);
}

function fmtMs(ms) {
  if (ms <= 0) return '✅ Ready!';
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${Math.ceil((ms % 60000) / 1000)}s`;
}

function slotIcon(slot) {
  if (!slot) return '🟫 Empty';
  const crop  = CROPS[slot.crop];
  if (!crop) return '🟫 Empty';
  if (isReady(slot)) return `${crop.emoji} *READY*`;
  const left = timeLeft(slot);
  const watered = slot.wateredAt ? '💧' : '';
  return `🌱${watered} ${crop.name} — ${fmtMs(left)}`;
}

export default {
  name:        'farming',
  aliases:     ['farm', 'plant', 'harvest', 'water'],
  category:    'games',
  description: 'Plant seeds, water crops, and harvest produce for coins and XP',
  usage:       '.farm  |  .farm plant <crop>  |  .farm water  |  .farm harvest',

  async execute({ sock, msg, reply, args, sender, settings }) {
    const jid    = msg.key.remoteJid;
    const prefix = settings?.prefix ?? '.';
    const sub    = args[0]?.toLowerCase();

    // ── Status (default) ─────────────────────────────────────────────────────
    if (!sub || sub === 'status' || sub === 'check') {
      const slots = getFarmSlots(sender);
      const lines = slots.map((s, i) => `  Slot ${i + 1}: ${slotIcon(s)}`);
      await reply(
        `🌾 *Your Farm*\n${'─'.repeat(22)}\n\n` +
        lines.join('\n') +
        `\n\n_Commands:_\n` +
        `• \`${prefix}farm plant <crop>\` — plant a seed\n` +
        `• \`${prefix}farm water\` — water all crops\n` +
        `• \`${prefix}farm harvest\` — collect ready crops\n` +
        `• \`${prefix}farm help\` — view all crops`,
      );
      return;
    }

    // ── Help ─────────────────────────────────────────────────────────────────
    if (sub === 'help') {
      const rows = Object.values(CROPS).map(c => {
        const h = Math.floor(c.growMs / 3600000);
        const m = Math.floor((c.growMs % 3600000) / 60000);
        const t = h ? `${h}h ${m}m` : `${m}m`;
        const seed = ITEMS[c.seedId];
        return `${c.emoji} *${c.name}*  —  seed: ${seed?.value ?? '?'}🪙  ·  grow: ${t}  ·  yield: ${ITEMS[c.harvestId]?.value ?? '?'}🪙`;
      }).join('\n');
      await reply(
        `🌱 *Crop Guide*\n${'─'.repeat(22)}\n\n${rows}\n\n` +
        `_Seeds available in \`${prefix}shop\`_`,
      );
      return;
    }

    // ── Plant ─────────────────────────────────────────────────────────────────
    if (sub === 'plant') {
      const cropName = args[1]?.toLowerCase();
      const slotArg  = parseInt(args[2]) - 1;

      if (!cropName) {
        await reply(`❌  Usage: \`${prefix}farm plant <crop> [slot 1-4]\``);
        return;
      }

      // Resolve crop
      const crop = CROPS[cropName] ?? Object.values(CROPS).find(c => c.name.toLowerCase() === cropName);
      if (!crop) {
        await reply(`❌  Unknown crop: *${cropName}*\nUse \`${prefix}farm help\` to see all crops.`);
        return;
      }

      // Check seed in inventory
      if (!hasItem(sender, crop.seedId)) {
        await reply(
          `❌  You don't have any ${ITEMS[crop.seedId]?.emoji} ${ITEMS[crop.seedId]?.name}!\n` +
          `Buy seeds at the shop: \`${prefix}shop buy ${crop.seedId}\``,
        );
        return;
      }

      // Find free slot
      const slots  = getFarmSlots(sender);
      let targetIdx;
      if (!isNaN(slotArg) && slotArg >= 0 && slotArg < 4) {
        if (slots[slotArg]) {
          await reply(`❌  Slot ${slotArg + 1} is already occupied! Harvest it first.`);
          return;
        }
        targetIdx = slotArg;
      } else {
        targetIdx = slots.findIndex(s => !s);
        if (targetIdx === -1) {
          await reply(`❌  All 4 farm slots are occupied! Use \`${prefix}farm harvest\` to clear them.`);
          return;
        }
      }

      removeItem(sender, crop.seedId, 1);
      setFarmSlot(sender, targetIdx, { crop: crop.id, plantedAt: Date.now(), wateredAt: 0 });

      const h = Math.floor(crop.growMs / 3600000);
      const m = Math.floor((crop.growMs % 3600000) / 60000);
      const t = h ? `${h}h ${m}m` : `${m}m`;
      await reply(
        `🌱 *Planted!*\n\n` +
        `${crop.emoji} *${crop.name}* in Slot ${targetIdx + 1}\n` +
        `⏱ Ready in: *${t}*\n` +
        `💧 Tip: Water it to cut grow time by 40%!\n` +
        `_\`${prefix}farm water\`_`,
      );
      return;
    }

    // ── Water ─────────────────────────────────────────────────────────────────
    if (sub === 'water') {
      const slots    = getFarmSlots(sender);
      const slotArg  = parseInt(args[1]) - 1;
      let watered    = 0;

      if (!isNaN(slotArg) && slotArg >= 0 && slotArg < 4) {
        const s = slots[slotArg];
        if (!s) { await reply(`❌  Slot ${slotArg + 1} is empty.`); return; }
        if (s.wateredAt) { await reply(`💧 Slot ${slotArg + 1} is already watered!`); return; }
        if (isReady(s)) { await reply(`✅ Slot ${slotArg + 1} is already ready to harvest!`); return; }
        setFarmSlot(sender, slotArg, { ...s, wateredAt: Date.now() });
        watered = 1;
      } else {
        for (let i = 0; i < 4; i++) {
          const s = slots[i];
          if (s && !s.wateredAt && !isReady(s)) {
            setFarmSlot(sender, i, { ...s, wateredAt: Date.now() });
            watered++;
          }
        }
      }

      if (!watered) {
        await reply(`💧 Nothing left to water — all crops are either watered or ready!`);
        return;
      }
      await reply(`💧 *Watered ${watered} crop${watered > 1 ? 's' : ''}!*\nGrow time reduced by 40% 🌱`);
      return;
    }

    // ── Harvest ───────────────────────────────────────────────────────────────
    if (sub === 'harvest') {
      const slots    = getFarmSlots(sender);
      const ready    = slots.map((s, i) => ({ s, i })).filter(({ s }) => s && isReady(s));

      if (!ready.length) {
        await reply(
          `🌾 *No crops are ready yet.*\n\nCheck your farm: \`${prefix}farm\`\n` +
          `Water unwatered crops to grow faster: \`${prefix}farm water\``,
        );
        return;
      }

      initUserDB(sender);
      let totalCoins = 0;
      let totalXp    = 0;
      const earned   = [];

      for (const { s, i } of ready) {
        const crop   = CROPS[s.crop];
        if (!crop) { setFarmSlot(sender, i, null); continue; }
        const qty    = 1 + Math.floor(Math.random() * 3); // 1–3 yield
        const item   = ITEMS[crop.harvestId];
        const coins  = (item?.value ?? 100) * qty;
        addItem(sender, crop.harvestId, qty);
        totalCoins  += coins;
        totalXp     += 20 + qty * 5;
        earned.push(`${crop.emoji} ${crop.name} ×${qty} (+${coins}🪙)`);
        setFarmSlot(sender, i, null);
        updateStat(sender, 'harvestCount', 1);
        updateQuestProgress(sender, 'harvestCount', 1);
      }

      const { leveled, newLevel } = addXP(sender, totalXp, settings?.pushName);
      updateStat(sender, 'totalEarned', totalCoins);
      updateQuestProgress(sender, 'totalEarned', totalCoins);

      const db     = loadDB();
      const dbu    = db.users[sender];
      const gu     = getGU(sender);
      const newAch = checkAchievements(sender, dbu, gu);

      let text =
        `🌾 *Harvest Complete!*\n${'─'.repeat(22)}\n\n` +
        earned.join('\n') +
        `\n\n💰 Added to inventory — sell at shop!\n` +
        `✨ XP gained: *+${totalXp}*`;

      if (leveled)    text += `\n\n🎉 *Level Up!* You reached *Level ${newLevel}*!`;
      if (newAch.length) {
        text += `\n\n🏆 *Achievement${newAch.length > 1 ? 's' : ''} unlocked:*\n` +
                newAch.map(a => `${a.emoji} ${a.name} (+${a.reward} 🪙)`).join('\n');
      }

      await sock.sendMessage(jid, { text }, { quoted: msg });
      await sock.sendMessage(jid, { react: { text: '🌾', key: msg.key } }).catch(() => {});
      return;
    }

    await reply(`❓ Unknown subcommand. Use \`${prefix}farm help\` for usage.`);
  },
};
