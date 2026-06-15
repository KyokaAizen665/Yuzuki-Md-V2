/**
 * Plugin: blackjack
 * Category: game
 *
 * Classic Blackjack vs the dealer (bot).
 * Commands:
 *   .blackjack       — start a new game
 *   .blackjack hit   — draw another card
 *   .blackjack stand — end your turn, dealer plays
 *   .blackjack resign — forfeit
 */

import { gameEngine }               from '../../lib/game-engine.js';
import { recordWin, recordLoss, recordDraw } from '../../lib/game-store.js';

const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r+s);
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function handValue(hand) {
  let v = 0, aces = 0;
  for (const c of hand) {
    const r = c.slice(0, -1);
    if (r === 'A') { v += 11; aces++; }
    else if (['J','Q','K'].includes(r)) v += 10;
    else v += parseInt(r);
  }
  while (v > 21 && aces > 0) { v -= 10; aces--; }
  return v;
}

function display(hand, hideSecond = false) {
  if (hideSecond) return `[${hand[0]}] [?]  (${hand[0].slice(0,-1) === 'A' ? 11 : isNaN(parseInt(hand[0].slice(0,-1))) ? 10 : parseInt(hand[0].slice(0,-1))})`;
  return `${hand.join(' ')}  (${handValue(hand)})`;
}

export default {
  name:        'blackjack',
  aliases:     ['bj', '21'],
  category:    'game',
  description: 'Play Blackjack against the dealer',
  usage:       '.blackjack | .blackjack hit | .blackjack stand | .blackjack resign',

  async execute({ reply, args, sender, msg }) {
    const jid     = msg.key.remoteJid;
    const session = gameEngine.get(jid);
    const arg0    = (args[0] ?? '').toLowerCase();
    const name    = msg.pushName ?? sender.split('@')[0];

    if (arg0 === 'resign' || arg0 === 'end') {
      if (!session || session.gameId !== 'blackjack') { await reply('❌ No active Blackjack game.'); return; }
      gameEngine.end(jid);
      recordLoss(sender, 'blackjack', name);
      await reply('🏳️ Game resigned. Better luck next time!');
      return;
    }

    if (arg0 === 'hit' && session?.gameId === 'blackjack') {
      const { deck, playerHand, dealerHand } = session.state;
      playerHand.push(deck.pop());
      const pv = handValue(playerHand);
      if (pv > 21) {
        gameEngine.end(jid);
        recordLoss(sender, 'blackjack', name);
        await reply(`🎴 *Blackjack*\n\nYour hand: ${display(playerHand)}\nDealer: ${display(dealerHand)}\n\n💥 *Bust! You lose, ${name}.*`);
        return;
      }
      gameEngine.update(jid, { deck, playerHand });
      await reply(`🎴 *Blackjack*\n\nYour hand: ${display(playerHand)}\nDealer: ${display(dealerHand, true)}\n\n*.blackjack hit* or *.blackjack stand*`);
      return;
    }

    if (arg0 === 'stand' && session?.gameId === 'blackjack') {
      const { deck, playerHand, dealerHand } = session.state;
      while (handValue(dealerHand) < 17) dealerHand.push(deck.pop());
      const pv = handValue(playerHand);
      const dv = handValue(dealerHand);
      gameEngine.end(jid);
      let result;
      if (dv > 21 || pv > dv) { result = `🎉 *You win, ${name}!* (${pv} vs ${dv})`; recordWin(sender, 'blackjack', name); }
      else if (dv > pv)        { result = `🤖 *Dealer wins.* (${dv} vs ${pv})`;        recordLoss(sender, 'blackjack', name); }
      else                     { result = `🤝 *Push (Draw)!* (${pv} vs ${dv})`;         recordDraw(sender, 'blackjack', name); }
      await reply(`🎴 *Blackjack — Final*\n\nYour hand: ${display(playerHand)}\nDealer: ${display(dealerHand)}\n\n${result}`);
      return;
    }

    // New game
    if (!session) {
      const deck       = makeDeck();
      const playerHand = [deck.pop(), deck.pop()];
      const dealerHand = [deck.pop(), deck.pop()];
      const pv         = handValue(playerHand);

      if (pv === 21) {
        recordWin(sender, 'blackjack', name);
        await reply(`🎴 *Blackjack!*\n\nYour hand: ${display(playerHand)}\nDealer: ${display(dealerHand, true)}\n\n🃏 *Natural Blackjack! ${name} wins!*`);
        return;
      }
      gameEngine.create(jid, 'blackjack', [sender], { deck, playerHand, dealerHand });
      await reply(`🎴 *Blackjack*\n\nYour hand: ${display(playerHand)}\nDealer: ${display(dealerHand, true)}\n\n*.blackjack hit* — draw a card\n*.blackjack stand* — end your turn`);
      return;
    }

    await reply(`🎴 A ${session.gameId} game is active. Use *.${session.gameId} resign* to cancel.`);
  },
};
