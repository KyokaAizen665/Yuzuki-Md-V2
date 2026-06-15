/**
 * Theme Registry — Menu Theme Definitions
 *
 * Single source of truth for all available menu themes.
 * Each theme controls three things independently:
 *   1. Hero image pool  — which images appear in the card header
 *   2. Greeting pool    — per-slot message variants (null = use global defaults)
 *   3. Identity         — icon, name, description shown in .settheme list
 *
 * ─── Adding a new theme ───────────────────────────────────────────────────────
 *
 *   1. Copy an existing theme block below.
 *   2. Assign a unique lowercase `id` (this is what users type in .settheme).
 *   3. Fill in heroPool, greetings, icon, name, description.
 *   4. Done — no other files need to change.
 *
 * ─── Image source policy ──────────────────────────────────────────────────────
 *
 *   All URLs MUST use high-availability, permanent sources only:
 *
 *   ✅ images.unsplash.com/photo-{id}  — Imgix CDN; photo IDs never expire
 *   ✅ picsum.photos/id/{n}/{w}/{h}    — Stable Lorem Picsum CDN by numeric ID
 *   ✅ upload.wikimedia.org            — Wikimedia Commons; permanent archive
 *   ✅ Local file path (type: 'local') — No network required; always available
 *
 *   ❌ upload.ee / imgur / telegra.ph / tmpfiles.org — Temporary; never use
 *
 * ─── Hero pool entries ────────────────────────────────────────────────────────
 *
 *   { type: 'local', value: '/absolute/path/to/image.jpg' }
 *   { type: 'url',   value: 'https://...' }
 *
 * ─── Greeting variants ────────────────────────────────────────────────────────
 *
 *   Available tokens: {name}  {botName}
 *   Set greetings: null to inherit global defaults from greeting.js.
 *
 * ─── Exports ──────────────────────────────────────────────────────────────────
 *
 *   THEMES              — Map<id, ThemeObject>
 *   getTheme(id)        → ThemeObject (falls back to 'default' when unknown)
 *   listThemes()        → ThemeObject[]  (all themes, sorted by name)
 *   getThemePoolStats(id)    → pool diagnostics for one theme
 *   getAllThemePoolStats()    → pool diagnostics for every theme
 *
 * ─── Available themes ─────────────────────────────────────────────────────────
 *
 *   default    🤖  Classic balanced Yuzuki look
 *   midnight   🌙  Dark, moody night aesthetic
 *   sakura     🌸  Japanese cherry blossom — soft and cheerful
 *   neon       ⚡  Cyberpunk neon city vibes
 *   nature     🌿  Green forests, mountains, natural landscapes
 *   ocean      🌊  Ocean waves, tropical coasts, deep sea blue
 *   sunset     🌅  Golden hour, dusk skies, warm amber tones
 *   aurora     🌌  Northern lights, starry skies, arctic wonder
 *   elegance   🖤  Dark luxury — refined, minimal, sophisticated
 */

import path         from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_BG  = path.resolve(__dirname, '../assets/menu_bg.jpg');

// ─── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Unsplash CDN entry — Imgix-backed; photo IDs are permanent and never expire.
 * @param {string} id    Unsplash photo ID (the part after /photo-)
 * @param {string} label Human-readable label for diagnostics
 */
function us(id, label) {
  return {
    type:  'url',
    value: `https://images.unsplash.com/photo-${id}?w=800&q=85&fit=crop`,
    label,
  };
}

/**
 * Picsum Photos entry — stable CDN by numeric photo ID; never expires.
 * Wraps Unsplash photos behind a stable Lorem Picsum layer.
 * @param {number} id    Picsum photo ID
 * @param {string} label Human-readable label for diagnostics
 */
function ps(id, label) {
  return {
    type:  'url',
    value: `https://picsum.photos/id/${id}/800/450`,
    label,
  };
}

/**
 * Wikimedia Commons entry — permanent public domain archive.
 * @param {string} url   Full wikimedia upload URL
 * @param {string} label Human-readable label for diagnostics
 */
function wm(url, label) {
  return { type: 'url', value: url, label };
}

