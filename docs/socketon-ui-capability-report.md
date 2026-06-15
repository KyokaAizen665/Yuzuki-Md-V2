# Socketon / Focashi — UI Capability Report
**Yuzuki Framework · June 2026**

This document maps every reusable UI abstraction already present in the fork.
Read this before building any new UI system so you do not duplicate existing work.

---

## Layer Map

```
src/message-engine/index.js   ← PUBLIC API — import from here
  ├── text.js                 ← plain text, reactions, presence, forwarding
  ├── media.js                ← image, video, audio, document, sticker, contact, location
  ├── interactive.js          ← NativeFlow button factories + card senders
  └── cards.js                ← pre-built templates (error, success, progress, info …)

src/lib/interactive.js        ← INTERNAL — superseded by message-engine; do not call directly
src/lib/msg-tricks.js         ← UNIQUE helpers (forwarding tricks, ad-reply, newsletter style)
src/lib/menu-builder.js       ← Registry-driven caption + row builders
src/menu.js                   ← Thin re-export of menu-builder + MENU_BG asset path
src/menuImage.js              ← Canvas-rendered PNG menu image generator

src/workflows/
  ├── index.js                ← Public entry (workflowManager, defineWorkflow, StepResult)
  ├── manager.js              ← WorkflowManager singleton
  ├── states.js               ← defineWorkflow() + StepResult factories
  ├── sessions.js             ← WorkflowSession + sessionStore
  └── handlers/play.js        ← Example built-in workflow
```

---

## 1. Text Layer — `src/message-engine/text.js`

Import path: `import { … } from '../message-engine/index.js'`

| Function | Signature | Purpose |
|---|---|---|
| `sendText` | `(sock, jid, text, opts?)` | Plain text. Supports `quoted`, `mentions`, `linkPreview` |
| `sendReply` | `(sock, jid, text, quotedMsg, opts?)` | Quoted reply |
| `editMessage` | `(sock, jid, originalKey, newText)` | Edit a message the bot already sent |
| `sendEphemeral` | `(sock, jid, text, opts?)` | Text with ephemeralExpiration TTL (default 24h) |
| `sendTyping` | `(sock, jid, durationMs?)` | Composing presence indicator (auto-stops after duration) |
| `sendReact` | `(sock, jid, emoji, msgKey)` | Add emoji reaction to a message |
| `removeReact` | `(sock, jid, msgKey)` | Remove a reaction (sends empty emoji) |
| `forwardMessage` | `(sock, jid, forwardedMsg, forwardScore?)` | Forward preserving original content |
| `broadcastText` | `(sock, jids[], text, opts?)` | Same text to multiple JIDs in parallel |

**Return shape:** `{ ok: true, sent }` or `{ ok: false, error }` — never throws.

### Rules
- All plain text sending goes through these functions.
- Never call `sock.sendMessage(jid, { text })` directly in plugin code.

---

## 2. Media Layer — `src/message-engine/media.js`

Import path: `import { … } from '../message-engine/index.js'`

**Source descriptor** — all media functions accept one of:
```js
{ url: 'https://…' }     // remote URL — Socketon streams it (no local download needed)
{ buffer: Buffer }        // in-memory binary
{ path: '/abs/path' }     // local file — read synchronously as buffer
```

| Function | Notable options |
|---|---|
| `sendImage(sock, jid, source, caption?, opts?)` | `viewOnce`, `mentions`, `contextInfo` |
| `sendVideo(sock, jid, source, caption?, opts?)` | `gifPlayback`, `viewOnce`, `seconds` |
| `sendAudio(sock, jid, source, opts?)` | `ptt`, `mimetype`, `seconds`, `contextInfo` |
| `sendVoice(sock, jid, source, opts?)` | Shorthand for `sendAudio` with PTT + ogg/opus |
| `sendDocument(sock, jid, source, filename, mimetype?, opts?)` | `caption`, `thumbnail` |
| `sendSticker(sock, jid, source, opts?)` | `isAnimated`, `stickerName`, `stickerAuthor` |
| `sendContact(sock, jid, displayName, vcard, opts?)` | Full vCard string |
| `sendLocation(sock, jid, lat, lon, opts?)` | `name`, `address` |
| `withAdReply(messagePayload, opts)` | Merge external ad-reply preview into any payload |

