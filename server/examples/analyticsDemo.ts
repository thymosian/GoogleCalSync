/**
 * Demonstration of Usage Analytics and Monitoring Features
 * This file shows how to use the new analytics and monitoring capabilities
 */

import { aiRouter } from '../aiRouterService.js';
import { usageAnalytics } from '../usageAnalyticsService.js';
import { aiRoutingLogger } from '../aiRoutingLogger.js';

/**
 * Demo function to show analytics capabilities
 */
async function demonstrateAnalytics() {
    console.log('=== AI Router Analytics Demo ===\n');

    // 1. Get current usage statistics
    console.log('1. Current Usage Statistics:');
    const usageStats = aiRouter.getUsageStats();
    console.log(`Total Gemini requests: ${usageStats.gemini.totalRequests}`);
    console.log(`Total Mistral requests: ${usageStats.mistral.totalRequests}`);
    console.log(`Fallbacks triggered: ${usageStats.routing.fallbacksTriggered}`);
    console.log();

    // 2. Get comprehensive analytics
    console.log('2. Comprehensive Analytics (last 24 hours):');
    const analytics = aiRouter.getUsageAnalytics(24);
    console.log(`Total routing decisions: ${analytics.routing.totalRoutingDecisions}`);
    console.log(`Gemini success rate: ${(analytics.gemini.successRate * 100).toFixed(1)}%`);
    console.log(`Mistral success rate: ${(analytics.mistral.successRate * 100).toFixed(1)}%`);
    console.log(`Recommendations: ${analytics.recommendations.length} available`);

    if (analytics.recommendations.length > 0) {
        console.log('Top recommendation:', analytics.recommendations[0].title);
    }
    console.log();

    // 3. Get cost analysis
    console.log('3. Cost Analysis:');
    const costAnalysis = aiRouter.getCostAnalysis(24);
    console.log(`Gemini cost (24h): $${costAnalysis.gemini.totalCost.toFixed(4)}`);
    console.log(`Mistral cost (24h): $${costAnalysis.mistral.totalCost.toFixed(4)}`);
    console.log(`Total savings: $${costAnalysis.savings.totalSavings.toFixed(4)}`);
    console.log(`Projected monthly cost: $${costAnalysis.gemini.projectedMonthlyCost.toFixed(2)}`);
    console.log();

    // 4. Get routing statistics
    console.log('4. Routing Statistics:');
    const routingStats = aiRouter.getRoutingStatistics(24);
    console.log(`Total requests: ${routingStats.totalRequests}`);
    console.log(`Average response time: ${routingStats.averageResponseTime.toFixed(0)}ms`);
    console.log(`Fallback rate: ${(routingStats.fallbackRate * 100).toFixed(1)}%`);

    console.log('Model usage breakdown:');
    Object.entries(routingStats.modelUsage).forEach(([model, count]) => {
        console.log(`  ${model}: ${count} requests`);
    });
    console.log();

    // 5. Get current alerts
    console.log('5. Current Alerts:');
    const alerts = aiRouter.getAlerts();
    if (alerts.length === 0) {
        console.log('No active alerts');
    } else {
        alerts.forEach(alert => {
            console.log(`[${alert.severity.toUpperCase()}] ${alert.title}: ${alert.description}`);
        });
    }
    console.log();

    // 6. Get service health
    console.log('6. Service Health:');
    const serviceHealth = await aiRouter.getServiceHealth();
    console.log(`Gemini: ${serviceHealth.gemini.available ? 'Available' : 'Unavailable'}`);
    console.log(`Mistral: ${serviceHealth.mistral.available ? 'Available' : 'Unavailable'}`);

    if (serviceHealth.gemini.responseTime) {
        console.log(`Gemini response time: ${serviceHealth.gemini.responseTime}ms`);
    }
    if (serviceHealth.mistral.responseTime) {
        console.log(`Mistral response time: ${serviceHealth.mistral.responseTime}ms`);
    }
    console.log();

    // 7. Export comprehensive data
    console.log('7. Export Data:');
    const exportedData = aiRouter.exportAnalytics(24);
    console.log('Exported data summary:');
    console.log(`  Total requests: ${exportedData.summary.totalRequests}`);
    console.log(`  Total cost: $${exportedData.summary.totalCost.toFixed(4)}`);
    console.log(`  Success rate: ${(exportedData.summary.successRate * 100).toFixed(1)}%`);
    console.log(`  Top functions: ${exportedData.summary.topFunctions.map(f => f.name).join(', ')}`);
    console.log();

    console.log('=== Demo Complete ===');
}

