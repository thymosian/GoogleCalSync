/**
 * Error Analytics Service for monitoring, reporting, and alerting
 * Requirements: 7.3 - Create error reporting and analytics integration
 */

import { errorLogger, ErrorSeverity, ErrorCategory, ErrorLogEntry, ErrorAnalytics } from './errorLogger.js';

/**
 * Alert configuration for error monitoring
 */
export interface AlertConfig {
  enabled: boolean;
  thresholds: {
    criticalErrorCount: number;
    highErrorCount: number;
    errorRatePerMinute: number;
    errorRatePerHour: number;
  };
  timeWindows: {
    immediate: number; // minutes
    short: number; // minutes  
    medium: number; // hours
    long: number; // hours
  };
  notifications: {
    email?: string[];
    webhook?: string;
    slack?: string;
  };
}

/**
 * Error monitoring metrics
 */
export interface ErrorMetrics {
  currentErrorRate: number; // errors per minute
  averageErrorRate: number; // errors per minute over time window
  errorSpikes: Array<{
    timestamp: Date;
    count: number;
    severity: ErrorSeverity;
    duration: number; // minutes
  }>;
  topErrorPatterns: Array<{
    pattern: string;
    count: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  }>;
  systemHealth: {
    status: 'healthy' | 'degraded' | 'critical';
    score: number; // 0-100
    issues: string[];
  };
}

/**
 * Error report configuration
 */
export interface ReportConfig {
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  includeCharts: boolean;
  includeDetails: boolean;
  filterSeverity?: ErrorSeverity[];
  filterCategories?: ErrorCategory[];
}

/**
 * Error Analytics Service
 */
export class ErrorAnalyticsService {
  private alertConfig: AlertConfig = {
    enabled: true,
    thresholds: {
      criticalErrorCount: 1, // Any critical error triggers alert
      highErrorCount: 5, // 5 high severity errors in time window
      errorRatePerMinute: 10, // 10 errors per minute
      errorRatePerHour: 100 // 100 errors per hour
    },
    timeWindows: {
      immediate: 5, // 5 minutes
      short: 15, // 15 minutes
      medium: 1, // 1 hour
      long: 24 // 24 hours
    },
    notifications: {
      email: [],
      webhook: undefined,
      slack: undefined
    }
  };

  private reportConfigs: ReportConfig[] = [];
  private alertHistory = new Map<string, Date>();
  private metricsCache = new Map<string, { data: any; timestamp: Date }>();
  private monitoringInterval?: NodeJS.Timeout;

  constructor() {
    this.startMonitoring();
  }

  /**
   * Start error monitoring and alerting
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Check for alerts every minute
    this.monitoringInterval = setInterval(() => {
      this.checkAlerts().catch(error => {
        console.error('Error in alert checking:', error);
      });
    }, 60000); // 1 minute

    console.log('Error analytics monitoring started');
  }

  /**
   * Stop error monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    console.log('Error analytics monitoring stopped');
  }

  /**
   * Check for alert conditions
   */
  private async checkAlerts(): Promise<void> {
    if (!this.alertConfig.enabled) {
      return;
    }

    const now = new Date();
    const metrics = await this.getErrorMetrics();

    // Check critical error threshold
    const criticalErrors = this.getRecentErrors(
      this.alertConfig.timeWindows.immediate,
      ErrorSeverity.CRITICAL
    );

    if (criticalErrors.length >= this.alertConfig.thresholds.criticalErrorCount) {
      await this.sendAlert('critical_errors', {
        message: `${criticalErrors.length} critical error(s) detected in the last ${this.alertConfig.timeWindows.immediate} minutes`,
        errors: criticalErrors.slice(0, 5), // Include first 5 errors
        severity: 'critical',
        timestamp: now
      });
    }

    // Check high error count threshold
    const highErrors = this.getRecentErrors(
      this.alertConfig.timeWindows.short,
      ErrorSeverity.HIGH
    );

    if (highErrors.length >= this.alertConfig.thresholds.highErrorCount) {
      await this.sendAlert('high_error_count', {
        message: `${highErrors.length} high severity errors detected in the last ${this.alertConfig.timeWindows.short} minutes`,
        errors: highErrors.slice(0, 3),
        severity: 'high',
        timestamp: now
      });
    }

    // Check error rate threshold
    if (metrics.currentErrorRate >= this.alertConfig.thresholds.errorRatePerMinute) {
      await this.sendAlert('high_error_rate', {
        message: `High error rate detected: ${metrics.currentErrorRate.toFixed(2)} errors/minute`,
        currentRate: metrics.currentErrorRate,
        threshold: this.alertConfig.thresholds.errorRatePerMinute,
        severity: 'high',
        timestamp: now
      });
    }

    // Check system health
    if (metrics.systemHealth.status === 'critical') {
      await this.sendAlert('system_health_critical', {
        message: `System health is critical (score: ${metrics.systemHealth.score})`,
        issues: metrics.systemHealth.issues,
        severity: 'critical',
        timestamp: now
      });
    }
  }

