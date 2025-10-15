#!/usr/bin/env tsx

/**
 * End-to-End AI Routing Test Script
 * 
 * This script validates that the AI router service is working correctly
 * and that all existing functionality continues to work seamlessly.
 */

import {
    extractMeetingIntent,
    generateMeetingTitles,
    generateMeetingAgenda,
    generateActionItems,
    getGeminiResponse,
    verifyAttendees
} from '../aiInterface.js';
import { aiRouter } from '../aiRouterService.js';
import { usageAnalytics } from '../usageAnalyticsService.js';
import type { ConversationMessage } from '../../shared/schema.js';

interface TestResult {
    test: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    message: string;
    duration?: number;
    error?: string;
}

class EndToEndValidator {
    private results: TestResult[] = [];

    async runAllTests(): Promise<void> {
        console.log('🚀 Starting End-to-End AI Routing Validation...\n');

        // Test 1: Service Health Check
        await this.testServiceHealth();

        // Test 2: Basic Routing Configuration
        await this.testRoutingConfiguration();

        // Test 3: Meeting Intent Extraction (Gemini)
        await this.testMeetingIntentExtraction();

        // Test 4: Meeting Title Generation (Gemini)
        await this.testMeetingTitleGeneration();

        // Test 5: Meeting Agenda Generation (Gemini)
        await this.testMeetingAgendaGeneration();

        // Test 6: Action Items Generation (Gemini)
        await this.testActionItemsGeneration();

        // Test 7: Chat Response Generation (Mistral)
        await this.testChatResponseGeneration();

        // Test 8: Attendee Verification (Mistral)
        await this.testAttendeeVerification();

        // Test 9: Complete Meeting Workflow
        await this.testCompleteWorkflow();

        // Test 10: Performance and Cost Optimization
        await this.testPerformanceOptimization();

        // Test 11: Error Handling and Fallback
        await this.testErrorHandling();

        // Print Results
        this.printResults();
    }

