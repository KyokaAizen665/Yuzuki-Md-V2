/**
 * Plugin: news
 * Category: tools
 *
 * Latest headlines from BBC News RSS (free, no API key).
 * Categories: general, world, tech, business, science, sport, health, entertainment.
 *
 * Usage:
 *   .news
 *   .news tech
 *   .news world
 *   .news business
 *
 * VRS: heroType 'utility' — abstract/general purpose imagery
 */

import { httpGetText, parseRss }          from '../../lib/utility.js';
import { sendHeroCard, copyButton }       from '../../lib/visual-response.js';
import { selectButton }                   from '../../message-engine/index.js';

const FEEDS = {
  general:       { url: 'https://feeds.bbci.co.uk/news/rss.xml',                         label: '📰 Top News'       },
  world:         { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                   label: '🌍 World News'     },
  tech:          { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',              label: '💻 Technology'     },
  business:      { url: 'https://feeds.bbci.co.uk/news/business/rss.xml',                label: '💼 Business'       },
  science:       { url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', label: '🔬 Science'        },
  sport:         { url: 'https://feeds.bbci.co.uk/sport/rss.xml',                        label: '⚽ Sports'         },
  health:        { url: 'https://feeds.bbci.co.uk/news/health/rss.xml',                  label: '🏥 Health'         },
  entertainment: { url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',  label: '🎬 Entertainment'  },
};

const ALIASES = {
  technology: 'tech', it: 'tech', coding: 'tech', dev: 'tech',
  economy: 'business', finance: 'business', market: 'business', financial: 'business',
  sports: 'sport', football: 'sport', soccer: 'sport',
  politics: 'world', international: 'world', global: 'world',
  env: 'science', environment: 'science', climate: 'science',
  medical: 'health', medicine: 'health',
  music: 'entertainment', movies: 'entertainment', film: 'entertainment', arts: 'entertainment',
};

export default {
  name:        'news',
  aliases:     ['headlines', 'breaking', 'newsfeed'],
  category:    'tools',
  description: 'Latest headlines from BBC News — 8 categories, always free',
  usage:       '.news [category]',

  async execute({ sock, msg, reply, args, settings, prefix }) {
    const jid = msg.key.remoteJid;

    const raw = (args[0] ?? '').toLowerCase().trim();
    const cat = ALIASES[raw] ?? raw;

    // ── Show category menu if no args ────────────────────────────────────────
    if (!raw) {
      const categoryRows = Object.entries(FEEDS).map(([key, { label }]) => ({
        title:       label,
        rowId:       `${prefix}news ${key}`,
        description: `Latest ${label.replace(/^[^\s]+\s/, '')} headlines`,
      }));

      await sendHeroCard(sock, jid, msg, {
        body:
          `📰 *Yuzuki News*\n${'─'.repeat(22)}\n\n` +
          `Stay informed with the latest headlines.\n\n` +
          `Select a category below or use:\n\`${prefix}news <category>\``,
        footer:   settings?.botName ?? 'Yuzuki MD',
        heroType: 'utility',
        settings,
        forceHero: true,
        buttons:  [selectButton('📂 Choose Category', categoryRows, 'News Categories')],
        fallback: `📰 *Yuzuki News*\n\nCategories: ${Object.keys(FEEDS).join(', ')}\n\nUsage: \`${prefix}news <category>\``,
      });
      return;
    }

    const feed         = FEEDS[cat] ?? FEEDS.general;
    const feedKey      = FEEDS[cat] ? cat : 'general';
    const usedFallback = !FEEDS[cat] && raw;

    try { await sock.sendPresenceUpdate('composing', jid); } catch {}

    let items;
    try {
      const xml = await httpGetText(feed.url, { timeout: 12000 });
      items = parseRss(xml, 8);
    } catch {
      await reply(`❌ News feed unavailable. Try again later.`);
      return;
    }

    try { await sock.sendPresenceUpdate('paused', jid); } catch {}

    if (!items.length) {
      await reply(`❌ No headlines found for *${feed.label}*. Try again later.`);
      return;
    }

    const lines = items.map((item, i) =>
      `*${i + 1}.* ${item.title}${item.link ? `\n    🔗 ${item.link}` : ''}`,
    );

    const note   = usedFallback ? `\n_Showing top news — category "${raw}" not found_` : '';
    const footer = `\n_Source: BBC News · ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}_`;
    const body   = `${feed.label}\n${'─'.repeat(22)}\n\n${lines.join('\n\n')}${note}${footer}`;

    const otherFeeds = Object.entries(FEEDS)
      .filter(([k]) => k !== feedKey)
      .slice(0, 5)
      .map(([k, { label }]) => ({
        title:       label,
        rowId:       `${prefix}news ${k}`,
        description: `Switch to ${label.replace(/^[^\s]+\s/, '')}`,
      }));

    await sendHeroCard(sock, jid, msg, {
      body,
      footer:   settings?.botName ?? 'Yuzuki MD',
      heroType: 'utility',
      settings,
      buttons:  [
        copyButton('📋 Copy Headlines', body),
        selectButton('📂 More Categories', otherFeeds, 'Switch Category'),
      ],
      fallback: body,
    });
  },
};
