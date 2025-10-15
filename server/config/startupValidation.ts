/**
 * Startup Environment Validation
 * 
 * This module performs environment validation during application startup
 * and provides clear feedback about configuration issues.
 */

import { EnvironmentConfigValidator } from './environmentConfig.js';

/**
 * Perform startup validation and log results
 */
export function validateEnvironmentOnStartup(): boolean {
    console.log('\n=== Environment Configuration Validation ===\n');
    
    const validation = EnvironmentConfigValidator.validateEnvironment();
    
    // Log configuration summary
    console.log(EnvironmentConfigValidator.getConfigurationSummary());
    
    // Handle validation results
    if (validation.valid) {
        console.log('✅ Environment configuration is valid');
        
        if (validation.warnings.length > 0) {
            console.log('\n⚠️  Configuration warnings (application will continue):');
            validation.warnings.forEach(warning => {
                console.log(`   • ${warning}`);
            });
        }
        
        console.log('\n🚀 AI services are ready to start\n');
        return true;
    } else {
        console.log('❌ Environment configuration validation failed');
        console.log('\n🔧 Configuration errors that must be fixed:');
        validation.errors.forEach(error => {
            console.log(`   • ${error}`);
        });
        
        if (validation.warnings.length > 0) {
            console.log('\n⚠️  Additional warnings:');
            validation.warnings.forEach(warning => {
                console.log(`   • ${warning}`);
            });
        }
        
        console.log('\n💡 Please fix the above errors and restart the application.\n');
        return false;
    }
}

/**
 * Validate environment and exit if invalid (for production use)
 */
export function validateEnvironmentOrExit(): void {
    if (!validateEnvironmentOnStartup()) {
        console.error('Exiting due to invalid environment configuration.');
        process.exit(1);
    }
}

/**
 * Validate specific service availability
 */
export function validateServiceAvailability(service: 'gemini' | 'mistral'): boolean {
    const validation = EnvironmentConfigValidator.validateEnvironment();
    
    if (!validation.config) {
        return false;
    }
    
    const serviceConfig = service === 'gemini' ? validation.config.gemini : validation.config.mistral;
    return !!serviceConfig.apiKey;
}

/**
 * Get environment validation status for health checks
 */
export function getEnvironmentValidationStatus() {
    const validation = EnvironmentConfigValidator.validateEnvironment();
    
    return {
        valid: validation.valid,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length,
        services: {
            gemini: validation.config ? !!validation.config.gemini.apiKey : false,
            mistral: validation.config ? !!validation.config.mistral.apiKey : false
        },
        timestamp: new Date().toISOString()
    };
}