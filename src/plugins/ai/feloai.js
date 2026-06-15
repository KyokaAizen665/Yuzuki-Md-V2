/**
 * Plugin: feloai
 * Category: ai
 * Status: DISABLED — provider API deprecated 2026-06-15
 *
 * Felo AI anonymous token endpoint now returns HTTP 401 Unauthorized.
 * Anonymous access has been revoked by the provider.
 */

export default {
  name:        'feloai',
  aliases:     ['felo', 'felosearch'],
  category:    'ai',
  description: '[Disabled] Felo AI Search — anonymous access revoked by provider',
  usage:       '.feloai <question>',
  disabled:    true,

  async execute({ reply, settings }) {
    const prefix = settings?.prefix ?? '.';
    await reply(
      `⚠️  *Felo AI — Provider Unavailable*\n` +
      `${'─'.repeat(22)}\n\n` +
      `Felo AI has revoked anonymous access (HTTP 401 Unauthorized).\n` +
      `The token authentication endpoint no longer accepts public requests.\n\n` +
      `_Use these working alternatives:_\n` +
      `• \`${prefix}chatgpt\` — GPT-class AI (free)\n` +
      `• \`${prefix}aichat\` — AI chat with memory (free)\n` +
      `• \`${prefix}explain\` — explain any topic (free)`,
    );
  },
};