### `withAdReply` — attaching a thumbnail strip to any message
```js
const payload = withAdReply(
  { image: { url: '…' }, caption: 'Result' },
  { title: 'YouTube', body: 'video title', sourceUrl: '…', largeThumb: true }
);
await sock.sendMessage(jid, payload, { quoted: msg });
```

---

## 3. Interactive Layer — NativeFlow

Import path: `import { … } from '../message-engine/index.js'`

### 3a. Button factories

| Factory | What it produces |
|---|---|
| `copyButton(label, textToCopy)` | `cta_copy` — copies text to clipboard when tapped |
| `urlButton(label, url)` | `cta_url` — opens URL in browser |
| `selectButton(label, rows, sectionTitle?)` | `single_select` — dropdown list (one section) |
| `selectButtonSections(label, sections[])` | `single_select` — dropdown list (multiple sections) |
| `quickReply(label, id)` | `quick_reply` — tapping sends `id` as a message |

Row shape for `selectButton`:
```js
{ title: 'Command name', description: 'Short desc', rowId: '.help trivia' }
```

### 3b. Card senders

| Function | Purpose |
|---|---|
| `sendCard(sock, jid, quotedMsg, opts)` | Core sender — assembles and relays NativeFlow interactive message; falls back to plain text on failure |
| `buildContent(opts)` | Assemble raw interactiveMessage content object (for advanced use) |
| `prepareImageHeader(sock, imageSource)` | Upload an image and return a media header for `sendCard` |
| `sendMenuCard(…)` | Main menu card with image header + category select list |
| `sendCommandCard(…)` | Plugin help card with two Copy buttons |
| `sendCategoryCard(…)` | Category listing card with command select list |
| `sendSearchCard(…)` | Search results card with command select list |

`sendCard` options:
```js
sendCard(sock, jid, msg, {
  body:        'Card body text (WA markdown supported)',
  footer:      'Footer text',
  headerTitle: 'Optional text header',
  mediaHeader: await prepareImageHeader(sock, { url: '…' }),  // optional image header
  buttons:     [ copyButton('Copy', val), urlButton('Open', url) ],
  fallback:    'Plain-text version if interactive fails',
});
```

### 3c. What NativeFlow requires
- Assembled via `generateWAMessageFromContent` + `sock.relayMessage` (NOT `sock.sendMessage`).
- The `sendCard` wrapper handles this — never call the Socketon internals directly.
- Older WhatsApp versions silently fail interactive messages → always set `fallback`.

---

## 4. Cards Layer — Pre-built Templates

Import path: `import { … } from '../message-engine/index.js'`

These are opinionated templates that encode Yuzuki's visual style.
Plugins use these instead of composing raw text.

| Template | Produces | Behaviour |
|---|---|---|
| `errorCard(sock, jid, msg, error, opts?)` | `❌ Error\n╰› message` | Sends ❌ reaction by default; accepts `hint`, `label` |
| `successCard(sock, jid, msg, label, value?, opts?)` | `✅ Label\n╰› value` | Sends ✅ reaction by default |
| `progressCard(sock, jid, msg, label, detail?)` | `⏱️ Label\n╰› detail` | Sends ⏱️ reaction |
| `infoCard(sock, jid, msg, emoji, title, fields, footer?)` | Box-drawn table | `fields` = `[label, value]` pairs; `null` = divider row |
| `noticeCard(sock, jid, msg, label, detail?)` | `⚠️ Label\n╰› detail` | Warning / notice |
| `ownerOnlyCard(sock, jid, msg)` | `⛔ Owner Only` | Standardised access denial |
| `usageCard(sock, jid, msg, usage, example?)` | `💡 Usage\n╰› .cmd` | Wrong-usage reminder |
| `richInfoCard(sock, jid, msg, body, footer?, buttons?)` | Interactive card | Wraps `sendCard` with arbitrary NativeFlow buttons |
| `loadingSequence(sock, jid, msg, workFn, opts?)` | ⏱️ → work → ✅/❌ | Wraps slow async ops with automatic reaction lifecycle |

`loadingSequence` — the most important template:
```js
await loadingSequence(sock, jid, msg, async ({ react }) => {
  await react('🔍');                          // custom mid-work reaction
  const result = await fetchFromApi(query);
  await sendImage(sock, jid, { url: result.url }, result.title, { quoted: msg });
}, { errorLabel: 'Fetch Failed', errorHint: 'Try again later' });
```

---

## 5. Message Tricks — `src/lib/msg-tricks.js`

