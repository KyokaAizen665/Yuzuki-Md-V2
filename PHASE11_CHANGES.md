# Phase 11 — Final Framework Layer

## Summary
Complete framework layer implemented. Every feature is now discoverable through
registry metadata. Every command exists as an independent plugin. The menu, help,
and search layers are 100% registry-driven with no hardcoded command lists.

---

## Registry (lib/registry.js) — v2

Added:
- `searchCommands(query, { limit, category })` — full-text search across names, aliases, descriptions, usages. Scored by relevance (exact > prefix > substring > description).
- `searchCategories(query)` — filter category names by substring.
- `getCommandCount()` — total count of unique registered commands.

---

## Menu System (lib/menu-builder.js) — NEW

Registry-driven. Zero hardcoded command lists.

- `buildMain(botName, prefix, runtime)` — main menu caption with auto-generated category list + real command counts.
- `buildSub(botName, prefix, key)` — category sub-menu with permission icons (Ⓕ/Ⓛ/Ⓐ/Ⓞ) from plugin metadata.
- `buildCommandHelp(cmd, prefix)` — single-command help page from plugin metadata.
- `buildSearchResults(query, prefix)` — formatted search-results caption.
- `buildMenuRows(prefix)` — WhatsApp select-list rows for the main menu.
- `buildListPayload(botName, prefix)` — complete list-message payload.
- `CATEGORY_META` — icon + display title per category; only edit this for presentation changes.

---

## Interactive Layer (lib/interactive.js) — NEW

NativeFlow button helpers + message assembly:

- `copyButton(displayText, text)` — cta_copy button
- `urlButton(displayText, url)` — cta_url button
- `selectButton(title, rows, sectionTitle)` — single_select button
- `selectButtonSections(title, sections)` — multi-section select
- `quickReply(displayText, id)` — quick_reply button
- `buildInteractiveContent(jid, opts)` — assembles viewOnce interactiveMessage
- `sendInteractive(sock, jid, quotedMsg, opts, fallback)` — sends with plain-text fallback
- `sendPluginCard(sock, jid, quotedMsg, cmd, prefix)` — interactive card for one command
- `sendCategoryCard(sock, jid, quotedMsg, category, botName, prefix)` — category card with select list
- `sendMenuInteractive(...)` — main menu with image header + category select

---

## Games Engine (lib/game-engine.js + lib/game-store.js) — NEW

**GameEngine** (in-memory session manager):
- One active session per JID (chat room)
- `create(jid, gameId, players, state)` — start session
- `get(jid)` — retrieve active session (auto-expires after 10 min idle)
- `update(jid, patch)` — merge state update
- `nextTurn(jid)` — round-robin turn advancement
- `end(jid)` — close session
- Auto-cleanup of expired sessions every 5 min

**GameStore** (persistent JSON leaderboard → data/game-scores.json):
- `recordWin / recordLoss / recordDraw(jid, gameId, name)`
- `getLeaderboard(gameId, limit)` — sorted by wins
- `getPlayerStats(jid, gameId)` — per-player stats
- `formatLeaderboard(gameId, title, limit)` — ready-to-send string

---

## Game Plugins (src/plugins/game/)

| Plugin       | Aliases               | Type     | Notes                                   |
|--------------|-----------------------|----------|-----------------------------------------|
| ttt          | tictactoe, xo         | session  | vs @user or vs AI bot                  |
| rps          | rockpaperscissors     | instant  | Rock Paper Scissors vs bot              |
| hangman      | hm                    | session  | 7-stage figure, word + letter guess    |
| blackjack    | bj, 21                | session  | Hit/Stand vs dealer AI                 |
| wordle       | wordguess             | session  | 5-letter word, 6 attempts, colour tiles|
| guess        | numguess              | session  | Number 1–100, 8 attempts               |
| trivia       | quiz                  | session  | Open Trivia DB, multiple choice        |
| coinflip     | flip, coin            | instant  | Optional heads/tails bet               |
| dice         | roll, rolldice        | instant  | NdS notation (1d6, 2d20, etc.)         |
| leaderboard  | lb, ranking           | query    | Per-game top 10 + personal stats       |
| endgame      | stopgame, cancelgame  | utility  | Force-end stuck session                |

---

## Plugin Manager Commands

| Command        | Aliases               | Description                              |
|----------------|-----------------------|------------------------------------------|
| .plugins       | plist                 | Enhanced: interactive select card        |
| .plugininfo    | pinfo, cmdinfo        | Detailed runtime info + copy buttons     |
| .enableplugin  | enable, enplugin      | Re-enable a disabled plugin              |
| .disableplugin | disable, displugin    | Disable plugin (protected list guards)   |
| .reloadplugin  | reload, hotreload     | Hot-reload one or all plugins            |

---

## Updated Existing Plugins

### tools/help.js
- Sends interactive NativeFlow card (category select on overview)
- `.help search <query>` — delegates to full-text registry search
- Fuzzy fallback: if no exact match, shows top 5 similar commands in a select list
- Every command result shows as an interactive plugin card with copy buttons

### tools/menu.js
- 100% registry-driven — no hardcoded categories or command lists
- Category counts auto-update as plugins load/unload
- NativeFlow interactive card with category select
- Image header from settings.menuBgUrl or local MENU_BG asset

### tools/search.js (NEW)
- Standalone `.search <query>` command
- Top 10 results with interactive select list

### owner/plugins.js
- Enhanced: shows per-category breakdown with interactive select
- Optional category filter: `.plugins owner`

---

## menu.js — Cleanup

- **Removed**: all hardcoded `CATEGORIES` arrays (≈150 lines of stale data)
- **Kept**: `MENU_BG` path constant
- All exports now delegate to `lib/menu-builder.js`
- Existing imports of `buildMain`, `buildSub`, `buildListPayload` still work unchanged

---

## Files Added / Changed

```
src/lib/registry.js          — v2: added search + getCommandCount
src/lib/menu-builder.js      — NEW: registry-driven menu builder
src/lib/interactive.js       — NEW: NativeFlow button + card helpers
src/lib/game-engine.js       — NEW: session manager (GameSession + GameEngine)
src/lib/game-store.js        — NEW: persistent leaderboard (JSON)
src/menu.js                  — replaced hardcoded CATEGORIES with registry re-export
src/plugins/game/ttt.js      — NEW
src/plugins/game/rps.js      — NEW
src/plugins/game/hangman.js  — NEW
src/plugins/game/blackjack.js — NEW
src/plugins/game/wordle.js   — NEW
src/plugins/game/guess.js    — NEW
src/plugins/game/trivia.js   — NEW
src/plugins/game/coinflip.js — NEW
src/plugins/game/dice.js     — NEW
src/plugins/game/leaderboard.js — NEW
src/plugins/game/endgame.js  — NEW
src/plugins/owner/plugininfo.js    — NEW
src/plugins/owner/enableplugin.js  — NEW
src/plugins/owner/disableplugin.js — NEW
src/plugins/owner/reloadplugin.js  — NEW
src/plugins/tools/help.js    — rewritten (NativeFlow + search)
src/plugins/tools/menu.js    — rewritten (registry-driven)
src/plugins/tools/search.js  — NEW
src/plugins/owner/plugins.js — rewritten (interactive card)
```
