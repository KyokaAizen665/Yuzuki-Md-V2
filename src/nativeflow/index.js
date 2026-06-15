/**
 * NativeFlow Integration — Public API
 *
 * Single import point for all NativeFlow card generators.
 * Import from here — never from the individual sub-modules.
 *
 * ─── Base cards (src/nativeflow/cards.js) ─────────────────────────────────────
 *
 *   helpCard(sock, jid, msg, opts?)
 *     Main help overview — all categories in a select list.
 *     Counts and icons come from the registry + CATEGORY_META.
 *
 *   categoryCard(sock, jid, msg, categoryKey, opts?)
 *     One category — commands listed with a select-to-detail button.
 *
 *   commandCard(sock, jid, msg, cmdObj, opts?)
 *     Single command: Copy Usage + Copy Command buttons.
 *
 *   pluginCard(sock, jid, msg, cmdObj, opts?)
 *     Alias for commandCard.
 *
 *   searchCard(sock, jid, msg, query, opts?)
 *     Full-text registry search results in a select card.
 *
 *   didYouMeanCard(sock, jid, msg, query, suggestions, opts?)
 *     "Did you mean?" select card from pre-fetched suggestions.
 *
 * ─── Carousel (src/nativeflow/carousel.js) ────────────────────────────────────
 *
 *   allMenuCarousel(sock, jid, msg, opts?)
 *     Swipeable carousel — 2 categories per card, image headers,
 *     optional CTA buttons. Falls back to plain text on failure.
 *
 * ─── Advanced UI (src/nativeflow/ui.js) ───────────────────────────────────────
 *
 *   pluginDetailCard(sock, jid, msg, cmdNameOrObj, opts?)
 *     Rich plugin metadata: description, aliases, permissions, deps,
 *     examples, rate limit, related-commands select list.
 *
 *   workflowCard(sock, jid, msg, workflowName, opts?)
 *     Single interactive workflow: step names, timeout, start command.
 *
 *   workflowListCard(sock, jid, msg, opts?)
 *     All registered workflows as a select list.
 *
 *   gameCard(sock, jid, msg, gameId, opts?)
 *     Single game: name, description, players, timeout, rewards.
 *
 *   gameListCard(sock, jid, msg, opts?)
 *     All registered games as a select list.
 *
 *   leaderboardCard(sock, jid, msg, gameId, opts?)
 *     Ranked player list with medals, win rates, play counts.
 *
 *   playerStatsCard(sock, jid, msg, playerJid, displayName?, opts?)
 *     Individual player stats across all games + per-game breakdown.
 *
 * ─── Common opts shape ────────────────────────────────────────────────────────
 *
 *   { prefix: string, botName: string }
 *
 * ─── Return shape (all functions) ─────────────────────────────────────────────
 *
 *   { ok: true,  sent: <WAMessage> }
 *   { ok: false, error: <Error>, fallbackSent?: <WAMessage> }
 */

// ─── Base cards ───────────────────────────────────────────────────────────────
export {
  helpCard,
  categoryCard,
  commandCard,
  pluginCard,
  searchCard,
  didYouMeanCard,
} from './cards.js';

// ─── Carousel ─────────────────────────────────────────────────────────────────
export { allMenuCarousel } from './carousel.js';

// ─── Advanced UI cards ────────────────────────────────────────────────────────
export {
  pluginDetailCard,
  workflowCard,
  workflowListCard,
  gameCard,
  gameListCard,
  leaderboardCard,
  playerStatsCard,
} from './ui.js';
