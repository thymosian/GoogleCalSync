/**
 * Comprehensive caching service for performance optimization
 * Provides multi-level caching with TTL, LRU eviction, and performance monitoring
 */

import { performanceMonitor } from './performanceMonitor';

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
  enableMetrics?: boolean; // Whether to track performance metrics
}

export interface CacheEntry<T> {
  value: T;
  expiry: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hitRate: number;
  totalRequests: number;
  averageAccessTime: number;
  memoryUsage: number;
}

/**
 * Generic caching service with LRU eviction and performance monitoring
 */
export class CachingService<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private readonly options: Required<CacheOptions>;
  
  // Performance metrics
  private hits = 0;
  private misses = 0;
  private totalRequests = 0;
  private accessTimes: number[] = [];

  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: options.ttl || 5 * 60 * 1000, // 5 minutes default
      maxSize: options.maxSize || 1000,
      enableMetrics: options.enableMetrics ?? true
    };
  }

  /**
   * Gets a value from cache
   */
  get(key: string): T | null {
    const startTime = Date.now();
    this.totalRequests++;

    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      this.recordAccessTime(Date.now() - startTime);
      return null;
    }

    // Check if entry has expired
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.misses++;
      this.recordAccessTime(Date.now() - startTime);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.hits++;
    
    const accessTime = Date.now() - startTime;
    this.recordAccessTime(accessTime);

    return entry.value;
  }

  /**
   * Sets a value in cache
   */
  set(key: string, value: T, customTtl?: number): void {
    const ttl = customTtl || this.options.ttl;
    const expiry = Date.now() + ttl;

    const entry: CacheEntry<T> = {
      value,
      expiry,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    this.cache.set(key, entry);

    // Evict entries if cache is full
    if (this.cache.size > this.options.maxSize) {
      this.evictLRU();
    }
  }

  /**
   * Checks if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Deletes a key from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clears all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.resetMetrics();
  }

  /**
   * Gets cache statistics
   */
  getStats(): CacheStats {
    const hitRate = this.totalRequests > 0 ? (this.hits / this.totalRequests) * 100 : 0;
    const averageAccessTime = this.accessTimes.length > 0
      ? this.accessTimes.reduce((sum, time) => sum + time, 0) / this.accessTimes.length
      : 0;

    // Estimate memory usage (rough approximation)
    const memoryUsage = this.estimateMemoryUsage();

    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      hitRate,
      totalRequests: this.totalRequests,
      averageAccessTime,
      memoryUsage
    };
  }

  /**
   * Gets or sets a value using a factory function
   */
  async getOrSet(key: string, factory: () => Promise<T>, customTtl?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, customTtl);
    return value;
  }

  /**
   * Preloads multiple values into cache
   */
  async preload(entries: Array<{ key: string; factory: () => Promise<T>; ttl?: number }>): Promise<void> {
    const promises = entries.map(async ({ key, factory, ttl }) => {
      if (!this.has(key)) {
        try {
          const value = await factory();
          this.set(key, value, ttl);
        } catch (error) {
          console.warn(`Failed to preload cache entry for key: ${key}`, error);
        }
      }
    });

    await Promise.all(promises);
  }

  /**
   * Refreshes expired entries in background
   */
  async refreshExpired(refreshFactory: (key: string, oldValue: T) => Promise<T>): Promise<void> {
    const now = Date.now();
    const expiredEntries: Array<{ key: string; entry: CacheEntry<T> }> = [];

    // Find expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        expiredEntries.push({ key, entry });
      }
    }

    // Refresh expired entries in background
    const refreshPromises = expiredEntries.map(async ({ key, entry }) => {
      try {
        const newValue = await refreshFactory(key, entry.value);
        this.set(key, newValue);
      } catch (error) {
        console.warn(`Failed to refresh cache entry for key: ${key}`, error);
        // Remove the expired entry if refresh fails
        this.cache.delete(key);
      }
    });

    await Promise.allSettled(refreshPromises);
  }

  /**
   * Gets keys that are about to expire
   */
  getExpiringKeys(withinMs: number = 60000): string[] {
    const threshold = Date.now() + withinMs;
    const expiringKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry <= threshold) {
        expiringKeys.push(key);
      }
    }

    return expiringKeys;
  }

  /**
   * Evicts least recently used entries
   */
  private evictLRU(): void {
    if (this.cache.size <= this.options.maxSize) {
      return;
    }

    const entriesToEvict = Math.max(1, Math.ceil((this.cache.size - this.options.maxSize) * 1.2)); // Evict excess + 20%
    const sortedEntries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    for (let i = 0; i < entriesToEvict && i < sortedEntries.length; i++) {
      const [key] = sortedEntries[i];
      this.cache.delete(key);
    }
  }

  /**
   * Records access time for performance monitoring
   */
  private recordAccessTime(time: number): void {
    this.accessTimes.push(time);

    // Keep only recent access times
    if (this.accessTimes.length > 1000) {
      this.accessTimes = this.accessTimes.slice(-1000);
    }
  }

  /**
   * Estimates memory usage of cache
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      // Rough estimation: key size + value size + metadata
      totalSize += key.length * 2; // UTF-16 characters
      totalSize += JSON.stringify(entry.value).length * 2;
      totalSize += 64; // Metadata overhead
    }

    return totalSize;
  }

  /**
   * Resets performance metrics
   */
  private resetMetrics(): void {
    this.hits = 0;
    this.misses = 0;
    this.totalRequests = 0;
    this.accessTimes = [];
  }
}

