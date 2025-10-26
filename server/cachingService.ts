interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

export class CachingService {
  private cache = new Map<string, CacheEntry>();
  private readonly defaultTTL = 30 * 60 * 1000; // 30 minutes

  /**
   * Set a cache entry with optional TTL
   */
  set(key: string, data: any, ttl: number = this.defaultTTL): void {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl
    };

    this.cache.set(key, entry);
    console.log(`Cached data for key: ${key}, TTL: ${ttl}ms`);
  }

  /**
   * Get a cache entry if it exists and hasn't expired
   */
  get(key: string): any | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      console.log(`Cache expired for key: ${key}`);
      return null;
    }

    console.log(`Cache hit for key: ${key}`);
    return entry.data;
  }

  /**
   * Delete a specific cache entry
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`Deleted cache entry for key: ${key}`);
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    console.log('All cache entries cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired cache entries`);
    }

    return cleanedCount;
  }

  /**
   * Generate a cache key for agenda generation
   */
  generateAgendaCacheKey(meetingData: any): string {
    const { id, title, enhancedPurpose, attendees, startTime, endTime } = meetingData;

    // Create a hash-like string from the key components
    const keyComponents = [
      id || 'no-id',
      title || 'no-title',
      enhancedPurpose?.substring(0, 100) || 'no-purpose', // Limit length for cache key
      attendees?.map((a: any) => a.email).sort().join(',') || 'no-attendees',
      startTime || 'no-start',
      endTime || 'no-end'
    ].join('|');

    // Simple hash function for the cache key
    let hash = 0;
    for (let i = 0; i < keyComponents.length; i++) {
      const char = keyComponents.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return `agenda_${Math.abs(hash)}`;
  }

  /**
   * Clear all agenda-related cache entries
   */
  clearAgendaCache(): number {
    let clearedCount = 0;
    const keysToDelete: string[] = [];

    // Find all agenda cache keys
    for (const [key] of this.cache.entries()) {
      if (key.startsWith('agenda_')) {
        keysToDelete.push(key);
      }
    }

    // Delete the keys
    for (const key of keysToDelete) {
      this.cache.delete(key);
      clearedCount++;
    }

    if (clearedCount > 0) {
      console.log(`Cleared ${clearedCount} agenda cache entries`);
    }

    return clearedCount;
  }
}

// Export singleton instance
export const cachingService = new CachingService();