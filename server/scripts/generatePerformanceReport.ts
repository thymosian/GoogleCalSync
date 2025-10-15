#!/usr/bin/env tsx

/**
 * Performance and Cost Analysis Report Generator
 * 
 * This script generates a comprehensive report on the AI routing system's
 * performance, cost optimization, and usage patterns.
 */

import { aiRouter } from '../aiRouterService.js';
import { usageAnalytics } from '../usageAnalyticsService.js';
import { performanceMonitor } from '../performanceMonitor.js';

interface PerformanceReport {
    timestamp: Date;
    summary: {
        totalRequests: number;
        totalCost: number;
        averageResponseTime: number;
        successRate: number;
        costOptimization: number;
    };
    routing: {
        geminiRequests: number;
        mistralRequests: number;
        fallbacksTriggered: number;
        routingDecisions: number;
    };
    performance: {
        fastestFunction: { name: string; time: number };
        slowestFunction: { name: string; time: number };
        averageByFunction: Record<string, number>;
    };
    costAnalysis: {
        geminiCost: number;
        mistralCost: number;
        totalSavings: number;
        projectedMonthlyCost: number;
    };
    recommendations: string[];
}

class PerformanceReportGenerator {
    
    async generateReport(): Promise<PerformanceReport> {
        console.log('📊 Generating AI Routing Performance Report...\n');

        // Get usage statistics
        const usageStats = aiRouter.getUsageStats();
        const routingStats = aiRouter.getRoutingStatistics(24);
        const costAnalysis = aiRouter.getCostAnalysis(24);
        const analytics = aiRouter.getUsageAnalytics(24);

        // Calculate summary metrics
        const totalRequests = usageStats.gemini.totalRequests + usageStats.mistral.totalRequests;
        const totalCost = costAnalysis.gemini.totalCost + costAnalysis.mistral.totalCost;
        const averageResponseTime = (
            (usageStats.gemini.averageResponseTime * usageStats.gemini.totalRequests) +
            (usageStats.mistral.averageResponseTime * usageStats.mistral.totalRequests)
        ) / totalRequests || 0;
        
        const successRate = totalRequests > 0 ? 
            ((usageStats.gemini.successRate * usageStats.gemini.totalRequests) +
             (usageStats.mistral.successRate * usageStats.mistral.totalRequests)) / totalRequests : 0;

        const costOptimization = totalRequests > 0 ? 
            (usageStats.mistral.totalRequests / totalRequests) * 100 : 0;

        // Analyze function performance
        const functionPerformance = this.analyzeFunctionPerformance(usageStats);

        // Generate recommendations
        const recommendations = this.generateRecommendations(usageStats, routingStats, costAnalysis);

        const report: PerformanceReport = {
            timestamp: new Date(),
            summary: {
                totalRequests,
                totalCost,
                averageResponseTime,
                successRate,
                costOptimization
            },
            routing: {
                geminiRequests: usageStats.gemini.totalRequests,
                mistralRequests: usageStats.mistral.totalRequests,
                fallbacksTriggered: usageStats.routing.fallbacksTriggered,
                routingDecisions: usageStats.routing.totalRoutingDecisions
            },
            performance: functionPerformance,
            costAnalysis: {
                geminiCost: costAnalysis.gemini.totalCost,
                mistralCost: costAnalysis.mistral.totalCost,
                totalSavings: costAnalysis.savings.totalSavings,
                projectedMonthlyCost: costAnalysis.gemini.projectedMonthlyCost
            },
            recommendations
        };

        return report;
    }

    private analyzeFunctionPerformance(usageStats: any): {
        fastestFunction: { name: string; time: number };
        slowestFunction: { name: string; time: number };
        averageByFunction: Record<string, number>;
    } {
        const allFunctions = {
            ...usageStats.gemini.functionBreakdown,
            ...usageStats.mistral.functionBreakdown
        };

        let fastestFunction = { name: 'none', time: Infinity };
        let slowestFunction = { name: 'none', time: 0 };
        const averageByFunction: Record<string, number> = {};

        Object.entries(allFunctions).forEach(([name, stats]: [string, any]) => {
            const avgTime = stats.averageResponseTime || 0;
            averageByFunction[name] = avgTime;

            if (avgTime < fastestFunction.time && avgTime > 0) {
                fastestFunction = { name, time: avgTime };
            }
            if (avgTime > slowestFunction.time) {
                slowestFunction = { name, time: avgTime };
            }
        });

        return {
            fastestFunction,
            slowestFunction,
            averageByFunction
        };
    }

