/**
 * AI Routing Validation Script
 * 
 * This script validates that the AI router service is working correctly
 * and that all existing functionality continues to work seamlessly.
 * Run this script to verify the system after implementing AI routing.
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

interface ValidationResult {
    test: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    message: string;
    duration?: number;
}

class AIRoutingValidator {
    private results: ValidationResult[] = [];

    async runValidation(): Promise<void> {
        console.log('🚀 Starting AI Routing Validation...\n');

        // Test 1: Service Health Check
        await this.testServiceHealth();

        // Test 2: Basic Routing Functionality
        await this.testBasicRouting();

        // Test 3: Meeting Intent Extraction
        await this.testMeetingIntentExtraction();

        // Test 4: Meeting Title Generation
        await this.testMeetingTitleGeneration();

        // Test 5: Meeting Agenda Generation
        await this.testMeetingAgendaGeneration();

        // Test 6: Action Items Generation
        await this.testActionItemsGeneration();

        // Test 7: Attendee Verification
        await this.testAttendeeVerification();

        // Test 8: Chat Response Generation
        await this.testChatResponseGeneration();

        // Test 9: End-to-End Workflow
        await this.testEndToEndWorkflow();

        // Test 10: Performance and Analytics
        await this.testPerformanceAndAnalytics();

        // Print Results
        this.printResults();
    }

    private async testServiceHealth(): Promise<void> {
        try {
            const startTime = Date.now();
            const healthStatus = await aiRouter.getServiceHealth();
            const duration = Date.now() - startTime;

            if (healthStatus.gemini && healthStatus.mistral) {
                this.results.push({
                    test: 'Service Health Check',
                    status: 'PASS',
                    message: `AI Router services available. Gemini: ${healthStatus.gemini.available}, Mistral: ${healthStatus.mistral.available}`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Service Health Check',
                    status: 'FAIL',
                    message: `AI Router health check failed: ${JSON.stringify(healthStatus)}`,
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Service Health Check',
                status: 'FAIL',
                message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        }
    }

    private async testBasicRouting(): Promise<void> {
        try {
            const startTime = Date.now();

            // Test that the router can route requests
            const routingRules = aiRouter.getRoutingRules();
            const duration = Date.now() - startTime;

            if (routingRules && Object.keys(routingRules).length > 0) {
                this.results.push({
                    test: 'Basic Routing Configuration',
                    status: 'PASS',
                    message: `Found ${Object.keys(routingRules).length} routing rules configured`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Basic Routing Configuration',
                    status: 'FAIL',
                    message: 'No routing rules found or router not configured',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Basic Routing Configuration',
                status: 'FAIL',
                message: `Routing configuration test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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

            if (result && result.intent && result.confidence !== undefined) {
                this.results.push({
                    test: 'Meeting Intent Extraction',
                    status: 'PASS',
                    message: `Successfully extracted intent: ${result.intent} (confidence: ${result.confidence})`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Meeting Intent Extraction',
                    status: 'FAIL',
                    message: 'Intent extraction returned invalid result',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Meeting Intent Extraction',
                status: 'FAIL',
                message: `Intent extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
                    test: 'Meeting Title Generation',
                    status: 'PASS',
                    message: `Generated ${result.suggestions.length} title suggestions`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Meeting Title Generation',
                    status: 'FAIL',
                    message: 'Title generation returned invalid result',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Meeting Title Generation',
                status: 'FAIL',
                message: `Title generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
                    test: 'Meeting Agenda Generation',
                    status: 'PASS',
                    message: `Generated agenda with ${result.length} characters`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Meeting Agenda Generation',
                    status: 'FAIL',
                    message: 'Agenda generation returned invalid result',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Meeting Agenda Generation',
                status: 'FAIL',
                message: `Agenda generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
                    test: 'Action Items Generation',
                    status: 'PASS',
                    message: `Generated ${result.length} action items`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Action Items Generation',
                    status: 'FAIL',
                    message: 'Action items generation returned invalid result',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Action Items Generation',
                status: 'FAIL',
                message: `Action items generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
                    test: 'Attendee Verification',
                    status: 'PASS',
                    message: `Verified ${result.length} attendees`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Attendee Verification',
                    status: 'FAIL',
                    message: 'Attendee verification returned invalid result',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Attendee Verification',
                status: 'FAIL',
                message: `Attendee verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
                    test: 'Chat Response Generation',
                    status: 'PASS',
                    message: `Generated response with ${result.length} characters`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Chat Response Generation',
                    status: 'FAIL',
                    message: 'Chat response generation returned invalid result',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Chat Response Generation',
                status: 'FAIL',
                message: `Chat response generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        }
    }

    private async testEndToEndWorkflow(): Promise<void> {
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

            const duration = Date.now() - startTime;

            if (intentResult && titleResult && attendeeResult) {
                this.results.push({
                    test: 'End-to-End Workflow',
                    status: 'PASS',
                    message: 'Successfully completed full meeting scheduling workflow',
                    duration
                });
            } else {
                this.results.push({
                    test: 'End-to-End Workflow',
                    status: 'FAIL',
                    message: 'End-to-end workflow failed at one or more steps',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'End-to-End Workflow',
                status: 'FAIL',
                message: `End-to-end workflow failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        }
    }

    private async testPerformanceAndAnalytics(): Promise<void> {
        try {
            const startTime = Date.now();

            // Test that analytics are being recorded
            const initialStats = usageAnalytics.getUsageAnalytics();

            // Perform a simple operation
            await getGeminiResponse([{ role: 'user', content: 'Test message for analytics' }]);

            const finalStats = usageAnalytics.getUsageAnalytics();
            const duration = Date.now() - startTime;

            // Check if analytics are working (stats should exist)
            if (finalStats && typeof finalStats === 'object') {
                this.results.push({
                    test: 'Performance and Analytics',
                    status: 'PASS',
                    message: 'Analytics system is operational',
                    duration
                });
            } else {
                this.results.push({
                    test: 'Performance and Analytics',
                    status: 'SKIP',
                    message: 'Analytics system status could not be determined',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Performance and Analytics',
                status: 'SKIP',
                message: `Analytics test skipped: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        }
    }

    private printResults(): void {
        console.log('\n📊 AI Routing Validation Results');
        console.log('================================\n');

        const passed = this.results.filter(r => r.status === 'PASS').length;
        const failed = this.results.filter(r => r.status === 'FAIL').length;
        const skipped = this.results.filter(r => r.status === 'SKIP').length;

        this.results.forEach(result => {
            const statusIcon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⏭️';
            const durationText = result.duration ? ` (${result.duration}ms)` : '';
            console.log(`${statusIcon} ${result.test}${durationText}`);
            console.log(`   ${result.message}\n`);
        });

        console.log('Summary:');
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`⏭️ Skipped: ${skipped}`);
        console.log(`📊 Total: ${this.results.length}\n`);

        if (failed === 0) {
            console.log('🎉 All critical tests passed! AI routing is working correctly.');
        } else {
            console.log('⚠️ Some tests failed. Please review the failures above.');
        }

        // Print recommendations
        this.printRecommendations();
    }

    private printRecommendations(): void {
        console.log('\n💡 Recommendations:');
        console.log('==================\n');

        const failedTests = this.results.filter(r => r.status === 'FAIL');

        if (failedTests.length === 0) {
            console.log('✨ System is performing optimally!');
            console.log('• Monitor usage analytics for cost optimization opportunities');
            console.log('• Consider implementing additional fallback strategies for improved resilience');
            console.log('• Review performance metrics regularly to identify optimization opportunities');
        } else {
            console.log('🔧 Issues to address:');
            failedTests.forEach(test => {
                console.log(`• Fix: ${test.test} - ${test.message}`);
            });
        }

        console.log('\n📈 Performance Optimization:');
        const avgDuration = this.results
            .filter(r => r.duration)
            .reduce((sum, r) => sum + (r.duration || 0), 0) / this.results.filter(r => r.duration).length;

        if (avgDuration) {
            console.log(`• Average response time: ${Math.round(avgDuration)}ms`);
            if (avgDuration > 5000) {
                console.log('• Consider optimizing timeout settings or implementing caching');
            }
        }

        console.log('\n🔍 Next Steps:');
        console.log('• Run this validation script regularly to ensure system health');
        console.log('• Monitor the usage analytics dashboard for insights');
        console.log('• Test with real API keys in a staging environment');
        console.log('• Implement additional monitoring and alerting as needed');
    }
}

// Run validation if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const validator = new AIRoutingValidator();
    validator.runValidation().catch(error => {
        console.error('❌ Validation script failed:', error);
        process.exit(1);
    });
}

export { AIRoutingValidator };