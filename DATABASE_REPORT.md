# Yuzuki Framework — Database Audit Report

**Date:** 2026-06-15
**Scope:** Full audit of the persistence layer, user storage, and RPG data systems

---

## 1. Database Implementation

### Status: ✅ Fully Implemented

The framework uses a two-file JSON persistence system:

| File | Purpose | Location |
|---|---|---|
| `data/database.json` | User profiles, levels, coins, limits | `src/lib/database.js` |
| `data/games.json` | Inventory, cooldowns, stats, achievements, quests | `src/lib/games-db.js` |

Both files are auto-created on first access. The `data/` directory is also auto-created if missing.

---

## 2. `database.js` — Public API

### `loadDB()` ✅
Reads `data/database.json`. Returns `{ users: {}, settings: { cmdLimit: {}, lastResetLimit: null } }` as default if the file does not exist or is corrupt.

### `saveDB(db)` ✅
Atomically writes the full DB object to disk as formatted JSON.

### `initUserDB(senderJid, pushName)` ✅
Auto-creates a user record if the JID is not present. Also performs a daily limit reset if the date has changed.

**Default user record:**
```json
{
  "level": 0,
  "exp": 0,
  "money": 0,
  "bank": 0,
  "health": 100,
  "limitfree": 15,
  "limitprem": 0,
  "limitbuy": 0,
  "lastmining": 0,
  "lastdungeon": 0,
  "name": "<pushName>",
  "registered": false,
  "premium": false
}
```

### `addXP(jid, amount, pushName)` ✅
Awards XP, levels up the user automatically, checks badge conditions, and saves. Called automatically on every command in `commands.js`.

### `addCoins(jid, amount)` / `spendCoins(jid, amount)` ✅
Coin management with save-on-change.

### `getLeaderboard(limit)` ✅
Returns top N users sorted by level descending, filtered to `registered === true`.

### `getRankPosition(jid)` ✅
Returns a user's 1-based rank position among registered users.

### `getLimitCost / setLimitCost / checkLimit / useLimit` ✅
Command rate-limiting system. Limits reset daily via `initUserDB`.

---

## 3. `games-db.js` — Game Storage

### Status: ✅ Fully Implemented

Stored at `data/games.json`, separate from the main user DB. Each user gets a game record with:

- `inventory` — item quantities by item ID
- `farming` — 4 farm slot states
- `stats` — fish/hunt/mine/harvest/battle counts, total earned, quests done
- `cooldowns` — timestamps for fish/hunt/mine/battle
- `lastDaily` / `dailyStreak` — daily reward tracking
- `achievements` — array of unlocked achievement IDs
- `quests` — daily quest progress (resets at midnight)

All fields are auto-initialised by `ensureGU()` — missing fields are patched on first access.

---

## 4. Current Database State (at time of audit)

```
Users in database: 2
  User 1: registered=False, level=1, exp=100, name=User
  User 2: registered=False, level=1, exp=100, name=User
```

Both users exist in the database (created by auto-XP on first command) but have `registered: false`. This is the reason `.leaderboard` showed no players — the filter requires `registered: true`.

---

## 5. Persistence Across Restarts

✅ **Yes — data persists across restarts.**

All writes go directly to disk via `fs.writeFileSync`. No in-memory caching is used. Every `addXP`, `saveDB`, `saveGU` call flushes to disk immediately.

---

## 6. Issues Found

| Issue | Severity | Status |
|---|---|---|
| No `.reg` plugin — `registered` never set to `true` | Critical | Fixed (see Registration Report) |
| Existing users stuck at `registered: false` | Medium | Resolved once they run `.reg` |

---

## 7. Architecture Assessment

| Aspect | Verdict |
|---|---|
| Storage format | JSON (acceptable for a bot at this scale) |
| Write safety | Synchronous `writeFileSync` — no partial-write risk |
| Error handling | `try/catch` with fallback default on corrupt read |
| Daily reset | Correct — triggered lazily by `initUserDB` |
| Games separation | Good — keeps main user record lean |
| Schema migration | Manual patching via `ensureGU` and field checks |

No structural changes are needed. The database layer is sound.
