/**
 * Environment Configuration and Validation for AI Services
 * 
 * This module handles environment variable validation for both Gemini and Mistral AI services,
 * ensuring proper configuration for the dual AI service architecture.
 */

export interface AIServiceEnvironmentConfig {
    // Gemini Configuration
    gemini: {
        apiKey: string;
        model: string;
        temperature: number;
        maxOutputTokens: number;
        topP: number;
        topK: number;
    };
    
    // Mistral Configuration
    mistral: {
        apiKey: string;
        model: string;
        temperature: number;
        maxTokens: number;
        baseUrl?: string;
    };
    
    // AI Router Configuration
    router: {
        enableLogging: boolean;
        enableFallback: boolean;
        defaultTimeout: number;
        maxRetries: number;
        retryDelay: number;
    };
    
    // General Configuration
    general: {
        port: number;
        sessionSecret: string;
        databaseUrl: string;
    };
    
    // Google OAuth Configuration
    oauth: {
        clientId: string;
        clientSecret: string;
    };
}

/**
 * Environment variable validation results
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    config?: AIServiceEnvironmentConfig;
}

/**
 * Environment Configuration Validator
 */
export class EnvironmentConfigValidator {
    
    /**
     * Validate all environment variables required for dual AI services
     */
    static validateEnvironment(): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // Validate Gemini configuration
        const geminiValidation = this.validateGeminiConfig();
        errors.push(...geminiValidation.errors);
        warnings.push(...geminiValidation.warnings);
        
        // Validate Mistral configuration
        const mistralValidation = this.validateMistralConfig();
        errors.push(...mistralValidation.errors);
        warnings.push(...mistralValidation.warnings);
        
        // Validate router configuration
        const routerValidation = this.validateRouterConfig();
        errors.push(...routerValidation.errors);
        warnings.push(...routerValidation.warnings);
        
        // Validate general configuration
        const generalValidation = this.validateGeneralConfig();
        errors.push(...generalValidation.errors);
        warnings.push(...generalValidation.warnings);
        
        // Validate OAuth configuration
        const oauthValidation = this.validateOAuthConfig();
        errors.push(...oauthValidation.errors);
        warnings.push(...oauthValidation.warnings);
        
        // Check for dual service availability
        const serviceAvailability = this.validateServiceAvailability();
        errors.push(...serviceAvailability.errors);
        warnings.push(...serviceAvailability.warnings);
        
        const valid = errors.length === 0;
        
        let config: AIServiceEnvironmentConfig | undefined;
        if (valid || errors.length === 0) {
            config = this.buildConfiguration();
        }
        
