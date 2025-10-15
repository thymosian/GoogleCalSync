/**
 * Tests for Usage Analytics and Monitoring Services
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UsageAnalyticsService } from '../usageAnalyticsService.js';
import { AIRoutingLogger } from '../aiRoutingLogger.js';

describe('Usage Analytics Service', () => {
    let analyticsService: UsageAnalyticsService;

    beforeEach(() => {
        analyticsService = new UsageAnalyticsService();
    });

    it('should record routing decisions', () => {
        analyticsService.recordRoutingDecision(
            'extractMeetingIntent',
            'gemini',
            'gemini',
            false,
            50,
            true
        );

        const analytics = analyticsService.getUsageAnalytics(1);
        expect(analytics.routing.totalRoutingDecisions).toBe(1);
        expect(analytics.routing.fallbacksTriggered).toBe(0);
    });

    it('should record fallback usage', () => {
        analyticsService.recordRoutingDecision(
            'getGeminiResponse',
            'mistral',
            'gemini',
            true,
            100,
            true
        );

        const analytics = analyticsService.getUsageAnalytics(1);
        expect(analytics.routing.fallbacksTriggered).toBe(1);
    });

    it('should generate cost analysis', () => {
        const costAnalysis = analyticsService.getCostAnalysis(24);
        
        expect(costAnalysis).toHaveProperty('gemini');
        expect(costAnalysis).toHaveProperty('mistral');
        expect(costAnalysis).toHaveProperty('savings');
        expect(costAnalysis.mistral.totalCost).toBe(0); // Mistral is free
    });

    it('should generate recommendations', () => {
        // Record some usage to trigger recommendations
        for (let i = 0; i < 20; i++) {
            analyticsService.recordRoutingDecision(
                'extractMeetingIntent',
                'gemini',
                'mistral',
                true,
                2000,
                true
            );
        }

        const analytics = analyticsService.getUsageAnalytics(1);
        expect(analytics.recommendations).toBeDefined();
        expect(Array.isArray(analytics.recommendations)).toBe(true);
    });
});

describe('AI Routing Logger', () => {
    let logger: AIRoutingLogger;

    beforeEach(() => {
        logger = new AIRoutingLogger();
    });

    it('should log routing decisions', () => {
        logger.logRoutingDecision(
            'generateMeetingTitles',
            'gemini',
            'gemini',
            false,
            1500,
            true
        );

        const logs = logger.getRoutingLogs(1);
        expect(logs).toHaveLength(1);
        expect(logs[0].functionName).toBe('generateMeetingTitles');
        expect(logs[0].success).toBe(true);
    });

    it('should log service health', () => {
        logger.logServiceHealth('gemini', 'healthy', 500);
        logger.logServiceHealth('mistral', 'degraded', 2000, 'Slow response');

        const healthLogs = logger.getHealthLogs(1);
        expect(healthLogs).toHaveLength(2);
        expect(healthLogs[0].service).toBe('gemini');
        expect(healthLogs[0].status).toBe('healthy');
        expect(healthLogs[1].status).toBe('degraded');
    });

    it('should generate routing statistics', () => {
        // Log some routing decisions
        logger.logRoutingDecision('extractMeetingIntent', 'gemini', 'gemini', false, 1000, true);
        logger.logRoutingDecision('getGeminiResponse', 'mistral', 'mistral', false, 500, true);
        logger.logRoutingDecision('generateMeetingAgenda', 'gemini', 'mistral', true, 2000, false, 'Rate limit exceeded');

        const stats = logger.getRoutingStatistics(1);
        expect(stats.totalRequests).toBe(3);
        expect(stats.successRate).toBeCloseTo(2/3);
        expect(stats.fallbackRate).toBeCloseTo(1/3);
        expect(stats.modelUsage).toHaveProperty('gemini');
        expect(stats.modelUsage).toHaveProperty('mistral');
    });

    it('should handle alerts', () => {
        // This would require more complex setup to trigger alerts
        const alerts = logger.getAlerts();
        expect(Array.isArray(alerts)).toBe(true);
    });

    it('should export logs', () => {
        logger.logRoutingDecision('test', 'gemini', 'gemini', false, 1000, true);
        
        const exported = logger.exportLogs(1);
        expect(exported).toHaveProperty('routingLogs');
        expect(exported).toHaveProperty('healthLogs');
        expect(exported).toHaveProperty('statistics');
        expect(exported).toHaveProperty('alerts');
        expect(exported).toHaveProperty('exportTime');
    });
});