/**
 * Tests for caching and performance improvements
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CachingService, cacheManager } from '../cachingService';
import { DatabaseOptimizer } from '../databaseOptimizer';
import { PerformanceDashboard } from '../performanceDashboard';
import { performanceMonitor } from '../performanceMonitor';

describe('CachingService', () => {
  let cache: CachingService<string>;

  beforeEach(() => {
    cache = new CachingService<string>({
      ttl: 1000, // 1 second for testing
      maxSize: 5,
      enableMetrics: true
    });
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return null for non-existent keys', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should expire values after TTL', async () => {
    cache.set('key1', 'value1', 100); // 100ms TTL
    expect(cache.get('key1')).toBe('value1');
    
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(cache.get('key1')).toBeNull();
  });

  it('should evict LRU entries when cache is full', () => {
    // Fill cache to capacity
    for (let i = 0; i < 5; i++) {
      cache.set(`key${i}`, `value${i}`);
    }

    // Add one more item to trigger eviction
    cache.set('key5', 'value5');

    // Cache should not exceed max size
    expect(cache.getStats().size).toBeLessThanOrEqual(5);
    
    // At least one key should be evicted
    const allKeys = ['key0', 'key1', 'key2', 'key3', 'key4'];
    const existingKeys = allKeys.filter(key => cache.has(key));
    expect(existingKeys.length).toBeLessThan(5);
  });

  it('should provide accurate cache statistics', () => {
    cache.set('key1', 'value1');
    cache.get('key1'); // hit
    cache.get('key2'); // miss

    const stats = cache.getStats();
    expect(stats.size).toBe(1);
    expect(stats.hitRate).toBe(50); // 1 hit out of 2 requests
    expect(stats.totalRequests).toBe(2);
  });

  it('should support getOrSet pattern', async () => {
    const factory = vi.fn().mockResolvedValue('computed-value');
    
    // First call should invoke factory
    const result1 = await cache.getOrSet('key1', factory);
    expect(result1).toBe('computed-value');
    expect(factory).toHaveBeenCalledTimes(1);

    // Second call should use cached value
    const result2 = await cache.getOrSet('key1', factory);
    expect(result2).toBe('computed-value');
    expect(factory).toHaveBeenCalledTimes(1); // Not called again
  });

  it('should preload multiple values', async () => {
    const entries = [
      { key: 'key1', factory: () => Promise.resolve('value1') },
      { key: 'key2', factory: () => Promise.resolve('value2') },
      { key: 'key3', factory: () => Promise.resolve('value3') }
    ];

    await cache.preload(entries);

    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('key3')).toBe('value3');
  });
});

describe('CacheManager', () => {
  beforeEach(() => {
    cacheManager.clearAll();
  });

  it('should create and manage multiple cache instances', () => {
    const cache1 = cacheManager.getCache<string>('test1');
    const cache2 = cacheManager.getCache<number>('test2');

    cache1.set('key1', 'value1');
    cache2.set('key2', 42);

    expect(cache1.get('key1')).toBe('value1');
    expect(cache2.get('key2')).toBe(42);
  });

  it('should provide statistics for all caches', () => {
    const cache1 = cacheManager.getCache<string>('test1');
    const cache2 = cacheManager.getCache<string>('test2');

    cache1.set('key1', 'value1');
    cache2.set('key2', 'value2');

    const allStats = cacheManager.getAllStats();
    expect(allStats.test1.size).toBe(1);
    expect(allStats.test2.size).toBe(1);
  });

  it('should generate optimization recommendations', () => {
    const cache = cacheManager.getCache<string>('test', {
      maxSize: 10,
      ttl: 1000
    });

    // Create low hit rate scenario
    cache.set('key1', 'value1');
    cache.get('key1'); // hit
    cache.get('key2'); // miss
    cache.get('key3'); // miss
    cache.get('key4'); // miss

    const recommendations = cacheManager.getOptimizationRecommendations();
    expect(recommendations.length).toBeGreaterThan(0);
    
    const hitRateRec = recommendations.find(r => r.type === 'hit_rate');
    expect(hitRateRec).toBeDefined();
    expect(hitRateRec?.priority).toBe('high');
  });
});

describe('DatabaseOptimizer', () => {
  let optimizer: DatabaseOptimizer;

  beforeEach(() => {
    optimizer = new DatabaseOptimizer();
    optimizer.clearCaches();
  });

  it('should cache query results', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ id: '1', name: 'test' });
    
    // First call should execute query
    const result1 = await optimizer.executeQuery('test-query', mockQuery, { useCache: true });
    expect(result1).toEqual({ id: '1', name: 'test' });
    expect(mockQuery).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const result2 = await optimizer.executeQuery('test-query', mockQuery, { useCache: true });
    expect(result2).toEqual({ id: '1', name: 'test' });
    expect(mockQuery).toHaveBeenCalledTimes(1); // Not called again
  });

  it('should record performance metrics', async () => {
    const mockQuery = vi.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve('result'), 10))
    );
    
    await optimizer.executeQuery('test-query', mockQuery, { useCache: false });
    
    const metrics = optimizer.getPerformanceMetrics();
    expect(metrics.queryCount).toBe(1);
    expect(metrics.averageExecutionTime).toBeGreaterThan(0);
  });

  it('should handle query failures', async () => {
    const mockQuery = vi.fn().mockRejectedValue(new Error('Query failed'));
    
    await expect(optimizer.executeQuery('test-query', mockQuery)).rejects.toThrow('Query failed');
    
    const metrics = optimizer.getPerformanceMetrics();
    expect(metrics.failedQueries).toBe(1);
  });

  it('should provide optimization recommendations', async () => {
    // Create scenario with slow queries
    const slowQuery = vi.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve('result'), 1100))
    );
    
    await optimizer.executeQuery('slow-query', slowQuery);
    
    const recommendations = optimizer.getOptimizationRecommendations();
    expect(recommendations.length).toBeGreaterThan(0);
    
    const indexingRec = recommendations.find(r => r.type === 'indexing');
    expect(indexingRec).toBeDefined();
  });
});

describe('PerformanceDashboard', () => {
  let dashboard: PerformanceDashboard;

  beforeEach(() => {
    dashboard = new PerformanceDashboard();
  });

  it('should collect system metrics', async () => {
    // Record some test metrics
    performanceMonitor.recordAPICall({
      service: 'gemini',
      operation: 'test',
      tokenCount: { input: 100, output: 50, total: 150 },
      responseTime: 1000,
      success: true
    });

    const metrics = await dashboard.getSystemMetrics();
    
    expect(metrics.timestamp).toBeInstanceOf(Date);
    expect(metrics.aiServices).toBeDefined();
    expect(metrics.caching).toBeDefined();
    expect(metrics.database).toBeDefined();
    expect(metrics.recommendations).toBeInstanceOf(Array);
  });

  it('should calculate health scores', async () => {
    const healthScore = await dashboard.getHealthScore();
    
    expect(healthScore.overall).toBeGreaterThanOrEqual(0);
    expect(healthScore.overall).toBeLessThanOrEqual(100);
    expect(healthScore.breakdown.aiServices).toBeGreaterThanOrEqual(0);
    expect(healthScore.breakdown.caching).toBeGreaterThanOrEqual(0);
    expect(healthScore.breakdown.database).toBeGreaterThanOrEqual(0);
    expect(healthScore.breakdown.memory).toBeGreaterThanOrEqual(0);
  });

  it('should export performance data', async () => {
    const jsonData = await dashboard.exportPerformanceData('json');
    expect(() => JSON.parse(jsonData)).not.toThrow();
    
    const csvData = await dashboard.exportPerformanceData('csv');
    expect(csvData).toContain('Timestamp,Category,Metric,Value');
  });

  it('should manage performance alerts', async () => {
    // This would require setting up conditions that trigger alerts
    const activeAlerts = dashboard.getActiveAlerts();
    expect(Array.isArray(activeAlerts)).toBe(true);
    
    const allAlerts = dashboard.getAllAlerts();
    expect(Array.isArray(allAlerts)).toBe(true);
  });
});

describe('Performance Integration', () => {
  it('should integrate caching with performance monitoring', async () => {
    const cache = new CachingService<string>({
      ttl: 1000,
      maxSize: 100,
      enableMetrics: true
    });

    // Perform cache operations
    cache.set('key1', 'value1');
    cache.get('key1'); // hit
    cache.get('key2'); // miss

    const stats = cache.getStats();
    expect(stats.hitRate).toBe(50);
    expect(stats.totalRequests).toBe(2);
  });

  it('should provide comprehensive performance insights', async () => {
    const dashboard = new PerformanceDashboard();
    
    // Record some activity
    performanceMonitor.recordAPICall({
      service: 'gemini',
      operation: 'intent-detection',
      tokenCount: { input: 200, output: 100, total: 300 },
      responseTime: 1500,
      success: true
    });

    const metrics = await dashboard.getSystemMetrics();
    const healthScore = await dashboard.getHealthScore();
    const trends = await dashboard.getPerformanceTrends(1);

    expect(metrics.aiServices.totalCalls).toBeGreaterThan(0);
    expect(healthScore.overall).toBeGreaterThan(0);
    expect(trends.tokenUsage.length).toBeGreaterThan(0);
  });
});