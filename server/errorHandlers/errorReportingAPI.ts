/**
 * Error Reporting API endpoints for monitoring and analytics
 * Requirements: 7.3 - Create error reporting and analytics integration
 */

import { Request, Response } from 'express';
import { errorLogger, ErrorSeverity, ErrorCategory, searchErrors, getErrorAnalytics, markErrorResolved } from './errorLogger.js';
import { errorAnalyticsService } from './errorAnalyticsService.js';

/**
 * Get error analytics and statistics
 */
export async function getErrorAnalyticsEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const { timeRange, severity, category } = req.query;
    
    // Parse time range
    let start: Date | undefined;
    let end: Date | undefined;
    
    if (timeRange) {
      const range = timeRange as string;
      const now = new Date();
      
      switch (range) {
        case '1h':
          start = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          // Try to parse custom range
          try {
            const [startStr, endStr] = range.split(',');
            start = new Date(startStr);
            end = new Date(endStr);
          } catch (error) {
            res.status(400).json({ error: 'Invalid time range format' });
            return;
          }
      }
      
      if (!end) {
        end = now;
      }
    }

    // Get analytics
    const analytics = getErrorAnalytics(start && end ? { start, end } : undefined);
    
    // Get current metrics
    const metrics = await errorAnalyticsService.getErrorMetrics(24);
    
    // Get dashboard stats
    const dashboardStats = await errorAnalyticsService.getDashboardStats();

    res.json({
      analytics,
      metrics,
      dashboardStats,
      timeRange: start && end ? { start, end } : null
    });

  } catch (error) {
    console.error('Error in getErrorAnalytics endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve error analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Search errors with filters
 */
export async function searchErrorsEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const { 
      severity, 
      category, 
      userId, 
      message, 
      tags, 
      timeRange,
      limit = 100,
      offset = 0
    } = req.query;

    // Parse time range
    let start: Date | undefined;
    let end: Date | undefined;
    
    if (timeRange) {
      try {
        const [startStr, endStr] = (timeRange as string).split(',');
        start = new Date(startStr);
        end = new Date(endStr);
      } catch (error) {
        res.status(400).json({ error: 'Invalid time range format. Use: start,end' });
        return;
      }
    }

    // Parse tags
    let parsedTags: string[] | undefined;
    if (tags) {
      parsedTags = (tags as string).split(',').map(tag => tag.trim());
    }

    // Build search criteria
    const criteria: any = {};
    if (severity) criteria.severity = severity as ErrorSeverity;
    if (category) criteria.category = category as ErrorCategory;
    if (userId) criteria.userId = userId as string;
    if (message) criteria.message = message as string;
    if (parsedTags) criteria.tags = parsedTags;
    if (start && end) criteria.timeRange = { start, end };

    // Search errors
    const allErrors = searchErrors(criteria);
    
    // Apply pagination
    const limitNum = parseInt(limit as string);
    const offsetNum = parseInt(offset as string);
    const paginatedErrors = allErrors.slice(offsetNum, offsetNum + limitNum);

    res.json({
      errors: paginatedErrors,
      total: allErrors.length,
      limit: limitNum,
      offset: offsetNum,
      hasMore: offsetNum + limitNum < allErrors.length
    });

  } catch (error) {
    console.error('Error in searchErrors endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to search errors',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get specific error by ID
 */
export async function getErrorByIdEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const { errorId } = req.params;
    
    if (!errorId) {
      res.status(400).json({ error: 'Error ID is required' });
      return;
    }

    const error = errorLogger.getError(errorId);
    
    if (!error) {
      res.status(404).json({ error: 'Error not found' });
      return;
    }

    res.json({ error });

  } catch (error) {
    console.error('Error in getErrorById endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Mark error as resolved
 */
export async function markErrorResolvedEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const { errorId } = req.params;
    const { resolvedBy } = req.body;
    
    if (!errorId) {
      res.status(400).json({ error: 'Error ID is required' });
      return;
    }

    const success = markErrorResolved(errorId, resolvedBy);
    
    if (!success) {
      res.status(404).json({ error: 'Error not found' });
      return;
    }

    res.json({ 
      success: true, 
      message: 'Error marked as resolved',
      resolvedBy,
      resolvedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in markErrorResolved endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to mark error as resolved',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Generate error report
 */
export async function generateErrorReportEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const { timeRange, format = 'json' } = req.query;
    
    // Parse time range (default to last 24 hours)
    let start: Date;
    let end: Date = new Date();
    
    if (timeRange) {
      const range = timeRange as string;
      const now = new Date();
      
      switch (range) {
        case '1h':
          start = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          try {
            const [startStr, endStr] = range.split(',');
            start = new Date(startStr);
            end = new Date(endStr);
          } catch (error) {
            res.status(400).json({ error: 'Invalid time range format' });
            return;
          }
      }
    } else {
      start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    }

    // Generate report
    const report = await errorAnalyticsService.generateErrorReport({ start, end });

    if (format === 'csv') {
      // Generate CSV format
      const csv = generateCSVReport(report);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="error-report-${start.toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } else {
      // Return JSON format
      res.json({
        report,
        generatedAt: new Date().toISOString(),
        timeRange: { start, end }
      });
    }

  } catch (error) {
    console.error('Error in generateErrorReport endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to generate error report',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get system health status
 */
export async function getSystemHealthEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const metrics = await errorAnalyticsService.getErrorMetrics(24);
    const dashboardStats = await errorAnalyticsService.getDashboardStats();

    res.json({
      health: metrics.systemHealth,
      currentErrorRate: metrics.currentErrorRate,
      averageErrorRate: metrics.averageErrorRate,
      recentAlerts: dashboardStats.alerts.slice(0, 5),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in getSystemHealth endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve system health',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Configure error alerts
 */
export async function configureAlertsEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const alertConfig = req.body;
    
    // Validate alert configuration
    if (!alertConfig || typeof alertConfig !== 'object') {
      res.status(400).json({ error: 'Invalid alert configuration' });
      return;
    }

    errorAnalyticsService.configureAlerts(alertConfig);

    res.json({ 
      success: true, 
      message: 'Alert configuration updated',
      config: errorAnalyticsService.getAlertConfig()
    });

  } catch (error) {
    console.error('Error in configureAlerts endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to configure alerts',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get current alert configuration
 */
export async function getAlertConfigEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const config = errorAnalyticsService.getAlertConfig();
    res.json({ config });

  } catch (error) {
    console.error('Error in getAlertConfig endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve alert configuration',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Clear error logs (admin only)
 */
export async function clearErrorLogsEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const { olderThan } = req.query;
    
    let cutoffDate: Date;
    if (olderThan) {
      cutoffDate = new Date(olderThan as string);
      if (isNaN(cutoffDate.getTime())) {
        res.status(400).json({ error: 'Invalid date format for olderThan parameter' });
        return;
      }
    } else {
      // Default to clearing logs older than 30 days
      cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const clearedCount = errorLogger.clearOldLogs(cutoffDate);

    res.json({ 
      success: true, 
      message: `Cleared ${clearedCount} error logs`,
      clearedCount,
      cutoffDate: cutoffDate.toISOString()
    });

  } catch (error) {
    console.error('Error in clearErrorLogs endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to clear error logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Generate CSV report from error report data
 */
function generateCSVReport(report: any): string {
  const headers = [
    'Date',
    'Total Errors',
    'Critical Errors',
    'High Errors',
    'Medium Errors',
    'Low Errors',
    'System Health Score',
    'System Health Status',
    'Error Rate (per minute)',
    'Top Error Category',
    'Top Error Type'
  ];

  const rows = [headers.join(',')];

  // Add summary row
  const summary = report.summary;
  const analytics = report.analytics;
  
  const summaryRow = [
    summary.timeRange.start.split('T')[0],
    summary.totalErrors,
    analytics.errorsBySeverity[ErrorSeverity.CRITICAL] || 0,
    analytics.errorsBySeverity[ErrorSeverity.HIGH] || 0,
    analytics.errorsBySeverity[ErrorSeverity.MEDIUM] || 0,
    analytics.errorsBySeverity[ErrorSeverity.LOW] || 0,
    summary.systemHealthScore,
    summary.systemHealthStatus,
    summary.errorRate.toFixed(2),
    summary.mostCommonCategory?.key || 'N/A',
    Object.keys(analytics.errorsByType)[0] || 'N/A'
  ];

  rows.push(summaryRow.join(','));

  // Add daily breakdown if available
  if (analytics.errorTrends && analytics.errorTrends.length > 0) {
    rows.push(''); // Empty row
    rows.push('Daily Breakdown:');
    rows.push('Date,Count,Severity');
    
    analytics.errorTrends.forEach((trend: any) => {
      rows.push(`${trend.date},${trend.count},${trend.severity}`);
    });
  }

  return rows.join('\n');
}

/**
 * Middleware to validate admin access for sensitive operations
 */
export function requireAdminAccess(req: Request, res: Response, next: Function): void {
  // In production, implement proper admin authentication
  const isAdmin = req.headers['x-admin-key'] === process.env.ADMIN_API_KEY;
  
  if (!isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  
  next();
}

/**
 * Error reporting middleware to automatically log API errors
 */
export function errorReportingMiddleware(error: any, req: Request, res: Response, next: Function): void {
  // Log the error automatically
  errorLogger.logError(error, {
    userId: (req as any).user?.id,
    operationName: `${req.method} ${req.path}`,
    requestId: req.headers['x-request-id'] as string,
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip
  }).catch(logError => {
    console.error('Failed to log error in middleware:', logError);
  });

  // Continue with normal error handling
  next(error);
}