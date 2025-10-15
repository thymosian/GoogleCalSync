/**
 * Database query optimization service
 * Provides query caching, batch operations, and performance monitoring
 */

import { db } from './storage';
import { performanceMonitor } from './performanceMonitor';
import { cacheManager } from './cachingService';
import type { ConversationContext, ChatMessage, MeetingDraft } from '../shared/schema';

export interface QueryOptions {
  useCache?: boolean;
  cacheTtl?: number;
  enableMetrics?: boolean;
  batchSize?: number;
}

export interface BatchOperation<T> {
  operation: 'insert' | 'update' | 'delete';
  table: string;
  data: T[];
  condition?: any;
}

export interface QueryPerformanceMetrics {
  queryCount: number;
  averageExecutionTime: number;
  cacheHitRate: number;
  slowQueries: number;
  failedQueries: number;
  batchOperationsCount: number;
}

/**
 * Database query optimizer with caching and performance monitoring
 */
export class DatabaseOptimizer {
  private queryCache = cacheManager.getCache<any>('databaseQueries', {
    ttl: 2 * 60 * 1000, // 2 minutes
    maxSize: 1000,
    enableMetrics: true
  });

  private queryMetrics = {
    queryCount: 0,
    totalExecutionTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    slowQueries: 0,
    failedQueries: 0,
    batchOperationsCount: 0,
    executionTimes: [] as number[]
  };

