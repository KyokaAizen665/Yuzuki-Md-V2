# Yuzuki MD v2 🐋

> **WhatsApp Multi-Device Bot** — built on [Baileys](https://github.com/WhiskeySockets/Baileys), upgraded with AI, media tools, group protection, and a full user economy system.

---

## ✨ What's New in V2

| Feature | V1 | V2 |
|---|---|---|
| AI Assistants | ❌ | ✅ GPT · Claude · Gemini |
| Media Downloaders | ❌ | ✅ TikTok · IG · YouTube · Spotify |
| Group Protection | ❌ | ✅ Anti-link · Toxic filter · Warn/Kick |
| User Database | ❌ | ✅ Levels · XP · Money · Premium |
| Sticker / Image Tools | ❌ | ✅ Sticker · BRAT · QR Code · Pinterest |
| Rate Limiting & Security | ❌ | ✅ Per-user & per-command limiters |
| Reseller System | ❌ | ✅ Keys · Resellers · Limits |
| Deploy Platforms | Pterodactyl only | ✅ Pterodactyl · Railway · Render · Fly.io · Docker |

---

## 📁 Project Structure

```
Yuzuki-Md-V2/
├── src/
│   ├── index.js          # Entry point & process guards
│   ├── bot.js            # Baileys connection + pairing code
│   ├── commands.js       # All command handlers
│   ├── menu.js           # Menu builder (categories + list view)
│   ├── menuImage.js      # Image-based menu renderer
│   ├── settings.js       # JSON settings store (prefix, owners, keys…)
│   ├── server.js         # HTTP keep-alive server
│   ├── lib/
│   │   ├── database.js   # User DB (levels, XP, money, limits)
│   │   ├── maker.js      # Sticker / BRAT / QR code maker
│   │   ├── protect.js    # Anti-link & toxic word detector
│   │   └── scrape/
│   │       ├── tiktok.js
│   │       ├── instagram.js
│   │       ├── youtube.js
│   │       ├── spotify.js
│   │       ├── pinterest.js
│   │       ├── dafont.js
│   │       ├── mathgpt.js
│   │       ├── feloai.js
│   │       └── chatexai.js
│   └── utils/
│       ├── backup.js     # Data backup utility
│       └── security.js   # Rate limiter & concurrency limiter
├── data/                 # Auto-created — settings, DB, groups
├── bot_session/          # Auto-created — WhatsApp session files
├── Dockerfile
├── fly.toml              # Fly.io config
├── railway.toml          # Railway config
├── render.yaml           # Render config
├── egg-whatsapp-bot.json # Pterodactyl egg
└── package.json
```

---

## 🚀 Deployment

### 🐳 Docker
```bash
docker build -t yuzuki-md-v2 .
docker run -e PHONE_NUMBER=628123456789 yuzuki-md-v2
```

### 🚂 Railway
1. Fork this repo
2. Create a new Railway project → **Deploy from GitHub**
3. Add environment variables (see below)
4. Railway auto-deploys on push

### 🎨 Render
1. Create a new **Web Service** on [render.com](https://render.com)
2. Connect this repo — Render will detect `render.yaml` automatically
3. Add environment variables
4. Deploy

### ✈️ Fly.io
```bash
fly launch   # detects fly.toml automatically
fly secrets set PHONE_NUMBER=628123456789
fly deploy
```

### 🦖 Pterodactyl
1. Admin panel → **Nests → Import Egg** → upload `egg-whatsapp-bot.json`
2. Create a new server using the *WhatsApp Baileys Bot* egg
3. Set `PHONE_NUMBER` in server variables
4. Upload all files (excluding `node_modules/`)
5. Run install script → start server
6. A **pairing code** will appear in the console
7. WhatsApp → **Settings → Linked Devices → Link with phone number** → enter code

### 💻 Local
```bash
npm install
PHONE_NUMBER=628123456789 node src/index.js
```
> Requires **Node.js 20+**

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PHONE_NUMBER` | ✅ | Your WhatsApp number, digits only (e.g. `628123456789`) |
| `OPENAI_API_KEY` | Optional | Enables GPT commands |
| `ANTHROPIC_API_KEY` | Optional | Enables Claude commands |
| `GEMINI_API_KEY` | Optional | Enables Gemini commands |
| `LOG_LEVEL` | Optional | `info` (default) · `debug` · `warn` |

---

## 🤖 AI Commands

> Requires the corresponding API key set in environment variables.

| Command | Description |
|---|---|
| `.gpt <text>` | Chat with OpenAI GPT |
| `.claude <text>` | Chat with Anthropic Claude |
| `.gemini <text>` | Chat with Google Gemini |
| `.mathgpt <equation>` | Solve math problems with AI |
| `.feloai <text>` | Felo AI assistant |
| `.chatex <text>` | ChatEx AI assistant |

---

## 📥 Media Downloader Commands

| Command | Description |
|---|---|
| `.tiktok <url>` | Download TikTok video |
| `.ig <url>` | Download Instagram media |
| `.ytmp3 <url>` | Download YouTube audio (MP3) |
| `.ytmp4 <url>` | Download YouTube video (MP4) |
| `.spotify <url>` | Download Spotify track |
| `.spsearch <query>` | Search Spotify |

---

## 🎨 Image & Sticker Tools

| Command | Description |
|---|---|
| `.sticker` | Convert image/video to sticker (reply to media) |
| `.brat <text>` | Make a BRAT-style image |
| `.bratvid <text>` | Make an animated BRAT GIF |
| `.qc <text>` | Generate a quote card |
| `.qr <text>` | Generate a QR code |
| `.pinterest <query>` | Search Pinterest images |
| `.dafont <query>` | Search Dafont fonts |

---

## 🛡️ Group Protection

| Command | Description |
|---|---|
| `.antilink on/off` | Block all links in the group |
| `.antilink gc` | Block WhatsApp group invite links |
| `.antilink tt/ig/yt/fb/tw` | Block platform-specific links |
| `.antilink toxic` | Block custom toxic/bad words |
| `.antilinkaction warn/kick/silent` | Set action on detection |
| `.antilinkwarn <n>` | Set warn limit before kick |
| `.warn @user` | Manually warn a user |
| `.resetwarn @user` | Reset a user's warn count |
| `.welcome on/off` | Toggle welcome messages |

---

## 👥 User Economy & Limits

Every user has a profile with: **Level · XP · Money · Bank · Health · Daily Limits**

| Command | Description |
|---|---|
| `.register` | Register your account |
| `.profile` | View your profile |
| `.balance` | Check money & bank |
| `.daily` | Claim daily reward |
| `.limit` | Check remaining command limit |
| `.buylimit <n>` | Buy extra limits |
| `.mining` | Mine for coins |
| `.transfer @user <amount>` | Send money to a user |

---

## 🔑 Owner Commands

| Command | Description |
|---|---|
| `.setprefix <p>` | Change command prefix |
| `.setowner <number>` | Set primary owner number |
| `.addowner <number> [name]` | Add an owner |
| `.delowner <number>` | Remove an owner |
| `.listowners` | List all owners |
| `.addreseller <number>` | Add a reseller |
| `.delreseller <number>` | Remove a reseller |
| `.addkey <key>` | Add an access key |
| `.delkey <key>` | Remove a key |
| `.setlimit <cmd> <cost>` | Set a command's limit cost |
| `.addcase <trigger> <response>` | Add a custom auto-reply |
| `.delcase <trigger>` | Delete a custom auto-reply |
| `.listcases` | List all custom cases |
| `.setmode private/public` | Set bot to private or public |
| `.antidelete on/off` | Toggle anti-delete |
| `.autoblock on/off` | Auto-block unknown numbers |
| `.gconly on/off` | Groups-only mode |
| `.restart` | Restart the bot |
| `.clearsession` | Clear WhatsApp session |

---

## 🛠️ General Commands

| Command | Description |
|---|---|
| `.menu` | Show command list |
| `.ping` | Check if bot is alive |
| `.alive` | Bot status |
| `.uptime` | How long the bot has been running |
| `.owner` | Show owner info |
| `.speed` | Latency test |
| `.vpsinfo` | Server specs |
| `.totalcmds` | Count of custom cases |

---

## 🗃️ Tech Stack

- **Runtime**: Node.js 20+, ESM (`"type": "module"`)
- **WhatsApp**: [Baileys](https://github.com/WhiskeySockets/Baileys) via `socketon`
- **AI**: OpenAI SDK · Anthropic SDK · Google Generative AI
- **Media**: `@distube/ytdl-core` · `sharp` · `@napi-rs/canvas` · `fluent-ffmpeg`
- **Auth**: Pairing code (no QR scan required)
- **Storage**: JSON flat-file (`data/settings.json`, `data/database.json`, `data/groups.json`)
- **Logging**: `pino` + `chalk` pretty logger

---

## 📝 License

MIT — use freely, credit appreciated.
