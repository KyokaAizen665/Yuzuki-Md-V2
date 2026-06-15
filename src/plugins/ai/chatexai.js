/**
 * Plugin: chatexai
 * Category: ai
 * Status: DISABLED — provider API deprecated 2026-06-15
 *
 * ChatEx AI anonymous API now returns HTTP 400 / 307 loop.
 * Provider requires authentication that is not publicly available.
 */

export default {
  name:        'chatexai',
  aliases:     ['chatex', 'cx'],
  category:    'ai',
  description: '[Disabled] ChatEx AI — provider API no longer available',
  usage:       '.chatexai <message>',
  disabled:    true,

  async execute({ reply, settings }) {
    const prefix = settings?.prefix ?? '.';
    await reply(
      `⚠️  *ChatEx AI — Provider Unavailable*\n` +
      `${'─'.repeat(22)}\n\n` +
      `ChatEx AI has changed their API and no longer accepts anonymous requests.\n\n` +
      `_Use these working alternatives:_\n` +
      `• \`${prefix}chatgpt\` — GPT-class AI (free)\n` +
      `• \`${prefix}gemini\` — Google Gemini (free)\n` +
      `• \`${prefix}aichat\` — AI chat with memory (free)`,
    );
  },
};
