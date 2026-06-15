# Yuzuki Framework — AI Provider Health Report

**Date:** 2026-06-15
**Audit Scope:** All AI commands, provider backends, endpoint reachability, error sources

---

## Executive Summary

| Category | Count |
|---|---|
| Providers audited | 6 |
| Operational ✅ | 2 (Pollinations.AI, MyMemory) |
| Deprecated / Broken ❌ | 2 (ChatEx AI, Felo AI) |
| Missing env vars (pre-fix) ⚠️ | 2 (GROQ_API_KEY, HF_TOKEN) |
| Commands affected | 15 plugins total |
| Commands now working | 13 |
| Commands disabled | 2 |

---

## 1. Provider Status

### ✅ Pollinations.AI — OPERATIONAL (restored)

| Endpoint | Status | Latency |
|---|---|---|
| `text.pollinations.ai/openai` | **200 OK** | 345 ms |
| `image.pollinations.ai/prompt` | 200 OK (queue on burst) | ~2–8 s |
| Models endpoint | **200 OK** | 350 ms |

**Root cause of failure (pre-fix):**
`pollinations.js` was rewritten to route through Groq (GROQ_API_KEY) and Hugging Face (HF_TOKEN). Neither key was set. Every plugin that calls `polliText`, `polliTextWith`, `polliVision`, or `polliImage` was throwing `"GROQ_API_KEY is not set"` before ever reaching a network call.

**Fix applied:**
`src/lib/pollinations.js` reverted to call the real Pollinations.AI free API:
- Text/Vision → `POST https://text.pollinations.ai/openai`
- Images → `GET https://image.pollinations.ai/prompt/<prompt>`
- No API key required
- All model aliases (openai, openai-large, gemini, mistral) preserved

**Plugins restored:** `.chatgpt` `.claude` `.gemini` `.aichat` `.code` `.explain` `.grammar` `.rewrite` `.summarize` `.imagegen` `.imganalyze`

---

### ✅ MyMemory Translation — OPERATIONAL

| Endpoint | Status |
|---|---|
| `api.mymemory.translated.net/get` | **200 OK** |

Free public API, no key required. No changes needed.

**Commands working:** `.translate` `.tr` `.trans` `.tl` `.lang`

---

### ❌ ChatEx AI — DEPRECATED / DISABLED

| Endpoint | Status | Detail |
|---|---|---|
| `chatex.ai/api/chat` (POST) | **307 → 400** | Redirect to www; www returns Bad Request |
| `chatex.ai/api/v1/chat/completions` (POST) | **307 → 400** | Same |
| `chatex.ai/` (homepage) | 200 OK | Site up, but API broken |

**Diagnosis:**
- `fetch` does not follow 307 redirects for POST by default — request hits `chatex.ai`, receives 307 to `www.chatex.ai`, stops there.
- Even when manually following the redirect to `www.chatex.ai/api/chat`, the response is HTTP 400 ("The request couldn't be processed").
- The API format or authentication requirements have changed. No anonymous access is possible.

**Action taken:**
- `src/lib/scrape/chatexai.js` replaced with a stub that throws `ProviderUnavailableError`
- `src/plugins/ai/chatexai.js` now shows a friendly "provider unavailable" message with working alternatives
- Plugin marked `disabled: true`

---

### ❌ Felo AI — DEPRECATED / DISABLED

| Endpoint | Status | Detail |
|---|---|---|
| `account.felo.ai/api/auth/anonymous` (POST) | **401 Unauthorized** | `{"code":"UNAUTHORIZED","message":"Unauthorized access."}` |
| `api.felo.ai/search` (POST) | **405 Method Not Allowed** | Endpoint format changed |
| `felo.ai/` (homepage) | 200 OK | Site up, API locked |

**Diagnosis:**
- The anonymous authentication endpoint previously accepted a `device_id` and returned an `access_token`. It now returns 401 for all anonymous requests regardless of payload format.
- Felo AI has revoked public unauthenticated access — a registered account and OAuth token are now required.
- The search endpoint returns 405, suggesting the API URL structure has also changed.