    private generateRecommendations(usageStats: any, routingStats: any, costAnalysis: any): string[] {
        const recommendations: string[] = [];

        // Performance recommendations
        if (usageStats.gemini.averageResponseTime > 3000) {
            recommendations.push('Consider optimizing Gemini prompts to reduce response time');
        }

        if (usageStats.mistral.averageResponseTime > 2000) {
            recommendations.push('Monitor Mistral performance - response times are higher than expected');
        }

        // Cost optimization recommendations
        const costOptimization = usageStats.mistral.totalRequests / 
            (usageStats.gemini.totalRequests + usageStats.mistral.totalRequests) * 100;

        if (costOptimization < 30) {
            recommendations.push('Consider routing more simple tasks to Mistral to reduce costs');
        }

        if (costOptimization > 70) {
            recommendations.push('Ensure complex tasks are still routed to Gemini for quality');
        }

        // Reliability recommendations
        if (usageStats.routing.fallbacksTriggered > usageStats.routing.totalRoutingDecisions * 0.1) {
            recommendations.push('High fallback rate detected - investigate service reliability');
        }

        if (usageStats.gemini.successRate < 0.95) {
            recommendations.push('Gemini success rate is below 95% - check API configuration');
        }

        if (usageStats.mistral.successRate < 0.95) {
            recommendations.push('Mistral success rate is below 95% - check API configuration');
        }

        // Usage pattern recommendations
        if (costAnalysis.gemini.projectedMonthlyCost > 100) {
            recommendations.push('Monthly Gemini costs projected to exceed $100 - consider usage optimization');
        }

        if (usageStats.routing.totalRoutingDecisions < 10) {
            recommendations.push('Low usage detected - consider running more comprehensive tests');
        }

        // Default recommendations if everything looks good
        if (recommendations.length === 0) {
            recommendations.push('System is performing optimally - continue monitoring');
            recommendations.push('Consider implementing caching for frequently used operations');
            recommendations.push('Monitor usage patterns for further optimization opportunities');
        }

        return recommendations;
    }

    async printReport(report: PerformanceReport): Promise<void> {
        console.log('📈 AI Routing Performance Report');
        console.log('================================\n');

        console.log(`Generated: ${report.timestamp.toISOString()}\n`);

        // Summary
        console.log('📊 Summary:');
        console.log(`Total Requests: ${report.summary.totalRequests}`);
        console.log(`Total Cost: $${report.summary.totalCost.toFixed(4)}`);
        console.log(`Average Response Time: ${Math.round(report.summary.averageResponseTime)}ms`);
        console.log(`Success Rate: ${(report.summary.successRate * 100).toFixed(1)}%`);
        console.log(`Cost Optimization: ${report.summary.costOptimization.toFixed(1)}% routed to free service\n`);

        // Routing Statistics
        console.log('🔀 Routing Statistics:');
        console.log(`Gemini Requests: ${report.routing.geminiRequests}`);
        console.log(`Mistral Requests: ${report.routing.mistralRequests}`);
        console.log(`Fallbacks Triggered: ${report.routing.fallbacksTriggered}`);
        console.log(`Total Routing Decisions: ${report.routing.routingDecisions}\n`);

        // Performance Analysis
        console.log('⚡ Performance Analysis:');
        console.log(`Fastest Function: ${report.performance.fastestFunction.name} (${Math.round(report.performance.fastestFunction.time)}ms)`);
        console.log(`Slowest Function: ${report.performance.slowestFunction.name} (${Math.round(report.performance.slowestFunction.time)}ms)`);
        
        console.log('\nFunction Performance Breakdown:');
        Object.entries(report.performance.averageByFunction).forEach(([name, time]) => {
            console.log(`  ${name}: ${Math.round(time)}ms`);
        });
        console.log();

        // Cost Analysis
        console.log('💰 Cost Analysis:');
        console.log(`Gemini Cost: $${report.costAnalysis.geminiCost.toFixed(4)}`);
        console.log(`Mistral Cost: $${report.costAnalysis.mistralCost.toFixed(4)} (free)`);
        console.log(`Total Savings: $${report.costAnalysis.totalSavings.toFixed(4)}`);
        console.log(`Projected Monthly Cost: $${report.costAnalysis.projectedMonthlyCost.toFixed(2)}\n`);

        // Recommendations
        console.log('💡 Recommendations:');
        report.recommendations.forEach((rec, index) => {
            console.log(`${index + 1}. ${rec}`);
        });
        console.log();

        // Performance Grades
        this.printPerformanceGrades(report);
    }

