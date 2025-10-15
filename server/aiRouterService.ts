
import { aiServiceErrorHandler } from './errorHandlers/aiServiceErrorHandler.js';
import { aiRoutingConfigManager, AIRoutingConfiguration } from './config/aiRoutingConfig.js';
import { usageAnalytics } from './usageAnalyticsService.js';
import { performanceMonitor } from './performanceMonitor.js';
import { aiRoutingLogger } from './aiRoutingLogger.js';

// Core interfaces for the AI router service
export interface RoutingOptions {
    forceModel?: 'gemini' | 'mistral';
    enableFallback?: boolean;
    timeout?: number;
}

export interface CircuitBreakerState {
    isOpen: boolean;
    failureCount: number;
    lastFailureTime?: Date;
    nextRetryTime?: Date;
}

export interface ErrorResponse {
    success: false;
    error: {
        type: string;
        message: string;
        code?: string;
        retryable: boolean;
        fallbackUsed: boolean;
        timestamp: Date;
    };
    fallbackResponse?: any;
}

export interface RoutingRule {
    primaryModel: 'gemini' | 'mistral';
    fallbackModel?: 'gemini' | 'mistral';
    enableFallback: boolean;
    timeout: number;
}

export interface RoutingRules {
    [functionName: string]: RoutingRule;
}

export interface ServiceHealthStatus {
    gemini: {
        available: boolean;
        lastCheck: Date;
        responseTime?: number;
        circuitBreaker: CircuitBreakerState;
    };
    mistral: {
        available: boolean;
        lastCheck: Date;
        responseTime?: number;
        circuitBreaker: CircuitBreakerState;
    };
}

export interface UsageStatistics {
    gemini: {
        totalRequests: number;
        totalTokens: number;
        averageResponseTime: number;
        successRate: number;
        costEstimate: number;
        functionBreakdown: Record<string, FunctionStats>;
    };
    mistral: {
        totalRequests: number;
        totalTokens: number;
        averageResponseTime: number;
        successRate: number;
        functionBreakdown: Record<string, FunctionStats>;
    };
    routing: {
        totalRoutingDecisions: number;
        fallbacksTriggered: number;
        routingFailures: number;
    };
}

export interface FunctionStats {
    requestCount: number;
    tokenUsage: number;
    averageResponseTime: number;
    successRate: number;
    lastUsed: Date;
}

// AI Router Service class
export class AIRouterService {
    private routingRules: RoutingRules;
    private usageStats: UsageStatistics;
    private serviceHealth: ServiceHealthStatus;
    private config: AIRoutingConfiguration;

    constructor(config?: AIRoutingConfiguration) {
        this.config = config || aiRoutingConfigManager.getConfiguration();
        this.routingRules = this.config.rules;
        this.usageStats = this.initializeUsageStats();
        this.serviceHealth = this.initializeServiceHealth();
    }