  /**
   * Get recent errors within time window
   */
  private getRecentErrors(
    timeWindowMinutes: number,
    severity?: ErrorSeverity
  ): ErrorLogEntry[] {
    const cutoff = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    
    return errorLogger.searchErrors({
      timeRange: { start: cutoff, end: new Date() },
      severity
    });
  }

  /**
   * Send alert notification
   */
  private async sendAlert(alertType: string, alertData: any): Promise<void> {
    const alertKey = `${alertType}_${new Date().toISOString().split('T')[0]}`;
    
    // Check if we've already sent this alert today (prevent spam)
    const lastAlert = this.alertHistory.get(alertKey);
    if (lastAlert && Date.now() - lastAlert.getTime() < 3600000) { // 1 hour cooldown
      return;
    }

    this.alertHistory.set(alertKey, new Date());

    try {
      // Log the alert
      console.error(`🚨 ALERT [${alertType}]:`, alertData);

      // Send email notifications
      if (this.alertConfig.notifications.email?.length) {
        await this.sendEmailAlert(alertType, alertData);
      }

      // Send webhook notifications
      if (this.alertConfig.notifications.webhook) {
        await this.sendWebhookAlert(alertType, alertData);
      }

      // Send Slack notifications
      if (this.alertConfig.notifications.slack) {
        await this.sendSlackAlert(alertType, alertData);
      }

    } catch (error) {
      console.error('Failed to send alert:', error);
    }
  }