/**
 * Multi-level cache manager for different data types
 */
export class CacheManager {
  private caches: Map<string, CachingService<any>> = new Map();

  /**
   * Gets or creates a cache instance
   */
  getCache<T>(name: string, options?: CacheOptions): CachingService<T> {
    if (!this.caches.has(name)) {
      this.caches.set(name, new CachingService<T>(options));
    }
    return this.caches.get(name)!;
  }

  /**
   * Gets statistics for all caches
   */
  getAllStats(): { [cacheName: string]: CacheStats } {
    const stats: { [cacheName: string]: CacheStats } = {};
    
    for (const [name, cache] of this.caches.entries()) {
      stats[name] = cache.getStats();
    }

    return stats;
  }

  /**
   * Clears all caches
   */
  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
  }

  /**
   * Gets cache optimization recommendations
   */
  getOptimizationRecommendations(): Array<{
    cacheName: string;
    type: 'size' | 'ttl' | 'hit_rate';
    priority: 'high' | 'medium' | 'low';
    description: string;
    currentValue: number;
    recommendedValue: number;
  }> {
    const recommendations = [];
    const allStats = this.getAllStats();

    for (const [cacheName, stats] of Object.entries(allStats)) {
      // Low hit rate recommendation
      if (stats.hitRate < 50) {
        recommendations.push({
          cacheName,
          type: 'hit_rate' as const,
          priority: 'high' as const,
          description: 'Low cache hit rate. Consider increasing TTL or cache size.',
          currentValue: stats.hitRate,
          recommendedValue: 75
        });
      }

      // High memory usage recommendation
      if (stats.memoryUsage > 10 * 1024 * 1024) { // 10MB
        recommendations.push({
          cacheName,
          type: 'size' as const,
          priority: 'medium' as const,
          description: 'High memory usage. Consider reducing cache size or TTL.',
          currentValue: stats.memoryUsage,
          recommendedValue: stats.memoryUsage * 0.7
        });
      }

      // Slow access time recommendation
      if (stats.averageAccessTime > 10) {
        recommendations.push({
          cacheName,
          type: 'ttl' as const,
          priority: 'low' as const,
          description: 'Slow cache access. Consider optimizing data structure.',
          currentValue: stats.averageAccessTime,
          recommendedValue: 5
        });
      }
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
}

// Global cache manager instance
export const cacheManager = new CacheManager();

// Pre-configured cache instances for common use cases
export const attendeeValidationCache = cacheManager.getCache<any>('attendeeValidation', {
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 1000,
  enableMetrics: true
});

export const conversationContextCache = cacheManager.getCache<any>('conversationContext', {
  ttl: 2 * 60 * 1000, // 2 minutes
  maxSize: 500,
  enableMetrics: true
});

export const meetingDataCache = cacheManager.getCache<any>('meetingData', {
  ttl: 10 * 60 * 1000, // 10 minutes
  maxSize: 200,
  enableMetrics: true
});