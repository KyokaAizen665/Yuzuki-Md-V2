/**
 * Felo AI scraper — DEPRECATED
 *
 * Status: BROKEN as of 2026-06-15
 *
 * Reason: The anonymous authentication endpoint
 * (https://account.felo.ai/api/auth/anonymous) now returns HTTP 401
 * Unauthorized for all requests, including those with correct Content-Type
 * and Origin headers. Felo AI has revoked public anonymous access.
 * The search API endpoint returns HTTP 405 Method Not Allowed.
 *
 * Action: Exports a stub FeloClient that throws a clear ProviderUnavailable
 *         error. The feloai plugin will surface this as a user-facing message.
 */

export class ProviderUnavailableError extends Error {
  constructor(provider, reason) {
    super(`${provider} is currently unavailable: ${reason}`);
    this.name     = 'ProviderUnavailableError';
    this.provider = provider;
  }
}

export class FeloClient {
  constructor() {}

  async ensureToken() {
    throw new ProviderUnavailableError(
      'Felo AI',
      'Anonymous authentication endpoint has been revoked (HTTP 401 Unauthorized). ' +
      'This provider has been disabled pending a fix.',
    );
  }

  async search(_query) {
    await this.ensureToken();
  }
}
