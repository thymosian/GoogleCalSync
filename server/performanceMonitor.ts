/**
 * Performance monitoring service for AI API calls and token optimization
 * Tracks token usage, response times, and provides optimization recommendations
 */

export interface AICallMetrics {
  id: string;
  timestamp: Date;
  service: 'gemini' | 'google' | 'mistral';
  operation: string;
  tokenCount: {
    input: number;
    output: number;
    total: number;
  };
  responseTime: number;
  success: boolean;
  error?: string;
  compressionRatio?: number;
  model?: string; // Track which Gemini model was used
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface PerformanceStats {
  totalCalls: number;
  totalTokens: number;
  averageResponseTime: number;
  successRate: number;
  tokenEfficiency: number;
  compressionSavings: number;
  cachePerformance?: {
    attendeeValidationCacheHitRate: number;
    databaseQueryCacheHitRate: number;
    averageCacheResponseTime: number;
  };
  databasePerformance?: {
    totalQueries: number;
    averageQueryTime: number;
    slowQueries: number;
    cacheEfficiency: number;
  };
}

export interface OptimizationRecommendation {
  type: 'compression' | 'prompt_optimization' | 'caching' | 'batching';
  priority: 'high' | 'medium' | 'low';
  description: string;
  estimatedSavings: {
    tokens: number;
    responseTime: number;
  };
}

/**
 * Performance monitoring and optimization service
 */
export class PerformanceMonitor {
  private metrics: AICallMetrics[] = [];
  private maxMetricsHistory = 1000;
  private tokenBudget = {
    daily: 100000,
    hourly: 10000,
    perCall: 1000
  };
  
  // Cache performance tracking
  private cacheMetrics = {
    attendeeValidation: { hits: 0, misses: 0, totalTime: 0 },
    databaseQueries: { hits: 0, misses: 0, totalTime: 0 }
  };
  
  // Database performance tracking
  private databaseMetrics = {
    totalQueries: 0,
    queryTimes: [] as number[],
    slowQueries: 0,
    failedQueries: 0
  };

  /**
   * Records an AI API call with performance metrics
   */
  recordAPICall(metrics: Omit<AICallMetrics, 'id' | 'timestamp'>): void {
    const callMetrics: AICallMetrics = {
      id: this.generateId(),
      timestamp: new Date(),
      ...metrics
    };

    this.metrics.push(callMetrics);

    // Keep only recent metrics to prevent memory bloat
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }

    // Log performance warnings
    this.checkPerformanceThresholds(callMetrics);
    
    // Log Gemini-specific metrics for monitoring
    if (callMetrics.service === 'gemini' && callMetrics.usageMetadata) {
      this.logGeminiMetrics(callMetrics);
    }
  }

  /**
   * Processes and logs Gemini-specific usage metadata
   */
  private logGeminiMetrics(metrics: AICallMetrics): void {
    if (!metrics.usageMetadata) return;
    
    const { promptTokenCount, candidatesTokenCount, totalTokenCount } = metrics.usageMetadata;
    
    // Log detailed Gemini metrics for analysis
    console.log(`Gemini API Call - Operation: ${metrics.operation}, Model: ${metrics.model || 'unknown'}`);
    console.log(`Token Usage - Prompt: ${promptTokenCount}, Response: ${candidatesTokenCount}, Total: ${totalTokenCount}`);
    console.log(`Response Time: ${metrics.responseTime}ms, Success: ${metrics.success}`);
    
    // Track model-specific performance
    this.trackModelPerformance(metrics.model || 'unknown', metrics);
  }

  /**
   * Tracks performance metrics by Gemini model
   */
  private modelPerformanceMap = new Map<string, {
    totalCalls: number;
    totalTokens: number;
    totalResponseTime: number;
    successCount: number;
  }>();

  private trackModelPerformance(model: string, metrics: AICallMetrics): void {
    if (!this.modelPerformanceMap.has(model)) {
      this.modelPerformanceMap.set(model, {
        totalCalls: 0,
        totalTokens: 0,
        totalResponseTime: 0,
        successCount: 0
      });
    }

    const modelStats = this.modelPerformanceMap.get(model)!;
    modelStats.totalCalls++;
    modelStats.totalTokens += metrics.tokenCount.total;
    modelStats.totalResponseTime += metrics.responseTime;
    if (metrics.success) {
      modelStats.successCount++;
    }
  }