    /**
     * Main routing method that delegates requests to appropriate AI service
     */
    async routeRequest<T>(
        functionName: string,
        args: any[],
        options?: RoutingOptions
    ): Promise<T> {
        const startTime = Date.now();
        const routingStartTime = Date.now();

        try {
            // Get routing rule for this function
            const rule = this.getRoutingRule(functionName);

            // Determine which model to use
            const targetModel = options?.forceModel || rule.primaryModel;
            const routingDecisionTime = Date.now() - routingStartTime;

            // Log routing decision
            this.logRoutingDecision(functionName, targetModel, 'primary');

            // Execute the request with retry logic
            const result = await this.executeRequestWithRetry<T>(
                functionName,
                args,
                targetModel,
                options?.timeout || rule.timeout,
                options
            );

            const responseTime = Date.now() - startTime;

            // Update usage statistics
            this.updateUsageStats(functionName, targetModel, responseTime, true);

            // Record routing decision for analytics
            usageAnalytics.recordRoutingDecision(
                functionName,
                rule.primaryModel,
                targetModel,
                false, // No fallback used
                routingDecisionTime,
                true
            );

            // Record performance metrics
            this.recordPerformanceMetrics(functionName, args, result, targetModel, responseTime, true);

            // Log routing decision
            aiRoutingLogger.logRoutingDecision(
                functionName,
                rule.primaryModel,
                targetModel,
                false,
                responseTime,
                true,
                undefined,
                this.extractTokenUsage(args, result),
                { routingReason: 'primary_model' }
            );

            return result;

        } catch (error: any) {
            const responseTime = Date.now() - startTime;

            // Try fallback if enabled and not already using fallback
            if (this.shouldTryFallback(functionName, options, error)) {
                return this.tryFallback<T>(functionName, args, options, error, responseTime);
            }

            // Update failure statistics
            const rule = this.getRoutingRule(functionName);
            const targetModel = options?.forceModel || rule.primaryModel;
            this.updateUsageStats(functionName, targetModel, responseTime, false);
            this.usageStats.routing.routingFailures++;

            // Record failed routing decision
            usageAnalytics.recordRoutingDecision(
                functionName,
                rule.primaryModel,
                targetModel,
                false,
                Date.now() - routingStartTime,
                false
            );

            // Record performance metrics for failure
            this.recordPerformanceMetrics(functionName, args, null, targetModel, responseTime, false, error);

            // Log failed routing decision
            aiRoutingLogger.logRoutingDecision(
                functionName,
                rule.primaryModel,
                targetModel,
                false,
                responseTime,
                false,
                error.message,
                this.extractTokenUsage(args, null),
                { routingReason: 'primary_model_failed' }
            );

            throw error;
        }
    }

    /**
     * Try fallback model when primary fails
     */
    private async tryFallback<T>(
        functionName: string,
        args: any[],
        options: RoutingOptions | undefined,
        originalError: any,
        _originalResponseTime: number
    ): Promise<T> {
        const rule = this.getRoutingRule(functionName);

        if (!rule.fallbackModel) {
            throw originalError;
        }

        const fallbackStartTime = Date.now();

        try {
            // Log fallback attempt
            this.logRoutingDecision(functionName, rule.fallbackModel, 'fallback');
            this.usageStats.routing.fallbacksTriggered++;

            // Execute with fallback model using retry logic
            const result = await this.executeRequestWithRetry<T>(
                functionName,
                args,
                rule.fallbackModel,
                options?.timeout || rule.timeout,
                options,
                2 // Fewer retries for fallback
            );

            const fallbackResponseTime = Date.now() - fallbackStartTime;

            // Update usage statistics for successful fallback
            this.updateUsageStats(functionName, rule.fallbackModel, fallbackResponseTime, true);

            // Record successful fallback routing decision
            usageAnalytics.recordRoutingDecision(
                functionName,
                rule.primaryModel,
                rule.fallbackModel,
                true, // Fallback was used
                fallbackResponseTime,
                true
            );

            // Record performance metrics for successful fallback
            this.recordPerformanceMetrics(functionName, args, result, rule.fallbackModel, fallbackResponseTime, true);

            // Log successful fallback routing decision
            aiRoutingLogger.logRoutingDecision(
                functionName,
                rule.primaryModel,
                rule.fallbackModel,
                true,
                fallbackResponseTime,
                true,
                undefined,
                this.extractTokenUsage(args, result),
                { routingReason: 'fallback_success' }
            );

            return result;

        } catch (fallbackError: any) {
            const fallbackResponseTime = Date.now() - fallbackStartTime;

            // Update failure statistics for fallback
            this.updateUsageStats(functionName, rule.fallbackModel, fallbackResponseTime, false);
            this.usageStats.routing.routingFailures++;

            // Record failed fallback routing decision
            usageAnalytics.recordRoutingDecision(
                functionName,
                rule.primaryModel,
                rule.fallbackModel,
                true, // Fallback was attempted
                fallbackResponseTime,
                false
            );

            // Record performance metrics for failed fallback
            this.recordPerformanceMetrics(functionName, args, null, rule.fallbackModel, fallbackResponseTime, false, fallbackError);

            // Log failed fallback routing decision
            aiRoutingLogger.logRoutingDecision(
                functionName,
                rule.primaryModel,
                rule.fallbackModel,
                true,
                fallbackResponseTime,
                false,
                fallbackError.message,
                this.extractTokenUsage(args, null),
                { routingReason: 'fallback_failed' }
            );

            // Throw the original error if fallback also fails
            throw originalError;
        }
    }

