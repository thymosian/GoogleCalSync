/**
 * Environment Configuration Tests
 * 
 * Tests for environment variable validation and configuration management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EnvironmentConfigValidator } from '../config/environmentConfig.js';

describe('Environment Configuration Validation', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        // Store original environment
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        // Restore original environment
        process.env = originalEnv;
    });

    describe('Gemini Configuration Validation', () => {
        it('should pass validation with valid Gemini configuration', () => {
            process.env.GEMINI_API_KEY = 'AIzaSyCtqhOhzHYMLr091w6vZqyYarqqUqKKMcg';
            process.env.GEMINI_MODEL = 'gemini-2.0-flash-exp';
            process.env.GEMINI_TEMPERATURE = '0.3';
            process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
            process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
            process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
            process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-long-enough';

            const result = EnvironmentConfigValidator.validateEnvironment();
            
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.config?.gemini.apiKey).toBe('AIzaSyCtqhOhzHYMLr091w6vZqyYarqqUqKKMcg');
        });

        it('should fail validation with missing Gemini API key', () => {
            delete process.env.GEMINI_API_KEY;
            process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
            process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
            process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
            process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-long-enough';

            const result = EnvironmentConfigValidator.validateEnvironment();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('GEMINI_API_KEY is required for Gemini service');
        });

        it('should warn about invalid temperature values', () => {
            process.env.GEMINI_API_KEY = 'AIzaSyCtqhOhzHYMLr091w6vZqyYarqqUqKKMcg';
            process.env.GEMINI_TEMPERATURE = '5.0'; // Invalid temperature
            process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
            process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
            process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
            process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-long-enough';

            const result = EnvironmentConfigValidator.validateEnvironment();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('GEMINI_TEMPERATURE must be a number between 0 and 2');
        });
    });

    describe('Mistral Configuration Validation', () => {
        it('should pass validation with valid Mistral configuration', () => {
            process.env.GEMINI_API_KEY = 'AIzaSyCtqhOhzHYMLr091w6vZqyYarqqUqKKMcg';
            process.env.MISTRAL_API_KEY = 'hI3z9LJdGV7Mq4dTNX20Wr5FR1k4pTfj';
            process.env.MISTRAL_MODEL = 'mistral-small-latest';
            process.env.MISTRAL_TEMPERATURE = '0.3';
            process.env.MISTRAL_MAX_TOKENS = '1000';
            process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
            process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
            process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
            process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-long-enough';

            const result = EnvironmentConfigValidator.validateEnvironment();
            
            expect(result.valid).toBe(true);
            expect(result.config?.mistral.apiKey).toBe('hI3z9LJdGV7Mq4dTNX20Wr5FR1k4pTfj');
        });

        it('should warn when Mistral API key is missing', () => {
            process.env.GEMINI_API_KEY = 'AIzaSyCtqhOhzHYMLr091w6vZqyYarqqUqKKMcg';
            delete process.env.MISTRAL_API_KEY;
            process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
            process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
            process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
            process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-long-enough';

            const result = EnvironmentConfigValidator.validateEnvironment();
            
            expect(result.warnings).toContain('MISTRAL_API_KEY is not set. Mistral service will not be available for fallback');
        });

        it('should fail validation with invalid max tokens', () => {
            process.env.GEMINI_API_KEY = 'AIzaSyCtqhOhzHYMLr091w6vZqyYarqqUqKKMcg';
            process.env.MISTRAL_API_KEY = 'hI3z9LJdGV7Mq4dTNX20Wr5FR1k4pTfj';
            process.env.MISTRAL_MAX_TOKENS = '50000'; // Too high
            process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
            process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
            process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
            process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-long-enough';

            const result = EnvironmentConfigValidator.validateEnvironment();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('MISTRAL_MAX_TOKENS must be a number between 1 and 32000');
        });
    });

    describe('Service Availability Validation', () => {
        it('should fail when no AI services are configured', () => {
            delete process.env.GEMINI_API_KEY;
            delete process.env.MISTRAL_API_KEY;
            process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
            process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
            process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
            process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-long-enough';

            const result = EnvironmentConfigValidator.validateEnvironment();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('At least one AI service (Gemini or Mistral) must be configured with a valid API key');
        });

        it('should warn when only one service is configured', () => {
            process.env.GEMINI_API_KEY = 'AIzaSyCtqhOhzHYMLr091w6vZqyYarqqUqKKMcg';
            delete process.env.MISTRAL_API_KEY;
            process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
            process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
            process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
            process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-long-enough';

            const result = EnvironmentConfigValidator.validateEnvironment();
            
            expect(result.warnings).toContain('Mistral service is not configured. Fallback capabilities will be limited');
        });
    });

    describe('Router Configuration Validation', () => {
        it('should validate router timeout settings', () => {
            process.env.GEMINI_API_KEY = 'AIzaSyCtqhOhzHYMLr091w6vZqyYarqqUqKKMcg';
            process.env.AI_ROUTER_DEFAULT_TIMEOUT = '500'; // Too low
            process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
            process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
            process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
            process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-long-enough';

            const result = EnvironmentConfigValidator.validateEnvironment();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('AI_ROUTER_DEFAULT_TIMEOUT must be between 1000ms and 300000ms');
        });

        it('should validate boolean router settings', () => {
            process.env.GEMINI_API_KEY = 'AIzaSyCtqhOhzHYMLr091w6vZqyYarqqUqKKMcg';
            process.env.AI_ROUTER_ENABLE_LOGGING = 'maybe'; // Invalid boolean
            process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
            process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
            process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
            process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-long-enough';

            const result = EnvironmentConfigValidator.validateEnvironment();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('AI_ROUTER_ENABLE_LOGGING must be "true" or "false"');
        });
    });

    describe('Configuration Summary', () => {
        it('should generate a readable configuration summary', () => {
            process.env.GEMINI_API_KEY = 'AIzaSyCtqhOhzHYMLr091w6vZqyYarqqUqKKMcg';
            process.env.MISTRAL_API_KEY = 'hI3z9LJdGV7Mq4dTNX20Wr5FR1k4pTfj';
            process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
            process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
            process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
            process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-long-enough';

            const summary = EnvironmentConfigValidator.getConfigurationSummary();
            
            expect(summary).toContain('AI Services Configuration Summary');
            expect(summary).toContain('Gemini: Configured');
            expect(summary).toContain('Mistral: Configured');
        });
    });
});