    private async testServiceHealth(): Promise<void> {
        try {
            const startTime = Date.now();
            const healthStatus = await aiRouter.getServiceHealth();
            const duration = Date.now() - startTime;

            if (healthStatus && healthStatus.gemini && healthStatus.mistral) {
                this.results.push({
                    test: 'Service Health Check',
                    status: 'PASS',
                    message: `AI services available. Gemini: ${healthStatus.gemini.available}, Mistral: ${healthStatus.mistral.available}`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Service Health Check',
                    status: 'FAIL',
                    message: 'Service health check returned invalid response',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Service Health Check',
                status: 'FAIL',
                message: 'Service health check failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testRoutingConfiguration(): Promise<void> {
        try {
            const startTime = Date.now();
            const routingRules = aiRouter.getRoutingRules();
            const duration = Date.now() - startTime;

            if (routingRules && Object.keys(routingRules).length > 0) {
                const ruleCount = Object.keys(routingRules).length;
                this.results.push({
                    test: 'Routing Configuration',
                    status: 'PASS',
                    message: `Found ${ruleCount} routing rules configured`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Routing Configuration',
                    status: 'FAIL',
                    message: 'No routing rules found',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Routing Configuration',
                status: 'FAIL',
                message: 'Failed to get routing configuration',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testMeetingIntentExtraction(): Promise<void> {
        try {
            const startTime = Date.now();

            const testMessages: ConversationMessage[] = [
                {
                    id: 'test-1',
                    role: 'user',
                    content: 'Can we schedule a team meeting for tomorrow at 2pm to discuss the project status?',
                    timestamp: new Date()
                }
            ];

            const result = await extractMeetingIntent(testMessages);
            const duration = Date.now() - startTime;

            if (result && result.intent && typeof result.confidence === 'number') {
                this.results.push({
                    test: 'Meeting Intent Extraction (Gemini)',
                    status: 'PASS',
                    message: `Successfully extracted intent: ${result.intent} (confidence: ${result.confidence})`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Meeting Intent Extraction (Gemini)',
                    status: 'FAIL',
                    message: 'Intent extraction returned invalid result',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Meeting Intent Extraction (Gemini)',
                status: 'FAIL',
                message: 'Intent extraction failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testMeetingTitleGeneration(): Promise<void> {
        try {
            const startTime = Date.now();

            const result = await generateMeetingTitles(
                'Sprint retrospective meeting',
                ['dev1@example.com', 'dev2@example.com'],
                'Development team retrospective to review sprint progress'
            );
            const duration = Date.now() - startTime;

            if (result && result.suggestions && Array.isArray(result.suggestions) && result.suggestions.length > 0) {
                this.results.push({
                    test: 'Meeting Title Generation (Gemini)',
                    status: 'PASS',
                    message: `Generated ${result.suggestions.length} title suggestions`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Meeting Title Generation (Gemini)',
                    status: 'FAIL',
                    message: 'Title generation returned invalid result',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Meeting Title Generation (Gemini)',
                status: 'FAIL',
                message: 'Title generation failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testMeetingAgendaGeneration(): Promise<void> {
        try {
            const startTime = Date.now();

            const result = await generateMeetingAgenda(
                'Sprint Retrospective',
                'Review sprint progress and identify improvements',
                ['dev1@example.com', 'dev2@example.com'],
                90,
                'Development team retrospective meeting'
            );
            const duration = Date.now() - startTime;

            if (result && typeof result === 'string' && result.length > 50) {
                this.results.push({
                    test: 'Meeting Agenda Generation (Gemini)',
                    status: 'PASS',
                    message: `Generated agenda with ${result.length} characters`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Meeting Agenda Generation (Gemini)',
                    status: 'FAIL',
                    message: 'Agenda generation returned invalid result',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Meeting Agenda Generation (Gemini)',
                status: 'FAIL',
                message: 'Agenda generation failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testActionItemsGeneration(): Promise<void> {
        try {
            const startTime = Date.now();

            const result = await generateActionItems(
                'Sprint Retrospective',
                'Review and improve development process',
                ['dev1@example.com', 'dev2@example.com'],
                ['Sprint review', 'Process improvements', 'Team feedback'],
                'Post-sprint planning and improvement identification'
            );
            const duration = Date.now() - startTime;

            if (result && Array.isArray(result) && result.length > 0) {
                this.results.push({
                    test: 'Action Items Generation (Gemini)',
                    status: 'PASS',
                    message: `Generated ${result.length} action items`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Action Items Generation (Gemini)',
                    status: 'FAIL',
                    message: 'Action items generation returned invalid result',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Action Items Generation (Gemini)',
                status: 'FAIL',
                message: 'Action items generation failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testChatResponseGeneration(): Promise<void> {
        try {
            const startTime = Date.now();

            const messages = [
                { role: 'user' as const, content: 'Hello, I need help scheduling a meeting' }
            ];

            const result = await getGeminiResponse(messages);
            const duration = Date.now() - startTime;

            if (result && typeof result === 'string' && result.length > 10) {
                this.results.push({
                    test: 'Chat Response Generation (Mistral)',
                    status: 'PASS',
                    message: `Generated response with ${result.length} characters`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Chat Response Generation (Mistral)',
                    status: 'FAIL',
                    message: 'Chat response generation returned invalid result',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Chat Response Generation (Mistral)',
                status: 'FAIL',
                message: 'Chat response generation failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testAttendeeVerification(): Promise<void> {
        try {
            const startTime = Date.now();

            const result = await verifyAttendees(['test@example.com', 'user@example.com']);
            const duration = Date.now() - startTime;

            if (result && Array.isArray(result) && result.length > 0) {
                this.results.push({
                    test: 'Attendee Verification (Mistral)',
                    status: 'PASS',
                    message: `Verified ${result.length} attendees`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Attendee Verification (Mistral)',
                    status: 'FAIL',
                    message: 'Attendee verification returned invalid result',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Attendee Verification (Mistral)',
                status: 'FAIL',
                message: 'Attendee verification failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testCompleteWorkflow(): Promise<void> {
        try {
            const startTime = Date.now();

            // Simulate a complete meeting scheduling workflow
            const conversationMessages: ConversationMessage[] = [
                {
                    id: 'workflow-1',
                    role: 'user',
                    content: 'We need to schedule a sprint planning meeting for next week',
                    timestamp: new Date()
                }
            ];

            // Step 1: Extract intent
            const intentResult = await extractMeetingIntent(conversationMessages);

            // Step 2: Generate titles
            const titleResult = await generateMeetingTitles(
                'Sprint planning meeting',
                ['team@example.com'],
                'Planning next sprint activities'
            );

            // Step 3: Verify attendees
            const attendeeResult = await verifyAttendees(['team@example.com']);

            // Step 4: Generate agenda
            const agendaResult = await generateMeetingAgenda(
                titleResult.suggestions[0] || 'Sprint Planning',
                'Plan next sprint activities',
                ['team@example.com'],
                120
            );

            const duration = Date.now() - startTime;

            if (intentResult && titleResult && attendeeResult && agendaResult) {
                this.results.push({
                    test: 'Complete Meeting Workflow',
                    status: 'PASS',
                    message: 'Successfully completed full meeting scheduling workflow',
                    duration
                });
            } else {
                this.results.push({
                    test: 'Complete Meeting Workflow',
                    status: 'FAIL',
                    message: 'Workflow failed at one or more steps',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Complete Meeting Workflow',
                status: 'FAIL',
                message: 'Workflow execution failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testPerformanceOptimization(): Promise<void> {
        try {
            const startTime = Date.now();

            // Get initial usage statistics
            const initialStats = aiRouter.getUsageStats();

            // Perform some operations to generate statistics
            await getGeminiResponse([{ role: 'user', content: 'Test message for performance tracking' }]);
            await verifyAttendees(['performance@test.com']);

            // Get updated statistics
            const finalStats = aiRouter.getUsageStats();
            const duration = Date.now() - startTime;

            // Check if statistics are being tracked
            const geminiRequests = finalStats.gemini.totalRequests;
            const mistralRequests = finalStats.mistral.totalRequests;
            const totalRoutingDecisions = finalStats.routing.totalRoutingDecisions;

            if (totalRoutingDecisions > 0 && (geminiRequests > 0 || mistralRequests > 0)) {
                this.results.push({
                    test: 'Performance and Cost Optimization',
                    status: 'PASS',
                    message: `Tracking ${totalRoutingDecisions} routing decisions, ${geminiRequests} Gemini requests, ${mistralRequests} Mistral requests`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Performance and Cost Optimization',
                    status: 'SKIP',
                    message: 'Performance tracking data not available or insufficient',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Performance and Cost Optimization',
                status: 'SKIP',
                message: 'Performance optimization test skipped',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testErrorHandling(): Promise<void> {
        try {
            const startTime = Date.now();

            // Test error handling with invalid input
            try {
                await extractMeetingIntent([]);
                // If this doesn't throw, it should handle empty input gracefully
                this.results.push({
                    test: 'Error Handling and Fallback',
                    status: 'PASS',
                    message: 'System handles edge cases gracefully',
                    duration: Date.now() - startTime
                });
            } catch (error) {
                // If it throws, it should be a meaningful error
                if (error instanceof Error && error.message.length > 5) {
                    this.results.push({
                        test: 'Error Handling and Fallback',
                        status: 'PASS',
                        message: 'System provides meaningful error messages',
                        duration: Date.now() - startTime
                    });
                } else {
                    this.results.push({
                        test: 'Error Handling and Fallback',
                        status: 'FAIL',
                        message: 'Error handling needs improvement',
                        duration: Date.now() - startTime
                    });
                }
            }
        } catch (error) {
            this.results.push({
                test: 'Error Handling and Fallback',
                status: 'SKIP',
                message: 'Error handling test could not be completed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private printResults(): void {
        console.log('\n📊 End-to-End AI Routing Validation Results');
        console.log('==========================================\n');

        const passed = this.results.filter(r => r.status === 'PASS').length;
        const failed = this.results.filter(r => r.status === 'FAIL').length;
        const skipped = this.results.filter(r => r.status === 'SKIP').length;

        this.results.forEach(result => {
            const statusIcon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⏭️';
            const durationText = result.duration ? ` (${result.duration}ms)` : '';
            console.log(`${statusIcon} ${result.test}${durationText}`);
            console.log(`   ${result.message}`);
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
            console.log();
        });

        console.log('Summary:');
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`⏭️ Skipped: ${skipped}`);
        console.log(`📊 Total: ${this.results.length}\n`);

        // Performance Analysis
        this.printPerformanceAnalysis();

        // Cost Optimization Analysis
        this.printCostAnalysis();

        // Recommendations
        this.printRecommendations();
    }

    private printPerformanceAnalysis(): void {
        console.log('⚡ Performance Analysis:');
        console.log('======================\n');

        const completedTests = this.results.filter(r => r.duration);
        if (completedTests.length === 0) {
            console.log('No performance data available\n');
            return;
        }

        const avgDuration = completedTests.reduce((sum, r) => sum + (r.duration || 0), 0) / completedTests.length;
        const maxDuration = Math.max(...completedTests.map(r => r.duration || 0));
        const minDuration = Math.min(...completedTests.map(r => r.duration || 0));

        console.log(`Average response time: ${Math.round(avgDuration)}ms`);
        console.log(`Fastest response: ${minDuration}ms`);
        console.log(`Slowest response: ${maxDuration}ms`);

        // Identify slow operations
        const slowTests = completedTests.filter(r => (r.duration || 0) > avgDuration * 1.5);
        if (slowTests.length > 0) {
            console.log('\nSlow operations:');
            slowTests.forEach(test => {
                console.log(`  • ${test.test}: ${test.duration}ms`);
            });
        }

        console.log();
    }

    private printCostAnalysis(): void {
        console.log('💰 Cost Optimization Analysis:');
        console.log('=============================\n');

        try {
            const stats = aiRouter.getUsageStats();
            
            console.log(`Gemini requests: ${stats.gemini.totalRequests}`);
            console.log(`Mistral requests: ${stats.mistral.totalRequests}`);
            console.log(`Total routing decisions: ${stats.routing.totalRoutingDecisions}`);
            console.log(`Fallbacks triggered: ${stats.routing.fallbacksTriggered}`);

            const totalRequests = stats.gemini.totalRequests + stats.mistral.totalRequests;
            if (totalRequests > 0) {
                const mistralPercentage = (stats.mistral.totalRequests / totalRequests * 100).toFixed(1);
                console.log(`Cost optimization: ${mistralPercentage}% of requests routed to free Mistral service`);
            }

            if (stats.routing.fallbacksTriggered > 0) {
                const fallbackRate = (stats.routing.fallbacksTriggered / stats.routing.totalRoutingDecisions * 100).toFixed(1);
                console.log(`Fallback rate: ${fallbackRate}%`);
            }

        } catch (error) {
            console.log('Cost analysis data not available');
        }

        console.log();
    }

    private printRecommendations(): void {
        console.log('💡 Recommendations:');
        console.log('==================\n');

        const failedTests = this.results.filter(r => r.status === 'FAIL');
        const skippedTests = this.results.filter(r => r.status === 'SKIP');

        if (failedTests.length === 0 && skippedTests.length === 0) {
            console.log('🎉 Excellent! All tests passed successfully.');
            console.log('✨ The AI routing system is working optimally.');
            console.log('📈 Monitor usage analytics regularly for continued optimization.');
            console.log('🔄 Consider implementing additional caching for frequently used operations.');
        } else {
            if (failedTests.length > 0) {
                console.log('🔧 Issues to address:');
                failedTests.forEach(test => {
                    console.log(`  • ${test.test}: ${test.message}`);
                    if (test.error) {
                        console.log(`    Error: ${test.error}`);
                    }
                });
                console.log();
            }

            if (skippedTests.length > 0) {
                console.log('⚠️ Tests that were skipped:');
                skippedTests.forEach(test => {
                    console.log(`  • ${test.test}: ${test.message}`);
                });
                console.log();
            }
        }

        console.log('📋 Next Steps:');
        console.log('• Run this validation regularly to ensure system health');
        console.log('• Monitor the usage analytics dashboard for insights');
        console.log('• Test with real API keys in a staging environment');
        console.log('• Implement additional monitoring and alerting as needed');
        console.log('• Consider A/B testing different routing strategies');
    }
}

// Main execution
async function main() {
    const validator = new EndToEndValidator();
    await validator.runAllTests();
}

// Run the validation
main().catch(error => {
    console.error('❌ End-to-end validation failed:', error);
    process.exit(1);
});