    /**
     * Execute request with retry logic for rate limits and transient failures
     */
    private async executeRequestWithRetry<T>(
        functionName: string,
        args: any[],
        model: 'gemini' | 'mistral',
        timeout: number,
        options?: RoutingOptions,
        maxRetries: number = 3
    ): Promise<T> {
        // Check circuit breaker before attempting request
        if (this.isCircuitBreakerOpen(model)) {
            throw this.createCircuitBreakerError(model);
        }

        let lastError: any;
        let retryCount = 0;

        while (retryCount <= maxRetries) {
            try {
                const result = await this.executeRequest<T>(functionName, args, model, timeout);
                
                // Reset circuit breaker on success
                this.resetCircuitBreaker(model);
                
                return result;
            } catch (error: any) {
                lastError = error;
                const errorClassification = aiServiceErrorHandler.classifyError(error);

                // Update circuit breaker on failure
                this.recordFailure(model, errorClassification);

                // Don't retry on final attempt
                if (retryCount === maxRetries) {
                    break;
                }

                // Only retry for specific error types
                if (this.shouldRetryError(errorClassification)) {
                    retryCount++;
                    const delay = this.calculateRetryDelay(retryCount, errorClassification);
                    
                    console.log(`[AI Router] Retry ${retryCount}/${maxRetries} for ${functionName} on ${model} after ${delay}ms delay. Error: ${errorClassification.type}`);
                    
                    await this.delay(delay);
                    continue;
                }

                // Don't retry for non-retryable errors
                break;
            }
        }

        throw lastError;
    }

    /**
     * Execute request with specific AI service
     */
    private async executeRequest<T>(
        functionName: string,
        args: any[],
        model: 'gemini' | 'mistral',
        timeout: number
    ): Promise<T> {
        // Import services dynamically to avoid circular dependencies
        const { executeWithTimeout } = await import('./utils/timeoutUtils.js');

        if (model === 'gemini') {
            const geminiService = await import('./gemini.js');
            return executeWithTimeout(
                this.callGeminiFunction(geminiService, functionName, args),
                timeout
            );
        } else {
            const mistralService = await import('./mistralService.js');
            return executeWithTimeout(
                this.callMistralFunction(mistralService, functionName, args),
                timeout
            );
        }
    }

    /**
     * Call appropriate Gemini function
     */
    private async callGeminiFunction(geminiService: any, functionName: string, args: any[]): Promise<any> {
        switch (functionName) {
            case 'extractMeetingIntent':
                return geminiService.extractMeetingIntent(...args);
            case 'generateMeetingTitles':
                return geminiService.generateMeetingTitles(...args);
            case 'generateMeetingAgenda':
                return geminiService.generateMeetingAgenda(...args);
            case 'generateActionItems':
                return geminiService.generateActionItems(...args);
            case 'getGeminiResponse':
                return geminiService.getGeminiResponse(...args);
            case 'verifyAttendees':
                return geminiService.verifyAttendees(...args);
            default:
                throw new Error(`Unknown function: ${functionName}`);
        }
    }

    /**
     * Call appropriate Mistral function
     */
    private async callMistralFunction(mistralService: any, functionName: string, args: any[]): Promise<any> {
        switch (functionName) {
            case 'getGeminiResponse':
                return mistralService.getGeminiResponse(...args);
            case 'verifyAttendees':
                return mistralService.verifyAttendees(...args);
            case 'generateBasicResponse':
                return mistralService.generateBasicResponse(...args);
            // For complex functions, fallback to basic response generation
            case 'extractMeetingIntent':
            case 'generateMeetingTitles':
            case 'generateMeetingAgenda':
            case 'generateActionItems':
                // These will be handled by fallback logic or throw appropriate errors
                throw new Error(`Function ${functionName} not optimized for Mistral`);
            default:
                throw new Error(`Unknown function: ${functionName}`);
        }
    }

