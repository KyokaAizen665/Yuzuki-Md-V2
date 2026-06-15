/**
 * AI Client (formerly pollinations.js)
 *
 * Drop-in replacement for the old Pollinations.AI client.
 * Every export name is identical — no plugin changes required.
 *
 * ─── Providers ────────────────────────────────────────────────────────────────
 *
 *   Text + Vision  →  Groq (OpenAI-compatible, fast, free tier)
 *                     Sign up free at https://console.groq.com
 *                     Env var: GROQ_API_KEY
 *
 *   Image gen      →  Hugging Face Inference API (FLUX.1-schnell, free tier)
 *                     Sign up free at https://huggingface.co/settings/tokens
 *                     Env var: HF_TOKEN
 *
 * ─── Model aliases (same keys as before) ─────────────────────────────────────
 *
 *   openai         →  llama-3.1-8b-instant    (fast, GPT-4o class quality)
 *   openai-large   →  llama-3.3-70b-versatile (largest, best quality)
 *   gemini         →  gemma2-9b-it            (Google Gemma 2, 9B)
 *   mistral        →  mixtral-8x7b-32768      (Mixtral MoE, 8×7B)
 *
 * ─── Image models ─────────────────────────────────────────────────────────────
 *
 *   flux           →  black-forest-labs/FLUX.1-schnell (fast, high quality)
 *   turbo          →  stabilityai/stable-diffusion-xl-base-1.0 (fallback)
 *
 * ─── Vision ───────────────────────────────────────────────────────────────────
 *
 *   Uses Groq's llama-3.2-11b-vision-preview — accepts base64 image content.
 *
 * ─── Exports (identical to old pollinations.js) ───────────────────────────────
 *
 *   polliText(messages, model?)           — basic text generation
 *   polliTextWith(messages, opts?)        — text with system prompt + model
 *   polliVision(imageBuffer, prompt?)     — describe / analyze an image
 *   polliImage(prompt, opts?)             — generate an image, returns Buffer
 *   MODELS                               — map of available model ids
 */

// ── Model constants ───────────────────────────────────────────────────────────

export const MODELS = {
  text: {
    openai:          'openai',
    'openai-large':  'openai-large',
    gemini:          'gemini',
    mistral:         'mistral',
  },
  image: {
    flux:  'flux',
    turbo: 'turbo',
  },
};

// ── Internal configuration ────────────────────────────────────────────────────

const GROQ_BASE   = 'https://api.groq.com/openai/v1';
const HF_BASE     = 'https://api-inference.huggingface.co/models';

/** Map old Pollinations model aliases to real Groq model IDs. */
const TEXT_MODEL_MAP = {
  'openai':        'llama-3.1-8b-instant',
  'openai-large':  'llama-3.3-70b-versatile',
  'gemini':        'gemma2-9b-it',
  'mistral':       'mixtral-8x7b-32768',
};

/** Map image model aliases to Hugging Face model IDs. */
const IMAGE_MODEL_MAP = {
  'flux':  'black-forest-labs/FLUX.1-schnell',
  'turbo': 'stabilityai/stable-diffusion-xl-base-1.0',
};

const VISION_MODEL = 'llama-3.2-11b-vision-preview';

// ── Internal helpers ──────────────────────────────────────────────────────────

function groqKey() {
  const k = process.env.GROQ_API_KEY;
  if (!k) throw new Error(
    'GROQ_API_KEY is not set.\n' +
    'Get a free API key at https://console.groq.com and add it to .env',
  );
  return k;
}

function hfKey() {
  const k = process.env.HF_TOKEN ?? process.env.HUGGING_FACE_TOKEN;
  if (!k) throw new Error(
    'HF_TOKEN is not set.\n' +
    'Get a free token at https://huggingface.co/settings/tokens and add it to .env',
  );
  return k;
}

/**
 * POST to the Groq chat completions endpoint.
 * @param {string} model       — Groq model ID
 * @param {Array}  messages    — OpenAI-format message array
 * @param {object} [extra]     — optional extra body params
 * @returns {Promise<string>}  — trimmed response text
 */
async function groqChat(model, messages, extra = {}) {
  const r = await fetch(`${GROQ_BASE}/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${groqKey()}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens:  2048,
      ...extra,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Groq API error ${r.status}: ${body}`);
  }

  const data = await r.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// ── Text generation ───────────────────────────────────────────────────────────

/**
 * Generate text via Groq.
 * Accepts the same model aliases as the old Pollinations client
 * ('openai', 'openai-large', 'gemini', 'mistral').
 *
 * @param {Array<{ role: string, content: string|Array }>} messages
 * @param {string} [model='openai']
 * @returns {Promise<string>}
 */
export async function polliText(messages, model = 'openai') {
  const groqModel = TEXT_MODEL_MAP[model] ?? TEXT_MODEL_MAP['openai'];
  return groqChat(groqModel, messages);
}

/**
 * Generate text with an optional system prompt and model choice.
 *
 * @param {Array<{ role: string, content: string }>} messages
 * @param {object}  [opts]
 * @param {string}  [opts.model='openai']   — model alias
 * @param {string}  [opts.system]           — system prompt (prepended)
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
 * Analyze an image using Groq's vision model (llama-3.2-11b-vision-preview).
 * Accepts a Buffer (WhatsApp downloaded media) or a public HTTPS URL.
 *
 * @param {Buffer|string} imageSource  — Buffer (converted to data URL) or https:// URL
 * @param {string}  [prompt]           — what to ask about the image
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

  return groqChat(VISION_MODEL, messages);
}

// ── Image generation ──────────────────────────────────────────────────────────

/**
 * Generate an image from a text prompt via Hugging Face Inference API.
 * Returns the raw image as a Buffer (JPEG/PNG depending on the model).
 *
 * @param {string} prompt
 * @param {object} [opts]
 * @param {number} [opts.width=1024]
 * @param {number} [opts.height=1024]
 * @param {string} [opts.model='flux']    — 'flux' or 'turbo'
 * @returns {Promise<Buffer>}
 */
export async function polliImage(prompt, {
  width  = 1024,
  height = 1024,
  model  = 'flux',
} = {}) {
  const hfModel = IMAGE_MODEL_MAP[model] ?? IMAGE_MODEL_MAP['flux'];

  const r = await fetch(`${HF_BASE}/${hfModel}`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${hfKey()}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      inputs:     prompt,
      parameters: { width, height },
    }),
    signal: AbortSignal.timeout(90000),
  });

  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`HF image gen error ${r.status}: ${body}`);
  }

  return Buffer.from(await r.arrayBuffer());
}
