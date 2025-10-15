/**
 * Usage Analytics Service for AI Model Routing
 * Provides comprehensive tracking and analysis of AI model usage patterns
 */

import { performanceMonitor, AICallMetrics } from './performanceMonitor.js';

export interface ModelUsageMetrics {
    totalRequests: number;
    totalTokens: number;
    averageResponseTime: number;
    successRate: number;
    costEstimate: number;
    functionBreakdown: Record<string, FunctionUsageStats>;
    lastUsed: Date;
    peakUsageHour: number;
    errorBreakdown: Record<string, number>;
}

export interface FunctionUsageStats {
    requestCount: number;
    tokenUsage: number;
    averageResponseTime: number;
    successRate: number;
    lastUsed: Date;
    averageTokensPerRequest: number;
    peakResponseTime: number;
    errorCount: number;
    fallbackUsageCount: number;
}

export interface RoutingAnalytics {
    totalRoutingDecisions: number;
    fallbacksTriggered: number;
    routingFailures: number;
    routingDecisionTime: number;
    modelSwitchCount: number;
    circuitBreakerActivations: number;
    costOptimizationSavings: number;
}

export interface UsageAnalytics {
    gemini: ModelUsageMetrics;
    mistral: ModelUsageMetrics;
    routing: RoutingAnalytics;
    timeRange: {
        start: Date;
        end: Date;
        hours: number;
    };
    recommendations: UsageRecommendation[];
}

export interface UsageRecommendation {
    type: 'cost_optimization' | 'performance_improvement' | 'reliability_enhancement' | 'capacity_planning';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    impact: {
        costSavings?: number;
        performanceImprovement?: number;
        reliabilityImprovement?: number;
    };
    actionItems: string[];
}

export interface CostAnalysis {
    gemini: {
        totalCost: number;
        costPerToken: number;
        costPerRequest: number;
        projectedMonthlyCost: number;
    };
    mistral: {
        totalCost: number; // Should be 0 for free tier
        costPerToken: number;
        costPerRequest: number;
        projectedMonthlyCost: number;
    };
    savings: {
        totalSavings: number;
        savingsFromRouting: number;
        potentialAdditionalSavings: number;
    };
}

/**
 * Usage Analytics Service for comprehensive AI model usage tracking
 */
export class UsageAnalyticsService {
    private usageHistory: AICallMetrics[] = [];
    private routingDecisions: Array<{
        timestamp: Date;
        functionName: string;
        primaryModel: string;
        actualModel: string;
        fallbackUsed: boolean;
        decisionTime: number;
        success: boolean;
    }> = [];

    // Cost estimates (tokens per dollar - approximate)
    private readonly costEstimates = {
        gemini: {
            inputTokenCost: 0.00000125,  // $1.25 per 1M input tokens
            outputTokenCost: 0.00000375, // $3.75 per 1M output tokens
        },
        mistral: {
            inputTokenCost: 0,  // Free tier
            outputTokenCost: 0, // Free tier
        }
    };

    /**
     * Record a routing decision for analytics
     */
    recordRoutingDecision(
        functionName: string,
        primaryModel: string,
        actualModel: string,
        fallbackUsed: boolean,
        decisionTime: number,
        success: boolean
    ): void {
        this.routingDecisions.push({
            timestamp: new Date(),
            functionName,
            primaryModel,
            actualModel,
            fallbackUsed,
            decisionTime,
            success
        });

        // Keep only recent decisions to prevent memory bloat
        if (this.routingDecisions.length > 10000) {
            this.routingDecisions = this.routingDecisions.slice(-5000);
        }
    }