  /**
   * Records cache performance metrics
   */
  recordCacheMetrics(
    type: 'attendeeValidation' | 'databaseQueries',
    hit: boolean,
    responseTime: number
  ): void {
    if (hit) {
      this.cacheMetrics[type].hits++;
    } else {
      this.cacheMetrics[type].misses++;
    }
    this.cacheMetrics[type].totalTime += responseTime;
  }

  /**
   * Records database query performance
   */
  recordDatabaseQuery(queryTime: number, failed: boolean = false): void {
    this.databaseMetrics.totalQueries++;
    this.databaseMetrics.queryTimes.push(queryTime);
    
    if (queryTime > 1000) { // Queries over 1 second are considered slow
      this.databaseMetrics.slowQueries++;
    }
    
    if (failed) {
      this.databaseMetrics.failedQueries++;
    }

    // Keep only recent query times
    if (this.databaseMetrics.queryTimes.length > 1000) {
      this.databaseMetrics.queryTimes = this.databaseMetrics.queryTimes.slice(-1000);
    }
  }

  /**
   * Gets performance statistics for a time period
   */
  getPerformanceStats(timeRangeHours: number = 24): PerformanceStats {
    const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoffTime);

    if (recentMetrics.length === 0) {
      return {
        totalCalls: 0,
        totalTokens: 0,
        averageResponseTime: 0,
        successRate: 0,
        tokenEfficiency: 0,
        compressionSavings: 0,
        cachePerformance: this.getCachePerformanceStats(),
        databasePerformance: this.getDatabasePerformanceStats()
      };
    }

