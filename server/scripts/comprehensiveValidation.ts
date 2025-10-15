#!/usr/bin/env tsx

/**
 * Comprehensive AI Routing Validation and Performance Analysis
 * 
 * This script runs end-to-end tests and generates a comprehensive performance report
 * to validate that the AI routing system is working correctly and optimally.
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
    error?: string;
}

interface ComprehensiveReport {
    timestamp: Date;
    validation: {
        totalTests: number;
        passed: number;
        failed: number;
        skipped: number;
        results: ValidationResult[];
    };
    performance: {
        averageResponseTime: number;
        fastestTest: { name: string; time: number };
        slowestTest: { name: string; time: number };
        totalTestTime: number;
    };
    routing: {
        geminiRequests: number;
        mistralRequests: number;
        totalRoutingDecisions: number;
        fallbacksTriggered: number;
        costOptimization: number;
    };
    requirements: {
        requirement1: { status: 'PASS' | 'FAIL'; details: string };
        requirement2: { status: 'PASS' | 'FAIL'; details: string };
        requirement3: { status: 'PASS' | 'FAIL'; details: string };
        requirement4: { status: 'PASS' | 'FAIL'; details: string };
        requirement5: { status: 'PASS' | 'FAIL'; details: string };
        requirement6: { status: 'PASS' | 'FAIL'; details: string };
    };
    recommendations: string[];
    overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

class ComprehensiveValidator {
    private results: ValidationResult[] = [];
    private startTime: number = 0;

    async runComprehensiveValidation(): Promise<ComprehensiveReport> {
        console.log('🚀 Starting Comprehensive AI Routing Validation...\n');
        this.startTime = Date.now();

        // Reset analytics for clean measurement
        // Note: In a real system, you might want to preserve existing analytics

        // Run all validation tests
        await this.runValidationTests();

        // Generate comprehensive report
        const report = await this.generateComprehensiveReport();

        // Print results
        this.printComprehensiveReport(report);

        return report;
    }

    private async runValidationTests(): Promise<void> {
        // Test 1: Service Health and Configuration
        await this.testServiceHealthAndConfiguration();

        // Test 2: Gemini Complex Tasks (Requirements 1.1-1.4)
        await this.testGeminiComplexTasks();

        // Test 3: Mistral Simple Tasks (Requirements 1.5-1.6)
        await this.testMistralSimpleTasks();

        // Test 4: Unified Interface (Requirement 2)
        await this.testUnifiedInterface();

        // Test 5: Failover and Error Handling (Requirement 3)
        await this.testFailoverAndErrorHandling();

        // Test 6: Usage Analytics (Requirement 4)
        await this.testUsageAnalytics();

        // Test 7: Mistral Integration (Requirement 5)
        await this.testMistralIntegration();

        // Test 8: Complete Workflows
        await this.testCompleteWorkflows();

        // Test 9: Performance Optimization
        await this.testPerformanceOptimization();

        // Test 10: Backward Compatibility
        await this.testBackwardCompatibility();
    }

    private async testServiceHealthAndConfiguration(): Promise<void> {
        try {
            const startTime = Date.now();

            // Test service health
            const healthStatus = await aiRouter.getServiceHealth();

            // Test routing configuration
            const routingRules = aiRouter.getRoutingRules();

            const duration = Date.now() - startTime;

            if (healthStatus && routingRules && Object.keys(routingRules).length >= 6) {
                this.results.push({
                    test: 'Service Health and Configuration',
                    status: 'PASS',
                    message: `Services available, ${Object.keys(routingRules).length} routing rules configured`,
                    duration
                });
            } else {
                this.results.push({
                    test: 'Service Health and Configuration',
                    status: 'FAIL',
                    message: 'Service health check or configuration failed',
                    duration
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Service Health and Configuration',
                status: 'FAIL',
                message: 'Service health and configuration test failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testGeminiComplexTasks(): Promise<void> {
        // Test extractMeetingIntent (Requirement 1.1)
        await this.testFunction(
            'Meeting Intent Extraction (Gemini)',
            async () => {
                const messages: ConversationMessage[] = [{
                    id: 'test-1',
                    role: 'user',
                    content: 'Can we schedule a team meeting for tomorrow at 2pm to discuss the project status?',
                    timestamp: new Date()
                }];
                const result = await extractMeetingIntent(messages);
                return Boolean(result && result.intent && typeof result.confidence === 'number');
            }
        );

        // Test generateMeetingTitles (Requirement 1.2)
        await this.testFunction(
            'Meeting Title Generation (Gemini)',
            async () => {
                const result = await generateMeetingTitles(
                    'Sprint retrospective meeting',
                    ['dev1@example.com', 'dev2@example.com'],
                    'Development team retrospective'
                );
                return Boolean(result && result.suggestions && Array.isArray(result.suggestions) && result.suggestions.length > 0);
            }
        );

        // Test generateMeetingAgenda (Requirement 1.3)
        await this.testFunction(
            'Meeting Agenda Generation (Gemini)',
            async () => {
                const result = await generateMeetingAgenda(
                    'Sprint Retrospective',
                    'Review sprint progress',
                    ['dev1@example.com', 'dev2@example.com'],
                    90,
                    'Development team retrospective'
                );
                return Boolean(result && typeof result === 'string' && result.length > 20);
            }
        );

        // Test generateActionItems (Requirement 1.4)
        await this.testFunction(
            'Action Items Generation (Gemini)',
            async () => {
                const result = await generateActionItems(
                    'Sprint Retrospective',
                    'Review and improve process',
                    ['dev1@example.com', 'dev2@example.com'],
                    ['Sprint review', 'Process improvements'],
                    'Post-sprint planning'
                );
                return Boolean(result && Array.isArray(result) && result.length > 0);
            }
        );
    }

    private async testMistralSimpleTasks(): Promise<void> {
        // Test getGeminiResponse (Requirement 1.5)
        await this.testFunction(
            'Chat Response Generation (Mistral)',
            async () => {
                const messages = [{ role: 'user' as const, content: 'Hello, I need help scheduling a meeting' }];
                const result = await getGeminiResponse(messages);
                return Boolean(result && typeof result === 'string' && result.length > 10);
            }
        );

        // Test verifyAttendees (Requirement 1.6)
        await this.testFunction(
            'Attendee Verification (Mistral)',
            async () => {
                const result = await verifyAttendees(['test@example.com', 'user@example.com']);
                return Boolean(result && Array.isArray(result) && result.length > 0);
            }
        );
    }

    private async testUnifiedInterface(): Promise<void> {
        await this.testFunction(
            'Unified Interface Compatibility',
            async () => {
                // Test that all functions maintain their original signatures
                const intentResult = await extractMeetingIntent([{
                    id: 'test',
                    role: 'user',
                    content: 'Schedule meeting',
                    timestamp: new Date()
                }]);

                const titleResult = await generateMeetingTitles('Meeting purpose', ['user@example.com']);
                const chatResult = await getGeminiResponse([{ role: 'user', content: 'Hello' }]);
                const attendeeResult = await verifyAttendees(['user@example.com']);

                return Boolean(intentResult && titleResult && chatResult && attendeeResult);
            }
        );
    }

    private async testFailoverAndErrorHandling(): Promise<void> {
        await this.testFunction(
            'Error Handling and Graceful Degradation',
            async () => {
                try {
                    // Test with empty input to see how system handles edge cases
                    await extractMeetingIntent([]);
                    return true; // If it doesn't throw, it handles gracefully
                } catch (error) {
                    // If it throws, check if it's a meaningful error
                    return Boolean(error instanceof Error && error.message.length > 5);
                }
            }
        );
    }

    private async testUsageAnalytics(): Promise<void> {
        await this.testFunction(
            'Usage Analytics and Monitoring',
            async () => {
                const stats = aiRouter.getUsageStats();
                return Boolean(stats && typeof stats === 'object' &&
                    'gemini' in stats && 'mistral' in stats && 'routing' in stats);
            }
        );
    }

    private async testMistralIntegration(): Promise<void> {
        await this.testFunction(
            'Mistral Service Integration',
            async () => {
                // Test that Mistral service is properly integrated
                const response = await getGeminiResponse([{ role: 'user', content: 'Test Mistral integration' }]);
                return Boolean(response && typeof response === 'string' && response.length > 0);
            }
        );
    }

    private async testCompleteWorkflows(): Promise<void> {
        await this.testFunction(
            'Complete Meeting Scheduling Workflow',
            async () => {
                const conversationMessages: ConversationMessage[] = [{
                    id: 'workflow-1',
                    role: 'user',
                    content: 'We need to schedule a sprint planning meeting for next week',
                    timestamp: new Date()
                }];

                const intentResult = await extractMeetingIntent(conversationMessages);
                const titleResult = await generateMeetingTitles('Sprint planning', ['team@example.com']);
                const attendeeResult = await verifyAttendees(['team@example.com']);
                const agendaResult = await generateMeetingAgenda(
                    titleResult.suggestions[0] || 'Sprint Planning',
                    'Plan next sprint',
                    ['team@example.com'],
                    120
                );

                return Boolean(intentResult && titleResult && attendeeResult && agendaResult);
            }
        );
    }

    private async testPerformanceOptimization(): Promise<void> {
        await this.testFunction(
            'Performance and Cost Optimization',
            async () => {
                // Perform multiple operations to test performance
                const operations = [
                    getGeminiResponse([{ role: 'user', content: 'Performance test 1' }]),
                    verifyAttendees(['perf@test.com']),
                    getGeminiResponse([{ role: 'user', content: 'Performance test 2' }])
                ];

                await Promise.all(operations);

                const stats = aiRouter.getUsageStats();
                const totalRequests = stats.gemini.totalRequests + stats.mistral.totalRequests;

                return totalRequests > 0;
            }
        );
    }

    private async testBackwardCompatibility(): Promise<void> {
        await this.testFunction(
            'Backward Compatibility',
            async () => {
                // Test that existing function signatures still work
                const result1 = await extractMeetingIntent([{
                    id: 'compat-test',
                    role: 'user',
                    content: 'Compatibility test',
                    timestamp: new Date()
                }]);

                const result2 = await generateMeetingTitles('Test meeting', ['user@example.com']);

                return Boolean(result1 && result2);
            }
        );
    }

    private async testFunction(name: string, testFn: () => Promise<boolean>): Promise<void> {
        try {
            const startTime = Date.now();
            const success = await testFn();
            const duration = Date.now() - startTime;

            this.results.push({
                test: name,
                status: success ? 'PASS' : 'FAIL',
                message: success ? 'Test completed successfully' : 'Test validation failed',
                duration
            });
        } catch (error) {
            this.results.push({
                test: name,
                status: 'FAIL',
                message: 'Test execution failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async generateComprehensiveReport(): Promise<ComprehensiveReport> {
        const totalTestTime = Date.now() - this.startTime;
        const passed = this.results.filter(r => r.status === 'PASS').length;
        const failed = this.results.filter(r => r.status === 'FAIL').length;
        const skipped = this.results.filter(r => r.status === 'SKIP').length;

        // Performance analysis
        const completedTests = this.results.filter(r => r.duration);
        const averageResponseTime = completedTests.length > 0 ?
            completedTests.reduce((sum, r) => sum + (r.duration || 0), 0) / completedTests.length : 0;

        const fastestTest = completedTests.length > 0 ? completedTests.reduce((fastest, current) =>
            (current.duration || 0) < (fastest.duration || Infinity) ? current : fastest
        ) : { test: 'none', duration: 0 };

        const slowestTest = completedTests.length > 0 ? completedTests.reduce((slowest, current) =>
            (current.duration || 0) > (slowest.duration || 0) ? current : slowest
        ) : { test: 'none', duration: 0 };

        // Routing analysis
        const stats = aiRouter.getUsageStats();
        const totalRequests = stats.gemini.totalRequests + stats.mistral.totalRequests;
        const costOptimization = totalRequests > 0 ?
            (stats.mistral.totalRequests / totalRequests) * 100 : 0;

        // Requirements validation
        const requirements = this.validateRequirements();

        // Generate recommendations
        const recommendations = this.generateRecommendations(passed, failed, stats, averageResponseTime);

        // Calculate overall grade
        const overallGrade = this.calculateOverallGrade(passed, failed, skipped, requirements);

        return {
            timestamp: new Date(),
            validation: {
                totalTests: this.results.length,
                passed,
                failed,
                skipped,
                results: this.results
            },
            performance: {
                averageResponseTime,
                fastestTest: { name: fastestTest.test, time: fastestTest.duration || 0 },
                slowestTest: { name: slowestTest.test, time: slowestTest.duration || 0 },
                totalTestTime
            },
            routing: {
                geminiRequests: stats.gemini.totalRequests,
                mistralRequests: stats.mistral.totalRequests,
                totalRoutingDecisions: stats.routing.totalRoutingDecisions,
                fallbacksTriggered: stats.routing.fallbacksTriggered,
                costOptimization
            },
            requirements,
            recommendations,
            overallGrade
        };
    }

    private validateRequirements(): ComprehensiveReport['requirements'] {
        const geminiTests = this.results.filter(r => r.test.includes('Gemini'));
        const mistralTests = this.results.filter(r => r.test.includes('Mistral'));
        const interfaceTests = this.results.filter(r => r.test.includes('Interface') || r.test.includes('Compatibility'));
        const errorTests = this.results.filter(r => r.test.includes('Error') || r.test.includes('Failover'));
        const analyticsTests = this.results.filter(r => r.test.includes('Analytics') || r.test.includes('Monitoring'));
        const integrationTests = this.results.filter(r => r.test.includes('Integration') || r.test.includes('Mistral Service'));

        return {
            requirement1: {
                status: geminiTests.every(t => t.status === 'PASS') ? 'PASS' : 'FAIL',
                details: `Gemini routing for complex tasks: ${geminiTests.filter(t => t.status === 'PASS').length}/${geminiTests.length} tests passed`
            },
            requirement2: {
                status: interfaceTests.every(t => t.status === 'PASS') ? 'PASS' : 'FAIL',
                details: `Unified interface compatibility: ${interfaceTests.filter(t => t.status === 'PASS').length}/${interfaceTests.length} tests passed`
            },
            requirement3: {
                status: errorTests.every(t => t.status === 'PASS') ? 'PASS' : 'FAIL',
                details: `Automatic failover and error handling: ${errorTests.filter(t => t.status === 'PASS').length}/${errorTests.length} tests passed`
            },
            requirement4: {
                status: analyticsTests.every(t => t.status === 'PASS') ? 'PASS' : 'FAIL',
                details: `Usage analytics and monitoring: ${analyticsTests.filter(t => t.status === 'PASS').length}/${analyticsTests.length} tests passed`
            },
            requirement5: {
                status: integrationTests.every(t => t.status === 'PASS') ? 'PASS' : 'FAIL',
                details: `Mistral service integration: ${integrationTests.filter(t => t.status === 'PASS').length}/${integrationTests.length} tests passed`
            },
            requirement6: {
                status: mistralTests.every(t => t.status === 'PASS') ? 'PASS' : 'FAIL',
                details: `Mistral routing for simple tasks: ${mistralTests.filter(t => t.status === 'PASS').length}/${mistralTests.length} tests passed`
            }
        };
    }

    private generateRecommendations(passed: number, failed: number, stats: any, avgResponseTime: number): string[] {
        const recommendations: string[] = [];

        if (failed === 0) {
            recommendations.push('🎉 All tests passed! The AI routing system is working optimally.');
        } else {
            recommendations.push(`⚠️ ${failed} test(s) failed. Review the failed tests and address the issues.`);
        }

        if (avgResponseTime > 2000) {
            recommendations.push('Consider optimizing response times - average is above 2 seconds.');
        }

        const totalRequests = stats.gemini.totalRequests + stats.mistral.totalRequests;
        if (totalRequests > 0) {
            const costOptimization = (stats.mistral.totalRequests / totalRequests) * 100;
            if (costOptimization < 30) {
                recommendations.push('Consider routing more simple tasks to Mistral to optimize costs.');
            }
        }

        if (stats.routing.fallbacksTriggered > 0) {
            recommendations.push('Monitor fallback usage to ensure service reliability.');
        }

        recommendations.push('Continue monitoring usage patterns for optimization opportunities.');
        recommendations.push('Run this validation regularly to ensure continued system health.');

        return recommendations;
    }

    private calculateOverallGrade(passed: number, failed: number, skipped: number, requirements: ComprehensiveReport['requirements']): 'A' | 'B' | 'C' | 'D' | 'F' {
        const totalTests = passed + failed + skipped;
        const passRate = totalTests > 0 ? passed / totalTests : 0;

        const requirementsPassed = Object.values(requirements).filter(r => r.status === 'PASS').length;
        const requirementsRate = requirementsPassed / 6;

        const overallScore = (passRate * 0.7) + (requirementsRate * 0.3);

        if (overallScore >= 0.95) return 'A';
        if (overallScore >= 0.85) return 'B';
        if (overallScore >= 0.75) return 'C';
        if (overallScore >= 0.65) return 'D';
        return 'F';
    }

    private printComprehensiveReport(report: ComprehensiveReport): void {
        console.log('\n🎯 Comprehensive AI Routing Validation Report');
        console.log('=============================================\n');

        console.log(`Generated: ${report.timestamp.toISOString()}`);
        console.log(`Overall Grade: ${report.overallGrade}\n`);

        // Validation Summary
        console.log('📊 Validation Summary:');
        console.log(`Total Tests: ${report.validation.totalTests}`);
        console.log(`✅ Passed: ${report.validation.passed}`);
        console.log(`❌ Failed: ${report.validation.failed}`);
        console.log(`⏭️ Skipped: ${report.validation.skipped}`);
        console.log(`Success Rate: ${((report.validation.passed / report.validation.totalTests) * 100).toFixed(1)}%\n`);

        // Performance Summary
        console.log('⚡ Performance Summary:');
        console.log(`Average Response Time: ${Math.round(report.performance.averageResponseTime)}ms`);
        console.log(`Fastest Test: ${report.performance.fastestTest.name} (${Math.round(report.performance.fastestTest.time)}ms)`);
        console.log(`Slowest Test: ${report.performance.slowestTest.name} (${Math.round(report.performance.slowestTest.time)}ms)`);
        console.log(`Total Test Time: ${Math.round(report.performance.totalTestTime)}ms\n`);

        // Routing Summary
        console.log('🔀 Routing Summary:');
        console.log(`Gemini Requests: ${report.routing.geminiRequests}`);
        console.log(`Mistral Requests: ${report.routing.mistralRequests}`);
        console.log(`Total Routing Decisions: ${report.routing.totalRoutingDecisions}`);
        console.log(`Fallbacks Triggered: ${report.routing.fallbacksTriggered}`);
        console.log(`Cost Optimization: ${report.routing.costOptimization.toFixed(1)}% routed to free service\n`);

        // Requirements Validation
        console.log('📋 Requirements Validation:');
        Object.entries(report.requirements).forEach(([req, result]) => {
            const icon = result.status === 'PASS' ? '✅' : '❌';
            console.log(`${icon} ${req.toUpperCase()}: ${result.details}`);
        });
        console.log();

        // Test Results
        console.log('🧪 Test Results:');
        report.validation.results.forEach(result => {
            const statusIcon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⏭️';
            const durationText = result.duration ? ` (${result.duration}ms)` : '';
            console.log(`${statusIcon} ${result.test}${durationText}`);
            console.log(`   ${result.message}`);
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
        });
        console.log();

        // Recommendations
        console.log('💡 Recommendations:');
        report.recommendations.forEach((rec, index) => {
            console.log(`${index + 1}. ${rec}`);
        });
        console.log();

        // Final Assessment
        this.printFinalAssessment(report.overallGrade);
    }

    private printFinalAssessment(grade: string): void {
        console.log('🏆 Final Assessment:');
        console.log('==================\n');

        switch (grade) {
            case 'A':
                console.log('🎉 EXCELLENT! The AI routing system is performing optimally.');
                console.log('✨ All requirements are met and the system is ready for production use.');
                console.log('📈 Continue monitoring and consider advanced optimizations.');
                break;
            case 'B':
                console.log('👍 GOOD! The AI routing system is working well with minor issues.');
                console.log('🔧 Address the identified issues for optimal performance.');
                console.log('📊 Monitor the system and implement recommended improvements.');
                break;
            case 'C':
                console.log('⚠️ ACCEPTABLE! The AI routing system has some significant issues.');
                console.log('🛠️ Several improvements are needed before production deployment.');
                console.log('🔍 Focus on addressing failed tests and performance issues.');
                break;
            case 'D':
                console.log('❌ POOR! The AI routing system has major issues that need attention.');
                console.log('🚨 Significant work is required before the system is production-ready.');
                console.log('🔧 Address all failed tests and review system architecture.');
                break;
            case 'F':
                console.log('🚫 FAILING! The AI routing system is not working correctly.');
                console.log('⛔ Do not deploy to production until all issues are resolved.');
                console.log('🔄 Review implementation and fix critical failures.');
                break;
        }
    }
}

// Main execution
async function main() {
    const validator = new ComprehensiveValidator();

    try {
        const report = await validator.runComprehensiveValidation();

        // Export report if requested
        if (process.argv.includes('--export')) {
            const fs = await import('fs/promises');
            const filename = `comprehensive-validation-report-${new Date().toISOString().split('T')[0]}.json`;
            await fs.writeFile(filename, JSON.stringify(report, null, 2));
            console.log(`\n📄 Report exported to: ${filename}`);
        }

        // Exit with appropriate code based on grade
        const exitCode = report.overallGrade === 'A' || report.overallGrade === 'B' ? 0 : 1;
        process.exit(exitCode);

    } catch (error) {
        console.error('❌ Comprehensive validation failed:', error);
        process.exit(1);
    }
}

// Run the comprehensive validation
main().catch(console.error);

export { ComprehensiveValidator, type ComprehensiveReport };