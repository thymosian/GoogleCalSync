import { RoutingRules, RoutingRule } from '../aiRouterService.js';

/**
 * Configuration interface for AI routing system
 */
export interface AIRoutingConfiguration {
    rules: RoutingRules;
    monitoring: {
        enableUsageTracking: boolean;
        enablePerformanceMetrics: boolean;
        logRoutingDecisions: boolean;
        healthCheckInterval: number;
    };
    fallback: {
        enableGlobalFallback: boolean;
        maxRetries: number;
        retryDelay: number;
    };
    performance: {
        defaultTimeout: number;
        maxConcurrentRequests: number;
        cacheEnabled: boolean;
        cacheTTL: number;
    };
    circuitBreaker: {
        gemini: {
            failureThreshold: number;
            resetTimeout: number;
            maxRetries: number;
        };
        mistral: {
            failureThreshold: number;
            resetTimeout: number;
            maxRetries: number;
        };
    };
}

/**
 * Default routing configuration based on design document
 */
export const DEFAULT_ROUTING_CONFIG: AIRoutingConfiguration = {
    rules: {
        // Complex tasks -> Gemini primary, Mistral fallback
        extractMeetingIntent: {
            primaryModel: 'gemini',
            fallbackModel: 'mistral',
            enableFallback: true,
            timeout: 30000
        },
        generateMeetingTitles: {
            primaryModel: 'gemini',
            fallbackModel: 'mistral',
            enableFallback: true,
            timeout: 20000
        },
        generateMeetingAgenda: {
            primaryModel: 'gemini',
            fallbackModel: 'mistral',
            enableFallback: true,
            timeout: 45000
        },
        generateActionItems: {
            primaryModel: 'gemini',
            fallbackModel: 'mistral',
            enableFallback: true,
            timeout: 30000
        },
        enhancePurposeWording: {
            primaryModel: 'gemini',
            fallbackModel: 'mistral',
            enableFallback: true,
            timeout: 25000
        },
        // Simple tasks -> Mistral primary, Gemini fallback
        getGeminiResponse: {
            primaryModel: 'mistral',
            fallbackModel: 'gemini',
            enableFallback: true,
            timeout: 15000
        },
        verifyAttendees: {
            primaryModel: 'mistral',
            fallbackModel: 'gemini',
            enableFallback: true,
            timeout: 10000
        },
        // Time parsing -> Mistral for natural language processing
        extractTimeFromNaturalLanguage: {
            primaryModel: 'mistral',
            fallbackModel: 'gemini',
            enableFallback: true,
            timeout: 15000
        },
    },
    monitoring: {
        enableUsageTracking: true,
        enablePerformanceMetrics: true,
        logRoutingDecisions: true,
        healthCheckInterval: 60000 // 1 minute
    },
    fallback: {
        enableGlobalFallback: true,
        maxRetries: 2,
        retryDelay: 1000 // 1 second
    },
    performance: {
        defaultTimeout: 30000, // 30 seconds
        maxConcurrentRequests: 10,
        cacheEnabled: false, // Disabled for now
        cacheTTL: 300000 // 5 minutes
    },
    circuitBreaker: {
        gemini: {
            failureThreshold: 3,
            resetTimeout: 60000, // 1 minute
            maxRetries: 3
        },
        mistral: {
            failureThreshold: 3,
            resetTimeout: 120000, // 2 minutes (longer for Mistral due to rate limits)
            maxRetries: 2
        }
    }
};

/**
 * Environment-based configuration overrides
 */
