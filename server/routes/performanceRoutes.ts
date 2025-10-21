/**
 * Performance monitoring API routes
 */

import { Router } from 'express';
import { performanceDashboard } from '../performanceDashboard';
import { cachingService } from '../cachingService';
import { databaseOptimizer } from '../databaseOptimizer';
import { performanceMonitor } from '../performanceMonitor';
import { attendeeValidator } from '../attendeeValidator';
import { conversationStorage } from '../conversationStorage';

const router = Router();

/**
 * GET /api/performance/metrics
 * Get comprehensive system performance metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await performanceDashboard.getSystemMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error getting performance metrics:', error);
    res.status(500).json({ error: 'Failed to get performance metrics' });
  }
});

/**
 * GET /api/performance/health
 * Get system health score
 */
router.get('/health', async (req, res) => {
  try {
    const healthScore = await performanceDashboard.getHealthScore();
    res.json(healthScore);
  } catch (error) {
    console.error('Error getting health score:', error);
    res.status(500).json({ error: 'Failed to get health score' });
  }
});

/**
 * GET /api/performance/trends
 * Get performance trends over time
 */
router.get('/trends', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const trends = await performanceDashboard.getPerformanceTrends(hours);
    res.json(trends);
  } catch (error) {
    console.error('Error getting performance trends:', error);
    res.status(500).json({ error: 'Failed to get performance trends' });
  }
});

/**
 * GET /api/performance/alerts
 * Get performance alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const activeOnly = req.query.active === 'true';
    const limit = parseInt(req.query.limit as string) || 50;
    
    const alerts = activeOnly 
      ? performanceDashboard.getActiveAlerts()
      : performanceDashboard.getAllAlerts(limit);
    
    res.json(alerts);
  } catch (error) {
    console.error('Error getting performance alerts:', error);
    res.status(500).json({ error: 'Failed to get performance alerts' });
  }
});

/**
 * POST /api/performance/alerts/:id/resolve
 * Resolve a performance alert
 */
router.post('/alerts/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const resolved = performanceDashboard.resolveAlert(id);
    
    if (resolved) {
      res.json({ success: true, message: 'Alert resolved' });
    } else {
      res.status(404).json({ error: 'Alert not found' });
    }
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

/**
 * GET /api/performance/cache/stats
 * Get cache statistics
 */
router.get('/cache/stats', async (req, res) => {
  try {
    const allStats = cachingService.getStats();
    const attendeeStats = attendeeValidator.getCacheStats();
    const conversationStats = conversationStorage.getQueryPerformanceMetrics();
    
    res.json({
      cacheManager: allStats,
      attendeeValidation: attendeeStats,
      conversationStorage: conversationStats
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({ error: 'Failed to get cache statistics' });
  }
});

/**
 * POST /api/performance/cache/clear
 * Clear all caches
 */
router.post('/cache/clear', async (req, res) => {
  try {
    const { cacheType } = req.body;
    
    if (cacheType === 'all' || !cacheType) {
      cachingService.clear();
      attendeeValidator.clearCache();
      conversationStorage.clearCaches();
      databaseOptimizer.clearCaches();
    } else if (cacheType === 'attendee') {
      attendeeValidator.clearCache();
    } else if (cacheType === 'conversation') {
      conversationStorage.clearCaches();
    } else if (cacheType === 'database') {
      databaseOptimizer.clearCaches();
    } else {
      return res.status(400).json({ error: 'Invalid cache type' });
    }
    
    res.json({ success: true, message: `${cacheType || 'all'} cache(s) cleared` });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

/**
 * GET /api/performance/database/stats
 * Get database performance statistics
 */
router.get('/database/stats', async (req, res) => {
  try {
    const stats = databaseOptimizer.getPerformanceMetrics();
    const recommendations = databaseOptimizer.getOptimizationRecommendations();
    
    res.json({
      metrics: stats,
      recommendations
    });
  } catch (error) {
    console.error('Error getting database stats:', error);
    res.status(500).json({ error: 'Failed to get database statistics' });
  }
});

/**
 * GET /api/performance/ai/stats
 * Get AI service performance statistics
 */
router.get('/ai/stats', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const stats = performanceMonitor.getPerformanceStats(hours);
    const tokenBudget = performanceMonitor.checkTokenBudget(1);
    const trends = performanceMonitor.getTokenUsageTrends(hours);
    const expensiveOps = performanceMonitor.getMostExpensiveOperations();
    
    res.json({
      stats,
      tokenBudget,
      trends,
      expensiveOperations: expensiveOps
    });
  } catch (error) {
    console.error('Error getting AI stats:', error);
    res.status(500).json({ error: 'Failed to get AI statistics' });
  }
});

/**
 * GET /api/performance/recommendations
 * Get optimization recommendations
 */
router.get('/recommendations', async (req, res) => {
  try {
    const aiRecommendations = performanceMonitor.getOptimizationRecommendations();
    const cacheStats = cachingService.getStats();
    const dbRecommendations = databaseOptimizer.getOptimizationRecommendations();
    
    // Generate basic cache recommendations
    const cacheRecommendations: any[] = [];
    if (cacheStats.size > 500) {
      cacheRecommendations.push({
        priority: 'medium',
        description: 'Cache is accumulating entries',
        suggestedAction: 'Run cache cleanup to remove expired entries'
      });
    }
    
    res.json({
      ai: aiRecommendations,
      cache: cacheRecommendations,
      database: dbRecommendations
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

/**
 * GET /api/performance/export
 * Export performance data
 */
router.get('/export', async (req, res) => {
  try {
    const format = (req.query.format as string) || 'json';
    
    if (format !== 'json' && format !== 'csv') {
      return res.status(400).json({ error: 'Invalid format. Use json or csv' });
    }
    
    const data = await performanceDashboard.exportPerformanceData(format as 'json' | 'csv');
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=performance-data.csv');
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=performance-data.json');
    }
    
    res.send(data);
  } catch (error) {
    console.error('Error exporting performance data:', error);
    res.status(500).json({ error: 'Failed to export performance data' });
  }
});

/**
 * POST /api/performance/preload/:userId
 * Preload user data into caches
 */
router.post('/preload/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Preload user data into various caches
    await Promise.allSettled([
      databaseOptimizer.preloadUserData(userId),
      conversationStorage.preloadCache(userId)
    ]);
    
    res.json({ success: true, message: 'User data preloaded into caches' });
  } catch (error) {
    console.error('Error preloading user data:', error);
    res.status(500).json({ error: 'Failed to preload user data' });
  }
});

export default router;