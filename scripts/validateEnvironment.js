#!/usr/bin/env node

/**
 * Environment Configuration Validation Script
 * 
 * This script validates the environment configuration for dual AI services
 * and provides detailed feedback about any issues.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

dotenv.config({ path: join(projectRoot, '.env') });

/**
 * Validation functions
 */
function validateGeminiConfig() {
    const errors = [];
    const warnings = [];
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        errors.push('GEMINI_API_KEY is required for Gemini service');
    } else if (apiKey.length < 20) {
        warnings.push('GEMINI_API_KEY appears to be too short');
    }
    
    const model = process.env.GEMINI_MODEL;
    if (!model) {
        warnings.push('GEMINI_MODEL not set, will use default');
    }
    
    const temperature = process.env.GEMINI_TEMPERATURE;
    if (temperature) {
        const temp = parseFloat(temperature);
        if (isNaN(temp) || temp < 0 || temp > 2) {
            errors.push('GEMINI_TEMPERATURE must be between 0 and 2');
        }
    }
    
    return { errors, warnings };
}

function validateMistralConfig() {
    const errors = [];
    const warnings = [];
    
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
        warnings.push('MISTRAL_API_KEY not set - Mistral service will not be available');
    } else if (apiKey.length < 20) {
        warnings.push('MISTRAL_API_KEY appears to be too short');
    }
    
    const model = process.env.MISTRAL_MODEL;
    if (!model) {
        warnings.push('MISTRAL_MODEL not set, will use default');
    }
    
    const temperature = process.env.MISTRAL_TEMPERATURE;
    if (temperature) {
        const temp = parseFloat(temperature);
        if (isNaN(temp) || temp < 0 || temp > 2) {
            errors.push('MISTRAL_TEMPERATURE must be between 0 and 2');
        }
    }
    
    const maxTokens = process.env.MISTRAL_MAX_TOKENS;
    if (maxTokens) {
        const tokens = parseInt(maxTokens);
        if (isNaN(tokens) || tokens < 1 || tokens > 32000) {
            errors.push('MISTRAL_MAX_TOKENS must be between 1 and 32000');
        }
    }
    
    return { errors, warnings };
}

function validateRouterConfig() {
    const errors = [];
    const warnings = [];
    
    const timeout = process.env.AI_ROUTER_DEFAULT_TIMEOUT;
    if (timeout) {
        const timeoutValue = parseInt(timeout);
        if (isNaN(timeoutValue) || timeoutValue < 1000 || timeoutValue > 300000) {
            errors.push('AI_ROUTER_DEFAULT_TIMEOUT must be between 1000ms and 300000ms');
        }
    }
    
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

function validateServiceAvailability() {
    const errors = [];
    const warnings = [];
    
    const hasGemini = !!process.env.GEMINI_API_KEY;
    const hasMistral = !!process.env.MISTRAL_API_KEY;
    
    if (!hasGemini && !hasMistral) {
        errors.push('At least one AI service (Gemini or Mistral) must be configured');
    } else if (!hasGemini) {
        warnings.push('Gemini service not configured - complex tasks may not work optimally');
    } else if (!hasMistral) {
        warnings.push('Mistral service not configured - fallback capabilities limited');
    }
    
    return { errors, warnings };
}

function validateGeneralConfig() {
    const errors = [];
    const warnings = [];
    
    const port = process.env.PORT;
    if (port) {
        const portValue = parseInt(port);
        if (isNaN(portValue) || portValue < 1 || portValue > 65535) {
            errors.push('PORT must be between 1 and 65535');
        }
    }
    
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
        errors.push('SESSION_SECRET is required');
    } else if (sessionSecret.length < 32) {
        warnings.push('SESSION_SECRET should be at least 32 characters long');
    }
    
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        errors.push('DATABASE_URL is required');
    }
    
    return { errors, warnings };
}

/**
 * Main validation function
 */
function validateEnvironment() {
    console.log('🔍 Validating Environment Configuration for Dual AI Services\n');
    
    const allErrors = [];
    const allWarnings = [];
    
    // Validate each section
    const sections = [
        { name: 'Gemini Configuration', validator: validateGeminiConfig },
        { name: 'Mistral Configuration', validator: validateMistralConfig },
        { name: 'Router Configuration', validator: validateRouterConfig },
        { name: 'Service Availability', validator: validateServiceAvailability },
        { name: 'General Configuration', validator: validateGeneralConfig }
    ];
    
    sections.forEach(section => {
        const result = section.validator();
        if (result.errors.length > 0 || result.warnings.length > 0) {
            console.log(`📋 ${section.name}:`);
            result.errors.forEach(error => {
                console.log(`   ❌ ${error}`);
                allErrors.push(error);
            });
            result.warnings.forEach(warning => {
                console.log(`   ⚠️  ${warning}`);
                allWarnings.push(warning);
            });
            console.log('');
        }
    });
    
    // Summary
    console.log('📊 Validation Summary:');
    console.log(`   Errors: ${allErrors.length}`);
    console.log(`   Warnings: ${allWarnings.length}`);
    
    if (allErrors.length === 0) {
        console.log('\n✅ Environment configuration is valid!');
        
        // Show configured services
        console.log('\n🤖 Available AI Services:');
        if (process.env.GEMINI_API_KEY) {
            console.log(`   • Gemini: ${process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'}`);
        }
        if (process.env.MISTRAL_API_KEY) {
            console.log(`   • Mistral: ${process.env.MISTRAL_MODEL || 'mistral-small-latest'}`);
        }
        
        console.log('\n🚀 Ready to start dual AI services!');
        return true;
    } else {
        console.log('\n❌ Environment configuration has errors that must be fixed.');
        console.log('\n💡 Please check your .env file and fix the above errors.');
        return false;
    }
}

// Run validation
const isValid = validateEnvironment();
process.exit(isValid ? 0 : 1);