export function getEnvironmentConfig(): Partial<AIRoutingConfiguration> {
    const config: Partial<AIRoutingConfiguration> = {};

    // Override timeouts from environment
    if (process.env.AI_ROUTER_DEFAULT_TIMEOUT) {
        config.performance = {
            ...DEFAULT_ROUTING_CONFIG.performance,
            defaultTimeout: parseInt(process.env.AI_ROUTER_DEFAULT_TIMEOUT)
        };
    }

    // Override monitoring settings
    if (process.env.AI_ROUTER_ENABLE_LOGGING !== undefined) {
        config.monitoring = {
            ...DEFAULT_ROUTING_CONFIG.monitoring,
            logRoutingDecisions: process.env.AI_ROUTER_ENABLE_LOGGING === 'true'
        };
    }

    // Override fallback settings
    if (process.env.AI_ROUTER_ENABLE_FALLBACK !== undefined) {
        config.fallback = {
            ...DEFAULT_ROUTING_CONFIG.fallback,
            enableGlobalFallback: process.env.AI_ROUTER_ENABLE_FALLBACK === 'true'
        };
    }

    return config;
}

/**
 * Configuration validation functions
 */
export class ConfigurationValidator {
    /**
     * Validate routing rules configuration
     */
    static validateRoutingRules(rules: RoutingRules): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        for (const [functionName, rule] of Object.entries(rules)) {
            // Validate function name
            if (!functionName || typeof functionName !== 'string') {
                errors.push(`Invalid function name: ${functionName}`);
                continue;
            }

            // Validate rule structure
            const ruleErrors = this.validateRoutingRule(functionName, rule);
            errors.push(...ruleErrors);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate individual routing rule
     */
    static validateRoutingRule(functionName: string, rule: RoutingRule): string[] {
        const errors: string[] = [];

        // Validate primary model
        if (!rule.primaryModel || !['gemini', 'mistral'].includes(rule.primaryModel)) {
            errors.push(`${functionName}: Invalid primary model '${rule.primaryModel}'. Must be 'gemini' or 'mistral'`);
        }

        // Validate fallback model if specified
        if (rule.fallbackModel && !['gemini', 'mistral'].includes(rule.fallbackModel)) {
            errors.push(`${functionName}: Invalid fallback model '${rule.fallbackModel}'. Must be 'gemini' or 'mistral'`);
        }

        // Validate that primary and fallback are different
        if (rule.fallbackModel && rule.primaryModel === rule.fallbackModel) {
            errors.push(`${functionName}: Primary and fallback models cannot be the same`);
        }

        // Validate timeout
        if (typeof rule.timeout !== 'number' || rule.timeout <= 0) {
            errors.push(`${functionName}: Timeout must be a positive number`);
        }

        // Validate timeout range (1 second to 5 minutes)
        if (rule.timeout < 1000 || rule.timeout > 300000) {
            errors.push(`${functionName}: Timeout must be between 1000ms and 300000ms`);
        }

        // Validate enableFallback
        if (typeof rule.enableFallback !== 'boolean') {
            errors.push(`${functionName}: enableFallback must be a boolean`);
        }

        // Validate fallback consistency
        if (rule.enableFallback && !rule.fallbackModel) {
            errors.push(`${functionName}: Fallback is enabled but no fallback model specified`);
        }

        return errors;
    }

    /**
     * Validate complete configuration
     */
    static validateConfiguration(config: AIRoutingConfiguration): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Validate routing rules
        const rulesValidation = this.validateRoutingRules(config.rules);
        errors.push(...rulesValidation.errors);

        // Validate monitoring configuration
        if (typeof config.monitoring.enableUsageTracking !== 'boolean') {
            errors.push('monitoring.enableUsageTracking must be a boolean');
        }

        if (typeof config.monitoring.enablePerformanceMetrics !== 'boolean') {
            errors.push('monitoring.enablePerformanceMetrics must be a boolean');
        }

        if (typeof config.monitoring.logRoutingDecisions !== 'boolean') {
            errors.push('monitoring.logRoutingDecisions must be a boolean');
        }

        if (typeof config.monitoring.healthCheckInterval !== 'number' || config.monitoring.healthCheckInterval <= 0) {
            errors.push('monitoring.healthCheckInterval must be a positive number');
        }

        // Validate fallback configuration
        if (typeof config.fallback.enableGlobalFallback !== 'boolean') {
            errors.push('fallback.enableGlobalFallback must be a boolean');
        }

        if (typeof config.fallback.maxRetries !== 'number' || config.fallback.maxRetries < 0) {
            errors.push('fallback.maxRetries must be a non-negative number');
        }

        if (typeof config.fallback.retryDelay !== 'number' || config.fallback.retryDelay < 0) {
            errors.push('fallback.retryDelay must be a non-negative number');
        }

        // Validate performance configuration
        if (typeof config.performance.defaultTimeout !== 'number' || config.performance.defaultTimeout <= 0) {
            errors.push('performance.defaultTimeout must be a positive number');
        }

        if (typeof config.performance.maxConcurrentRequests !== 'number' || config.performance.maxConcurrentRequests <= 0) {
            errors.push('performance.maxConcurrentRequests must be a positive number');
        }

        if (typeof config.performance.cacheEnabled !== 'boolean') {
            errors.push('performance.cacheEnabled must be a boolean');
        }

        if (typeof config.performance.cacheTTL !== 'number' || config.performance.cacheTTL <= 0) {
            errors.push('performance.cacheTTL must be a positive number');
        }

        // Validate circuit breaker configuration
        if (!config.circuitBreaker || typeof config.circuitBreaker !== 'object') {
            errors.push('circuitBreaker must be an object');
        } else {
            // Validate Gemini circuit breaker
            if (!config.circuitBreaker.gemini || typeof config.circuitBreaker.gemini !== 'object') {
                errors.push('circuitBreaker.gemini must be an object');
            } else {
                if (typeof config.circuitBreaker.gemini.failureThreshold !== 'number' || config.circuitBreaker.gemini.failureThreshold <= 0) {
                    errors.push('circuitBreaker.gemini.failureThreshold must be a positive number');
                }
                if (typeof config.circuitBreaker.gemini.resetTimeout !== 'number' || config.circuitBreaker.gemini.resetTimeout <= 0) {
                    errors.push('circuitBreaker.gemini.resetTimeout must be a positive number');
                }
                if (typeof config.circuitBreaker.gemini.maxRetries !== 'number' || config.circuitBreaker.gemini.maxRetries < 0) {
                    errors.push('circuitBreaker.gemini.maxRetries must be a non-negative number');
                }
            }

            // Validate Mistral circuit breaker
            if (!config.circuitBreaker.mistral || typeof config.circuitBreaker.mistral !== 'object') {
                errors.push('circuitBreaker.mistral must be an object');
            } else {
                if (typeof config.circuitBreaker.mistral.failureThreshold !== 'number' || config.circuitBreaker.mistral.failureThreshold <= 0) {
                    errors.push('circuitBreaker.mistral.failureThreshold must be a positive number');
                }
                if (typeof config.circuitBreaker.mistral.resetTimeout !== 'number' || config.circuitBreaker.mistral.resetTimeout <= 0) {
                    errors.push('circuitBreaker.mistral.resetTimeout must be a positive number');
                }
                if (typeof config.circuitBreaker.mistral.maxRetries !== 'number' || config.circuitBreaker.mistral.maxRetries < 0) {
                    errors.push('circuitBreaker.mistral.maxRetries must be a non-negative number');
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

/**
 * Configuration loader and manager
 */
export class AIRoutingConfigManager {
    private config: AIRoutingConfiguration;
    private configPath?: string;

    constructor(initialConfig?: AIRoutingConfiguration) {
        this.config = initialConfig || this.loadConfiguration();
    }

    /**
     * Load configuration from environment and defaults
     */
    loadConfiguration(): AIRoutingConfiguration {
        const envConfig = getEnvironmentConfig();
        const mergedConfig = this.mergeConfigurations(DEFAULT_ROUTING_CONFIG, envConfig);
        
        // Validate the merged configuration
        const validation = ConfigurationValidator.validateConfiguration(mergedConfig);
        if (!validation.valid) {
            console.error('Invalid AI routing configuration:', validation.errors);
            throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
        }

        return mergedConfig;
    }

    /**
     * Get current configuration
     */
    getConfiguration(): AIRoutingConfiguration {
        return { ...this.config };
    }

    /**
     * Update configuration
     */
    updateConfiguration(updates: Partial<AIRoutingConfiguration>): void {
        const newConfig = this.mergeConfigurations(this.config, updates);
        
        // Validate the new configuration
        const validation = ConfigurationValidator.validateConfiguration(newConfig);
        if (!validation.valid) {
            throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
        }

        this.config = newConfig;
    }

    /**
     * Get routing rules only
     */
    getRoutingRules(): RoutingRules {
        return { ...this.config.rules };
    }

    /**
     * Update routing rules
     */
    updateRoutingRules(rules: Partial<RoutingRules>): void {
        const newRules: RoutingRules = { ...this.config.rules };
        
        // Merge the rules, ensuring we only add defined values
        for (const [key, value] of Object.entries(rules)) {
            if (value !== undefined) {
                newRules[key] = value;
            }
        }
        
        // Validate the new rules
        const validation = ConfigurationValidator.validateRoutingRules(newRules);
        if (!validation.valid) {
            throw new Error(`Routing rules validation failed: ${validation.errors.join(', ')}`);
        }

        this.config.rules = newRules;
    }

    /**
     * Add or update a single routing rule
     */
    setRoutingRule(functionName: string, rule: RoutingRule): void {
        // Validate the rule
        const errors = ConfigurationValidator.validateRoutingRule(functionName, rule);
        if (errors.length > 0) {
            throw new Error(`Routing rule validation failed: ${errors.join(', ')}`);
        }

        this.config.rules[functionName] = rule;
    }

    /**
     * Remove a routing rule
     */
    removeRoutingRule(functionName: string): void {
        delete this.config.rules[functionName];
    }

    /**
     * Get monitoring configuration
     */
    getMonitoringConfig() {
        return { ...this.config.monitoring };
    }

    /**
     * Get fallback configuration
     */
    getFallbackConfig() {
        return { ...this.config.fallback };
    }

    /**
     * Get performance configuration
     */
    getPerformanceConfig() {
        return { ...this.config.performance };
    }

    /**
     * Get circuit breaker configuration
     */
    getCircuitBreakerConfig() {
        return { ...this.config.circuitBreaker };
    }

    /**
     * Merge two configuration objects
     */
    private mergeConfigurations(
        base: AIRoutingConfiguration,
        override: Partial<AIRoutingConfiguration>
    ): AIRoutingConfiguration {
        return {
            rules: { ...base.rules, ...override.rules },
            monitoring: { ...base.monitoring, ...override.monitoring },
            fallback: { ...base.fallback, ...override.fallback },
            performance: { ...base.performance, ...override.performance },
            circuitBreaker: { ...base.circuitBreaker, ...override.circuitBreaker }
        };
    }

    /**
     * Reset configuration to defaults
     */
    resetToDefaults(): void {
        this.config = { ...DEFAULT_ROUTING_CONFIG };
    }

    /**
     * Export configuration as JSON
     */
    exportConfiguration(): string {
        return JSON.stringify(this.config, null, 2);
    }

    /**
     * Import configuration from JSON
     */
    importConfiguration(jsonConfig: string): void {
        try {
            const config = JSON.parse(jsonConfig) as AIRoutingConfiguration;
            
            // Validate the imported configuration
            const validation = ConfigurationValidator.validateConfiguration(config);
            if (!validation.valid) {
                throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
            }

            this.config = config;
        } catch (error) {
            throw new Error(`Failed to import configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

// Create and export singleton instance
export const aiRoutingConfigManager = new AIRoutingConfigManager();

// Export types and classes