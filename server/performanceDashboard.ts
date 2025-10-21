/**
 * Performance monitoring dashboard service
 * Provides comprehensive performance metrics and monitoring capabilities
 */

import { performanceMonitor } from './performanceMonitor';
import { cachingService } from './cachingService';
import { databaseOptimizer } from './databaseOptimizer';
import { attendeeValidator } from './attendeeValidator';
import { conversationStorage } from './conversationStorage';

export interface SystemPerformanceMetrics {
  timestamp: Date;
  aiServices: {
    totalCalls: number;
    averageResponseTime: number;
    successRate: number;
    tokenUsage: {
      total: number;
      average: number;
      efficiency: number;
    };
    compressionSavings: number;
  };
  caching: {
    attendeeValidation: {
      hitRate: number;
      size: number;
      averageResponseTime: number;
    };
    databaseQueries: {
      hitRate: number;
      size: number;
      averageResponseTime: number;
    };
    conversationContext: {
      hitRate: number;
      size: number;
      averageResponseTime: number;
    };
    totalMemoryUsage: number;
  };
  database: {
    totalQueries: number;
    averageQueryTime: number;
    slowQueries: number;
    cacheEfficiency: number;
    failedQueries: number;
  };
  recommendations: Array<{
    category: 'ai' | 'cache' | 'database' | 'general';
    priority: 'high' | 'medium' | 'low';
    description: string;
    estimatedImpact: string;
  }>;
}

export interface PerformanceAlert {
  id: string;
  timestamp: Date;
  severity: 'critical' | 'warning' | 'info';
  category: 'ai' | 'cache' | 'database' | 'memory';
  message: string;
  metrics: Record<string, number>;
  resolved: boolean;
}

/**
 * Performance monitoring dashboard service
 */
export class PerformanceDashboard {
  private alerts: PerformanceAlert[] = [];
  private alertThresholds = {
    aiResponseTime: 5000, // 5 seconds
    cacheHitRate: 50, // 50%
    databaseQueryTime: 1000, // 1 second
    memoryUsage: 100 * 1024 * 1024, // 100MB
    tokenUsagePerHour: 10000,
    failureRate: 10 // 10%
  };

  /**
   * Gets comprehensive system performance metrics
   */
  async getSystemMetrics(): Promise<SystemPerformanceMetrics> {
    const aiStats = performanceMonitor.getPerformanceStats(1); // Last hour
    const cacheStats = cachingService.getStats();
    const dbStats = databaseOptimizer.getPerformanceMetrics();
    const attendeeStats = attendeeValidator.getPerformanceMetrics();
    const conversationStats = conversationStorage.getQueryPerformanceMetrics();

    // Calculate total memory usage across all caches (approximate based on cache size)
    const totalMemoryUsage = cacheStats.size * 1024; // Rough estimate: 1KB per entry

    const metrics: SystemPerformanceMetrics = {
      timestamp: new Date(),
      aiServices: {
        totalCalls: aiStats.totalCalls,
        averageResponseTime: aiStats.averageResponseTime,
        successRate: aiStats.successRate * 100,
        tokenUsage: {
          total: aiStats.totalTokens,
          average: aiStats.totalCalls > 0 ? aiStats.totalTokens / aiStats.totalCalls : 0,
          efficiency: aiStats.tokenEfficiency * 100
        },
        compressionSavings: aiStats.compressionSavings * 100
      },
      caching: {
        attendeeValidation: {
          hitRate: attendeeStats.cacheStats.cacheEfficiency,
          size: attendeeStats.cacheStats.size,
          averageResponseTime: attendeeStats.cacheStats.averageValidationTime
        },
        databaseQueries: {
          hitRate: conversationStats.cacheHitRate,
          size: conversationStats.cacheStats.totalCacheSize,
          averageResponseTime: conversationStats.averageQueryTime
        },
        conversationContext: {
          hitRate: cacheStats.conversationContext?.hitRate || 0,
          size: cacheStats.conversationContext?.size || 0,
          averageResponseTime: cacheStats.conversationContext?.averageAccessTime || 0
        },
        totalMemoryUsage
      },
      database: {
        totalQueries: dbStats.queryCount,
        averageQueryTime: dbStats.averageExecutionTime,
        slowQueries: dbStats.slowQueries,
        cacheEfficiency: dbStats.cacheHitRate,
        failedQueries: dbStats.failedQueries
      },
      recommendations: await this.generateRecommendations()
    };

    // Check for performance alerts
    await this.checkPerformanceAlerts(metrics);

    return metrics;
  }

