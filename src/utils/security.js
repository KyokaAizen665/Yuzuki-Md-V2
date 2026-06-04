/**
 * Rate limiting and security utilities
 * Prevents abuse and DoS attacks
 */

/**
 * User-based rate limiter
 */
export class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  /**
   * Check if user is allowed to proceed
   * @param {string} userId - User identifier
   * @returns {object} - { allowed: boolean, remaining: number, resetAt: Date }
   */
  check(userId) {
    if (!userId) throw new Error('userId is required');

    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    
    // Remove old requests outside window
    const recentRequests = userRequests.filter(time => now - time < this.windowMs);
    
    const allowed = recentRequests.length < this.maxRequests;
    
    if (allowed) {
      recentRequests.push(now);
    }
    
    this.requests.set(userId, recentRequests);
    
    const oldestRequest = recentRequests[0];
    const resetAt = oldestRequest ? new Date(oldestRequest + this.windowMs) : new Date(now + this.windowMs);

    return {
      allowed,
      remaining: Math.max(0, this.maxRequests - recentRequests.length),
      resetAt,
    };
  }

  /**
   * Reset user's rate limit
   * @param {string} userId - User identifier
   */
  reset(userId) {
    this.requests.delete(userId);
  }

  /**
   * Get stats
   * @returns {object}
   */
  getStats() {
    return {
      totalUsers: this.requests.size,
      requests: Array.from(this.requests.entries()).map(([userId, times]) => ({
        userId,
        count: times.length,
      })),
    };
  }

  /**
   * Cleanup old entries (call periodically)
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, times] of this.requests.entries()) {
      const recentTimes = times.filter(time => now - time < this.windowMs);
      
      if (recentTimes.length === 0) {
        this.requests.delete(userId);
        cleaned++;
      } else {
        this.requests.set(userId, recentTimes);
      }
    }

    return cleaned;
  }
}

/**
 * Per-command type rate limiter (prevent API abuse)
 */
export class CommandRateLimiter {
  constructor() {
    this.limiters = new Map();
  }

  /**
   * Get or create limiter for a command
   * @param {string} command - Command name
   * @param {object} config - { maxRequests, windowMs }
   * @returns {RateLimiter}
   */
  getLimiter(command, config = {}) {
    const { maxRequests = 5, windowMs = 60000 } = config;

    if (!this.limiters.has(command)) {
      this.limiters.set(command, new RateLimiter(maxRequests, windowMs));
    }

    return this.limiters.get(command);
  }

  /**
   * Check if user can execute command
   * @param {string} command - Command name
   * @param {string} userId - User identifier
   * @param {object} config - Limiter config
   * @returns {object} - Result object
   */
  check(command, userId, config = {}) {
    const limiter = this.getLimiter(command, config);
    return limiter.check(userId);
  }
}

/**
 * Concurrent request limiter (prevent resource exhaustion)
 */
export class ConcurrencyLimiter {
  constructor(maxConcurrent = 5) {
    this.maxConcurrent = maxConcurrent;
    this.active = 0;
    this.queue = [];
  }

  /**
   * Acquire a slot
   * @returns {Promise<Function>} - Release function
   */
  async acquire() {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return () => this.release();
    }

    // Wait in queue
    await new Promise(resolve => {
      this.queue.push(resolve);
    });

    this.active++;
    return () => this.release();
  }

  /**
   * Execute function with limit
   * @param {Function} fn - Async function
   * @returns {Promise}
   */
  async run(fn) {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Release a slot
   */
  release() {
    this.active--;

    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      resolve();
    }
  }

  /**
   * Get limiter stats
   * @returns {object}
   */
  getStats() {
    return {
      active: this.active,
      max: this.maxConcurrent,
      queued: this.queue.length,
      utilization: (this.active / this.maxConcurrent * 100).toFixed(2) + '%',
    };
  }
}

/**
 * Cache for expensive operations
 */
export class SimpleCache {
  constructor(ttlMs = 300000) {
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  /**
   * Get cached value
   * @param {string} key - Cache key
   * @returns {any} - Cached value or undefined
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set cache value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlMs - Optional TTL override
   */
  set(key, value, ttlMs = null) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this.ttlMs),
    });
  }

  /**
   * Check if key exists and is valid
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== undefined;
  }

  /**
   * Delete key
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache stats
   * @returns {object}
   */
  getStats() {
    let validEntries = 0;
    
    for (const [, entry] of this.cache.entries()) {
      if (Date.now() <= entry.expiresAt) {
        validEntries++;
      }
    }

    return {
      total: this.cache.size,
      valid: validEntries,
      expired: this.cache.size - validEntries,
    };
  }

  /**
   * Cleanup expired entries
   * @returns {number} - Number of entries cleaned
   */
  cleanup() {
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * Track and limit API calls
 */
export class ApiCallTracker {
  constructor() {
    this.calls = new Map();
  }

  /**
   * Record an API call
   * @param {string} service - Service name
   * @param {boolean} success - Whether call succeeded
   * @param {number} duration - Duration in ms
   */
  track(service, success, duration = 0) {
    if (!this.calls.has(service)) {
      this.calls.set(service, {
        total: 0,
        success: 0,
        failed: 0,
        totalDuration: 0,
      });
    }

    const stats = this.calls.get(service);
    stats.total++;
    stats.totalDuration += duration;

    if (success) {
      stats.success++;
    } else {
      stats.failed++;
    }
  }

  /**
   * Get service statistics
   * @param {string} service - Service name
   * @returns {object}
   */
  getStats(service = null) {
    if (service) {
      return this.calls.get(service) || null;
    }

    // Return all stats
    const all = {};
    for (const [name, stats] of this.calls.entries()) {
      all[name] = {
        ...stats,
        avgDuration: stats.total > 0 ? Math.round(stats.totalDuration / stats.total) : 0,
        successRate: stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(2) + '%' : '0%',
      };
    }

    return all;
  }

  /**
   * Reset stats
   * @param {string} service - Service name (null for all)
   */
  reset(service = null) {
    if (service) {
      this.calls.delete(service);
    } else {
      this.calls.clear();
    }
  }
}