    /**
     * Get comprehensive usage analytics for a time period
     */
    getUsageAnalytics(timeRangeHours: number = 24): UsageAnalytics {
        const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
        
        // Get performance metrics from the performance monitor
        const performanceStats = performanceMonitor.getPerformanceStats(timeRangeHours);
        const allMetrics = this.getFilteredMetrics(cutoffTime);
        
        const geminiMetrics = allMetrics.filter(m => m.service === 'gemini');
        const mistralMetrics = allMetrics.filter(m => m.service === 'mistral');
        const recentRoutingDecisions = this.routingDecisions.filter(d => d.timestamp >= cutoffTime);

        return {
            gemini: this.calculateModelMetrics(geminiMetrics, 'gemini'),
            mistral: this.calculateModelMetrics(mistralMetrics, 'mistral'),
            routing: this.calculateRoutingAnalytics(recentRoutingDecisions),
            timeRange: {
                start: cutoffTime,
                end: new Date(),
                hours: timeRangeHours
            },
            recommendations: this.generateRecommendations(geminiMetrics, mistralMetrics, recentRoutingDecisions)
        };
    }

    /**
     * Calculate detailed metrics for a specific model
     */
    private calculateModelMetrics(metrics: AICallMetrics[], model: 'gemini' | 'mistral'): ModelUsageMetrics {
        if (metrics.length === 0) {
            return {
                totalRequests: 0,
                totalTokens: 0,
                averageResponseTime: 0,
                successRate: 0,
                costEstimate: 0,
                functionBreakdown: {},
                lastUsed: new Date(0),
                peakUsageHour: 0,
                errorBreakdown: {}
            };
        }

        const totalRequests = metrics.length;
        const successfulRequests = metrics.filter(m => m.success).length;
        const totalTokens = metrics.reduce((sum, m) => sum + m.tokenCount.total, 0);
        const totalResponseTime = metrics.reduce((sum, m) => sum + m.responseTime, 0);
        const lastUsed = new Date(Math.max(...metrics.map(m => m.timestamp.getTime())));

        // Calculate function breakdown
        const functionBreakdown: Record<string, FunctionUsageStats> = {};
        const errorBreakdown: Record<string, number> = {};

        metrics.forEach(metric => {
            // Function stats
            if (!functionBreakdown[metric.operation]) {
                functionBreakdown[metric.operation] = {
                    requestCount: 0,
                    tokenUsage: 0,
                    averageResponseTime: 0,
                    successRate: 0,
                    lastUsed: new Date(0),
                    averageTokensPerRequest: 0,
                    peakResponseTime: 0,
                    errorCount: 0,
                    fallbackUsageCount: 0
                };
            }

            const funcStats = functionBreakdown[metric.operation];
            funcStats.requestCount++;
            funcStats.tokenUsage += metric.tokenCount.total;
            funcStats.averageResponseTime = 
                (funcStats.averageResponseTime * (funcStats.requestCount - 1) + metric.responseTime) / funcStats.requestCount;
            funcStats.lastUsed = new Date(Math.max(funcStats.lastUsed.getTime(), metric.timestamp.getTime()));
            funcStats.averageTokensPerRequest = funcStats.tokenUsage / funcStats.requestCount;
            funcStats.peakResponseTime = Math.max(funcStats.peakResponseTime, metric.responseTime);

            if (metric.success) {
                funcStats.successRate = 
                    (funcStats.successRate * (funcStats.requestCount - 1) + 1) / funcStats.requestCount;
            } else {
                funcStats.successRate = 
                    (funcStats.successRate * (funcStats.requestCount - 1)) / funcStats.requestCount;
                funcStats.errorCount++;
            }

            // Error breakdown
            if (!metric.success && metric.error) {
                const errorType = this.classifyErrorType(metric.error);
                errorBreakdown[errorType] = (errorBreakdown[errorType] || 0) + 1;
            }
        });

        // Calculate peak usage hour
        const hourlyUsage: Record<number, number> = {};
        metrics.forEach(metric => {
            const hour = metric.timestamp.getHours();
            hourlyUsage[hour] = (hourlyUsage[hour] || 0) + 1;
        });
        const peakUsageHour = Object.entries(hourlyUsage)
            .reduce((max, [hour, count]) => count > max.count ? { hour: parseInt(hour), count } : max, { hour: 0, count: 0 })
            .hour;

        return {
            totalRequests,
            totalTokens,
            averageResponseTime: totalResponseTime / totalRequests,
            successRate: successfulRequests / totalRequests,
            costEstimate: this.calculateCostEstimate(metrics, model),
            functionBreakdown,
            lastUsed,
            peakUsageHour,
            errorBreakdown
        };
    }