  /**
   * Gets performance trends over time
   */
  async getPerformanceTrends(hours: number = 24): Promise<{
    aiResponseTimes: Array<{ hour: number; averageTime: number }>;
    tokenUsage: Array<{ hour: number; tokens: number }>;
    cacheHitRates: Array<{ hour: number; hitRate: number }>;
    databaseQueryTimes: Array<{ hour: number; averageTime: number }>;
  }> {
    const tokenTrends = performanceMonitor.getTokenUsageTrends(hours);
    
    // For now, return mock data for other trends
    // In a real implementation, you'd store historical data
    const hourlyData = Array.from({ length: hours }, (_, i) => ({
      hour: i,
      averageTime: Math.random() * 1000 + 500,
      hitRate: Math.random() * 40 + 60,
      queryTime: Math.random() * 200 + 100
    }));

    return {
      aiResponseTimes: hourlyData.map(d => ({ hour: d.hour, averageTime: d.averageTime })),
      tokenUsage: tokenTrends,
      cacheHitRates: hourlyData.map(d => ({ hour: d.hour, hitRate: d.hitRate })),
      databaseQueryTimes: hourlyData.map(d => ({ hour: d.hour, averageTime: d.queryTime }))
    };
  }

  /**
   * Gets active performance alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Gets all performance alerts
   */
  getAllAlerts(limit: number = 50): PerformanceAlert[] {
    return this.alerts
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Resolves a performance alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      return true;
    }
    return false;
  }

  /**
   * Gets performance health score (0-100)
   */
  async getHealthScore(): Promise<{
    overall: number;
    breakdown: {
      aiServices: number;
      caching: number;
      database: number;
      memory: number;
    };
  }> {
    const metrics = await this.getSystemMetrics();
    
    // Calculate individual scores
    const aiScore = this.calculateAIHealthScore(metrics.aiServices);
    const cacheScore = this.calculateCacheHealthScore(metrics.caching);
    const dbScore = this.calculateDatabaseHealthScore(metrics.database);
    const memoryScore = this.calculateMemoryHealthScore(metrics.caching.totalMemoryUsage);

    // Calculate overall score (weighted average)
    const overall = Math.round(
      (aiScore * 0.3 + cacheScore * 0.25 + dbScore * 0.3 + memoryScore * 0.15)
    );

    return {
      overall,
      breakdown: {
        aiServices: aiScore,
        caching: cacheScore,
        database: dbScore,
        memory: memoryScore
      }
    };
  }

  /**
   * Exports performance data for analysis
   */
  async exportPerformanceData(format: 'json' | 'csv' = 'json'): Promise<string> {
    const metrics = await this.getSystemMetrics();
    const trends = await this.getPerformanceTrends(24);
    const alerts = this.getAllAlerts();
    const healthScore = await this.getHealthScore();

    const data = {
      timestamp: new Date().toISOString(),
      metrics,
      trends,
      alerts,
      healthScore
    };

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else {
      // Convert to CSV format (simplified)
      const csvLines = [
        'Timestamp,Category,Metric,Value',
        `${data.timestamp},AI,Total Calls,${metrics.aiServices.totalCalls}`,
        `${data.timestamp},AI,Average Response Time,${metrics.aiServices.averageResponseTime}`,
        `${data.timestamp},AI,Success Rate,${metrics.aiServices.successRate}`,
        `${data.timestamp},Cache,Attendee Validation Hit Rate,${metrics.caching.attendeeValidation.hitRate}`,
        `${data.timestamp},Cache,Database Query Hit Rate,${metrics.caching.databaseQueries.hitRate}`,
        `${data.timestamp},Database,Total Queries,${metrics.database.totalQueries}`,
        `${data.timestamp},Database,Average Query Time,${metrics.database.averageQueryTime}`,
        `${data.timestamp},Database,Slow Queries,${metrics.database.slowQueries}`
      ];
      return csvLines.join('\n');
    }
  }

  /**
   * Generates performance optimization recommendations
   */
  private async generateRecommendations(): Promise<Array<{
    category: 'ai' | 'cache' | 'database' | 'general';
    priority: 'high' | 'medium' | 'low';
    description: string;
    estimatedImpact: string;
  }>> {
    const recommendations: Array<{
      category: 'ai' | 'cache' | 'database' | 'general';
      priority: 'high' | 'medium' | 'low';
      description: string;
      estimatedImpact: string;
    }> = [];

    // Get recommendations from individual services
    const aiRecommendations = performanceMonitor.getOptimizationRecommendations();
    const cacheStats = cachingService.getStats();
    const dbRecommendations = databaseOptimizer.getOptimizationRecommendations();

    // Convert AI recommendations
    aiRecommendations.forEach(rec => {
      recommendations.push({
        category: 'ai' as const,
        priority: rec.priority,
        description: rec.description,
        estimatedImpact: `${rec.estimatedSavings.tokens} tokens, ${rec.estimatedSavings.responseTime}ms saved`
      });
    });

    // Add cache recommendations if cache is getting full
    if (cacheStats.size > 500) {
      recommendations.push({
        category: 'cache' as const,
        priority: 'medium',
        description: 'Cache is accumulating many entries',
        estimatedImpact: `Current cache size: ${cacheStats.size} entries. Consider running cleanup.`
      });
    }

    // Convert database recommendations
    dbRecommendations.forEach(rec => {
      recommendations.push({
        category: 'database' as const,
        priority: rec.priority,
        description: rec.description,
        estimatedImpact: rec.estimatedImprovement
      });
    });

    return recommendations.sort((a, b) => {
      const priorityOrder: { [key: string]: number } = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Checks for performance alerts and creates new ones
   */
  private async checkPerformanceAlerts(metrics: SystemPerformanceMetrics): Promise<void> {
    const newAlerts: PerformanceAlert[] = [];

    // Check AI response time
    if (metrics.aiServices.averageResponseTime > this.alertThresholds.aiResponseTime) {
      newAlerts.push({
        id: this.generateAlertId(),
        timestamp: new Date(),
        severity: 'warning',
        category: 'ai',
        message: `AI response time is high: ${metrics.aiServices.averageResponseTime}ms`,
        metrics: { responseTime: metrics.aiServices.averageResponseTime },
        resolved: false
      });
    }

    // Check cache hit rates
    if (metrics.caching.attendeeValidation.hitRate < this.alertThresholds.cacheHitRate) {
      newAlerts.push({
        id: this.generateAlertId(),
        timestamp: new Date(),
        severity: 'warning',
        category: 'cache',
        message: `Attendee validation cache hit rate is low: ${metrics.caching.attendeeValidation.hitRate}%`,
        metrics: { hitRate: metrics.caching.attendeeValidation.hitRate },
        resolved: false
      });
    }

    // Check database query time
    if (metrics.database.averageQueryTime > this.alertThresholds.databaseQueryTime) {
      newAlerts.push({
        id: this.generateAlertId(),
        timestamp: new Date(),
        severity: 'warning',
        category: 'database',
        message: `Database query time is high: ${metrics.database.averageQueryTime}ms`,
        metrics: { queryTime: metrics.database.averageQueryTime },
        resolved: false
      });
    }

    // Check memory usage
    if (metrics.caching.totalMemoryUsage > this.alertThresholds.memoryUsage) {
      newAlerts.push({
        id: this.generateAlertId(),
        timestamp: new Date(),
        severity: 'critical',
        category: 'memory',
        message: `High memory usage: ${Math.round(metrics.caching.totalMemoryUsage / 1024 / 1024)}MB`,
        metrics: { memoryUsage: metrics.caching.totalMemoryUsage },
        resolved: false
      });
    }

    // Add new alerts
    this.alerts.push(...newAlerts);

    // Keep only recent alerts (last 1000)
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }
  }

  /**
   * Calculates AI services health score
   */
  private calculateAIHealthScore(aiMetrics: SystemPerformanceMetrics['aiServices']): number {
    let score = 100;

    // Penalize slow response times
    if (aiMetrics.averageResponseTime > 3000) score -= 20;
    else if (aiMetrics.averageResponseTime > 2000) score -= 10;

    // Penalize low success rate
    if (aiMetrics.successRate < 90) score -= 30;
    else if (aiMetrics.successRate < 95) score -= 15;

    // Penalize low token efficiency
    if (aiMetrics.tokenUsage.efficiency < 80) score -= 15;
    else if (aiMetrics.tokenUsage.efficiency < 90) score -= 8;

    return Math.max(0, score);
  }

  /**
   * Calculates cache health score
   */
  private calculateCacheHealthScore(cacheMetrics: SystemPerformanceMetrics['caching']): number {
    let score = 100;

    // Average hit rate across all caches
    const avgHitRate = (
      cacheMetrics.attendeeValidation.hitRate +
      cacheMetrics.databaseQueries.hitRate +
      cacheMetrics.conversationContext.hitRate
    ) / 3;

    if (avgHitRate < 50) score -= 30;
    else if (avgHitRate < 70) score -= 15;

    // Penalize slow cache response times
    const avgResponseTime = (
      cacheMetrics.attendeeValidation.averageResponseTime +
      cacheMetrics.databaseQueries.averageResponseTime +
      cacheMetrics.conversationContext.averageResponseTime
    ) / 3;

    if (avgResponseTime > 50) score -= 20;
    else if (avgResponseTime > 25) score -= 10;

    return Math.max(0, score);
  }

  /**
   * Calculates database health score
   */
  private calculateDatabaseHealthScore(dbMetrics: SystemPerformanceMetrics['database']): number {
    let score = 100;

    // Penalize slow queries
    if (dbMetrics.averageQueryTime > 1000) score -= 25;
    else if (dbMetrics.averageQueryTime > 500) score -= 12;

    // Penalize high number of slow queries
    const slowQueryRate = dbMetrics.totalQueries > 0 ? (dbMetrics.slowQueries / dbMetrics.totalQueries) * 100 : 0;
    if (slowQueryRate > 10) score -= 20;
    else if (slowQueryRate > 5) score -= 10;

    // Penalize failed queries
    const failureRate = dbMetrics.totalQueries > 0 ? (dbMetrics.failedQueries / dbMetrics.totalQueries) * 100 : 0;
    if (failureRate > 5) score -= 30;
    else if (failureRate > 2) score -= 15;

    return Math.max(0, score);
  }

  /**
   * Calculates memory health score
   */
  private calculateMemoryHealthScore(memoryUsage: number): number {
    let score = 100;
    const usageMB = memoryUsage / 1024 / 1024;

    if (usageMB > 200) score -= 40;
    else if (usageMB > 100) score -= 20;
    else if (usageMB > 50) score -= 10;

    return Math.max(0, score);
  }

  /**
   * Generates a unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Global performance dashboard instance
export const performanceDashboard = new PerformanceDashboard();