/**
 * AI Routing Logger Service
 * Provides comprehensive logging and monitoring for AI routing decisions
 */

export interface RoutingLogEntry {
    timestamp: Date;
    requestId: string;
    functionName: string;
    primaryModel: string;
    actualModel: string;
    fallbackUsed: boolean;
    responseTime: number;
    success: boolean;
    error?: string;
    tokenUsage?: {
        input: number;
        output: number;
        total: number;
    };
    metadata?: {
        retryCount?: number;
        circuitBreakerState?: string;
        routingReason?: string;
    };
}

export interface ServiceHealthLog {
    timestamp: Date;
    service: 'gemini' | 'mistral';
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime?: number;
    error?: string;
    circuitBreakerOpen: boolean;
    consecutiveFailures: number;
}

export interface AlertConfig {
    enabled: boolean;
    thresholds: {
        errorRate: number;        // Alert if error rate exceeds this percentage
        responseTime: number;     // Alert if average response time exceeds this (ms)
        fallbackRate: number;     // Alert if fallback usage exceeds this percentage
        costThreshold: number;    // Alert if daily cost exceeds this amount
    };
    cooldownMinutes: number;      // Minimum time between similar alerts
}

export interface Alert {
    id: string;
    timestamp: Date;
    type: 'error_rate' | 'response_time' | 'fallback_rate' | 'cost_threshold' | 'service_down';
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    metrics: {
        current: number;
        threshold: number;
        timeWindow: string;
    };
    acknowledged: boolean;
    resolvedAt?: Date;
}

/**
 * AI Routing Logger and Monitoring Service
 */
export class AIRoutingLogger {
    private routingLogs: RoutingLogEntry[] = [];
    private healthLogs: ServiceHealthLog[] = [];
    private alerts: Alert[] = [];
    private maxLogEntries = 10000;
    private alertConfig: AlertConfig;
    private lastAlertTimes: Map<string, Date> = new Map();

    constructor() {
        this.alertConfig = {
            enabled: process.env.AI_ROUTING_ALERTS_ENABLED === 'true',
            thresholds: {
                errorRate: parseFloat(process.env.AI_ROUTING_ERROR_RATE_THRESHOLD || '10'), // 10%
                responseTime: parseInt(process.env.AI_ROUTING_RESPONSE_TIME_THRESHOLD || '5000'), // 5 seconds
                fallbackRate: parseFloat(process.env.AI_ROUTING_FALLBACK_RATE_THRESHOLD || '20'), // 20%
                costThreshold: parseFloat(process.env.AI_ROUTING_DAILY_COST_THRESHOLD || '50') // $50
            },
            cooldownMinutes: parseInt(process.env.AI_ROUTING_ALERT_COOLDOWN || '30') // 30 minutes
        };
    }

    /**
     * Log a routing decision with comprehensive details
     */
    logRoutingDecision(
        functionName: string,
        primaryModel: string,
        actualModel: string,
        fallbackUsed: boolean,
        responseTime: number,
        success: boolean,
        error?: string,
        tokenUsage?: { input: number; output: number; total: number },
        metadata?: { retryCount?: number; circuitBreakerState?: string; routingReason?: string }
    ): void {
        const logEntry: RoutingLogEntry = {
            timestamp: new Date(),
            requestId: this.generateRequestId(),
            functionName,
            primaryModel,
            actualModel,
            fallbackUsed,
            responseTime,
            success,
            error,
            tokenUsage,
            metadata
        };

        this.routingLogs.push(logEntry);

        // Keep only recent logs to prevent memory bloat
        if (this.routingLogs.length > this.maxLogEntries) {
            this.routingLogs = this.routingLogs.slice(-Math.floor(this.maxLogEntries * 0.8));
        }

        // Log to console with appropriate level
        this.logToConsole(logEntry);

        // Check for alerts if enabled
        if (this.alertConfig.enabled) {
            this.checkForAlerts();
        }
    }

    /**
     * Log service health status
     */
    logServiceHealth(
        service: 'gemini' | 'mistral',
        status: 'healthy' | 'degraded' | 'unhealthy',
        responseTime?: number,
        error?: string,
        circuitBreakerOpen: boolean = false,
        consecutiveFailures: number = 0
    ): void {
        const healthLog: ServiceHealthLog = {
            timestamp: new Date(),
            service,
            status,
            responseTime,
            error,
            circuitBreakerOpen,
            consecutiveFailures
        };

        this.healthLogs.push(healthLog);

        // Keep only recent health logs
        if (this.healthLogs.length > 1000) {
            this.healthLogs = this.healthLogs.slice(-500);
        }

        // Log to console
        const logLevel = status === 'healthy' ? 'info' : status === 'degraded' ? 'warn' : 'error';
        console[logLevel](`[AI Router Health] ${service}: ${status}${responseTime ? ` (${responseTime}ms)` : ''}${error ? ` - ${error}` : ''}`);

        // Create alert for service issues
        if (status === 'unhealthy' && this.alertConfig.enabled) {
            this.createAlert(
                'service_down',
                'critical',
                `${service.charAt(0).toUpperCase() + service.slice(1)} Service Down`,
                `The ${service} service is currently unhealthy. ${error || 'No additional details available.'}`,
                {
                    current: consecutiveFailures,
                    threshold: 5,
                    timeWindow: '5 minutes'
                }
            );
        }
    }