    private printPerformanceGrades(report: PerformanceReport): void {
        console.log('🎯 Performance Grades:');
        
        // Response Time Grade
        const avgResponseTime = report.summary.averageResponseTime;
        let responseTimeGrade = 'A';
        if (avgResponseTime > 3000) responseTimeGrade = 'C';
        else if (avgResponseTime > 2000) responseTimeGrade = 'B';
        
        console.log(`Response Time: ${responseTimeGrade} (${Math.round(avgResponseTime)}ms)`);

        // Success Rate Grade
        const successRate = report.summary.successRate;
        let successRateGrade = 'A';
        if (successRate < 0.90) successRateGrade = 'C';
        else if (successRate < 0.95) successRateGrade = 'B';
        
        console.log(`Success Rate: ${successRateGrade} (${(successRate * 100).toFixed(1)}%)`);

        // Cost Optimization Grade
        const costOptimization = report.summary.costOptimization;
        let costGrade = 'A';
        if (costOptimization < 20) costGrade = 'C';
        else if (costOptimization < 35) costGrade = 'B';
        
        console.log(`Cost Optimization: ${costGrade} (${costOptimization.toFixed(1)}% free routing)`);

        // Reliability Grade
        const fallbackRate = report.routing.fallbacksTriggered / report.routing.routingDecisions;
        let reliabilityGrade = 'A';
        if (fallbackRate > 0.15) reliabilityGrade = 'C';
        else if (fallbackRate > 0.05) reliabilityGrade = 'B';
        
        console.log(`Reliability: ${reliabilityGrade} (${(fallbackRate * 100).toFixed(1)}% fallback rate)`);

        // Overall Grade
        const grades = [responseTimeGrade, successRateGrade, costGrade, reliabilityGrade];
        const gradeValues = grades.map(g => g === 'A' ? 3 : g === 'B' ? 2 : 1);
        const avgGrade = gradeValues.reduce((a, b) => a + b, 0) / gradeValues.length;
        
        let overallGrade = 'A';
        if (avgGrade < 2) overallGrade = 'C';
        else if (avgGrade < 2.5) overallGrade = 'B';
        
        console.log(`\n🏆 Overall Grade: ${overallGrade}`);
        
        if (overallGrade === 'A') {
            console.log('🎉 Excellent performance! The AI routing system is working optimally.');
        } else if (overallGrade === 'B') {
            console.log('👍 Good performance with room for improvement.');
        } else {
            console.log('⚠️ Performance needs attention. Review recommendations above.');
        }
    }

    async exportReport(report: PerformanceReport, filename?: string): Promise<string> {
        const exportFilename = filename || `ai-routing-report-${new Date().toISOString().split('T')[0]}.json`;
        
        try {
            const fs = await import('fs/promises');
            await fs.writeFile(exportFilename, JSON.stringify(report, null, 2));
            console.log(`\n📄 Report exported to: ${exportFilename}`);
            return exportFilename;
        } catch (error) {
            console.error('Failed to export report:', error);
            throw error;
        }
    }
}

// Main execution
async function main() {
    const generator = new PerformanceReportGenerator();
    
    try {
        const report = await generator.generateReport();
        await generator.printReport(report);
        
        // Optionally export the report
        if (process.argv.includes('--export')) {
            await generator.exportReport(report);
        }
        
    } catch (error) {
        console.error('❌ Failed to generate performance report:', error);
        process.exit(1);
    }
}

// Run the report generator
main().catch(console.error);

export { PerformanceReportGenerator, type PerformanceReport };