    /**
     * Determine if an error should trigger a retry
     */
    private shouldRetryError(errorClassification: any): boolean {
        const retryableErrors = [
            'API_RATE_LIMIT',
            'TIMEOUT', 
            'SERVICE_UNAVAILABLE',
            'NETWORK_ERROR',
            'MODEL_UNAVAILABLE'
        ];

        return retryableErrors.includes(errorClassification.type);
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    private calculateRetryDelay(retryCount: number, errorClassification: any): number {
        const baseDelay = 1000; // 1 second
        const maxDelay = 30000; // 30 seconds
        
        // Use retry-after header if available for rate limits
        if (errorClassification.retryAfter && errorClassification.type === 'API_RATE_LIMIT') {
            return Math.min(errorClassification.retryAfter, maxDelay);
        }

        // Exponential backoff with jitter
        const exponentialDelay = baseDelay * Math.pow(2, retryCount - 1);
        const jitter = Math.random() * 1000; // Add up to 1 second of jitter
        
        return Math.min(exponentialDelay + jitter, maxDelay);
    }

    /**
     * Utility method for delays
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Circuit breaker methods for service health management
     */
    private isCircuitBreakerOpen(model: 'gemini' | 'mistral'): boolean {
        const circuitBreaker = this.serviceHealth[model].circuitBreaker;
        
        if (!circuitBreaker.isOpen) {
            return false;
        }

        // Check if it's time to try again (half-open state)
        if (circuitBreaker.nextRetryTime && new Date() >= circuitBreaker.nextRetryTime) {
            circuitBreaker.isOpen = false;
            console.log(`[AI Router] Circuit breaker for ${model} moving to half-open state`);
            return false;
        }

        return true;
    }

    private recordFailure(model: 'gemini' | 'mistral', errorClassification: any): void {
        const circuitBreaker = this.serviceHealth[model].circuitBreaker;
        const now = new Date();
        
        circuitBreaker.failureCount++;
        circuitBreaker.lastFailureTime = now;

        // Open circuit breaker after 5 consecutive failures
        if (circuitBreaker.failureCount >= 5 && !circuitBreaker.isOpen) {
            circuitBreaker.isOpen = true;
            circuitBreaker.nextRetryTime = new Date(now.getTime() + 60000); // 1 minute
            
            console.error(`[AI Router] Circuit breaker opened for ${model} after ${circuitBreaker.failureCount} failures`);
        }
    }

    private resetCircuitBreaker(model: 'gemini' | 'mistral'): void {
        const circuitBreaker = this.serviceHealth[model].circuitBreaker;
        
        if (circuitBreaker.failureCount > 0 || circuitBreaker.isOpen) {
            console.log(`[AI Router] Circuit breaker reset for ${model}`);
        }
        
        circuitBreaker.failureCount = 0;
        circuitBreaker.isOpen = false;
        circuitBreaker.lastFailureTime = undefined;
        circuitBreaker.nextRetryTime = undefined;
    }

    private createCircuitBreakerError(model: 'gemini' | 'mistral'): Error {
        const circuitBreaker = this.serviceHealth[model].circuitBreaker;
        const nextRetry = circuitBreaker.nextRetryTime ? 
            ` Retry available at ${circuitBreaker.nextRetryTime.toISOString()}` : '';
        
        const error = new Error(`Circuit breaker is open for ${model} service.${nextRetry}`);
        (error as any).type = 'CIRCUIT_BREAKER_OPEN';
        (error as any).model = model;
        (error as any).nextRetryTime = circuitBreaker.nextRetryTime;
        
        return error;
    }

    /**
     * Format error response with comprehensive information
     */
    public formatErrorResponse(
        error: any, 
        functionName: string, 
        fallbackUsed: boolean = false,
        fallbackResponse?: any
    ): ErrorResponse {
        const errorClassification = aiServiceErrorHandler.classifyError(error);
        
        return {
            success: false,
            error: {
                type: errorClassification.type,
                message: this.sanitizeErrorMessage(errorClassification.message),
                code: error.code || error.status?.toString(),
                retryable: errorClassification.retryable,
                fallbackUsed,
                timestamp: new Date()
            },
            fallbackResponse
        };
    }

    /**
     * Sanitize error messages to avoid exposing sensitive information
     */
    private sanitizeErrorMessage(message: string): string {
        // Remove API keys, tokens, or other sensitive data
        return message
            .replace(/api[_-]?key[=:]\s*[^\s&]+/gi, 'api_key=***')
            .replace(/token[=:]\s*[^\s&]+/gi, 'token=***')
            .replace(/authorization[=:]\s*[^\s&]+/gi, 'authorization=***')
            .replace(/bearer\s+[^\s&]+/gi, 'bearer ***');
    }

    /**
     * Get comprehensive service status including circuit breaker states
     */
    public async getComprehensiveServiceStatus(): Promise<{
        overall: 'healthy' | 'degraded' | 'unhealthy';
        services: ServiceHealthStatus;
        lastHealthCheck: Date;
        recommendations: string[];
    }> {
        await this.checkServiceHealth();
        
        const geminiHealthy = this.serviceHealth.gemini.available && !this.serviceHealth.gemini.circuitBreaker.isOpen;
        const mistralHealthy = this.serviceHealth.mistral.available && !this.serviceHealth.mistral.circuitBreaker.isOpen;
        
        let overall: 'healthy' | 'degraded' | 'unhealthy';
        const recommendations: string[] = [];
        
        if (geminiHealthy && mistralHealthy) {
            overall = 'healthy';
        } else if (geminiHealthy || mistralHealthy) {
            overall = 'degraded';
            if (!geminiHealthy) {
                recommendations.push('Gemini service is unavailable - using Mistral fallback');
            }
            if (!mistralHealthy) {
                recommendations.push('Mistral service is unavailable - using Gemini fallback');
            }
        } else {
            overall = 'unhealthy';
            recommendations.push('Both AI services are unavailable - check network connectivity and API keys');
        }
        
        return {
            overall,
            services: { ...this.serviceHealth },
            lastHealthCheck: new Date(),
            recommendations
        };
    }

    /**
     * Determine if fallback should be attempted
     */
    private shouldTryFallback(
        functionName: string,
        options: RoutingOptions | undefined,
        error: any
    ): boolean {
        const rule = this.getRoutingRule(functionName);

        // Don't fallback if explicitly disabled
        if (options?.enableFallback === false || !rule.enableFallback) {
            return false;
        }

        // Don't fallback if no fallback model configured
        if (!rule.fallbackModel) {
            return false;
        }

        // Don't fallback if already using forced model
        if (options?.forceModel) {
            return false;
        }

        // Fallback on rate limits, timeouts, or service unavailable errors
        const errorClassification = aiServiceErrorHandler.classifyError(error);
        return ['API_RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE'].includes(errorClassification.type);
    }

    /**
     * Get routing rule for a function
     */
    private getRoutingRule(functionName: string): RoutingRule {
        const rule = this.routingRules[functionName];
        if (!rule) {
            throw new Error(`No routing rule configured for function: ${functionName}`);
        }
        return rule;
    }

    /**
     * Log routing decisions for monitoring
     */
    private logRoutingDecision(functionName: string, model: string, type: 'primary' | 'fallback'): void {
        if (this.config.monitoring.logRoutingDecisions) {
            console.log(`[AI Router] ${functionName} -> ${model} (${type})`);
        }
        this.usageStats.routing.totalRoutingDecisions++;
    }

    /**
     * Update usage statistics
     */
    private updateUsageStats(
        functionName: string,
        model: 'gemini' | 'mistral',
        responseTime: number,
        success: boolean
    ): void {
        const modelStats = this.usageStats[model];

        // Update overall model stats
        modelStats.totalRequests++;
        modelStats.averageResponseTime =
            (modelStats.averageResponseTime * (modelStats.totalRequests - 1) + responseTime) / modelStats.totalRequests;

        if (success) {
            modelStats.successRate =
                (modelStats.successRate * (modelStats.totalRequests - 1) + 1) / modelStats.totalRequests;
        } else {
            modelStats.successRate =
                (modelStats.successRate * (modelStats.totalRequests - 1)) / modelStats.totalRequests;
        }

        // Update function-specific stats
        if (!modelStats.functionBreakdown[functionName]) {
            modelStats.functionBreakdown[functionName] = {
                requestCount: 0,
                tokenUsage: 0,
                averageResponseTime: 0,
                successRate: 0,
                lastUsed: new Date()
            };
        }

        const funcStats = modelStats.functionBreakdown[functionName];
        funcStats.requestCount++;
        funcStats.averageResponseTime =
            (funcStats.averageResponseTime * (funcStats.requestCount - 1) + responseTime) / funcStats.requestCount;
        funcStats.lastUsed = new Date();

        if (success) {
            funcStats.successRate =
                (funcStats.successRate * (funcStats.requestCount - 1) + 1) / funcStats.requestCount;
        } else {
            funcStats.successRate =
                (funcStats.successRate * (funcStats.requestCount - 1)) / funcStats.requestCount;
        }
    }

    /**
     * Record detailed performance metrics for analytics
     */
    private recordPerformanceMetrics(
        functionName: string,
        args: any[],
        result: any,
        model: 'gemini' | 'mistral',
        responseTime: number,
        success: boolean,
        error?: any
    ): void {
        // Estimate token usage
        const inputText = this.extractInputText(args);
        const outputText = this.extractOutputText(result);
        
        const inputTokens = performanceMonitor.estimateTokenCount(inputText);
        const outputTokens = success ? performanceMonitor.estimateTokenCount(outputText) : 0;

        // Record in performance monitor
        performanceMonitor.recordAPICall({
            service: model,
            operation: functionName,
            tokenCount: {
                input: inputTokens,
                output: outputTokens,
                total: inputTokens + outputTokens
            },
            responseTime,
            success,
            error: error?.message,
            model: model === 'gemini' ? 'gemini-pro' : 'mistral-small-latest' // Default model names
        });

        // Update token usage in our stats
        if (this.usageStats[model].functionBreakdown[functionName]) {
            this.usageStats[model].functionBreakdown[functionName].tokenUsage += inputTokens + outputTokens;
        }
        this.usageStats[model].totalTokens += inputTokens + outputTokens;
    }

    /**
     * Extract input text from function arguments for token estimation
     */
    private extractInputText(args: any[]): string {
        if (!args || args.length === 0) return '';
        
        return args.map(arg => {
            if (typeof arg === 'string') {
                return arg;
            } else if (typeof arg === 'object' && arg !== null) {
                // Handle message arrays or objects
                if (Array.isArray(arg)) {
                    return arg.map(item => 
                        typeof item === 'object' && item.content ? item.content : String(item)
                    ).join(' ');
                } else if (arg.content) {
                    return arg.content;
                } else {
                    return JSON.stringify(arg);
                }
            }
            return String(arg);
        }).join(' ');
    }

    /**
     * Extract output text from function result for token estimation
     */
    private extractOutputText(result: any): string {
        if (!result) return '';
        
        if (typeof result === 'string') {
            return result;
        } else if (typeof result === 'object') {
            // Handle structured responses
            if (result.content) {
                return result.content;
            } else if (result.response) {
                return result.response;
            } else if (result.text) {
                return result.text;
            } else {
                return JSON.stringify(result);
            }
        }
        
        return String(result);
    }

    /**
     * Extract token usage information for logging
     */
    private extractTokenUsage(args: any[], result: any): { input: number; output: number; total: number } {
        const inputText = this.extractInputText(args);
        const outputText = this.extractOutputText(result);
        
        const inputTokens = performanceMonitor.estimateTokenCount(inputText);
        const outputTokens = performanceMonitor.estimateTokenCount(outputText);

        return {
            input: inputTokens,
            output: outputTokens,
            total: inputTokens + outputTokens
        };
    }

    /**
     * Configuration management methods
     */
    updateRoutingRules(rules: RoutingRules): void {
        // Update both local cache and configuration manager
        aiRoutingConfigManager.updateRoutingRules(rules);
        this.config = aiRoutingConfigManager.getConfiguration();
        this.routingRules = this.config.rules;
    }

    getRoutingRules(): RoutingRules {
        return { ...this.routingRules };
    }

    /**
     * Update complete configuration
     */
    updateConfiguration(config: Partial<AIRoutingConfiguration>): void {
        aiRoutingConfigManager.updateConfiguration(config);
        this.config = aiRoutingConfigManager.getConfiguration();
        this.routingRules = this.config.rules;
    }

    /**
     * Get complete configuration
     */
    getConfiguration(): AIRoutingConfiguration {
        return aiRoutingConfigManager.getConfiguration();
    }

    /**
     * Reload configuration from environment and defaults
     */
    reloadConfiguration(): void {
        this.config = aiRoutingConfigManager.loadConfiguration();
        this.routingRules = this.config.rules;
    }

    /**
     * Health and monitoring methods
     */
    async getServiceHealth(): Promise<ServiceHealthStatus> {
        // Update health status by checking services
        await this.checkServiceHealth();
        return { ...this.serviceHealth };
    }

    getUsageStats(): UsageStatistics {
        return { ...this.usageStats };
    }

    /**
     * Get comprehensive usage analytics
     */
    getUsageAnalytics(timeRangeHours: number = 24) {
        return usageAnalytics.getUsageAnalytics(timeRangeHours);
    }

    /**
     * Get detailed cost analysis
     */
    getCostAnalysis(timeRangeHours: number = 24) {
        return usageAnalytics.getCostAnalysis(timeRangeHours);
    }

    /**
     * Export comprehensive analytics data
     */
    exportAnalytics(timeRangeHours: number = 24) {
        return usageAnalytics.exportAnalytics(timeRangeHours);
    }

    /**
     * Get routing logs for monitoring
     */
    getRoutingLogs(timeRangeHours: number = 24) {
        return aiRoutingLogger.getRoutingLogs(timeRangeHours);
    }

    /**
     * Get health logs for monitoring
     */
    getHealthLogs(timeRangeHours: number = 24) {
        return aiRoutingLogger.getHealthLogs(timeRangeHours);
    }

    /**
     * Get routing statistics for dashboard
     */
    getRoutingStatistics(timeRangeHours: number = 24) {
        return aiRoutingLogger.getRoutingStatistics(timeRangeHours);
    }

    /**
     * Get current alerts
     */
    getAlerts(includeResolved: boolean = false) {
        return aiRoutingLogger.getAlerts(includeResolved);
    }

    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId: string): boolean {
        return aiRoutingLogger.acknowledgeAlert(alertId);
    }