    /**
     * Calculate routing analytics
     */
    private calculateRoutingAnalytics(decisions: typeof this.routingDecisions): RoutingAnalytics {
        if (decisions.length === 0) {
            return {
                totalRoutingDecisions: 0,
                fallbacksTriggered: 0,
                routingFailures: 0,
                routingDecisionTime: 0,
                modelSwitchCount: 0,
                circuitBreakerActivations: 0,
                costOptimizationSavings: 0
            };
        }

        const fallbacksTriggered = decisions.filter(d => d.fallbackUsed).length;
        const routingFailures = decisions.filter(d => !d.success).length;
        const averageDecisionTime = decisions.reduce((sum, d) => sum + d.decisionTime, 0) / decisions.length;
        
        // Count model switches (when actual model differs from primary)
        const modelSwitches = decisions.filter(d => d.actualModel !== d.primaryModel).length;

        return {
            totalRoutingDecisions: decisions.length,
            fallbacksTriggered,
            routingFailures,
            routingDecisionTime: averageDecisionTime,
            modelSwitchCount: modelSwitches,
            circuitBreakerActivations: 0, // This would need to be tracked separately
            costOptimizationSavings: this.calculateCostOptimizationSavings(decisions)
        };
    }

    /**
     * Calculate cost estimate for model usage
     */
    private calculateCostEstimate(metrics: AICallMetrics[], model: 'gemini' | 'mistral'): number {
        const costs = this.costEstimates[model];
        
        return metrics.reduce((total, metric) => {
            const inputCost = metric.tokenCount.input * costs.inputTokenCost;
            const outputCost = metric.tokenCount.output * costs.outputTokenCost;
            return total + inputCost + outputCost;
        }, 0);
    }

    /**
     * Calculate cost optimization savings from routing decisions
     */
    private calculateCostOptimizationSavings(decisions: typeof this.routingDecisions): number {
        // Calculate savings by routing simple tasks to Mistral instead of Gemini
        const mistralRoutings = decisions.filter(d => d.actualModel === 'mistral' && d.primaryModel === 'gemini');
        
        // Estimate average tokens per request for cost calculation
        const averageTokensPerRequest = 500; // Conservative estimate
        const geminiCostPerRequest = averageTokensPerRequest * (this.costEstimates.gemini.inputTokenCost + this.costEstimates.gemini.outputTokenCost);
        
        return mistralRoutings.length * geminiCostPerRequest;
    }

    /**
     * Classify error types for analytics
     */
    private classifyErrorType(error: string): string {
        const errorLower = error.toLowerCase();
        
        if (errorLower.includes('rate limit') || errorLower.includes('quota')) {
            return 'rate_limit';
        } else if (errorLower.includes('timeout')) {
            return 'timeout';
        } else if (errorLower.includes('network') || errorLower.includes('connection')) {
            return 'network';
        } else if (errorLower.includes('authentication') || errorLower.includes('unauthorized')) {
            return 'authentication';
        } else if (errorLower.includes('service unavailable') || errorLower.includes('503')) {
            return 'service_unavailable';
        } else {
            return 'other';
        }
    }

