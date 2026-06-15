/**
 * AI Client — Pollinations.AI
 *
 * All exports are identical to what every plugin expects.
 * Uses the Pollinations.AI free API — no API key required.
 *
 * ─── Providers ────────────────────────────────────────────────────────────────
 *
 *   Text + Vision  →  Pollinations.AI text endpoint (free, no key)
 *                     https://text.pollinations.ai/openai
 *
 *   Image gen      →  Pollinations.AI image endpoint (free, no key)
 *                     https://image.pollinations.ai/prompt/<prompt>
 *
 * ─── Model aliases ────────────────────────────────────────────────────────────
 *
 *   openai         →  openai       (GPT-class, fast)
 *   openai-large   →  openai-large (larger GPT-class model)
 *   gemini         →  gemini       (Google Gemma / Gemini)
 *   mistral        →  mistral      (Mixtral MoE)
 *
 * ─── Image models ─────────────────────────────────────────────────────────────
 *
 *   flux           →  FLUX.1-schnell  (high quality, default)
 *   turbo          →  turbo           (faster generation)
 *
 * ─── Exports ──────────────────────────────────────────────────────────────────
 *
 *   polliText(messages, model?)          — text generation
 *   polliTextWith(messages, opts?)       — text with system prompt + model
 *   polliVision(imageBuffer, prompt?)    — image analysis (vision)
 *   polliImage(prompt, opts?)            — image generation → Buffer
 *   MODELS                              — available model ids
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const MODELS = {
  text: {
    openai:         'openai',
    'openai-large': 'openai-large',
    gemini:         'gemini',
    mistral:        'mistral',
  },
  image: {
    flux:  'flux',
    turbo: 'turbo',
  },
};

const PTEXT_URL  = 'https://text.pollinations.ai/openai';
const PIMAGE_URL = 'https://image.pollinations.ai/prompt';

const TEXT_MODELS = {
  'openai':        'openai',
  'openai-large':  'openai-large',
  'gemini':        'gemini',
  'mistral':       'mistral',
};

const VISION_MODEL = 'openai';   // supports image_url content blocks

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * POST to the Pollinations.AI text completion endpoint.
 * @param {string} model    — Pollinations model name
 * @param {Array}  messages — OpenAI-format message array
 * @returns {Promise<string>}
 */
async function polliChat(model, messages) {
  const r = await fetch(PTEXT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model, messages }),
    signal:  AbortSignal.timeout(35000),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Pollinations text error ${r.status}: ${txt.slice(0, 120)}`);
  }

  const data = await r.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// ── Text generation ───────────────────────────────────────────────────────────

/**
 * Generate text via Pollinations.AI.
 * Accepts the standard model aliases ('openai', 'openai-large', 'gemini', 'mistral').
 *
 * @param {Array<{ role: string, content: string|Array }>} messages
 * @param {string} [model='openai']
 * @returns {Promise<string>}
 */
export async function polliText(messages, model = 'openai') {
  const m = TEXT_MODELS[model] ?? 'openai';
  return polliChat(m, messages);
}

/**
 * Generate text with an optional system prompt and model choice.
 *
 * @param {Array<{ role: string, content: string }>} messages
 * @param {object} [opts]
 * @param {string} [opts.model='openai']
 * @param {string} [opts.system]
 * @returns {Promise<string>}
 */
export async function polliTextWith(messages, { model = 'openai', system = null } = {}) {
  const full = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;
  return polliText(full, model);
}

// ── Vision (image analysis) ───────────────────────────────────────────────────

/**
 * Analyze an image using Pollinations.AI vision.
 * Accepts a Buffer (WhatsApp downloaded media) or a public HTTPS URL.
 *
 * @param {Buffer|string} imageSource
 * @param {string}  [prompt]
 * @returns {Promise<string>}
 */
export async function polliVision(
  imageSource,
  prompt = 'Describe this image in detail.',
) {
  let imageUrl;
  if (Buffer.isBuffer(imageSource)) {
    imageUrl = `data:image/jpeg;base64,${imageSource.toString('base64')}`;
  } else {
    imageUrl = imageSource;
  }

  const messages = [{
    role:    'user',
    content: [
      { type: 'text',      text: prompt },
      { type: 'image_url', image_url: { url: imageUrl } },
    ],
  }];

  return polliChat(VISION_MODEL, messages);
}

// ── Image generation ──────────────────────────────────────────────────────────

/**
 * Generate an image from a text prompt via Pollinations.AI.
 * Returns the raw image as a Buffer.
 *
 * @param {string} prompt
 * @param {object} [opts]
 * @param {number} [opts.width=1024]
 * @param {number} [opts.height=1024]
 * @param {string} [opts.model='flux']
 * @returns {Promise<Buffer>}
 */
export async function polliImage(prompt, {
  width  = 1024,
  height = 1024,
  model  = 'flux',
} = {}) {
  const url = [
    `${PIMAGE_URL}/${encodeURIComponent(prompt)}`,
    `?model=${model}`,
    `&width=${width}`,
    `&height=${height}`,
    `&nologo=true`,
    `&enhance=true`,
  ].join('');

  const r = await fetch(url, { signal: AbortSignal.timeout(90000) });

  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Pollinations image error ${r.status}: ${txt.slice(0, 120)}`);
  }

  return Buffer.from(await r.arrayBuffer());
}