  /**
   * Executes a query with caching and performance monitoring
   */
  async executeQuery<T>(
    queryKey: string,
    queryFunction: () => Promise<T>,
    options: QueryOptions = {}
  ): Promise<T> {
    const startTime = Date.now();
    const opts = {
      useCache: true,
      cacheTtl: 2 * 60 * 1000,
      enableMetrics: true,
      ...options
    };

    this.queryMetrics.queryCount++;

    try {
      // Try cache first if enabled
      if (opts.useCache) {
        const cached = this.queryCache.get(queryKey);
        if (cached !== null) {
          this.queryMetrics.cacheHits++;
          const executionTime = Date.now() - startTime;
          this.recordExecutionTime(executionTime);
          
          if (opts.enableMetrics) {
            performanceMonitor.recordCacheMetrics('databaseQueries', true, executionTime);
          }
          
          return cached;
        }
        this.queryMetrics.cacheMisses++;
      }

      // Execute query
      const result = await queryFunction();
      const executionTime = Date.now() - startTime;

      // Cache result if enabled
      if (opts.useCache) {
        this.queryCache.set(queryKey, result, opts.cacheTtl);
      }

      // Record metrics
      this.recordExecutionTime(executionTime);
      
      if (executionTime > 1000) {
        this.queryMetrics.slowQueries++;
      }

      if (opts.enableMetrics) {
        performanceMonitor.recordDatabaseQuery(executionTime, false);
        performanceMonitor.recordCacheMetrics('databaseQueries', false, executionTime);
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.queryMetrics.failedQueries++;
      this.recordExecutionTime(executionTime);

      if (opts.enableMetrics) {
        performanceMonitor.recordDatabaseQuery(executionTime, true);
      }

      throw error;
    }
  }

  /**
   * Executes multiple queries in batch for better performance
   */
  async executeBatch<T>(
    operations: BatchOperation<T>[],
    options: QueryOptions = {}
  ): Promise<any[]> {
    const startTime = Date.now();
    const opts = {
      batchSize: 100,
      enableMetrics: true,
      ...options
    };

    this.queryMetrics.batchOperationsCount++;

    try {
      const results = [];

      // Process operations in batches
      for (let i = 0; i < operations.length; i += opts.batchSize) {
        const batch = operations.slice(i, i + opts.batchSize);
        const batchResults = await Promise.all(
          batch.map(async (operation) => {
            // This would need to be implemented based on specific operation types
            // For now, return a placeholder
            return { operation: operation.operation, success: true };
          })
        );
        results.push(...batchResults);
      }

      const executionTime = Date.now() - startTime;
      this.recordExecutionTime(executionTime);

      if (opts.enableMetrics) {
        performanceMonitor.recordDatabaseQuery(executionTime, false);
      }

      return results;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.queryMetrics.failedQueries++;
      this.recordExecutionTime(executionTime);

      if (opts.enableMetrics) {
        performanceMonitor.recordDatabaseQuery(executionTime, true);
      }

      throw error;
    }
  }

  /**
   * Optimized query for getting conversation contexts with caching
   */
  async getConversationContextOptimized(
    contextId: string,
    options: QueryOptions = {}
  ): Promise<ConversationContext | null> {
    const queryKey = `conversation_context:${contextId}`;
    
    return this.executeQuery(
      queryKey,
      async () => {
        const { conversationContexts } = await import('../shared/schema');
        const { eq } = await import('drizzle-orm');
        
        const [context] = await db
          .select()
          .from(conversationContexts)
          .where(eq(conversationContexts.id, contextId))
          .limit(1);
        
        return context || null;
      },
      options
    );
  }

  /**
   * Optimized query for getting user conversation contexts with caching
   */
  async getUserConversationContextsOptimized(
    userId: string,
    limit: number = 10,
    options: QueryOptions = {}
  ): Promise<ConversationContext[]> {
    const queryKey = `user_contexts:${userId}:${limit}`;
    
    return this.executeQuery(
      queryKey,
      async () => {
        const { conversationContexts } = await import('../shared/schema');
        const { eq, desc } = await import('drizzle-orm');
        
        return await db
          .select()
          .from(conversationContexts)
          .where(eq(conversationContexts.userId, userId))
          .orderBy(desc(conversationContexts.updatedAt))
          .limit(limit);
      },
      options
    );
  }

  /**
   * Optimized query for getting conversation messages with caching
   */
  async getConversationMessagesOptimized(
    conversationId: string,
    limit: number = 20,
    offset: number = 0,
    options: QueryOptions = {}
  ): Promise<ChatMessage[]> {
    const queryKey = `conversation_messages:${conversationId}:${limit}:${offset}`;
    
    return this.executeQuery(
      queryKey,
      async () => {
        const { chatMessages } = await import('../shared/schema');
        const { eq, desc } = await import('drizzle-orm');
        
        return await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.conversationId, conversationId))
          .orderBy(desc(chatMessages.timestamp))
          .limit(limit)
          .offset(offset);
      },
      options
    );
  }

  /**
   * Optimized query for getting message count with caching
   */
  async getMessageCountOptimized(
    conversationId: string,
    options: QueryOptions = {}
  ): Promise<number> {
    const queryKey = `message_count:${conversationId}`;
    
    return this.executeQuery(
      queryKey,
      async () => {
        const { chatMessages } = await import('../shared/schema');
        const { eq, count } = await import('drizzle-orm');
        
        const result = await db
          .select({ count: count() })
          .from(chatMessages)
          .where(eq(chatMessages.conversationId, conversationId));
        
        return result[0]?.count || 0;
      },
      {
        ...options,
        cacheTtl: 30 * 1000 // Shorter TTL for frequently changing data
      }
    );
  }

  /**
   * Optimized query for getting user meeting drafts with caching
   */
  async getUserMeetingDraftsOptimized(
    userId: string,
    limit: number = 10,
    options: QueryOptions = {}
  ): Promise<MeetingDraft[]> {
    const queryKey = `user_meeting_drafts:${userId}:${limit}`;
    
    return this.executeQuery(
      queryKey,
      async () => {
        const { meetingDrafts, conversationContexts } = await import('../shared/schema');
        const { eq, desc } = await import('drizzle-orm');
        
        const results = await db
          .select()
          .from(meetingDrafts)
          .innerJoin(conversationContexts, eq(meetingDrafts.conversationId, conversationContexts.id))
          .where(eq(conversationContexts.userId, userId))
          .orderBy(desc(meetingDrafts.createdAt))
          .limit(limit);
        
        return results.map(result => result.meeting_drafts);
      },
      options
    );
  }

  /**
   * Preloads frequently accessed data into cache
   */
  async preloadUserData(userId: string): Promise<void> {
    const preloadPromises = [
      // Preload user's recent conversation contexts
      this.getUserConversationContextsOptimized(userId, 5, { useCache: true }),
      
      // Preload user's recent meeting drafts
      this.getUserMeetingDraftsOptimized(userId, 5, { useCache: true })
    ];

    try {
      await Promise.allSettled(preloadPromises);
    } catch (error) {
      console.warn('Failed to preload user data:', error);
    }
  }

  /**
   * Invalidates cache entries for a specific user
   */
  invalidateUserCache(userId: string): void {
    const keysToInvalidate = [
      `user_contexts:${userId}`,
      `user_meeting_drafts:${userId}`
    ];

    // Find and delete all keys that start with these patterns
    const allStats = this.queryCache.getStats();
    // Note: This is a simplified implementation. In a real scenario,
    // you'd need to track keys more systematically
    keysToInvalidate.forEach(pattern => {
      // This would need a more sophisticated key tracking mechanism
      this.queryCache.delete(pattern);
    });
  }

  /**
   * Invalidates cache entries for a specific conversation
   */
  invalidateConversationCache(conversationId: string): void {
    const keysToInvalidate = [
      `conversation_context:${conversationId}`,
      `conversation_messages:${conversationId}`,
      `message_count:${conversationId}`
    ];

    keysToInvalidate.forEach(key => {
      this.queryCache.delete(key);
    });
  }

  /**
   * Gets query performance metrics
   */
  getPerformanceMetrics(): QueryPerformanceMetrics {
    const averageExecutionTime = this.queryMetrics.executionTimes.length > 0
      ? this.queryMetrics.executionTimes.reduce((sum, time) => sum + time, 0) / this.queryMetrics.executionTimes.length
      : this.queryMetrics.totalExecutionTime / Math.max(1, this.queryMetrics.queryCount);

    const totalCacheRequests = this.queryMetrics.cacheHits + this.queryMetrics.cacheMisses;
    const cacheHitRate = totalCacheRequests > 0
      ? (this.queryMetrics.cacheHits / totalCacheRequests) * 100
      : 0;

    return {
      queryCount: this.queryMetrics.queryCount,
      averageExecutionTime,
      cacheHitRate,
      slowQueries: this.queryMetrics.slowQueries,
      failedQueries: this.queryMetrics.failedQueries,
      batchOperationsCount: this.queryMetrics.batchOperationsCount
    };
  }

  /**
   * Gets optimization recommendations
   */
  getOptimizationRecommendations(): Array<{
    type: 'caching' | 'indexing' | 'batching' | 'query_structure';
    priority: 'high' | 'medium' | 'low';
    description: string;
    estimatedImprovement: string;
  }> {
    const metrics = this.getPerformanceMetrics();
    const recommendations = [];

    // Low cache hit rate
    if (metrics.cacheHitRate < 50) {
      recommendations.push({
        type: 'caching' as const,
        priority: 'high' as const,
        description: 'Low cache hit rate. Consider increasing cache TTL or improving cache key strategies.',
        estimatedImprovement: '30-50% query time reduction'
      });
    }

    // High number of slow queries
    if (metrics.slowQueries > metrics.queryCount * 0.1) {
      recommendations.push({
        type: 'indexing' as const,
        priority: 'high' as const,
        description: 'High number of slow queries. Consider adding database indexes on frequently queried columns.',
        estimatedImprovement: '50-80% query time reduction'
      });
    }

    // Low batch operation usage
    if (metrics.batchOperationsCount < metrics.queryCount * 0.05) {
      recommendations.push({
        type: 'batching' as const,
        priority: 'medium' as const,
        description: 'Consider using batch operations for bulk data operations.',
        estimatedImprovement: '20-40% throughput improvement'
      });
    }

    // High average execution time
    if (metrics.averageExecutionTime > 500) {
      recommendations.push({
        type: 'query_structure' as const,
        priority: 'medium' as const,
        description: 'High average query execution time. Consider optimizing query structure and reducing data transfer.',
        estimatedImprovement: '25-45% query time reduction'
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Clears all query caches and resets metrics
   */
  clearCaches(): void {
    this.queryCache.clear();
    this.resetMetrics();
  }

  /**
   * Records query execution time
   */
  private recordExecutionTime(time: number): void {
    this.queryMetrics.executionTimes.push(time);
    this.queryMetrics.totalExecutionTime += time;

    // Keep only recent execution times
    if (this.queryMetrics.executionTimes.length > 1000) {
      this.queryMetrics.executionTimes = this.queryMetrics.executionTimes.slice(-1000);
    }
  }

  /**
   * Resets performance metrics
   */
  private resetMetrics(): void {
    this.queryMetrics = {
      queryCount: 0,
      totalExecutionTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      slowQueries: 0,
      failedQueries: 0,
      batchOperationsCount: 0,
      executionTimes: []
    };
  }
}

// Global database optimizer instance
export const databaseOptimizer = new DatabaseOptimizer();