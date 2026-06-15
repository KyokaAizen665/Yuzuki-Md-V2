# Yuzuki Framework — AI Provider Compatibility Report

**Date:** 2026-06-15
**Scope:** Provider API compatibility, authentication requirements, endpoint mapping

---

## 1. Provider Compatibility Matrix

| Provider | Auth Required | Key Available | API Stable | Compatible | Verdict |
|---|---|---|---|---|---|
| **Pollinations.AI** | ❌ None | N/A | ✅ Yes | ✅ Yes | **USE — Primary** |
| **MyMemory** | ❌ None | N/A | ✅ Yes | ✅ Yes | **USE — Translate only** |
| **ChatEx AI** | ✅ Yes (changed) | ❌ No | ❌ No | ❌ No | **DISABLED** |
| **Felo AI** | ✅ Yes (changed) | ❌ No | ❌ No | ❌ No | **DISABLED** |
| **Groq** | ✅ Yes | ❌ Not set | ✅ Yes | ⚠️ Conditional | **NOT CONFIGURED** |
| **Hugging Face** | ✅ Yes | ❌ Not set | ✅ Yes | ⚠️ Conditional | **NOT CONFIGURED** |

---

## 2. Pollinations.AI — Detailed Compatibility

**Base URLs:**
- Text: `https://text.pollinations.ai/openai`
- Images: `https://image.pollinations.ai/prompt/<prompt>`

**Confirmed working models (as of 2026-06-15):**

| Bot alias | Pollinations model | Status | Notes |
|---|---|---|---|
| `openai` | `openai` | ✅ Verified 200 OK | Fast, GPT-class |
| `openai-large` | `openai-large` | ✅ Available | Higher quality |
| `gemini` | `gemini` | ✅ Available | May queue on burst |
| `mistral` | `mistral` | ✅ Available | May queue on burst |
| `flux` (image) | `flux` | ✅ Available | 5–15s cold start |
| `turbo` (image) | `turbo` | ✅ Available | Faster, lower quality |

**Authentication:** None. No API key, no account, no registration.

**Rate limits:**
- Per-IP request queuing
- Max 1 queued request per IP per model (burst)
- Normal single-user bot load: unaffected

**Request format (text):**
```json
POST https://text.pollinations.ai/openai
{
  "model": "openai",
  "messages": [{"role": "user", "content": "..."}]
}
```

**Request format (image):**
```
GET https://image.pollinations.ai/prompt/<encoded-prompt>?model=flux&width=1024&height=1024&nologo=true&enhance=true
```

---

## 3. MyMemory — Detailed Compatibility

**Endpoint:** `https://api.mymemory.translated.net/get?q=<text>&langpair=<src>|<tgt>`

**Authentication:** None for up to 10,000 words/day per IP.

**Status:** Fully operational. No changes required.

---

## 4. ChatEx AI — Failure Analysis

**Reported error:** HTTP 404 / command not responding

**Root cause chain:**
1. `chatex.ai/api/chat` returns HTTP 307 → `www.chatex.ai/api/chat`
2. Node.js `fetch` does not follow POST 307 redirects — response is the redirect itself
3. `!res.ok` branch triggers → attempts fallback `v1/chat/completions`
4. Same 307 received for fallback → `!res2.ok` → throws `ChatEx API error: 307`
5. Even when redirect is manually followed: `www.chatex.ai/api/chat` → **HTTP 400**

**What changed on provider side:**
- API was moved from bare domain to `www.`
- API format/authentication requirements changed (returns 400 for the old request format)
- No public API documentation available
- No anonymous access pathway

**Recovery path:** Not feasible without a paid account or API key from ChatEx AI.

**Status: PERMANENTLY DISABLED**

---

## 5. Felo AI — Failure Analysis

**Reported error:** "Failed token retrieval" / command failing silently

**Root cause chain:**
1. `FeloClient.search()` calls `ensureToken()` → `getAnonymousToken()`
2. POST to `https://account.felo.ai/api/auth/anonymous` with `{device_id, language}`
3. Response: HTTP 401 `{"status":401,"code":"UNAUTHORIZED","message":"Unauthorized access."}`
4. `throw new Error("Failed to get Felo token.")` propagates to plugin catch block

**What changed on provider side:**
- Anonymous device-based authentication was revoked
- Account registration + OAuth is now required
- The search endpoint format also changed (405 on `POST /search`)

**Recovery path:** Not feasible without a registered Felo account and OAuth integration.

**Status: PERMANENTLY DISABLED**

---

## 6. Groq — Conditional Compatibility

Groq is a high-quality free-tier provider (OpenAI-compatible). Would restore if configured.

| Feature | Detail |
|---|---|
| Text models | `llama-3.1-8b-instant`, `llama-3.3-70b-versatile`, `gemma2-9b-it`, `mixtral-8x7b-32768` |
| Vision | `llama-3.2-11b-vision-preview` |
| Free tier | 30 req/min, 14,400 req/day |
| Env var needed | `GROQ_API_KEY` |
| Sign-up | https://console.groq.com |

Not required while Pollinations.AI is operational. Can be activated by setting `GROQ_API_KEY` and reverting `pollinations.js` model map.

---

## 7. Architecture Decision

### Current (post-fix): Pollinations.AI

```
All text commands
  └─ polliText() / polliTextWith()
       └─ POST https://text.pollinations.ai/openai
            └─ No key, free, always-on

Image commands
  └─ polliImage()
       └─ GET https://image.pollinations.ai/prompt/...
            └─ No key, free, queue-based

Vision commands
  └─ polliVision()
       └─ POST https://text.pollinations.ai/openai  (model=openai, image_url)
            └─ No key, free

Translate
  └─ fetch MyMemory API
       └─ No key, free
```

### Deprecated (removed)

```
ChatEx AI  → chatex.ai API (broken, returns 400)
Felo AI    → account.felo.ai anonymous auth (returns 401)
```

### Previously attempted (reverted)

```
Groq      → api.groq.com/openai/v1  (GROQ_API_KEY never configured)
HF        → api-inference.huggingface.co  (HF_TOKEN never configured)
```

---

## 8. Recommendations

1. **Keep Pollinations.AI as primary.** It is free, stable, and no key management is required.
2. **Do not re-enable ChatEx or Felo** without a verified working authentication method.
3. **If Pollinations becomes unavailable,** add `GROQ_API_KEY` (free at console.groq.com) and swap the model routing in `pollinations.js` — the entire API surface is identical.
4. **Image generation:** If Pollinations queue becomes a bottleneck, set `HF_TOKEN` and add HF as image backend alongside Pollinations text.
