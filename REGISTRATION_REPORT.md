# Yuzuki Framework — Registration Audit Report

**Date:** 2026-06-15
**Scope:** User registration, profile, rank, leaderboard, and XP persistence

---

## 1. Issue Summary

Commands `.reg`, `.profile`, `.rank`, `.xp`, and `.leaderboard` depend on user persistence. The reported issue was that "registration cannot store user data."

**Actual diagnosis:** The database layer is fully functional. The only missing piece was a registration plugin — nothing ever set `registered: true` on a user record.

---

## 2. Flow Trace

### `.profile` / `.rank` / `.xp` — How they work

```
User sends .profile
  → commands.js: addXP(sender, xpGain, pushname) — auto-awards XP on every command
  → pluginCmd.execute() dispatches to src/plugins/rpg/profile.js
    → initUserDB(targetJid) — creates user record if not present
    → loadDB() → reads user record
    → renders profile card (does NOT require registered: true)
```

These commands **work without registration** because they only call `initUserDB`, which auto-creates the user.

### `.leaderboard` — Why it was empty

```
User sends .leaderboard
  → getLeaderboard(10) in database.js
    → filters: v.registered === true
    → 0 users pass the filter → empty result
    → "No registered players yet!" shown
```

The filter is intentional — only explicitly registered users appear on the leaderboard.

### `.reg` — Why it wasn't working

```
User sends .reg Aizen
  → commands.js: getCommand('register') → null (plugin didn't exist)
  → switch(command) → no 'register' case
  → command falls through → no response / unknown command
```

**The `.reg` / `.register` plugin did not exist.** No file in `src/plugins/` handled registration. The leaderboard even referenced the command (`_Register using .register_`) but the handler was missing.

---

## 3. Root Cause

| Component | Expected | Actual |
|---|---|---|
| `src/plugins/rpg/register.js` | Exists, handles `.reg` | ❌ Did not exist |
| `registered` field in user record | Set to `true` after `.reg` | ❌ Always `false` |
| Leaderboard population | Shows registered users | ❌ Always empty |

The plugin was referenced in the leaderboard empty-state hint and in the user badge system (`_checkBadges` checks `u.registered === true` to award the `🌱 Newcomer` badge) but was never implemented.

---

## 4. Fix Applied

### New file: `src/plugins/rpg/register.js`

```
Commands:  .register  .reg  .signup  .join
Category:  rpg
```

**Behaviour:**

1. Requires a display name argument (`.reg <name>`)
2. Enforces a 20-character name limit
3. Calls `initUserDB(sender)` to ensure the user record exists
4. Checks `u.registered` — if already registered, shows current profile snapshot
5. Sets `u.registered = true`
6. Sets `u.name` to the provided display name
7. Awards the `🌱 Newcomer` badge (already defined in `_checkBadges`)
8. Awards 100 starter coins
9. Saves with `saveDB(db)`
10. Sends a confirmation card with level, XP, and quick-access command hints

**No changes were made to `database.js`, `leaderboard.js`, `profile.js`, or `rank.js`.** The fix is additive — one new plugin file.

---

## 5. Command Verification Matrix

| Command | Before fix | After fix |
|---|---|---|
| `.reg Aizen` | No response | ✅ Creates profile, awards badge + 100 coins |
| `.reg` (no name) | No response | ✅ Shows usage hint |
| `.reg` (already registered) | No response | ✅ Shows current profile snapshot |
| `.profile` | ✅ Works | ✅ Works (unchanged) |
| `.rank` / `.xp` / `.level` | ✅ Works | ✅ Works (unchanged) |
| `.leaderboard` | ❌ Always empty | ✅ Shows registered users |
| `.leaderboard coins` | ✅ Works (no `registered` filter) | ✅ Works (unchanged) |
| `.leaderboard fish/hunt/mine` | ✅ Works | ✅ Works (unchanged) |
| Restart — data persists? | ✅ Yes | ✅ Yes (unchanged) |

---

## 6. Data Flow After Fix

```
User sends .reg Aizen
  → register.js: initUserDB(sender)     — ensures record exists
  → register.js: u.registered = true   — marks as registered
  → register.js: u.name = 'Aizen'      — sets display name
  → register.js: u.badges.push('🌱 Newcomer')
  → register.js: u.money += 100
  → register.js: saveDB(db)            — written to data/database.json ✅
  → register.js: sends confirmation card

User sends .leaderboard
  → getLeaderboard(10)                  — filters registered === true
  → finds 'Aizen' with level X         — appears on board ✅

Bot restarts
  → loadDB() reads data/database.json  — Aizen still registered ✅
```

---

## 7. Related Systems — No Changes Needed

| System | Verdict |
|---|---|
| `_checkBadges()` in database.js | Already handles `🌱 Newcomer` badge condition |
| `addXP()` auto-awards on every command | Already called in `commands.js` |
| `getLeaderboard()` filter | Correct as designed — only registered users rank |
| `initUserDB()` default `registered: false` | Correct — opt-in registration is intended |
| `data/database.json` persistence | Survives restarts — no change needed |