    /**
     * Get routing logs for a specific time period
     */
    getRoutingLogs(timeRangeHours: number = 24): RoutingLogEntry[] {
        const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
        return this.routingLogs.filter(log => log.timestamp >= cutoffTime);
    }

    /**
     * Get health logs for a specific time period
     */
    getHealthLogs(timeRangeHours: number = 24): ServiceHealthLog[] {
        const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
        return this.healthLogs.filter(log => log.timestamp >= cutoffTime);
    }

    /**
     * Get routing statistics for monitoring dashboard
     */
    getRoutingStatistics(timeRangeHours: number = 24): {
        totalRequests: number;
        successRate: number;
        averageResponseTime: number;
        fallbackRate: number;
        errorBreakdown: Record<string, number>;
        modelUsage: Record<string, number>;
        functionUsage: Record<string, number>;
        peakHours: Array<{ hour: number; requests: number }>;
    } {
        const logs = this.getRoutingLogs(timeRangeHours);
        
        if (logs.length === 0) {
            return {
                totalRequests: 0,
                successRate: 0,
                averageResponseTime: 0,
                fallbackRate: 0,
                errorBreakdown: {},
                modelUsage: {},
                functionUsage: {},
                peakHours: []
            };
        }

        const totalRequests = logs.length;
        const successfulRequests = logs.filter(log => log.success).length;
        const fallbackRequests = logs.filter(log => log.fallbackUsed).length;
        const totalResponseTime = logs.reduce((sum, log) => sum + log.responseTime, 0);

        // Error breakdown
        const errorBreakdown: Record<string, number> = {};
        logs.filter(log => !log.success && log.error).forEach(log => {
            const errorType = this.classifyError(log.error!);
            errorBreakdown[errorType] = (errorBreakdown[errorType] || 0) + 1;
        });

        // Model usage
        const modelUsage: Record<string, number> = {};
        logs.forEach(log => {
            modelUsage[log.actualModel] = (modelUsage[log.actualModel] || 0) + 1;
        });

        // Function usage
        const functionUsage: Record<string, number> = {};
        logs.forEach(log => {
            functionUsage[log.functionName] = (functionUsage[log.functionName] || 0) + 1;
        });

        // Peak hours analysis
        const hourlyUsage: Record<number, number> = {};
        logs.forEach(log => {
            const hour = log.timestamp.getHours();
            hourlyUsage[hour] = (hourlyUsage[hour] || 0) + 1;
        });

        const peakHours = Object.entries(hourlyUsage)
            .map(([hour, requests]) => ({ hour: parseInt(hour), requests }))
            .sort((a, b) => b.requests - a.requests)
            .slice(0, 5);

        return {
            totalRequests,
            successRate: successfulRequests / totalRequests,
            averageResponseTime: totalResponseTime / totalRequests,
            fallbackRate: fallbackRequests / totalRequests,
            errorBreakdown,
            modelUsage,
            functionUsage,
            peakHours
        };
    }