/**
 * Demo function to show monitoring capabilities
 */
async function demonstrateMonitoring() {
    console.log('=== AI Router Monitoring Demo ===\n');

    // 1. Get recent routing logs
    console.log('1. Recent Routing Logs (last 5):');
    const routingLogs = aiRouter.getRoutingLogs(24);
    const recentLogs = routingLogs.slice(-5);

    if (recentLogs.length === 0) {
        console.log('No routing logs available');
    } else {
        recentLogs.forEach(log => {
            const status = log.success ? '✓' : '✗';
            const fallback = log.fallbackUsed ? ' (fallback)' : '';
            console.log(`${status} ${log.functionName} -> ${log.actualModel}${fallback} (${log.responseTime}ms)`);
        });
    }
    console.log();

    // 2. Get health logs
    console.log('2. Recent Health Logs (last 5):');
    const healthLogs = aiRouter.getHealthLogs(24);
    const recentHealthLogs = healthLogs.slice(-5);

    if (recentHealthLogs.length === 0) {
        console.log('No health logs available');
    } else {
        recentHealthLogs.forEach(log => {
            const status = log.status === 'healthy' ? '✓' : log.status === 'degraded' ? '⚠' : '✗';
            console.log(`${status} ${log.service}: ${log.status}${log.responseTime ? ` (${log.responseTime}ms)` : ''}`);
        });
    }
    console.log();

    // 3. Alert configuration
    console.log('3. Alert Configuration:');
    console.log('Current alert thresholds:');
    console.log('  Error rate: 10%');
    console.log('  Response time: 5000ms');
    console.log('  Fallback rate: 20%');
    console.log('  Daily cost: $50');
    console.log();

    // 4. Export logs
    console.log('4. Export Logs:');
    const exportedLogs = aiRouter.exportLogs(24);
    console.log(`Routing logs: ${exportedLogs.routingLogs.length} entries`);
    console.log(`Health logs: ${exportedLogs.healthLogs.length} entries`);
    console.log(`Active alerts: ${exportedLogs.alerts.filter(a => !a.resolvedAt).length}`);
    console.log();

    console.log('=== Monitoring Demo Complete ===');
}

/**
 * Demo function to simulate some routing activity
 */
async function simulateRoutingActivity() {
    console.log('=== Simulating Routing Activity ===\n');

    try {
        // Simulate some successful requests
        console.log('Simulating successful requests...');

        // Note: These would normally be actual AI function calls
        // For demo purposes, we're just recording the routing decisions

        usageAnalytics.recordRoutingDecision('extractMeetingIntent', 'gemini', 'gemini', false, 1500, true);
        usageAnalytics.recordRoutingDecision('generateMeetingTitles', 'gemini', 'gemini', false, 2000, true);
        usageAnalytics.recordRoutingDecision('getGeminiResponse', 'mistral', 'mistral', false, 800, true);
        usageAnalytics.recordRoutingDecision('verifyAttendees', 'mistral', 'mistral', false, 600, true);

        // Simulate some fallback scenarios
        console.log('Simulating fallback scenarios...');
        usageAnalytics.recordRoutingDecision('extractMeetingIntent', 'gemini', 'mistral', true, 3000, true);
        usageAnalytics.recordRoutingDecision('generateMeetingAgenda', 'gemini', 'mistral', true, 2500, false);

        // Log some service health updates
        aiRoutingLogger.logServiceHealth('gemini', 'healthy', 1200);
        aiRoutingLogger.logServiceHealth('mistral', 'healthy', 800);

        console.log('Activity simulation complete!');
        console.log();

        // Show updated statistics
        const stats = aiRouter.getRoutingStatistics(1);
        console.log('Updated statistics:');
        console.log(`Total requests: ${stats.totalRequests}`);
        console.log(`Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
        console.log(`Fallback rate: ${(stats.fallbackRate * 100).toFixed(1)}%`);

    } catch (error) {
        console.error('Error during simulation:', error);
    }
}

// Export demo functions for use in other modules
export { demonstrateAnalytics, demonstrateMonitoring, simulateRoutingActivity };

// If running this file directly, run all demos
if (import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        await simulateRoutingActivity();
        await demonstrateAnalytics();
        await demonstrateMonitoring();
    })().catch(console.error);
} 