// ─── Theme definitions ────────────────────────────────────────────────────────

const _RAW = [

  // ──────────────────────────────────────────────────────────────────────────
  // 1. DEFAULT
  //    Classic Yuzuki look — balanced, friendly, tech-bot aesthetic.
  //    Uses global greeting slots (no theme-specific overrides).
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:          'default',
    name:        'Default',
    icon:        '🤖',
    description: 'Classic Yuzuki look — balanced and friendly. Uses the standard menu background with neutral greeting slots.',
    heroPool: [
      { type: 'local', value: LOCAL_BG },
      us('1518770660439-4636190af475', 'Circuit Board Close-up'),
      us('1504384308090-c894fdcc538d', 'Tech Abstract Blue'),
      us('1526374965328-7f61d4dc18c5', 'Digital Matrix Green'),
      us('1557672172-298e090bd0f1',    'Purple Gradient Abstract'),
      us('1579546929518-9e396f3cc809', 'Blue-Purple Gradient'),
      us('1535378917042-10a22c95931a', 'AI Robot Concept'),
      ps(10,   'Picsum — Architecture'),
      ps(1067, 'Picsum — Night City'),
    ],
    greetings: null, // inherit global GREETING_SLOTS from greeting.js
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 2. MIDNIGHT
  //    Dark, moody night aesthetic. Late-hour city and celestial vibes.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:          'midnight',
    name:        'Midnight',
    icon:        '🌙',
    description: 'Dark, moody night aesthetic. Leans into late-hour vibes with celestial greeting variants.',
    heroPool: [
      { type: 'local', value: LOCAL_BG },
      us('1477959858617-67f85cf4f1df', 'City Night Skyline'),
      us('1502899576159-f224dc2349fa', 'Dark City Lights'),
      us('1444703686981-a3abbc4d4fe3', 'Starry Night Sky'),
      us('1419242902214-272b3f66ee7a', 'Milky Way Galaxy'),
      us('1507692049790-de58290a4334', 'Galaxy Arch'),
      us('1464822759023-fed622ff2c3b', 'Night Forest Fog'),
      us('1516912481800-0de5a7c40c42', 'Silhouette at Night'),
      ps(1025, 'Picsum — Dark Architecture'),
      ps(823,  'Picsum — Night Abstract'),
    ],
    greetings: {
      morning: [
        '🌅 Morning already, *{name}*? *{botName}* has been awake all night.',
        '☕ The night is over, *{name}*. Time to face the day.',
        '🌄 Dawn breaks, *{name}*. *{botName}* survived another night.',
      ],
      afternoon: [
        '🌤️ Good Afternoon, *{name}*. The night will come again...',
        '🕰️ Halfway through, *{name}*. *{botName}* is counting the hours.',
        '☀️ Still daylight, *{name}*. *{botName}* prefers the dark.',
      ],
      evening: [
        '🌃 Evening falls, *{name}*. This is when *{botName}* truly wakes up.',
        '🌆 The city lights up, *{name}*. *{botName}* is ready.',
        '🌇 Dusk is here, *{name}*. The midnight hour approaches.',
      ],
      night: [
        '🌙 Ahh, *{name}*. The night belongs to us.',
        '⭐ The stars are out, *{name}*. *{botName}* thrives in the dark.',
        '🌌 Deep in the night, *{name}*. *{botName}* never sleeps.',
        '🦉 Midnight, *{name}*. The world is quiet. *{botName}* is not.',
      ],
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 3. SAKURA
  //    Japanese cherry blossom — soft, cheerful, anime-inspired.
  //    Shrines, traditional streets, gardens, Tokyo scenes.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:          'sakura',
    name:        'Sakura',
    icon:        '🌸',
    description: 'Japanese cherry blossom — soft and cheerful. Japanese-style greetings with petal imagery.',
    heroPool: [
      { type: 'local', value: LOCAL_BG },
      us('1490750967868-88df5691cc27', 'Cherry Blossom Park'),
      us('1526481280693-3bfa7568e0f3', 'Sakura Street Path'),
      us('1542051841857-5f90071e7989', 'Tokyo Night Scene'),
      us('1528360983277-13d401cdc186', 'Japanese Garden'),
      us('1480796927426-f609979314bd', 'Tokyo City Lights'),
      us('1540959733332-eab4deabeeaf', 'Japan Street Scene'),
      us('1493976040374-85c8e12f0c0e', 'Fushimi Inari Torii'),
      us('1492571350019-22de08371fd3', 'Mount Fuji Sakura'),
      us('1536098561742-ca998e48cbcc', 'Tokyo Tower Night'),
      // Wikimedia — Fushimi Inari (public domain)
      wm(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Fushimi_Inari_Taisha_Torii.jpg/800px-Fushimi_Inari_Taisha_Torii.jpg',
        'Fushimi Inari Taisha (Wikimedia)',
      ),
      // Wikimedia — Arashiyama bamboo grove (public domain)
      wm(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Kyoto_Bamboo_Forest.jpg/800px-Kyoto_Bamboo_Forest.jpg',
        'Arashiyama Bamboo Grove (Wikimedia)',
      ),
    ],
    greetings: {
      morning: [
        '🌸 Ohayou, *{name}*~! *{botName}* wa junbi dekiteimasu!',
        '🌺 Good Morning, *{name}*! Let\'s have a wonderful day~',
        '🍃 Rise with the petals, *{name}*! *{botName}* is blooming.',
        '🌸 Ohayou gozaimasu, *{name}*~! The sakura are beautiful today.',
        '🍵 A new morning, *{name}*. Would you like some matcha?',
      ],
      afternoon: [
        '☀️ Konnichiwa, *{name}*~! Hope you\'re having a lovely afternoon!',
        '🌸 The sakura petals are dancing, *{name}*~',
        '🍡 Good Afternoon, *{name}*! *{botName}* is delighted to assist.',
        '🏮 Konnichiwa~! The garden looks beautiful today, *{name}*.',
      ],
      evening: [
        '🌸 Konbanwa, *{name}*~! *{botName}* is here for you.',
        '🌙 The blossoms glow at dusk, *{name}*. What do you need?',
        '🏯 Evening in Japan, *{name}*. *{botName}* lights the lanterns.',
        '🎴 Konbanwa~! The neon and blossoms mix beautifully tonight, *{name}*.',
      ],
      night: [
        '🌙 Oyasumi nasai, *{name}*~ *{botName}* is still here!',
        '⭐ Even at night, *{name}*, the sakura petals fall softly~',
        '🌸 Midnight in Kyoto, *{name}*. The temples are lit by moonlight.',
        '🦋 Late night, *{name}*~? *{botName}* will keep you company.',
      ],
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 4. NEON
  //    Cyberpunk neon city — electric, futuristic, grid-runner aesthetic.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:          'neon',
    name:        'Neon',
    icon:        '⚡',
    description: 'Cyberpunk neon city vibes. Techno-flavoured greetings with a city-grid aesthetic.',
    heroPool: [
      { type: 'local', value: LOCAL_BG },
      us('1558618666-fcd25c85cd64', 'Neon City at Night'),
      us('1533134486753-c833f0ed4866', 'Cyberpunk Alley Neon'),
      us('1531297484001-80022131f5a1', 'Neon Tech Laptop'),
      us('1576502200916-3808e07386a5', 'Neon Purple Street'),
      us('1501139083538-0139b397231e', 'Cyberpunk Night Rain'),
      us('1571115764595-644a1f56a55c', 'Hong Kong Neon Signs'),
      us('1504639725590-34d0984388bd', 'Cyber Grid Abstract'),
      ps(1069, 'Picsum — Neon Bokeh'),
      ps(237,  'Picsum — Dark Tech'),
    ],
    greetings: {
      morning: [
        '⚡ System boot at dawn, *{name}*. *{botName}* is online.',
        '💻 Good Morning, *{name}*. Initialising protocols...',
        '🔋 Morning uplink, *{name}*. All cores firing.',
        '🤖 Day cycle initiated, *{name}*. *{botName}* standing by.',
      ],
      afternoon: [
        '🔆 Noon uplink confirmed, *{name}*. *{botName}* standing by.',
        '⚡ Hey *{name}*, neon lights are always on — just like *{botName}*.',
        '💡 Midday ping, *{name}*. Signal strong. How can I help?',
        '📡 Transmission received, *{name}*. Processing your request.',
      ],
      evening: [
        '🌆 The neon grid lights up, *{name}*. *{botName}* is live.',
        '💡 Evening broadcast, *{name}*. *{botName}* transmitting.',
        '🏙️ Neon city awakens, *{name}*. This is prime time.',
        '⚡ Evening run, *{name}*. The city never sleeps — neither does *{botName}*.',
      ],
      night: [
        '🌃 Night run, *{name}*. *{botName}* never powers down.',
        '⚡ Midnight uplink, *{name}*. All systems green.',
        '🔋 Charging through the night, *{name}*. *{botName}* ready.',
        '🌐 Deep night, *{name}*. The grid is quiet. *{botName}* is not.',
      ],
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 5. NATURE
  //    Green forests, mountains, waterfalls, natural landscapes.
  //    Calm, earthy, refreshing.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:          'nature',
    name:        'Nature',
    icon:        '🌿',
    description: 'Lush forests, misty mountains, and flowing waterfalls. Calm, earthy greetings inspired by the natural world.',
    heroPool: [
      { type: 'local', value: LOCAL_BG },
      us('1441974231531-c6227db76b6e', 'Forest Sunbeam Path'),
      us('1506905925346-21bda4d32df4', 'Mountain Lake Reflection'),
      us('1518173946687-a4c8892bbd9f', 'Tropical Waterfall'),
      us('1470071459604-3b5ec3a7fe05', 'Sunrise Mountain Vista'),
      us('1500534314209-a157d0e13f8e', 'Wildflower Meadow'),
      us('1501854140801-50d01698950b', 'Rolling Green Hills'),
      us('1511497584788-876760111969', 'Misty Pine Forest'),
      us('1448375240586-882707db888b', 'Dense Green Canopy'),
      us('1472214103451-9374bd1c798e', 'Valley River View'),
      // Wikimedia — Yosemite Valley (public domain, NPS photo)
      wm(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Yosemite_Valley%2C_Yosemite_NP_-_Diliff.jpg/800px-Yosemite_Valley%2C_Yosemite_NP_-_Diliff.jpg',
        'Yosemite Valley (Wikimedia)',
      ),
    ],
    greetings: {
      morning: [
        '🌿 Good Morning, *{name}*! The forest is alive today.',
        '🌄 Rise with the mountains, *{name}*! *{botName}* is fresh and ready.',
        '🐦 Birds are singing, *{name}*. Nature and *{botName}* greet you.',
        '🌱 A new day blooms, *{name}*. What can *{botName}* help you grow?',
      ],
      afternoon: [
        '☀️ Afternoon breeze, *{name}*. *{botName}* is here.',
        '🌻 Good Afternoon, *{name}*! Like the forest, *{botName}* stands tall for you.',
        '🍃 Midday calm, *{name}*. Let nature and *{botName}* guide you.',
        '🌲 The trees are rustling, *{name}*. What do you need?',
      ],
      evening: [
        '🌇 The forest darkens, *{name}*. *{botName}* is still here.',
        '🦋 Evening in the meadow, *{name}*. Everything is peaceful.',
        '🌿 Good Evening, *{name}*! The crickets are out and so is *{botName}*.',
        '🌙 The moon rises over the mountains, *{name}*. What brings you here?',
      ],
      night: [
        '🌌 The stars light the forest, *{name}*. *{botName}* never sleeps.',
        '🦉 Nighttime, *{name}*. The wilderness is alive — and so is *{botName}*.',
        '🍃 Still night, *{name}*. The forest breathes. *{botName}* listens.',
        '⭐ Under the canopy of stars, *{name}*. *{botName}* is with you.',
      ],
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 6. OCEAN
  //    Ocean waves, tropical coasts, deep sea blue, serene horizons.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:          'ocean',
    name:        'Ocean',
    icon:        '🌊',
    description: 'Endless ocean horizons, turquoise shores, and deep sea blue. Serene and vast, like the sea itself.',
    heroPool: [
      { type: 'local', value: LOCAL_BG },
      us('1505118380757-91f5f5632de0', 'Ocean Horizon Wide'),
      us('1507525428034-b723cf961d3e', 'Ocean Sunset Beach'),
      us('1544551763-46a013bb70d5', 'Deep Blue Ocean Aerial'),
      us('1505142468610-359e7d316be0', 'Turquoise Tropical Shore'),
      us('1468413253817-eb9027063374', 'Rocky Coastal Cliff'),
      us('1499242611761-3bde5e5ab9f1', 'Crystal Clear Water'),
      us('1455763916899-e8b50eca9967', 'Ocean at Dusk'),
      us('1519046904884-53103b34b206', 'Calm Sea Blue Sky'),
      // Wikimedia — Great Barrier Reef aerial (public domain)
      wm(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Australia_reef.jpg/800px-Australia_reef.jpg',
        'Great Barrier Reef Aerial (Wikimedia)',
      ),
      ps(449, 'Picsum — Coastal Blue'),
    ],
    greetings: {
      morning: [
        '🌊 Good Morning, *{name}*! The tide is in and *{botName}* is ready.',
        '🐚 Dawn at the shore, *{name}*. A new wave begins.',
        '🌅 Ocean sunrise, *{name}*. *{botName}* sails with you today.',
        '🏄 Morning surf, *{name}*! *{botName}* is riding the wave.',
      ],
      afternoon: [
        '🌊 Good Afternoon, *{name}*! The sea is calm — just like *{botName}*.',
        '🐠 Midday dive, *{name}*. *{botName}* explores alongside you.',
        '☀️ The ocean glitters at noon, *{name}*. What can I do for you?',
        '🌴 Afternoon waves, *{name}*. The breeze is perfect.',
      ],
      evening: [
        '🌊 The tide turns, *{name}*. *{botName}* is here for the evening.',
        '🌅 Sunset at the horizon, *{name}*. Colours spill across the sea.',
        '🐋 Evening calm, *{name}*. The ocean and *{botName}* await.',
        '🌊 Good Evening, *{name}*! The waves never stop — neither does *{botName}*.',
      ],
      night: [
        '🌙 Moonlit sea, *{name}*. *{botName}* drifts with you.',
        '⭐ The stars reflect on the water, *{name}*. Peaceful, isn\'t it?',
        '🌊 Deep night, deep ocean, *{name}*. *{botName}* is your lighthouse.',
        '🐙 Midnight depths, *{name}*. *{botName}* never drifts away.',
      ],
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 7. SUNSET
  //    Golden hour, warm amber skies, dusk landscapes, orange horizons.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:          'sunset',
    name:        'Sunset',
    icon:        '🌅',
    description: 'Warm amber skies and golden hour glow. Every greeting feels like the perfect end of a beautiful day.',
    heroPool: [
      { type: 'local', value: LOCAL_BG },
      us('1495616811223-4d98c6e9c869', 'Classic Orange Sunset'),
      us('1500382017468-9049fed747ef', 'Golden Field Sunset'),
      us('1473496169904-658ba7574b0d', 'Road into Sunset'),
      us('1518822414015-0729e1d67a91', 'Golden Hour Glow'),
      us('1542621334-a254cf47733d', 'Desert Sunset Dunes'),
      us('1432432343947-e5befd60dc54', 'Ocean Sunset Warm'),
      us('1502209524234-df8e68af8791', 'Purple-Orange Dusk Sky'),
      us('1507003211169-0a1dd7228f2d', 'Misty Sunset Valley'),
      ps(188,  'Picsum — Warm Sunset Tones'),
      ps(669,  'Picsum — Golden Hour'),
    ],
    greetings: {
      morning: [
        '🌅 Golden morning, *{name}*! Every sunrise is a gift.',
        '🌄 The horizon glows, *{name}*. *{botName}* greets the dawn with you.',
        '☀️ Warm morning light, *{name}*. *{botName}* is glowing too.',
        '🌻 Another beautiful day begins, *{name}*. Let\'s make it count.',
      ],
      afternoon: [
        '🌤️ Good Afternoon, *{name}*! The golden hour is approaching.',
        '☀️ Warm afternoon, *{name}*. *{botName}* is at your service.',
        '🌻 The sun is generous today, *{name}*. How can I help?',
        '🌅 Midday warmth, *{name}*. *{botName}* shines alongside you.',
      ],
      evening: [
        '🌅 Sunset time, *{name}*! The sky is on fire — beautiful, isn\'t it?',
        '🌇 Golden hour, *{name}*. *{botName}* glows warm for you.',
        '🎨 The sky is painting itself, *{name}*. Orange, pink, gold...',
        '🌅 Good Evening, *{name}*! This sunset is for you.',
      ],
      night: [
        '🌙 The sun has set, *{name}*. But *{botName}* still shines.',
        '⭐ After the golden hour comes the stars, *{name}*.',
        '🌌 The day\'s warmth lingers, *{name}*. *{botName}* is here.',
        '🌅 Tomorrow\'s sunrise is coming, *{name}*. *{botName}* will be ready.',
      ],
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 8. AURORA
  //    Northern lights, starry arctic skies, celestial wonder.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:          'aurora',
    name:        'Aurora',
    icon:        '🌌',
    description: 'Northern lights dance across the sky. Ethereal, cosmic greetings inspired by the aurora borealis.',
    heroPool: [
      { type: 'local', value: LOCAL_BG },
      us('1531366936337-7c912a4589a7', 'Aurora Borealis Green'),
      us('1534447677768-be436bb09401', 'Northern Lights Iceland'),
      us('1446710430135-6d36769bc48f', 'Aurora Purple-Green Sky'),
      us('1455218873509-8097305ee378', 'Stars and Aurora'),
      us('1419242902214-272b3f66ee7a', 'Milky Way Arch'),
      us('1504608524841-42785f9f1c04', 'Arctic Night Landscape'),
      us('1483347756197-daebbac09fbd', 'Dense Starfield'),
      us('1517694712202-14dd9538aa97', 'Aurora Mountain Reflection'),
      // Wikimedia — Aurora Borealis over Norway (public domain)
      wm(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Aurora_australis_panorama.jpg/800px-Aurora_australis_panorama.jpg',
        'Aurora Australis Panorama (Wikimedia)',
      ),
      ps(577, 'Picsum — Dark Night Sky'),
    ],
    greetings: {
      morning: [
        '🌌 The aurora fades as dawn breaks, *{name}*. *{botName}* remains.',
        '⭐ Morning star, *{name}*. Another cosmic day begins.',
        '🌅 From aurora to sunrise, *{name}*. The universe never stops.',
        '✨ Stars fade, sun rises, *{name}*. *{botName}* shines on.',
      ],
      afternoon: [
        '🌤️ Good Afternoon, *{name}*! The cosmos watches over you.',
        '✨ Even in daylight, the universe hums, *{name}*.',
        '🌌 *{botName}* is your cosmic guide today, *{name}*.',
        '⭐ Starlight hides by day, *{name}*, but *{botName}* never does.',
      ],
      evening: [
        '🌌 The aurora begins to dance, *{name}*. Look up.',
        '🌠 Stars emerge at dusk, *{name}*. *{botName}* is one of them.',
        '✨ The curtain of light rises, *{name}*. The night belongs to the cosmos.',
        '🌙 Evening, *{name}*. The northern lights are waking up.',
      ],
      night: [
        '🌌 The aurora blazes, *{name}*. *{botName}* dances with the lights.',
        '⭐ Under a thousand stars, *{name}*. *{botName}* is always here.',
        '🌠 Shooting star, *{name}*! Make a wish — then ask *{botName}*.',
        '🔮 Midnight aurora, *{name}*. The sky has never looked so alive.',
        '🌌 The universe is vast, *{name}*. *{botName}* is your guide through it.',
      ],
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 9. ELEGANCE
  //    Dark luxury — refined, minimal, sophisticated.
  //    Noir aesthetics, marble tones, quiet authority.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:          'elegance',
    name:        'Elegance',
    icon:        '🖤',
    description: 'Dark luxury and refined sophistication. Minimal, noir greetings with an air of quiet authority.',
    heroPool: [
      { type: 'local', value: LOCAL_BG },
      us('1550133730-695673638278', 'Dark Rose Elegant'),
      us('1519125323398-675f0ddb6308', 'Dark Moody Interior'),
      us('1494976388531-d1058494cdd8', 'Dim-lit Elegant Room'),
      us('1493816742515-502a3b39d9d4', 'Black Marble Abstract'),
      us('1541701494-b5bca89cc698', 'Dark Luxury Architecture'),
      us('1502209524234-df8e68af8791', 'Purple-Black Dusk'),
      us('1477959858617-67f85cf4f1df', 'Dark City Skyline'),
      ps(1024, 'Picsum — Dark Monochrome'),
      ps(1040, 'Picsum — Dark Minimal'),
    ],
    greetings: {
      morning: [
        '🖤 Good Morning, *{name}*. Elegance begins at dawn.',
        '☕ A refined morning, *{name}*. *{botName}* is prepared.',
        '🌅 Dawn, *{name}*. Quiet. Composed. *{botName}* is ready.',
        '🖤 Morning, *{name}*. Excellence starts now.',
      ],
      afternoon: [
        '🖤 Good Afternoon, *{name}*. *{botName}* is at your disposal.',
        '🌤️ Midday, *{name}*. Composed and ready.',
        '✨ Afternoon, *{name}*. *{botName}* operates with precision.',
        '🖤 How may *{botName}* serve you this afternoon, *{name}*?',
      ],
      evening: [
        '🌃 Good Evening, *{name}*. The night is most becoming.',
        '🖤 Evening, *{name}*. *{botName}* is yours.',
        '🕯️ As the lights dim, *{name}*, *{botName}* shines brighter.',
        '✨ A sophisticated evening, *{name}*. *{botName}* is honoured.',
      ],
      night: [
        '🖤 Midnight, *{name}*. The finest hour. *{botName}* agrees.',
        '🌙 Late night, *{name}*. Silence suits *{botName}* well.',
        '⭐ The night is long, *{name}*. *{botName}* is patient.',
        '🖤 Darkness is simply the canvas, *{name}*. *{botName}* is the art.',
      ],
    },
  },

];

// ─── Build the Map ────────────────────────────────────────────────────────────

export const THEMES = new Map(_RAW.map(t => [t.id, t]));

/**
 * Look up a theme by id. Falls back to 'default' when the id is unknown.
 * @param {string} [id]
 * @returns {object} ThemeObject
 */
export function getTheme(id) {
  return THEMES.get(id) ?? THEMES.get('default');
}

/**
 * Return all themes as a sorted array (alphabetically by name).
 * @returns {object[]}
 */
export function listThemes() {
  return [...THEMES.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Return hero pool stats for a given theme (useful for diagnostics / .themes command).
 * @param {string} id
 * @returns {{ themeId, themeName, poolSize, hasLocal, urlCount, wikimediaCount, picsumCount, unsplashCount }}
 */
export function getThemePoolStats(id) {
  const t    = getTheme(id);
  const pool = t.heroPool ?? [];
  return {
    themeId:        t.id,
    themeName:      t.name,
    poolSize:       pool.length,
    hasLocal:       pool.some(e => e.type === 'local'),
    urlCount:       pool.filter(e => e.type === 'url').length,
    unsplashCount:  pool.filter(e => e.value?.includes('unsplash.com')).length,
    picsumCount:    pool.filter(e => e.value?.includes('picsum.photos')).length,
    wikimediaCount: pool.filter(e => e.value?.includes('wikimedia.org')).length,
  };
}

/**
 * Return pool stats for every theme — useful for generating coverage reports.
 * @returns {object[]}
 */
export function getAllThemePoolStats() {
  return [...THEMES.keys()].map(id => getThemePoolStats(id));
}