    /**
     * Get current alerts
     */
    getAlerts(includeResolved: boolean = false): Alert[] {
        if (includeResolved) {
            return [...this.alerts];
        }
        return this.alerts.filter(alert => !alert.resolvedAt);
    }

    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId: string): boolean {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            console.log(`[AI Router Alert] Alert ${alertId} acknowledged`);
            return true;
        }
        return false;
    }

    /**
     * Resolve an alert
     */
    resolveAlert(alertId: string): boolean {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.resolvedAt = new Date();
            console.log(`[AI Router Alert] Alert ${alertId} resolved`);
            return true;
        }
        return false;
    }

    /**
     * Update alert configuration
     */
    updateAlertConfig(config: Partial<AlertConfig>): void {
        this.alertConfig = { ...this.alertConfig, ...config };
        console.log('[AI Router] Alert configuration updated:', this.alertConfig);
    }

    /**
     * Export logs for analysis
     */
    exportLogs(timeRangeHours: number = 24): {
        routingLogs: RoutingLogEntry[];
        healthLogs: ServiceHealthLog[];
        statistics: any; // Use any for now to avoid the this context issue
        alerts: Alert[];
        exportTime: Date;
    } {
        return {
            routingLogs: this.getRoutingLogs(timeRangeHours),
            healthLogs: this.getHealthLogs(timeRangeHours),
            statistics: this.getRoutingStatistics(timeRangeHours),
            alerts: this.getAlerts(true),
            exportTime: new Date()
        };
    }

    /**
     * Log to console with appropriate formatting
     */
    private logToConsole(logEntry: RoutingLogEntry): void {
        const { functionName, primaryModel, actualModel, fallbackUsed, responseTime, success, error } = logEntry;
        
        const modelInfo = fallbackUsed ? `${primaryModel} -> ${actualModel} (fallback)` : actualModel;
        const statusInfo = success ? '✓' : '✗';
        const timeInfo = `${responseTime}ms`;
        
        const logMessage = `[AI Router] ${statusInfo} ${functionName} -> ${modelInfo} (${timeInfo})`;
        
        if (success) {
            console.log(logMessage);
        } else {
            console.error(`${logMessage} - Error: ${error || 'Unknown error'}`);
        }

        // Log additional details in debug mode
        if (process.env.AI_ROUTER_DEBUG === 'true') {
            console.debug(`[AI Router Debug] Request ID: ${logEntry.requestId}`, {
                tokenUsage: logEntry.tokenUsage,
                metadata: logEntry.metadata
            });
        }
    }

    /**
     * Check for alert conditions
     */
    private checkForAlerts(): void {
        const recentLogs = this.getRoutingLogs(1); // Last hour
        if (recentLogs.length < 10) return; // Need sufficient data

        const stats = this.getRoutingStatistics(1);

        // Check error rate
        if (stats.successRate < (100 - this.alertConfig.thresholds.errorRate) / 100) {
            this.createAlert(
                'error_rate',
                'high',
                'High Error Rate Detected',
                `Error rate is ${((1 - stats.successRate) * 100).toFixed(1)}%, exceeding threshold of ${this.alertConfig.thresholds.errorRate}%`,
                {
                    current: (1 - stats.successRate) * 100,
                    threshold: this.alertConfig.thresholds.errorRate,
                    timeWindow: '1 hour'
                }
            );
        }

        // Check response time
        if (stats.averageResponseTime > this.alertConfig.thresholds.responseTime) {
            this.createAlert(
                'response_time',
                'medium',
                'Slow Response Times',
                `Average response time is ${stats.averageResponseTime.toFixed(0)}ms, exceeding threshold of ${this.alertConfig.thresholds.responseTime}ms`,
                {
                    current: stats.averageResponseTime,
                    threshold: this.alertConfig.thresholds.responseTime,
                    timeWindow: '1 hour'
                }
            );
        }

        // Check fallback rate
        if (stats.fallbackRate > this.alertConfig.thresholds.fallbackRate / 100) {
            this.createAlert(
                'fallback_rate',
                'medium',
                'High Fallback Usage',
                `Fallback usage is ${(stats.fallbackRate * 100).toFixed(1)}%, exceeding threshold of ${this.alertConfig.thresholds.fallbackRate}%`,
                {
                    current: stats.fallbackRate * 100,
                    threshold: this.alertConfig.thresholds.fallbackRate,
                    timeWindow: '1 hour'
                }
            );
        }
    }

    /**
     * Create a new alert
     */
    private createAlert(
        type: Alert['type'],
        severity: Alert['severity'],
        title: string,
        description: string,
        metrics: Alert['metrics']
    ): void {
        // Check cooldown period
        const lastAlertTime = this.lastAlertTimes.get(type);
        const cooldownMs = this.alertConfig.cooldownMinutes * 60 * 1000;
        
        if (lastAlertTime && Date.now() - lastAlertTime.getTime() < cooldownMs) {
            return; // Still in cooldown period
        }

        const alert: Alert = {
            id: this.generateAlertId(),
            timestamp: new Date(),
            type,
            severity,
            title,
            description,
            metrics,
            acknowledged: false
        };

        this.alerts.push(alert);
        this.lastAlertTimes.set(type, new Date());

        // Log alert
        console.warn(`[AI Router Alert] ${severity.toUpperCase()}: ${title} - ${description}`);

        // Keep only recent alerts
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-50);
        }
    }

    /**
     * Classify error types for better monitoring
     */
    private classifyError(error: string): string {
        const errorLower = error.toLowerCase();
        
        if (errorLower.includes('rate limit') || errorLower.includes('quota')) {
            return 'rate_limit';
        } else if (errorLower.includes('timeout')) {
            return 'timeout';
        } else if (errorLower.includes('network') || errorLower.includes('connection')) {
            return 'network';
        } else if (errorLower.includes('authentication') || errorLower.includes('unauthorized')) {
            return 'authentication';
        } else if (errorLower.includes('service unavailable') || errorLower.includes('503')) {
            return 'service_unavailable';
        } else if (errorLower.includes('circuit breaker')) {
            return 'circuit_breaker';
        } else {
            return 'other';
        }
    }

    /**
     * Generate unique request ID
     */
    private generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate unique alert ID
     */
    private generateAlertId(): string {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// Export singleton instance
export const aiRoutingLogger = new AIRoutingLogger();