**Action taken:**
- `src/lib/scrape/feloai.js` replaced with a stub `FeloClient` that throws `ProviderUnavailableError`
- `src/plugins/ai/feloai.js` now shows a friendly "provider unavailable" message with working alternatives
- Plugin marked `disabled: true`

---

### ⚠️ Groq API — NOT CONFIGURED (no longer needed)

| Env var | Status |
|---|---|
| `GROQ_API_KEY` | **Not set** |

Groq was the temporary backend after the Pollinations migration. Since Pollinations.AI is free and fully operational, Groq is not needed. No action required.

---

### ⚠️ Hugging Face — NOT CONFIGURED (no longer needed)

| Env var | Status |
|---|---|
| `HF_TOKEN` | **Not set** |
| `HUGGING_FACE_TOKEN` | **Not set** |

Hugging Face was the temporary image backend. Pollinations.AI handles image generation without a key. No action required.

---

## 2. Commands Affected Before Fix

All 11 Pollinations-backed commands were failing with:
```
Error: GROQ_API_KEY is not set.
Get a free API key at https://console.groq.com and add it to .env
```

This was thrown inside `groqKey()` before any network call was made.

---

## 3. Current State After Fix

| Command | Provider | Status |
|---|---|---|
| `.chatgpt` / `.gpt` / `.ai` | Pollinations `openai` | ✅ Working |
| `.claude` / `.claude3` | Pollinations `openai-large` | ✅ Working |
| `.gemini` / `.google` | Pollinations `gemini` | ✅ Working |
| `.aichat` / `.chat` / `.yuzuki` | Pollinations `openai` | ✅ Working |
| `.code` / `.coding` / `.dev` | Pollinations `openai-large` | ✅ Working |
| `.explain` / `.wtf` / `.define` | Pollinations `openai` | ✅ Working |
| `.grammar` / `.gc` | Pollinations `openai` | ✅ Working |
| `.rewrite` / `.rw` | Pollinations `openai` | ✅ Working |
| `.summarize` / `.sum` / `.tldr` | Pollinations `openai` | ✅ Working |
| `.imagegen` / `.imagine` / `.ig` | Pollinations flux image | ✅ Working |
| `.imganalyze` / `.analyze` / `.ocr` | Pollinations vision | ✅ Working |
| `.translate` / `.tr` | MyMemory | ✅ Working |
| `.chatexai` / `.chatex` | ChatEx AI | ❌ Disabled |
| `.feloai` / `.felo` | Felo AI | ❌ Disabled |

---

## 4. Reliability Notes

- **Pollinations.AI rate limits:** The API uses per-IP queuing. Concurrent requests from the same IP may receive HTTP 429. Under normal WhatsApp bot load (one request per user per command), this is not an issue.
- **Image generation queue:** Images may take 5–15 seconds on first request (cold model). Subsequent requests are faster. The 90-second timeout in `polliImage()` handles this.
- **Vision:** Pollinations proxies OpenAI vision via `openai` model with `image_url` content blocks. Base64-encoded images from WhatsApp work correctly.

---

## 5. Files Changed

| File | Change |
|---|---|
| `src/lib/pollinations.js` | Reverted to Pollinations.AI free API (removed Groq/HF dependency) |
| `src/lib/scrape/chatexai.js` | Replaced with ProviderUnavailableError stub |
| `src/lib/scrape/feloai.js` | Replaced with ProviderUnavailableError stub |
| `src/plugins/ai/chatexai.js` | Updated to show provider unavailable message |
| `src/plugins/ai/feloai.js` | Updated to show provider unavailable message |
| `src/plugins/ai/chatgpt.js` | Updated description, added reaction emoji |
| `src/plugins/ai/claude.js` | Updated description, added reaction emoji |
| `src/plugins/ai/gemini.js` | Updated description, added reaction emoji |
