/**
 * ChatEx AI scraper — DEPRECATED
 *
 * Status: BROKEN as of 2026-06-15
 *
 * Reason: The ChatEx AI API endpoint (https://chatex.ai/api/chat) now issues
 * a 307 redirect to www.chatex.ai. The www endpoint returns HTTP 400 for all
 * POST requests, indicating the API format or authentication requirements have
 * changed. The fallback endpoint (v1/chat/completions) has the same issue.
 * No anonymous access is available.
 *
 * Action: Exports a stub that throws a clear ProviderUnavailable error.
 *         The chatexai plugin will surface this as a user-facing message.
 */

export class ProviderUnavailableError extends Error {
  constructor(provider, reason) {
    super(`${provider} is currently unavailable: ${reason}`);
    this.name   = 'ProviderUnavailableError';
    this.provider = provider;
  }
}

/**
 * @throws {ProviderUnavailableError} always
 */
export async function chatex(_prompt) {
  throw new ProviderUnavailableError(
    'ChatEx AI',
    'Provider API has changed and no longer accepts anonymous requests (HTTP 400). ' +
    'This provider has been disabled pending a fix.',
  );
}
