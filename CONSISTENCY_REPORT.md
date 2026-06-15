# Yuzuki Framework — Visual Consistency Report

**Date:** 2026-06-15
**Scope:** Full UI audit across all menu, card, and formatting systems

---

## Executive Summary

The audit identified **5 categories of visual inconsistency** across 4 core UI files. All issues have been resolved. The framework now uses a single unified visual identity across every card type, menu, and reply format.

---

## Issues Found & Resolved

### 1. Conflicting Divider Characters

**Before:** 3 different divider characters used interchangeably with no rule:

| Character | Width | Where Used |
|---|---|---|
| `─` (thin solid) | 22 | `cards.js`, `ui.js` |
| `┄` (thin dashed) | 22 | `cards.js`, `ui.js` (inner separators) |
| `━` (heavy/bold) | 22 | `nativeflow/ui.js` — ALL 7 card types |

**After:** Single unified divider system:

| Character | Role | Files |
|---|---|---|
| `─` × 22 | **Content divider** — separates title from body in all cards | All files |
| `┄` × 22 | **Field separator** — subtle row break inside a card body | `cards.js`, `ui.js` only |

**Files changed:** `src/nativeflow/ui.js` (7 replacements)

---

### 2. Inconsistent Section Header Decoration

**Before:** Mixed single / double `━` on the bot name header:

```
✨━〔 🤖 *Yuzuki MD* 〕━✨     ← single ━  (buildMain)
✨━━〔 📂 *Categories* 〕━━✨  ← double ━━ (buildMain, buildSub)
✨━━〔 🤖 *AI Menu* 〕━━✨     ← double ━━ (buildSub)
```

**After:** All section headers use double `━━`:

```
✨━━〔 🤖 *Yuzuki MD* 〕━━✨
✨━━〔 📂 *Categories* 〕━━✨
✨━━〔 🤖 *AI Menu* 〕━━✨
```

**File changed:** `src/lib/menu-builder.js`

---

### 3. Inconsistent Box Closing Widths

**Before:** Box closings had 5 different widths — 14, 15, 17, 19, and 22 dashes:

```
╰───────────────╯   ← 15 dashes (User Info box)
╰─────────────────╯ ← 17 dashes (Bot Info box)
╰──────────────╮    ← 14 dashes (Categories box)
╰───────────────────╯ ← 19 dashes (Access Key box)
╰───────────────╯   ← 15 dashes (Tips box in buildSub)
```

**After:** All boxes close at a uniform 22 dashes — matching the standard `LINE = "─".repeat(22)`:

```
╰──────────────────────╯  ← 22 dashes (all boxes)
```

**File changed:** `src/lib/menu-builder.js` (5 closing borders standardized)

---

### 4. Broken Footer Rendering (Missing `╯`)

**Before:** When a footer string was passed to `card()` and `infoCard()`, the closing border was missing its corner character:

```
╭──────────────────────╮
│  ...
╰──────────────────────    ← missing ╯
_Footer text here_
```

**After:** Footer boxes close cleanly before the footer text:

```
╭──────────────────────╮
│  ...
╰──────────────────────╯
_Footer text here_
```

**Files changed:** `src/utils/ui.js`, `src/message-engine/cards.js`

---

### 5. Inconsistent List Divider Width

**Before:** `listCard()` used a shorter 18-dash divider while every other component used 22:

```
📋  *Title*
──────────────────    ← 18 dashes (listCard)
  1.  Item one
──────────────────    ← 18 dashes

vs.

╭──────────────────────╮   ← 22 dashes (card/infoCard)
```

**After:** All dividers use 22 dashes uniformly:

```
📋  *Title*
──────────────────────    ← 22 dashes
  1.  Item one
──────────────────────    ← 22 dashes
```

**File changed:** `src/utils/ui.js`

---

## Unified Visual System (Reference)

### Dividers
```
─ × 22  →  ──────────────────────   (content divider, all card types)
┄ × 22  →  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  (field separator, inside card body only)
━ × 2   →  ━━                       (decoration in section headers only: ✨━━〔...〕━━✨)
```

### Box System
```
╭─〔 EMOJI *SECTION TITLE* 〕     ← bracket-style header (info sections)
│  content
╰──────────────────────╯          ← always 22 dashes

╭──────────────────────╮          ← plain header (list containers)
│  content
╰──────────────────────╯
```

### Section Headers
```
✨━━〔 EMOJI *TITLE* 〕━━✨        ← always double ━━ on both sides
```

### Inline Cards (toast / reply style)
```
EMOJI  *Label*
╰›  value or detail
```

### Permission Legend (sub-menus)
```
Ⓕ = ꜰʀᴇᴇ  │  Ⓛ = ʟɪᴍɪᴛᴇᴅ
Ⓐ = ᴀᴅᴍɪɴ  │  Ⓞ = ᴏᴡɴᴇʀ
```

### Command Bullets
```
◦ *prefix.command*  Ⓕ  _short description_
```

---

## Files Changed

| File | Changes |
|---|---|
| `src/nativeflow/ui.js` | 7× `━` divider → `─` (pluginDetailCard, workflowCard, workflowListCard, gameCard, gameListCard, leaderboardCard, playerStatsCard) |
| `src/lib/menu-builder.js` | Section header `━` → `━━`; 5 box closings → 22 dashes |
| `src/utils/ui.js` | Footer `╰${LINE}` → `╰${LINE}╯`; listCard 18 → 22 dashes |
| `src/message-engine/cards.js` | Footer `╰${LINE}` → `╰${LINE}╯` |

---

## Verification Checklist

- [x] Main menu (`buildMain`) — consistent headers, uniform box widths
- [x] Sub-menus (`buildSub`) — consistent headers, uniform box widths
- [x] Help card (`buildCommandHelp`) — no borders, plain list format (no changes needed)
- [x] Search results (`buildSearchResults`) — no borders, plain list format (no changes needed)
- [x] Info card (`infoCard` / `card`) — footer border fixed
- [x] Plugin detail card (`pluginDetailCard`) — divider standardized to `─`
- [x] Workflow card (`workflowCard`) — divider standardized to `─`
- [x] Workflow list card (`workflowListCard`) — divider standardized to `─`
- [x] Game card (`gameCard`) — divider standardized to `─`
- [x] Game list card (`gameListCard`) — divider standardized to `─`
- [x] Leaderboard card (`leaderboardCard`) — divider standardized to `─`
- [x] Player stats card (`playerStatsCard`) — divider standardized to `─`
- [x] List card (`listCard`) — width standardized to 22
- [x] Toast / toggle / progress — no borders, already consistent (no changes needed)
- [x] Greeting system — no visual formatting (no changes needed)

---

## Result

Every card type in the Yuzuki Framework now shares the same visual language:
- **One divider width:** 22 characters
- **One content divider character:** `─`
- **One field separator character:** `┄`
- **One section header style:** `✨━━〔...〕━━✨`
- **One box closing width:** 22 dashes
- **One footer rendering pattern:** `╰──────────────────────╯\n_footer_`