        return {
            valid,
            errors,
            warnings,
            config
        };
    }
    
    /**
     * Validate Gemini-specific environment variables
     */
    private static validateGeminiConfig(): { errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // Validate API key
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            errors.push('GEMINI_API_KEY is required for Gemini service');
        } else if (apiKey.length < 20) {
            warnings.push('GEMINI_API_KEY appears to be too short, please verify it is correct');
        } else if (apiKey === 'your_gemini_api_key_here') {
            errors.push('GEMINI_API_KEY is set to placeholder value, please provide a real API key');
        }
        
        // Validate model
        const model = process.env.GEMINI_MODEL;
        if (model && !this.isValidGeminiModel(model)) {
            warnings.push(`GEMINI_MODEL '${model}' may not be a valid Gemini model name`);
        }
        
        // Validate temperature
        const temperature = process.env.GEMINI_TEMPERATURE;
        if (temperature) {
            const tempValue = parseFloat(temperature);
            if (isNaN(tempValue) || tempValue < 0 || tempValue > 2) {
                errors.push('GEMINI_TEMPERATURE must be a number between 0 and 2');
            }
        }
        
        return { errors, warnings };
    }
    
    /**
     * Validate Mistral-specific environment variables
     */
    private static validateMistralConfig(): { errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // Validate API key
        const apiKey = process.env.MISTRAL_API_KEY;
        if (!apiKey) {
            warnings.push('MISTRAL_API_KEY is not set. Mistral service will not be available for fallback');
        } else if (apiKey.length < 20) {
            warnings.push('MISTRAL_API_KEY appears to be too short, please verify it is correct');
        }
        
        // Validate model
        const model = process.env.MISTRAL_MODEL;
        if (model && !this.isValidMistralModel(model)) {
            warnings.push(`MISTRAL_MODEL '${model}' may not be a valid Mistral model name`);
        }
        
        // Validate temperature
        const temperature = process.env.MISTRAL_TEMPERATURE;
        if (temperature) {
            const tempValue = parseFloat(temperature);
            if (isNaN(tempValue) || tempValue < 0 || tempValue > 2) {
                errors.push('MISTRAL_TEMPERATURE must be a number between 0 and 2');
            }
        }
        
        // Validate max tokens
        const maxTokens = process.env.MISTRAL_MAX_TOKENS;
        if (maxTokens) {
            const tokensValue = parseInt(maxTokens);
            if (isNaN(tokensValue) || tokensValue < 1 || tokensValue > 32000) {
                errors.push('MISTRAL_MAX_TOKENS must be a number between 1 and 32000');
            }
        }
        
        return { errors, warnings };
    }
    
    /**
     * Validate AI router configuration
     */
    private static validateRouterConfig(): { errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // Validate timeout
        const timeout = process.env.AI_ROUTER_DEFAULT_TIMEOUT;
        if (timeout) {
            const timeoutValue = parseInt(timeout);
            if (isNaN(timeoutValue) || timeoutValue < 1000 || timeoutValue > 300000) {
                errors.push('AI_ROUTER_DEFAULT_TIMEOUT must be between 1000ms and 300000ms');
            }
        }
        
        // Validate boolean flags
        const enableLogging = process.env.AI_ROUTER_ENABLE_LOGGING;
        if (enableLogging && !['true', 'false'].includes(enableLogging.toLowerCase())) {
            errors.push('AI_ROUTER_ENABLE_LOGGING must be "true" or "false"');
        }
        
        const enableFallback = process.env.AI_ROUTER_ENABLE_FALLBACK;
        if (enableFallback && !['true', 'false'].includes(enableFallback.toLowerCase())) {
            errors.push('AI_ROUTER_ENABLE_FALLBACK must be "true" or "false"');
        }
        
        return { errors, warnings };
    }
    
    /**
     * Validate general application configuration
     */
    private static validateGeneralConfig(): { errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // Validate port
        const port = process.env.PORT;
        if (port) {
            const portValue = parseInt(port);
            if (isNaN(portValue) || portValue < 1 || portValue > 65535) {
                errors.push('PORT must be a valid port number between 1 and 65535');
            }
        }
        
        // Validate session secret
        const sessionSecret = process.env.SESSION_SECRET;
        if (!sessionSecret) {
            errors.push('SESSION_SECRET is required for session management');
        } else if (sessionSecret.length < 32) {
            warnings.push('SESSION_SECRET should be at least 32 characters long for security');
        }
        
        // Validate database URL
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
            errors.push('DATABASE_URL is required for database connection');
        } else if (!databaseUrl.startsWith('postgresql://')) {
            warnings.push('DATABASE_URL should start with postgresql:// for PostgreSQL connections');
        }
        
        return { errors, warnings };
    }
    
    /**
     * Validate OAuth configuration
     */
    private static validateOAuthConfig(): { errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // Validate Google OAuth client ID
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
            errors.push('GOOGLE_CLIENT_ID is required for Google OAuth');
        } else if (!clientId.includes('.apps.googleusercontent.com')) {
            warnings.push('GOOGLE_CLIENT_ID should end with .apps.googleusercontent.com');
        }
        
        // Validate Google OAuth client secret
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        if (!clientSecret) {
            errors.push('GOOGLE_CLIENT_SECRET is required for Google OAuth');
        } else if (clientSecret.length < 20) {
            warnings.push('GOOGLE_CLIENT_SECRET appears to be too short');
        }
        
        return { errors, warnings };
    }
    
    /**
     * Validate that at least one AI service is available
     */
    private static validateServiceAvailability(): { errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        const hasGemini = !!process.env.GEMINI_API_KEY;
        const hasMistral = !!process.env.MISTRAL_API_KEY;
        
        if (!hasGemini && !hasMistral) {
            errors.push('At least one AI service (Gemini or Mistral) must be configured with a valid API key');
        } else if (!hasGemini) {
            warnings.push('Gemini service is not configured. Complex AI tasks may not work optimally');
        } else if (!hasMistral) {
            warnings.push('Mistral service is not configured. Fallback capabilities will be limited');
        }
        
        return { errors, warnings };
    }
    
    /**
     * Build configuration object from environment variables
     */
    private static buildConfiguration(): AIServiceEnvironmentConfig {
        return {
            gemini: {
                apiKey: process.env.GEMINI_API_KEY || '',
                model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
                temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.3'),
                maxOutputTokens: parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '120'),
                topP: parseFloat(process.env.GEMINI_TOP_P || '0.8'),
                topK: parseInt(process.env.GEMINI_TOP_K || '40')
            },
            mistral: {
                apiKey: process.env.MISTRAL_API_KEY || '',
                model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
                temperature: parseFloat(process.env.MISTRAL_TEMPERATURE || '0.3'),
                maxTokens: parseInt(process.env.MISTRAL_MAX_TOKENS || '1000'),
                baseUrl: process.env.MISTRAL_BASE_URL
            },
            router: {
                enableLogging: process.env.AI_ROUTER_ENABLE_LOGGING?.toLowerCase() === 'true',
                enableFallback: process.env.AI_ROUTER_ENABLE_FALLBACK?.toLowerCase() !== 'false', // Default true
                defaultTimeout: parseInt(process.env.AI_ROUTER_DEFAULT_TIMEOUT || '30000'),
                maxRetries: parseInt(process.env.AI_ROUTER_MAX_RETRIES || '2'),
                retryDelay: parseInt(process.env.AI_ROUTER_RETRY_DELAY || '1000')
            },
            general: {
                port: parseInt(process.env.PORT || '5000'),
                sessionSecret: process.env.SESSION_SECRET || '',
                databaseUrl: process.env.DATABASE_URL || ''
            },
            oauth: {
                clientId: process.env.GOOGLE_CLIENT_ID || '',
                clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
            }
        };
    }
    
    /**
     * Check if a Gemini model name is valid
     */
    private static isValidGeminiModel(model: string): boolean {
        const validModels = [
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-2.0-flash-exp',
            'gemini-pro',
            'gemini-pro-vision'
        ];
        return validModels.includes(model);
    }
    
    /**
     * Check if a Mistral model name is valid
     */
    private static isValidMistralModel(model: string): boolean {
        const validModels = [
            // Core models
            'mistral-tiny', 'mistral-tiny-latest', 'mistral-tiny-2312', 'mistral-tiny-2407',
            'mistral-small', 'mistral-small-latest', 'mistral-small-2312', 'mistral-small-2409', 'mistral-small-2501', 'mistral-small-2503', 'mistral-small-2506',
            'mistral-medium', 'mistral-medium-latest', 'mistral-medium-2505', 'mistral-medium-2508',
            'mistral-large', 'mistral-large-latest', 'mistral-large-2407', 'mistral-large-2411',
            
            // Mini models
            'ministral-3b-2410', 'ministral-3b-latest',
            'ministral-8b-2410', 'ministral-8b-latest',
            
            // Open models
            'open-mistral-7b', 'open-mistral-nemo', 'open-mistral-nemo-2407',
            'open-mixtral-8x7b', 'open-mixtral-8x22b', 'open-mixtral-8x22b-2404',
            
            // Specialized models
            'codestral-latest', 'codestral-2411-rc5', 'codestral-2412', 'codestral-2501', 'codestral-2508',
            'devstral-small-latest', 'devstral-small-2505', 'devstral-small-2507',
            'devstral-medium-latest', 'devstral-medium-2507',
            'pixtral-large-latest', 'pixtral-large-2411',
            'mistral-large-pixtral-2411',
            'pixtral-12b', 'pixtral-12b-latest', 'pixtral-12b-2409',
            'magistral-small-latest', 'magistral-small-2506', 'magistral-small-2507', 'magistral-small-2509',
            'magistral-medium-latest', 'magistral-medium-2506', 'magistral-medium-2507', 'magistral-medium-2509',
            'voxtral-mini-latest', 'voxtral-mini-2507',
            'voxtral-small-latest', 'voxtral-small-2507',
            
            // Embedding and utility models
            'mistral-embed', 'mistral-embed-2312',
            'codestral-embed', 'codestral-embed-2505',
            'mistral-moderation-latest', 'mistral-moderation-2411',
            'mistral-ocr-latest', 'mistral-ocr-2503', 'mistral-ocr-2505',
            'voxtral-mini-transcribe-2507'
        ];
        
        // If the model follows a known pattern but isn't in our list, consider it valid
        // This handles future model versions without requiring constant updates
        if (!validModels.includes(model)) {
            const knownPrefixes = [
                'mistral-', 'ministral-', 'open-mistral-', 'open-mixtral-',
                'codestral-', 'devstral-', 'pixtral-', 'magistral-', 'voxtral-'
            ];
            
            for (const prefix of knownPrefixes) {
                if (model.startsWith(prefix)) {
                    return true;
                }
            }
        }
        
        return validModels.includes(model);
    }
    
    /**
     * Get configuration summary for logging
     */
    static getConfigurationSummary(): string {
        const validation = this.validateEnvironment();
        const config = validation.config;
        
        if (!config) {
            return 'Configuration validation failed';
        }
        
        const summary = [
            '=== AI Services Configuration Summary ===',
            `Gemini: ${config.gemini.apiKey ? 'Configured' : 'Not configured'} (${config.gemini.model})`,
            `Mistral: ${config.mistral.apiKey ? 'Configured' : 'Not configured'} (${config.mistral.model})`,
            `Router: Logging=${config.router.enableLogging}, Fallback=${config.router.enableFallback}`,
            `Port: ${config.general.port}`,
            `Database: ${config.general.databaseUrl ? 'Configured' : 'Not configured'}`,
            `OAuth: ${config.oauth.clientId ? 'Configured' : 'Not configured'}`,
            ''
        ];
        
        if (validation.warnings.length > 0) {
            summary.push('Warnings:');
            validation.warnings.forEach(warning => summary.push(`  - ${warning}`));
            summary.push('');
        }
        
        if (validation.errors.length > 0) {
            summary.push('Errors:');
            validation.errors.forEach(error => summary.push(`  - ${error}`));
        }
        
        return summary.join('\n');
    }
}