    /**
     * Generate usage recommendations based on analytics
     */
    private generateRecommendations(
        geminiMetrics: AICallMetrics[],
        mistralMetrics: AICallMetrics[],
        routingDecisions: typeof this.routingDecisions
    ): UsageRecommendation[] {
        const recommendations: UsageRecommendation[] = [];

        // Cost optimization recommendations
        const totalGeminiCost = this.calculateCostEstimate(geminiMetrics, 'gemini');
        if (totalGeminiCost > 10) { // If spending more than $10
            recommendations.push({
                type: 'cost_optimization',
                priority: 'high',
                title: 'High Gemini Usage Detected',
                description: `Current Gemini usage costs approximately $${totalGeminiCost.toFixed(2)}. Consider routing more simple tasks to Mistral.`,
                impact: {
                    costSavings: totalGeminiCost * 0.3
                },
                actionItems: [
                    'Review routing rules for simple functions',
                    'Consider using Mistral for basic chat responses',
                    'Implement more aggressive prompt compression'
                ]
            });
        }

        // Performance recommendations
        const geminiAvgResponseTime = geminiMetrics.length > 0 
            ? geminiMetrics.reduce((sum, m) => sum + m.responseTime, 0) / geminiMetrics.length 
            : 0;
        
        if (geminiAvgResponseTime > 5000) {
            recommendations.push({
                type: 'performance_improvement',
                priority: 'medium',
                title: 'Slow Gemini Response Times',
                description: `Average Gemini response time is ${(geminiAvgResponseTime / 1000).toFixed(1)}s. Consider optimizing prompts or using Mistral for faster responses.`,
                impact: {
                    performanceImprovement: 3000
                },
                actionItems: [
                    'Optimize prompt lengths',
                    'Use Mistral for time-sensitive operations',
                    'Implement request timeout optimization'
                ]
            });
        }

        // Reliability recommendations
        const fallbackRate = routingDecisions.length > 0 
            ? routingDecisions.filter(d => d.fallbackUsed).length / routingDecisions.length 
            : 0;
        
        if (fallbackRate > 0.1) { // More than 10% fallback usage
            recommendations.push({
                type: 'reliability_enhancement',
                priority: 'high',
                title: 'High Fallback Usage',
                description: `${(fallbackRate * 100).toFixed(1)}% of requests are using fallback models. This indicates reliability issues with primary models.`,
                impact: {
                    reliabilityImprovement: 0.9
                },
                actionItems: [
                    'Investigate primary model availability issues',
                    'Adjust circuit breaker thresholds',
                    'Consider load balancing between models'
                ]
            });
        }

        // Capacity planning recommendations
        const totalRequests = geminiMetrics.length + mistralMetrics.length;
        if (totalRequests > 1000) { // High usage
            recommendations.push({
                type: 'capacity_planning',
                priority: 'low',
                title: 'High Request Volume',
                description: `Processing ${totalRequests} requests. Consider implementing request batching and caching for better efficiency.`,
                impact: {
                    performanceImprovement: 2000,
                    costSavings: totalGeminiCost * 0.15
                },
                actionItems: [
                    'Implement request batching for similar operations',
                    'Add caching for frequently requested data',
                    'Consider request rate limiting for non-critical operations'
                ]
            });
        }

        return recommendations.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    /**
     * Get detailed cost analysis
     */
    getCostAnalysis(timeRangeHours: number = 24): CostAnalysis {
        const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
        const allMetrics = this.getFilteredMetrics(cutoffTime);
        
        const geminiMetrics = allMetrics.filter(m => m.service === 'gemini');
        const mistralMetrics = allMetrics.filter(m => m.service === 'mistral');

        const geminiCost = this.calculateCostEstimate(geminiMetrics, 'gemini');
        const mistralCost = this.calculateCostEstimate(mistralMetrics, 'mistral');

        // Project monthly costs based on current usage
        const hoursInMonth = 24 * 30;
        const projectionMultiplier = hoursInMonth / timeRangeHours;

        const geminiTokens = geminiMetrics.reduce((sum, m) => sum + m.tokenCount.total, 0);
        const mistralTokens = mistralMetrics.reduce((sum, m) => sum + m.tokenCount.total, 0);

        return {
            gemini: {
                totalCost: geminiCost,
                costPerToken: geminiTokens > 0 ? geminiCost / geminiTokens : 0,
                costPerRequest: geminiMetrics.length > 0 ? geminiCost / geminiMetrics.length : 0,
                projectedMonthlyCost: geminiCost * projectionMultiplier
            },
            mistral: {
                totalCost: mistralCost,
                costPerToken: 0,
                costPerRequest: 0,
                projectedMonthlyCost: 0
            },
            savings: {
                totalSavings: this.calculateTotalSavings(geminiMetrics, mistralMetrics),
                savingsFromRouting: this.calculateRoutingSavings(),
                potentialAdditionalSavings: geminiCost * 0.2 // Estimate 20% additional savings possible
            }
        };
    }

    /**
     * Calculate total savings from using the routing system
     */
    private calculateTotalSavings(geminiMetrics: AICallMetrics[], mistralMetrics: AICallMetrics[]): number {
        // Calculate what the cost would have been if all requests went to Gemini
        const mistralTokens = mistralMetrics.reduce((sum, m) => sum + m.tokenCount.total, 0);
        const wouldBeGeminiCost = mistralTokens * (this.costEstimates.gemini.inputTokenCost + this.costEstimates.gemini.outputTokenCost);
        
        return wouldBeGeminiCost; // Since Mistral is free, this is the full savings
    }

    /**
     * Calculate savings specifically from routing decisions
     */
    private calculateRoutingSavings(): number {
        const recentDecisions = this.routingDecisions.filter(d => 
            d.timestamp >= new Date(Date.now() - 24 * 60 * 60 * 1000)
        );
        
        return this.calculateCostOptimizationSavings(recentDecisions);
    }

    /**
     * Get filtered metrics from performance monitor
     */
    private getFilteredMetrics(cutoffTime: Date): AICallMetrics[] {
        // This would need to be implemented to get metrics from the performance monitor
        // For now, return empty array as the performance monitor doesn't expose its internal metrics
        return [];
    }

    /**
     * Export comprehensive analytics data
     */
    exportAnalytics(timeRangeHours: number = 24): {
        usage: UsageAnalytics;
        costs: CostAnalysis;
        exportTime: Date;
        summary: {
            totalRequests: number;
            totalCost: number;
            averageResponseTime: number;
            successRate: number;
            topFunctions: Array<{ name: string; usage: number }>;
        };
    } {
        const usage = this.getUsageAnalytics(timeRangeHours);
        const costs = this.getCostAnalysis(timeRangeHours);

        const totalRequests = usage.gemini.totalRequests + usage.mistral.totalRequests;
        const totalCost = costs.gemini.totalCost + costs.mistral.totalCost;
        const weightedAvgResponseTime = totalRequests > 0 
            ? (usage.gemini.averageResponseTime * usage.gemini.totalRequests + 
               usage.mistral.averageResponseTime * usage.mistral.totalRequests) / totalRequests
            : 0;
        const overallSuccessRate = totalRequests > 0
            ? (usage.gemini.successRate * usage.gemini.totalRequests + 
               usage.mistral.successRate * usage.mistral.totalRequests) / totalRequests
            : 0;

        // Get top functions by usage
        const allFunctions = {
            ...usage.gemini.functionBreakdown,
            ...usage.mistral.functionBreakdown
        };
        const topFunctions = Object.entries(allFunctions)
            .map(([name, stats]) => ({ name, usage: stats.requestCount }))
            .sort((a, b) => b.usage - a.usage)
            .slice(0, 5);

        return {
            usage,
            costs,
            exportTime: new Date(),
            summary: {
                totalRequests,
                totalCost,
                averageResponseTime: weightedAvgResponseTime,
                successRate: overallSuccessRate,
                topFunctions
            }
        };
    }
}

// Export singleton instance
export const usageAnalytics = new UsageAnalyticsService();