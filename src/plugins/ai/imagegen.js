/**
 * Plugin: imagegen
 * Category: ai
 *
 * Generate images from text prompts using Hugging Face (FLUX.1-schnell).
 * Requires HF_TOKEN env var (free at huggingface.co). Returns a high-quality 1024×1024 image.
 *
 * Usage:
 *   .imagegen <prompt>
 *   .imagine a futuristic city at night
 *   .ig cute anime girl with cherry blossoms
 *
 * Options (append to prompt):
 *   --wide    → 1280×720  landscape
 *   --tall    → 720×1280  portrait
 *   --square  → 1024×1024 default
 *   --fast    → use turbo model (faster, slightly lower quality)
 */

import { polliImage } from '../../lib/pollinations.js';

const SIZE_FLAGS = {
  '--wide':   { width: 1280, height: 720  },
  '--tall':   { width: 720,  height: 1280 },
  '--square': { width: 1024, height: 1024 },
};

export default {
  name:        'imagegen',
  aliases:     ['imagine', 'ig', 'genimage', 'aiimage', 'drawme'],
  category:    'ai',
  description: 'Generate AI images from text prompts via Hugging Face FLUX.1-schnell (needs HF_TOKEN)',
  usage:       '.imagegen <prompt> [--wide|--tall|--fast]',

  async execute({ sock, msg, reply, args, settings }) {
    const jid = msg.key.remoteJid;

    // Parse flags
    let width  = 1024;
    let height = 1024;
    let model  = 'flux';

    const cleanArgs = args.filter(a => {
      if (a === '--fast')  { model  = 'turbo'; return false; }
      const s = SIZE_FLAGS[a];
      if (s) { width = s.width; height = s.height; return false; }
      return true;
    });

    const prompt = cleanArgs.join(' ').trim();
    const prefix = settings?.prefix ?? '.';

    if (!prompt) {
      await reply(
        `🎨  *AI Image Generator*\n\n` +
        `Usage: \`${prefix}imagegen <prompt>\`\n\n` +
        `_Examples:_\n` +
        `• \`${prefix}ig a dragon in space\`\n` +
        `• \`${prefix}ig a cozy cabin in winter --wide\`\n` +
        `• \`${prefix}ig anime girl with flowers --tall --fast\`\n\n` +
        `Flags: \`--wide\` \`--tall\` \`--square\` \`--fast\``,
      );
      return;
    }

    await sock.sendMessage(jid, { react: { text: '🎨', key: msg.key } }).catch(() => {});

    try {
      const buf = await polliImage(prompt, { width, height, model });

      await sock.sendMessage(jid, {
        image:   buf,
        caption: `🎨  *AI Image*\n\n_Prompt:_ ${prompt}\n\n_Model:_ ${model}  •  _${width}×${height}_`,
        mimetype: 'image/jpeg',
      }, { quoted: msg });

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`❌  Image generation failed: ${e.message}\n\nTry a shorter or different prompt.`);
    }
  },
};