/**
 * Validate environment on module load and export results
 */
export const environmentValidation = EnvironmentConfigValidator.validateEnvironment();

/**
 * Export validated configuration
 */
export const validatedConfig = environmentValidation.config;

/**
 * Helper function to ensure environment is properly configured
 */
export function ensureEnvironmentConfigured(): AIServiceEnvironmentConfig {
    if (!environmentValidation.valid) {
        console.error('Environment configuration validation failed:');
        environmentValidation.errors.forEach(error => console.error(`  - ${error}`));
        throw new Error('Environment configuration is invalid. Please check your environment variables.');
    }
    
    if (environmentValidation.warnings.length > 0) {
        console.warn('Environment configuration warnings:');
        environmentValidation.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
    
    return environmentValidation.config!;
}

/**
 * Helper function to check if a specific AI service is available
 */
export function isServiceAvailable(service: 'gemini' | 'mistral'): boolean {
    const config = validatedConfig;
    if (!config) return false;
    
    return service === 'gemini' ? !!config.gemini.apiKey : !!config.mistral.apiKey;
}

/**
 * Helper function to get service configuration
 */
export function getServiceConfig(service: 'gemini' | 'mistral') {
    const config = ensureEnvironmentConfigured();
    return service === 'gemini' ? config.gemini : config.mistral;
}