These are **not exposed through the message-engine barrel**. Import directly.
They provide WhatsApp-specific rendering tricks with no equivalent elsewhere.

```js
import { sendForwarded, sendAdReply, sendNewsletterStyle,
         sendAnnouncementCard, sendPremiumStyle } from './lib/msg-tricks.js';
```

| Function | What it does |
|---|---|
| `sendForwarded(sock, jid, text, opts?)` | Adds "Forwarded many times" yellow label (`forwardingScore: 999`) |
| `sendAdReply(sock, jid, text, adOpts, extras?)` | Custom fake link-preview strip (externalAdReply) with thumbnail, title, source URL |
| `sendNewsletterStyle(sock, jid, text, opts?)` | Message appears to come from a WA Channel/Newsletter |
| `sendAnnouncementCard(sock, jid, opts?)` | Combined: large thumbnail + newsletter context + URL CTA button — full announcement card |
| `sendPremiumStyle(sock, jid, content, msgOpts?)` | Undocumented `premium:1` flag — client-dependent behaviour |

These are wrappers and should be preferred over raw `contextInfo` injection.

---

## 6. Menu System

### Caption builders — `src/lib/menu-builder.js` / `src/menu.js`

All content is **dynamically generated from the command registry** at runtime.
No hardcoded command lists.

| Export | Purpose |
|---|---|
| `buildMain(botName, prefix, runtime)` | Full main menu caption string |
| `buildSub(botName, prefix, categoryKey)` | Category sub-menu caption with permission indicators |
| `buildCommandHelp(cmd, prefix)` | Single command detail page |
| `buildSearchResults(query, prefix, limit?)` | Search results caption |
| `buildMenuRows(prefix)` | Array of `{ title, description, rowId }` rows for a select button |
| `buildListPayload(botName, prefix)` | Full WA list-message payload object |
| `CATEGORY_META` | `{ icon, title }` per category key — edit here to restyle categories |
| `MENU_BG` | Absolute path to `src/assets/menu_bg.jpg` |

`runtime` shape for `buildMain`:
```js
{ pushname, userRank, uptimeStr, totalUsers, ownerNumber }
```

### Canvas image generator — `src/menuImage.js`

```js
import { generateMenuImage } from './menuImage.js';

const pngBuffer = await generateMenuImage(
  'Yuzuki MD',
  '.',
  [
    { title: '🤖 AI',      commands: ['chatgpt', 'gemini', 'dalle'] },
    { title: '📥 Download', commands: ['ytmp4', 'ytmp3', 'igdl']   },
  ],
  'https://…/bg.jpg'   // optional background URL
);
// pngBuffer is a Buffer — send via sendImage(sock, jid, { buffer: pngBuffer })
```

Renders a dark-themed (GitHub-style), 2-column panel grid as a PNG.
Uses `@napi-rs/canvas` — no browser dependency.

---

## 7. Workflow Engine — `src/workflows/`

Multi-step conversational interactions. Integrated into `bot.js` already.

```js
import { defineWorkflow, StepResult, workflowManager } from './workflows/index.js';
```

### Defining a workflow
```js
const myWorkflow = defineWorkflow({
  name:    'my-workflow',
  timeout: 60_000,          // ms per step (default)
  steps: [
    {
      name: 'ask',
      async enter(session, ctx) {
        await ctx.sock.sendMessage(session.jid, { text: 'What is your name?' });
        // return nothing → wait for user input via handle()
      },
      async handle(session, input, ctx) {
        if (!input.trim()) return StepResult.retry('Please enter a name.');
        session.state.name = input.trim();
        return StepResult.next('confirm');
      },
      maxRetries: 3,
    },
    {
      name: 'confirm',
      async enter(session, ctx) {
        await ctx.sock.sendMessage(session.jid, { text: `Hello, ${session.state.name}!` });
        return StepResult.done();
      },
    },
  ],
  onCancel:   async (session, ctx, reason) => { /* cleanup */ },
  onTimeout:  async (session, ctx)         => { /* notify user */ },
  onComplete: async (session, ctx)         => { /* celebration */ },
});

workflowManager.register(myWorkflow);
```

### Starting from a plugin
```js
// In execute():
const result = await workflowManager.start(jid, 'my-workflow', { userId: sender }, { sock, msg, settings });
if (!result.ok) await errorCard(sock, jid, msg, result.error);
```

### StepResult factories

