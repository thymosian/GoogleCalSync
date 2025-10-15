/**
 * Integration Validation Tests
 * 
 * These tests validate that the AI routing integration is working correctly
 * without requiring actual API keys. They test the routing logic, fallback
 * mechanisms, and ensure backward compatibility.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiRouter } from '../aiRouterService';

// Mock the actual AI services to avoid API calls
vi.mock('../gemini', () => ({
    extractMeetingIntent: vi.fn().mockResolvedValue({
        intent: 'scheduling',
        confidence: 0.85,
        extractedData: { title: 'Test Meeting' }
    }),
    generateMeetingTitles: vi.fn().mockResolvedValue({
        suggestions: ['Meeting Title 1', 'Meeting Title 2'],
        context: 'Generated titles'
    }),
    generateMeetingAgenda: vi.fn().mockResolvedValue('1. Welcome\n2. Discussion\n3. Action Items'),
    generateActionItems: vi.fn().mockResolvedValue([
        { task: 'Follow up', priority: 'high' }
    ]),
    getGeminiResponse: vi.fn().mockResolvedValue('Gemini response'),
    verifyAttendees: vi.fn().mockResolvedValue([
        { email: 'test@example.com', valid: true, trusted: true }
    ])
}));

vi.mock('../mistralService', () => ({
    getGeminiResponse: vi.fn().mockResolvedValue('Mistral response'),
    verifyAttendees: vi.fn().mockResolvedValue([
        { email: 'test@example.com', valid: true, trusted: true }
    ])
}));

describe('AI Routing Integration Validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Router Configuration', () => {
        it('should have routing rules configured', () => {
            const rules = aiRouter.getRoutingRules();
            
            expect(rules).toBeDefined();
            expect(Object.keys(rules).length).toBeGreaterThan(0);
            
            // Check that key functions are configured
            expect(rules.extractMeetingIntent).toBeDefined();
            expect(rules.generateMeetingTitles).toBeDefined();
            expect(rules.getGeminiResponse).toBeDefined();
            expect(rules.verifyAttendees).toBeDefined();
        });

        it('should have proper model assignments', () => {
            const rules = aiRouter.getRoutingRules();
            
            // Complex tasks should route to Gemini
            expect(rules.extractMeetingIntent.primaryModel).toBe('gemini');
            expect(rules.generateMeetingTitles.primaryModel).toBe('gemini');
            expect(rules.generateMeetingAgenda.primaryModel).toBe('gemini');
            
            // Simple tasks should route to Mistral
            expect(rules.verifyAttendees.primaryModel).toBe('mistral');
            expect(rules.getGeminiResponse.primaryModel).toBe('mistral');
        });

        it('should have fallback models configured', () => {
            const rules = aiRouter.getRoutingRules();
            
            // Each rule should have a fallback model
            Object.values(rules).forEach(rule => {
                expect(rule.fallbackModel).toBeDefined();
                expect(rule.fallbackModel).not.toBe(rule.primaryModel);
            });
        });
    });

    describe('Service Health', () => {
        it('should provide health status', async () => {
            const health = await aiRouter.getServiceHealth();
            
            expect(health).toBeDefined();
            expect(health.gemini).toBeDefined();
            expect(health.mistral).toBeDefined();
        });

        it('should handle service availability checks', async () => {
            // The health check should complete without throwing errors
            await expect(aiRouter.getServiceHealth()).resolves.toBeDefined();
        });
    });

    describe('Request Routing', () => {
        it('should route requests to appropriate services', async () => {
            // Import the mocked services to verify calls
            const geminiService = await import('../gemini');
            const mistralService = await import('../mistralService');

            // Test complex task routing (should go to Gemini)
            await aiRouter.routeRequest('extractMeetingIntent', [[]]);
            expect(geminiService.extractMeetingIntent).toHaveBeenCalled();

            // Test simple task routing (should go to Mistral)
            await aiRouter.routeRequest('verifyAttendees', [['test@example.com']]);
            expect(mistralService.verifyAttendees).toHaveBeenCalled();
        });

        it('should handle function routing correctly', async () => {
            const result = await aiRouter.routeRequest('getGeminiResponse', [[{ role: 'user', content: 'test' }]]);
            
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid function names gracefully', async () => {
            await expect(
                aiRouter.routeRequest('nonExistentFunction' as any, [])
            ).rejects.toThrow();
        });

        it('should handle empty arguments', async () => {
            // Should not throw for valid functions with empty args
            const result = await aiRouter.routeRequest('getGeminiResponse', [[]]);
            expect(result).toBeDefined();
        });
    });

    describe('Performance Monitoring', () => {
        it('should track usage statistics', () => {
            const stats = aiRouter.getUsageStats();
            
            expect(stats).toBeDefined();
            expect(typeof stats).toBe('object');
        });

        it('should provide performance metrics', () => {
            const analytics = aiRouter.getUsageAnalytics();
            
            expect(analytics).toBeDefined();
            expect(typeof analytics).toBe('object');
        });
    });

    describe('Backward Compatibility', () => {
        it('should maintain existing function interfaces', async () => {
            // Test that all expected functions are available through the router
            const functions = [
                'extractMeetingIntent',
                'generateMeetingTitles',
                'generateMeetingAgenda',
                'generateActionItems',
                'getGeminiResponse',
                'verifyAttendees'
            ];

            functions.forEach(functionName => {
                const rules = aiRouter.getRoutingRules();
                expect(rules[functionName]).toBeDefined();
            });
        });

        it('should handle different parameter types', async () => {
            // Test with different parameter combinations
            await expect(
                aiRouter.routeRequest('getGeminiResponse', [[{ role: 'user', content: 'test' }]])
            ).resolves.toBeDefined();

            await expect(
                aiRouter.routeRequest('verifyAttendees', [['test@example.com']])
            ).resolves.toBeDefined();
        });
    });

    describe('Configuration Validation', () => {
        it('should have valid timeout configurations', () => {
            const rules = aiRouter.getRoutingRules();
            
            Object.values(rules).forEach(rule => {
                expect(rule.timeout).toBeDefined();
                expect(rule.timeout).toBeGreaterThan(0);
                expect(rule.timeout).toBeLessThanOrEqual(60000); // Max 60 seconds
            });
        });

        it('should have cost optimization settings', () => {
            const rules = aiRouter.getRoutingRules();
            
            // Verify that cost-sensitive functions use appropriate models
            expect(rules.verifyAttendees.primaryModel).toBe('mistral'); // Cheaper for simple tasks
            expect(rules.extractMeetingIntent.primaryModel).toBe('gemini'); // Better for complex tasks
        });
    });
});