    /**
     * Resolve an alert
     */
    resolveAlert(alertId: string): boolean {
        return aiRoutingLogger.resolveAlert(alertId);
    }

    /**
     * Update alert configuration
     */
    updateAlertConfig(config: any): void {
        aiRoutingLogger.updateAlertConfig(config);
    }

    /**
     * Export comprehensive logs and monitoring data
     */
    exportLogs(timeRangeHours: number = 24) {
        return aiRoutingLogger.exportLogs(timeRangeHours);
    }

    /**
     * Check health of both AI services with comprehensive testing
     */
    private async checkServiceHealth(): Promise<void> {
        const now = new Date();

        // Check Gemini health with actual API call
        await this.checkGeminiHealth(now);
        
        // Check Mistral health with actual API call
        await this.checkMistralHealth(now);
    }

    /**
     * Check Gemini service health with timeout and error handling
     */
    private async checkGeminiHealth(timestamp: Date): Promise<void> {
        try {
            const geminiService = await import('./gemini.js');
            const startTime = Date.now();
            
            // Perform a lightweight health check with timeout
            const { executeWithTimeout } = await import('./utils/timeoutUtils.js');
            
            await executeWithTimeout(
                this.performGeminiHealthCheck(geminiService),
                5000 // 5 second timeout for health check
            );

            this.serviceHealth.gemini = {
                available: true,
                lastCheck: timestamp,
                responseTime: Date.now() - startTime,
                circuitBreaker: this.serviceHealth.gemini.circuitBreaker
            };

            console.log(`[AI Router] Gemini health check passed (${Date.now() - startTime}ms)`);

            // Log healthy status
            aiRoutingLogger.logServiceHealth(
                'gemini',
                'healthy',
                Date.now() - startTime,
                undefined,
                this.serviceHealth.gemini.circuitBreaker.isOpen,
                this.serviceHealth.gemini.circuitBreaker.failureCount
            );

        } catch (error: any) {
            this.serviceHealth.gemini = {
                available: false,
                lastCheck: timestamp,
                circuitBreaker: this.serviceHealth.gemini.circuitBreaker
            };

            const errorClassification = aiServiceErrorHandler.classifyError(error);
            console.error(`[AI Router] Gemini health check failed: ${errorClassification.type} - ${errorClassification.message}`);

            // Log unhealthy status
            aiRoutingLogger.logServiceHealth(
                'gemini',
                'unhealthy',
                undefined,
                errorClassification.message,
                this.serviceHealth.gemini.circuitBreaker.isOpen,
                this.serviceHealth.gemini.circuitBreaker.failureCount
            );
        }
    }