    const totalCalls = recentMetrics.length;
    const successfulCalls = recentMetrics.filter(m => m.success).length;
    const totalTokens = recentMetrics.reduce((sum, m) => sum + m.tokenCount.total, 0);
    const totalResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0);
    const compressionMetrics = recentMetrics.filter(m => m.compressionRatio);
    const compressionSavings = compressionMetrics.length > 0 
      ? compressionMetrics.reduce((sum, m) => sum + (1 - (m.compressionRatio || 1)), 0) / compressionMetrics.length
      : 0;

    return {
      totalCalls,
      totalTokens,
      averageResponseTime: totalResponseTime / totalCalls,
      successRate: successfulCalls / totalCalls,
      tokenEfficiency: this.calculateTokenEfficiency(recentMetrics),
      compressionSavings,
      cachePerformance: this.getCachePerformanceStats(),
      databasePerformance: this.getDatabasePerformanceStats()
    };
  }

  /**
   * Gets cache performance statistics
   */
  private getCachePerformanceStats() {
    const attendeeValidationTotal = this.cacheMetrics.attendeeValidation.hits + this.cacheMetrics.attendeeValidation.misses;
    const databaseQueriesTotal = this.cacheMetrics.databaseQueries.hits + this.cacheMetrics.databaseQueries.misses;
    
    const attendeeValidationHitRate = attendeeValidationTotal > 0 
      ? (this.cacheMetrics.attendeeValidation.hits / attendeeValidationTotal) * 100 
      : 0;
    
    const databaseQueryHitRate = databaseQueriesTotal > 0 
      ? (this.cacheMetrics.databaseQueries.hits / databaseQueriesTotal) * 100 
      : 0;

    const totalCacheRequests = attendeeValidationTotal + databaseQueriesTotal;
    const averageCacheResponseTime = totalCacheRequests > 0
      ? (this.cacheMetrics.attendeeValidation.totalTime + this.cacheMetrics.databaseQueries.totalTime) / totalCacheRequests
      : 0;

    return {
      attendeeValidationCacheHitRate: attendeeValidationHitRate,
      databaseQueryCacheHitRate: databaseQueryHitRate,
      averageCacheResponseTime
    };
  }

  /**
   * Gets database performance statistics
   */
  private getDatabasePerformanceStats() {
    const averageQueryTime = this.databaseMetrics.queryTimes.length > 0
      ? this.databaseMetrics.queryTimes.reduce((sum, time) => sum + time, 0) / this.databaseMetrics.queryTimes.length
      : 0;

    const cacheEfficiency = this.databaseMetrics.totalQueries > 0
      ? ((this.databaseMetrics.totalQueries - this.databaseMetrics.slowQueries) / this.databaseMetrics.totalQueries) * 100
      : 0;

    return {
      totalQueries: this.databaseMetrics.totalQueries,
      averageQueryTime,
      slowQueries: this.databaseMetrics.slowQueries,
      cacheEfficiency
    };
  }

  /**
   * Gets optimization recommendations based on performance data
   */
  getOptimizationRecommendations(): OptimizationRecommendation[] {
    const stats = this.getPerformanceStats();
    const recommendations: OptimizationRecommendation[] = [];

    // High token usage recommendation
    if (stats.totalTokens > this.tokenBudget.daily * 0.8) {
      recommendations.push({
        type: 'compression',
        priority: 'high',
        description: 'Token usage is approaching daily limit. Enable aggressive context compression.',
        estimatedSavings: {
          tokens: Math.floor(stats.totalTokens * 0.3),
          responseTime: 0
        }
      });
    }

    // Slow response time recommendation
    if (stats.averageResponseTime > 3000) {
      recommendations.push({
        type: 'prompt_optimization',
        priority: 'medium',
        description: 'Response times are slow. Consider shorter prompts and lower max_tokens.',
        estimatedSavings: {
          tokens: Math.floor(stats.totalTokens * 0.2),
          responseTime: 1000
        }
      });
    }

    // Low compression usage recommendation
    if (stats.compressionSavings < 0.2) {
      recommendations.push({
        type: 'compression',
        priority: 'medium',
        description: 'Context compression could be more aggressive to save tokens.',
        estimatedSavings: {
          tokens: Math.floor(stats.totalTokens * 0.25),
          responseTime: 500
        }
      });
    }

    // Frequent similar calls recommendation
    const frequentOperations = this.getFrequentOperations();
    if (frequentOperations.length > 0) {
      recommendations.push({
        type: 'caching',
        priority: 'low',
        description: `Consider caching results for frequent operations: ${frequentOperations.join(', ')}`,
        estimatedSavings: {
          tokens: Math.floor(stats.totalTokens * 0.15),
          responseTime: 2000
        }
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Checks if current token usage is within budget
   */
  checkTokenBudget(timeRangeHours: number = 1): {
    withinBudget: boolean;
    usage: number;
    limit: number;
    utilizationPercent: number;
  } {
    const stats = this.getPerformanceStats(timeRangeHours);
    const limit = timeRangeHours === 1 ? this.tokenBudget.hourly : this.tokenBudget.daily;
    const utilizationPercent = (stats.totalTokens / limit) * 100;

    return {
      withinBudget: stats.totalTokens <= limit,
      usage: stats.totalTokens,
      limit,
      utilizationPercent
    };
  }

  /**
   * Gets token usage trends over time
   */
  getTokenUsageTrends(hours: number = 24): Array<{
    hour: number;
    tokens: number;
    calls: number;
    averageTokensPerCall: number;
  }> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoffTime);

    const hourlyData: { [hour: number]: { tokens: number; calls: number } } = {};

    recentMetrics.forEach(metric => {
      const hour = metric.timestamp.getHours();
      if (!hourlyData[hour]) {
        hourlyData[hour] = { tokens: 0, calls: 0 };
      }
      hourlyData[hour].tokens += metric.tokenCount.total;
      hourlyData[hour].calls += 1;
    });

    return Object.entries(hourlyData).map(([hour, data]) => ({
      hour: parseInt(hour),
      tokens: data.tokens,
      calls: data.calls,
      averageTokensPerCall: data.calls > 0 ? data.tokens / data.calls : 0
    }));
  }

  /**
   * Estimates token count for text (rough approximation)
   */
  estimateTokenCount(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    // More accurate for code and structured text: 1 token ≈ 3.5 characters
    const avgCharsPerToken = 3.8;
    return Math.ceil(text.length / avgCharsPerToken);
  }

  /**
   * Calculates compression efficiency for a given text and compressed version
   */
  calculateCompressionRatio(originalText: string, compressedText: string): number {
    const originalTokens = this.estimateTokenCount(originalText);
    const compressedTokens = this.estimateTokenCount(compressedText);
    return originalTokens > 0 ? compressedTokens / originalTokens : 1;
  }

  /**
   * Gets the most expensive operations by token usage
   */
  getMostExpensiveOperations(limit: number = 5): Array<{
    operation: string;
    totalTokens: number;
    averageTokens: number;
    callCount: number;
  }> {
    const operationStats: { [operation: string]: { totalTokens: number; callCount: number } } = {};

    this.metrics.forEach(metric => {
      if (!operationStats[metric.operation]) {
        operationStats[metric.operation] = { totalTokens: 0, callCount: 0 };
      }
      operationStats[metric.operation].totalTokens += metric.tokenCount.total;
      operationStats[metric.operation].callCount += 1;
    });

    return Object.entries(operationStats)
      .map(([operation, stats]) => ({
        operation,
        totalTokens: stats.totalTokens,
        averageTokens: stats.totalTokens / stats.callCount,
        callCount: stats.callCount
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, limit);
  }

  /**
   * Clears old metrics to free memory
   */
  clearOldMetrics(olderThanHours: number = 168): void { // Default: 1 week
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoffTime);
  }

  /**
   * Gets model performance comparison metrics for Gemini models
   */
  getModelPerformanceComparison(): Array<{
    model: string;
    averageResponseTime: number;
    averageTokensPerCall: number;
    successRate: number;
    totalCalls: number;
    efficiency: number;
  }> {
    return Array.from(this.modelPerformanceMap.entries()).map(([model, stats]) => ({
      model,
      averageResponseTime: stats.totalCalls > 0 ? stats.totalResponseTime / stats.totalCalls : 0,
      averageTokensPerCall: stats.totalCalls > 0 ? stats.totalTokens / stats.totalCalls : 0,
      successRate: stats.totalCalls > 0 ? stats.successCount / stats.totalCalls : 0,
      totalCalls: stats.totalCalls,
      efficiency: stats.totalCalls > 0 ? (stats.successCount * 1000) / (stats.totalResponseTime + stats.totalTokens) : 0
    })).sort((a, b) => b.efficiency - a.efficiency);
  }

  /**
   * Exports performance data for analysis
   */
  exportMetrics(timeRangeHours: number = 24): {
    summary: PerformanceStats;
    recommendations: OptimizationRecommendation[];
    trends: Array<{ hour: number; tokens: number; calls: number; averageTokensPerCall: number }>;
    expensiveOperations: Array<{ operation: string; totalTokens: number; averageTokens: number; callCount: number }>;
    modelComparison: Array<{ model: string; averageResponseTime: number; averageTokensPerCall: number; successRate: number; totalCalls: number; efficiency: number }>;
  } {
    return {
      summary: this.getPerformanceStats(timeRangeHours),
      recommendations: this.getOptimizationRecommendations(),
      trends: this.getTokenUsageTrends(timeRangeHours),
      expensiveOperations: this.getMostExpensiveOperations(),
      modelComparison: this.getModelPerformanceComparison()
    };
  }

  private generateId(): string {
    return `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private checkPerformanceThresholds(metrics: AICallMetrics): void {
    // Warn about high token usage
    if (metrics.tokenCount.total > this.tokenBudget.perCall) {
      console.warn(`High token usage detected: ${metrics.tokenCount.total} tokens for ${metrics.operation}`);
    }

    // Warn about slow responses
    if (metrics.responseTime > 5000) {
      console.warn(`Slow API response: ${metrics.responseTime}ms for ${metrics.operation}`);
    }

    // Warn about failures
    if (!metrics.success) {
      console.error(`API call failed: ${metrics.operation} - ${metrics.error}`);
    }
  }

  private calculateTokenEfficiency(metrics: AICallMetrics[]): number {
    if (metrics.length === 0) return 0;

    // Calculate efficiency as successful tokens per total tokens
    const successfulMetrics = metrics.filter(m => m.success);
    const successfulTokens = successfulMetrics.reduce((sum, m) => sum + m.tokenCount.total, 0);
    const totalTokens = metrics.reduce((sum, m) => sum + m.tokenCount.total, 0);

    return totalTokens > 0 ? successfulTokens / totalTokens : 0;
  }

  private getFrequentOperations(): string[] {
    const operationCounts: { [operation: string]: number } = {};
    
    this.metrics.forEach(metric => {
      operationCounts[metric.operation] = (operationCounts[metric.operation] || 0) + 1;
    });

    return Object.entries(operationCounts)
      .filter(([_, count]) => count >= 5) // Operations called 5+ times
      .map(([operation, _]) => operation);
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Decorator function to automatically monitor AI API calls
 */
export function monitorAICall(
  service: 'gemini' | 'google' | 'mistral',
  operation: string
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      let success = false;
      let error: string | undefined;
      let tokenCount = { input: 0, output: 0, total: 0 };

      try {
        // Estimate input tokens if first argument is a string
        if (args.length > 0 && typeof args[0] === 'string') {
          tokenCount.input = performanceMonitor.estimateTokenCount(args[0]);
        }

        const result = await method.apply(this, args);
        success = true;

        // Estimate output tokens if result is a string
        if (typeof result === 'string') {
          tokenCount.output = performanceMonitor.estimateTokenCount(result);
        }

        tokenCount.total = tokenCount.input + tokenCount.output;

        return result;
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
        throw err;
      } finally {
        const responseTime = Date.now() - startTime;

        performanceMonitor.recordAPICall({
          service,
          operation,
          tokenCount,
          responseTime,
          success,
          error
        });
      }
    };

    return descriptor;
  };
}