  /**
   * Send email alert (placeholder implementation)
   */
  private async sendEmailAlert(alertType: string, alertData: any): Promise<void> {
    // In production, integrate with email service (SendGrid, SES, etc.)
    console.log(`📧 Email alert [${alertType}] would be sent to:`, this.alertConfig.notifications.email);
    console.log('Alert data:', alertData);
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alertType: string, alertData: any): Promise<void> {
    try {
      const response = await fetch(this.alertConfig.notifications.webhook!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          alertType,
          timestamp: new Date().toISOString(),
          service: 'conversational-meeting-scheduler',
          environment: process.env.NODE_ENV || 'development',
          ...alertData
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook alert failed: ${response.status} ${response.statusText}`);
      }

      console.log(`🔗 Webhook alert [${alertType}] sent successfully`);
    } catch (error) {
      console.error('Failed to send webhook alert:', error);
    }
  }

  /**
   * Send Slack alert (placeholder implementation)
   */
  private async sendSlackAlert(alertType: string, alertData: any): Promise<void> {
    try {
      const slackMessage = {
        text: `🚨 Error Alert: ${alertType}`,
        attachments: [
          {
            color: alertData.severity === 'critical' ? 'danger' : 'warning',
            fields: [
              {
                title: 'Message',
                value: alertData.message,
                short: false
              },
              {
                title: 'Timestamp',
                value: alertData.timestamp,
                short: true
              },
              {
                title: 'Environment',
                value: process.env.NODE_ENV || 'development',
                short: true
              }
            ]
          }
        ]
      };

      const response = await fetch(this.alertConfig.notifications.slack!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(slackMessage)
      });

      if (!response.ok) {
        throw new Error(`Slack alert failed: ${response.status} ${response.statusText}`);
      }

      console.log(`💬 Slack alert [${alertType}] sent successfully`);
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }

  /**
   * Get comprehensive error metrics
   */
  async getErrorMetrics(timeWindowHours: number = 24): Promise<ErrorMetrics> {
    const cacheKey = `metrics_${timeWindowHours}h`;
    const cached = this.metricsCache.get(cacheKey);
    
    // Return cached data if less than 5 minutes old
    if (cached && Date.now() - cached.timestamp.getTime() < 300000) {
      return cached.data;
    }

    const now = new Date();
    const timeWindow = new Date(now.getTime() - timeWindowHours * 60 * 60 * 1000);
    
    const analytics = errorLogger.getAnalytics({ start: timeWindow, end: now });
    const recentErrors = errorLogger.searchErrors({
      timeRange: { start: new Date(now.getTime() - 60000), end: now } // Last minute
    });

    // Calculate current error rate (errors per minute)
    const currentErrorRate = recentErrors.length;

    // Calculate average error rate over time window
    const totalMinutes = timeWindowHours * 60;
    const averageErrorRate = analytics.totalErrors / totalMinutes;

    // Detect error spikes
    const errorSpikes = this.detectErrorSpikes(analytics.errorTrends);

    // Analyze error patterns
    const topErrorPatterns = this.analyzeErrorPatterns(analytics.topErrors);

    // Calculate system health
    const systemHealth = this.calculateSystemHealth(analytics, currentErrorRate);

    const metrics: ErrorMetrics = {
      currentErrorRate,
      averageErrorRate,
      errorSpikes,
      topErrorPatterns,
      systemHealth
    };

    // Cache the results
    this.metricsCache.set(cacheKey, {
      data: metrics,
      timestamp: now
    });

    return metrics;
  }

  /**
   * Detect error spikes in trends
   */
  private detectErrorSpikes(trends: ErrorAnalytics['errorTrends']): ErrorMetrics['errorSpikes'] {
    const spikes: ErrorMetrics['errorSpikes'] = [];
    
    // Group trends by date and calculate daily totals
    const dailyTotals = new Map<string, { count: number; severities: Map<ErrorSeverity, number> }>();
    
    trends.forEach(trend => {
      if (!dailyTotals.has(trend.date)) {
        dailyTotals.set(trend.date, { count: 0, severities: new Map() });
      }
      
      const daily = dailyTotals.get(trend.date)!;
      daily.count += trend.count;
      daily.severities.set(trend.severity, (daily.severities.get(trend.severity) || 0) + trend.count);
    });

    // Calculate average and detect spikes (> 2x average)
    const counts = Array.from(dailyTotals.values()).map(d => d.count);
    const average = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    const threshold = average * 2;

    dailyTotals.forEach((daily, date) => {
      if (daily.count > threshold) {
        // Find the most severe error type in the spike
        let topSeverity = ErrorSeverity.INFO;
        let maxCount = 0;
        
        daily.severities.forEach((count, severity) => {
          if (count > maxCount) {
            maxCount = count;
            topSeverity = severity;
          }
        });

        spikes.push({
          timestamp: new Date(date),
          count: daily.count,
          severity: topSeverity,
          duration: 1440 // Assume 1 day duration for daily spikes
        });
      }
    });

    return spikes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 5);
  }

  /**
   * Analyze error patterns and trends
   */
  private analyzeErrorPatterns(topErrors: ErrorAnalytics['topErrors']): ErrorMetrics['topErrorPatterns'] {
    return topErrors.slice(0, 10).map(error => {
      // Simple trend analysis based on recent occurrences
      const recentOccurrences = Date.now() - error.lastOccurrence.getTime();
      const isRecent = recentOccurrences < 3600000; // Within last hour
      
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      
      if (isRecent && error.count > 5) {
        trend = 'increasing';
      } else if (!isRecent) {
        trend = 'decreasing';
      }

      return {
        pattern: error.message.substring(0, 100), // Truncate long messages
        count: error.count,
        trend
      };
    });
  }

  /**
   * Calculate system health score and status
   */
  private calculateSystemHealth(
    analytics: ErrorAnalytics,
    currentErrorRate: number
  ): ErrorMetrics['systemHealth'] {
    let score = 100;
    const issues: string[] = [];

    // Deduct points for critical errors
    const criticalCount = analytics.errorsBySeverity[ErrorSeverity.CRITICAL] || 0;
    if (criticalCount > 0) {
      score -= criticalCount * 20; // 20 points per critical error
      issues.push(`${criticalCount} critical error(s) detected`);
    }

    // Deduct points for high severity errors
    const highCount = analytics.errorsBySeverity[ErrorSeverity.HIGH] || 0;
    if (highCount > 5) {
      score -= (highCount - 5) * 5; // 5 points per high error above threshold
      issues.push(`${highCount} high severity errors detected`);
    }

    // Deduct points for high error rate
    if (currentErrorRate > 10) {
      score -= (currentErrorRate - 10) * 2; // 2 points per error above threshold
      issues.push(`High error rate: ${currentErrorRate} errors/minute`);
    }

    // Deduct points for error diversity (many different error types)
    const errorTypeCount = Object.keys(analytics.errorsByType).length;
    if (errorTypeCount > 10) {
      score -= (errorTypeCount - 10) * 1; // 1 point per error type above threshold
      issues.push(`High error diversity: ${errorTypeCount} different error types`);
    }

    // Ensure score doesn't go below 0
    score = Math.max(0, score);

    // Determine status based on score
    let status: 'healthy' | 'degraded' | 'critical';
    if (score >= 80) {
      status = 'healthy';
    } else if (score >= 50) {
      status = 'degraded';
      if (issues.length === 0) {
        issues.push('System performance is degraded');
      }
    } else {
      status = 'critical';
      if (issues.length === 0) {
        issues.push('System health is critical');
      }
    }

    return { status, score, issues };
  }

  /**
   * Generate error report
   */
  async generateErrorReport(
    timeRange: { start: Date; end: Date },
    config: Partial<ReportConfig> = {}
  ): Promise<{
    summary: any;
    analytics: ErrorAnalytics;
    metrics: ErrorMetrics;
    recommendations: string[];
  }> {
    const analytics = errorLogger.getAnalytics(timeRange);
    const metrics = await this.getErrorMetrics(24);

    // Generate summary
    const summary = {
      timeRange,
      totalErrors: analytics.totalErrors,
      errorRate: analytics.totalErrors / ((timeRange.end.getTime() - timeRange.start.getTime()) / 60000), // errors per minute
      mostCommonCategory: this.getMostCommon(analytics.errorsByCategory),
      mostCommonSeverity: this.getMostCommon(analytics.errorsBySeverity),
      systemHealthScore: metrics.systemHealth.score,
      systemHealthStatus: metrics.systemHealth.status
    };

    // Generate recommendations
    const recommendations = this.generateRecommendations(analytics, metrics);

    return {
      summary,
      analytics,
      metrics,
      recommendations
    };
  }

  /**
   * Get most common item from a record
   */
  private getMostCommon<T extends string | number | symbol>(
    record: Record<T, number>
  ): { key: T; count: number } | null {
    let maxKey: T | null = null;
    let maxCount = 0;

    for (const [key, count] of Object.entries(record) as [T, number][]) {
      if (count > maxCount) {
        maxCount = count;
        maxKey = key;
      }
    }

    return maxKey ? { key: maxKey, count: maxCount } : null;
  }

  /**
   * Generate recommendations based on error patterns
   */
  private generateRecommendations(
    analytics: ErrorAnalytics,
    metrics: ErrorMetrics
  ): string[] {
    const recommendations: string[] = [];

    // Critical error recommendations
    const criticalCount = analytics.errorsBySeverity[ErrorSeverity.CRITICAL] || 0;
    if (criticalCount > 0) {
      recommendations.push(`Address ${criticalCount} critical error(s) immediately - these may indicate system instability`);
    }

    // High error rate recommendations
    if (metrics.currentErrorRate > 10) {
      recommendations.push('Investigate high error rate - consider implementing rate limiting or circuit breakers');
    }

    // Network error recommendations
    const networkErrors = analytics.errorsByCategory[ErrorCategory.NETWORK] || 0;
    if (networkErrors > analytics.totalErrors * 0.3) {
      recommendations.push('High network error rate detected - review network connectivity and implement retry mechanisms');
    }

    // Authentication error recommendations
    const authErrors = analytics.errorsByCategory[ErrorCategory.AUTHENTICATION] || 0;
    if (authErrors > 5) {
      recommendations.push('Multiple authentication errors detected - review token refresh mechanisms and user session management');
    }

    // API error recommendations
    const apiErrors = analytics.errorsByCategory[ErrorCategory.API] || 0;
    if (apiErrors > analytics.totalErrors * 0.4) {
      recommendations.push('High API error rate - review external service integrations and implement fallback mechanisms');
    }

    // Error diversity recommendations
    const errorTypeCount = Object.keys(analytics.errorsByType).length;
    if (errorTypeCount > 15) {
      recommendations.push('High error diversity detected - consider implementing better error handling patterns and validation');
    }

    // System health recommendations
    if (metrics.systemHealth.status === 'critical') {
      recommendations.push('System health is critical - immediate investigation and remediation required');
    } else if (metrics.systemHealth.status === 'degraded') {
      recommendations.push('System health is degraded - monitor closely and address underlying issues');
    }

    // Error spike recommendations
    if (metrics.errorSpikes.length > 0) {
      recommendations.push('Error spikes detected - investigate potential causes such as traffic surges or system changes');
    }

    // Default recommendation if no specific issues found
    if (recommendations.length === 0 && analytics.totalErrors > 0) {
      recommendations.push('Continue monitoring error patterns and maintain current error handling practices');
    }

    return recommendations;
  }

  /**
   * Configure alerts
   */
  configureAlerts(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config };
    console.log('Alert configuration updated:', this.alertConfig);
  }

  /**
   * Add report configuration
   */
  addReportConfig(config: ReportConfig): void {
    this.reportConfigs.push(config);
    console.log('Report configuration added:', config);
  }

  /**
   * Get current alert configuration
   */
  getAlertConfig(): AlertConfig {
    return { ...this.alertConfig };
  }

  /**
   * Get error statistics for dashboard
   */
  async getDashboardStats(): Promise<{
    last24Hours: ErrorAnalytics;
    last7Days: ErrorAnalytics;
    currentMetrics: ErrorMetrics;
    alerts: Array<{ type: string; timestamp: Date; message: string }>;
  }> {
    const now = new Date();
    
    const last24Hours = errorLogger.getAnalytics({
      start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      end: now
    });

    const last7Days = errorLogger.getAnalytics({
      start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      end: now
    });

    const currentMetrics = await this.getErrorMetrics(24);

    // Get recent alerts (simplified)
    const alerts = Array.from(this.alertHistory.entries())
      .filter(([_, timestamp]) => Date.now() - timestamp.getTime() < 24 * 60 * 60 * 1000)
      .map(([type, timestamp]) => ({
        type,
        timestamp,
        message: `Alert: ${type.replace(/_/g, ' ')}`
      }))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);

    return {
      last24Hours,
      last7Days,
      currentMetrics,
      alerts
    };
  }

  /**
   * Clear old cached data
   */
  clearCache(): void {
    this.metricsCache.clear();
    console.log('Error analytics cache cleared');
  }

  /**
   * Cleanup method for graceful shutdown
   */
  cleanup(): void {
    this.stopMonitoring();
    this.clearCache();
    this.alertHistory.clear();
  }
}

// Export singleton instance
export const errorAnalyticsService = new ErrorAnalyticsService();