    /**
     * Check Mistral service health with timeout and error handling
     */
    private async checkMistralHealth(timestamp: Date): Promise<void> {
        try {
            const mistralService = await import('./mistralService.js');
            const startTime = Date.now();
            
            // Use Mistral's built-in health check if available
            if (typeof mistralService.getServiceHealth === 'function') {
                const { executeWithTimeout } = await import('./utils/timeoutUtils.js');
                
                const health = await executeWithTimeout(
                    mistralService.getServiceHealth(),
                    5000 // 5 second timeout for health check
                );

                this.serviceHealth.mistral = {
                    available: health.available,
                    lastCheck: timestamp,
                    responseTime: Date.now() - startTime,
                    circuitBreaker: this.serviceHealth.mistral.circuitBreaker
                };
            } else {
                // Fallback to basic availability check
                this.serviceHealth.mistral = {
                    available: true,
                    lastCheck: timestamp,
                    responseTime: Date.now() - startTime,
                    circuitBreaker: this.serviceHealth.mistral.circuitBreaker
                };
            }

            console.log(`[AI Router] Mistral health check passed (${Date.now() - startTime}ms)`);

            // Log healthy status
            aiRoutingLogger.logServiceHealth(
                'mistral',
                'healthy',
                Date.now() - startTime,
                undefined,
                this.serviceHealth.mistral.circuitBreaker.isOpen,
                this.serviceHealth.mistral.circuitBreaker.failureCount
            );

        } catch (error: any) {
            this.serviceHealth.mistral = {
                available: false,
                lastCheck: timestamp,
                circuitBreaker: this.serviceHealth.mistral.circuitBreaker
            };

            const errorClassification = aiServiceErrorHandler.classifyError(error);
            console.error(`[AI Router] Mistral health check failed: ${errorClassification.type} - ${errorClassification.message}`);

            // Log unhealthy status
            aiRoutingLogger.logServiceHealth(
                'mistral',
                'unhealthy',
                undefined,
                errorClassification.message,
                this.serviceHealth.mistral.circuitBreaker.isOpen,
                this.serviceHealth.mistral.circuitBreaker.failureCount
            );
        }
    }