| Factory | Effect |
|---|---|
| `StepResult.next('stepName')` | Move to named step (runs `enter()`) |
| `StepResult.done()` | End workflow, call `onComplete` |
| `StepResult.retry('error msg')` | Stay on current step; optionally send error |
| `StepResult.cancel('reason')` | Abort, call `onCancel` |

### Built-in behaviours (WorkflowManager)
- **Auto-cancel keywords**: `cancel`, `stop`, `quit`, `exit` (with or without prefix) end the workflow gracefully.
- **Prefixed commands**: sending `.anotherCommand` silently cancels the workflow and lets the command execute normally.
- **Retry limit**: default 3 consecutive retries per step → auto-cancel on overflow.
- **Timeout**: per-step timer; fires `onTimeout` hook or sends default message.
- **ctx shape** passed to every step: `{ sock, msg, settings }`.

---

## 8. Low-level Library — `src/lib/interactive.js`

> ⚠️ **Do not import or call this file from new code.**

This is the older generation of NativeFlow helpers. It is kept for backward compatibility with code that predates the message-engine layer. Its exports (`copyButton`, `urlButton`, `selectButton`, `sendInteractive`, `sendPluginCard`, `sendCategoryCard`, `sendMenuInteractive`) are all superseded by `src/message-engine/interactive.js` and `src/message-engine/cards.js`, which have:
- Consistent `{ ok, sent, error }` return shapes
- Better fallback handling
- Cleaner separation of button factories from senders

---

## Decision Matrix — What to Reuse vs. What Not to Touch

| You need to… | Use this | Do NOT do this |
|---|---|---|
| Send plain text | `sendReply` / `sendText` | `sock.sendMessage(jid, { text })` directly |
| Send media | `sendImage` / `sendVideo` / `sendAudio` | Raw sock media payloads |
| Show ⏱️ → result → ✅/❌ | `loadingSequence` | Manual reactions + try/catch |
| Show an error | `errorCard` | `sock.sendMessage(jid, { text: '❌ …' })` |
| Show a NativeFlow card | `sendCard` + button factories | `sock.relayMessage` directly |
| Multi-step conversation | `workflowManager.start` + `defineWorkflow` | Manual session state maps |
| Menu captions | `buildMain` / `buildSub` / `buildCommandHelp` | Hardcoding command lists in strings |
| Menu as image | `generateMenuImage` | Re-implementing canvas rendering |
| "Forwarded" / ad-reply trick | `sendForwarded` / `sendAdReply` | Raw `contextInfo` construction |
| Newsletter-style messages | `sendNewsletterStyle` / `sendAnnouncementCard` | Raw `contextInfo` construction |
| Category icon/title | `CATEGORY_META` (edit `menu-builder.js`) | Duplicating metadata in plugins |

---

## Import Cheat Sheet

```js
// Everything text + media + interactive + cards (most plugins need only this)
import {
  sendReply, sendReact, sendTyping,
  sendImage, sendVideo, sendAudio, sendDocument,
  copyButton, urlButton, selectButton, quickReply,
  sendCard, errorCard, successCard, loadingSequence, infoCard,
} from '../message-engine/index.js';

// Message tricks (unique — not in message-engine barrel)
import { sendAdReply, sendAnnouncementCard, sendNewsletterStyle }
  from '../lib/msg-tricks.js';

// Menu content generation
import { buildMain, buildSub, buildCommandHelp, buildMenuRows, CATEGORY_META }
  from '../lib/menu-builder.js';

// Menu as PNG image
import { generateMenuImage } from '../menuImage.js';

// Workflow engine
import { defineWorkflow, StepResult, workflowManager }
  from '../workflows/index.js';
```

---

## Summary

The framework ships a **complete, layered UI stack**. Nothing below needs to be reimplemented:

1. **Text** — 9 wrappers for every plain-text pattern
2. **Media** — 9 wrappers covering all media types + source normalization
3. **NativeFlow** — 5 button factories + 5 card senders + raw builder escape hatch
4. **Templates** — 9 pre-built cards encoding the bot's visual style
5. **Message tricks** — 5 contextInfo injection helpers (forwarding, ad-reply, newsletter)
6. **Menu** — fully registry-driven, zero hardcoding required
7. **Canvas image** — one function, produces styled PNG
8. **Workflows** — complete multi-step conversation engine already wired into `bot.js`

New UI systems should be **wrappers or extensions** of these layers, not replacements.