    /**
     * Perform a lightweight Gemini health check
     */
    private async performGeminiHealthCheck(geminiService: any): Promise<void> {
        // Try a simple API call to verify Gemini is responsive
        if (typeof geminiService.getGeminiResponse === 'function') {
            await geminiService.getGeminiResponse('ping', 'health-check');
        } else {
            // Just verify the service can be imported
            return Promise.resolve();
        }
    }



    /**
     * Initialize usage statistics
     */
    private initializeUsageStats(): UsageStatistics {
        return {
            gemini: {
                totalRequests: 0,
                totalTokens: 0,
                averageResponseTime: 0,
                successRate: 1,
                costEstimate: 0,
                functionBreakdown: {}
            },
            mistral: {
                totalRequests: 0,
                totalTokens: 0,
                averageResponseTime: 0,
                successRate: 1,
                functionBreakdown: {}
            },
            routing: {
                totalRoutingDecisions: 0,
                fallbacksTriggered: 0,
                routingFailures: 0
            }
        };
    }

    /**
     * Initialize service health status
     */
    private initializeServiceHealth(): ServiceHealthStatus {
        const now = new Date();
        return {
            gemini: {
                available: false,
                lastCheck: now,
                circuitBreaker: {
                    isOpen: false,
                    failureCount: 0
                }
            },
            mistral: {
                available: false,
                lastCheck: now,
                circuitBreaker: {
                    isOpen: false,
                    failureCount: 0
                }
            }
        };
    }
}

// Create and export singleton instance
export const aiRouter = new AIRouterService();

// Note: Types are already exported with their interface declarations above