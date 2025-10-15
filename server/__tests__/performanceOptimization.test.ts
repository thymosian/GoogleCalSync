import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConversationContextEngine } from '../conversationContext';
import { performanceMonitor, PerformanceMonitor } from '../performanceMonitor';
import { summarizeConversation, compressContext } from '../aiInterface';
import type { ConversationMessage } from '../../shared/schema';

// Mock the gemini functions
vi.mock('../gemini', () => ({
  summarizeConversation: vi.fn(),
  compressContext: vi.fn()
}));

// Mock the storage
vi.mock('../storage', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'test-context-id' }])
      })
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([])
      })
    })
  }
}));

vi.mock('../conversationStorage', () => ({
  conversationStorage: {
    getOrCreateSession: vi.fn().mockResolvedValue({
      id: 'test-session-id',
      currentMode: 'casual',
      compressionLevel: 0
    }),
    getConversationContext: vi.fn().mockResolvedValue(null),
    getRecentMessages: vi.fn().mockResolvedValue([]),
    storeChatMessage: vi.fn().mockResolvedValue(undefined),
    updateConversationContext: vi.fn().mockResolvedValue(undefined),
    compressConversationContext: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('Performance Optimization', () => {
  let contextEngine: ConversationContextEngine;
  let testMessages: ConversationMessage[];

  beforeEach(async () => {
    // Reset performance monitor completely
    performanceMonitor['metrics'] = [];

    contextEngine = new ConversationContextEngine('test-user');
    await contextEngine.loadContext();

    // Create test messages
    testMessages = [
      {
        id: '1',
        role: 'user',
        content: 'Hi, I need to schedule a meeting with john@example.com for tomorrow at 2pm to discuss the project roadmap and quarterly planning.',
        timestamp: new Date('2024-01-01T10:00:00Z')
      },
      {
        id: '2',
        role: 'assistant',
        content: 'I can help you schedule that meeting. Let me gather the details: meeting with john@example.com tomorrow at 2pm about project roadmap and quarterly planning.',
        timestamp: new Date('2024-01-01T10:01:00Z')
      },
      {
        id: '3',
        role: 'user',
        content: 'Yes, that\'s correct. Also add sarah@company.com and mike@team.org to the meeting. We should also discuss budget allocation and resource planning.',
        timestamp: new Date('2024-01-01T10:02:00Z')
      },
      {
        id: '4',
        role: 'assistant',
        content: 'Perfect! I\'ve added sarah@company.com and mike@team.org to the attendee list. The meeting will cover project roadmap, quarterly planning, budget allocation, and resource planning.',
        timestamp: new Date('2024-01-01T10:03:00Z')
      },
      {
        id: '5',
        role: 'user',
        content: 'Actually, let\'s make it a 90-minute meeting and start at 1:30pm instead. We have a lot to cover.',
        timestamp: new Date('2024-01-01T10:04:00Z')
      }
    ];

    // Add messages to context
    for (const message of testMessages) {
      await contextEngine.addMessage(message);
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('PerformanceMonitor', () => {
    it('should record API call metrics', () => {
      performanceMonitor.recordAPICall({
        service: 'gemini',
        operation: 'test_operation',
        tokenCount: {
          input: 100,
          output: 50,
          total: 150
        },
        responseTime: 1500,
        success: true
      });

      const stats = performanceMonitor.getPerformanceStats(1);
      expect(stats.totalCalls).toBe(1);
      expect(stats.totalTokens).toBe(150);
      expect(stats.averageResponseTime).toBe(1500);
      expect(stats.successRate).toBe(1);
    });

    it('should provide optimization recommendations for high token usage', () => {
      // Simulate high token usage
      for (let i = 0; i < 10; i++) {
        performanceMonitor.recordAPICall({
          service: 'gemini',
          operation: 'high_token_operation',
          tokenCount: {
            input: 8000,
            output: 2000,
            total: 10000
          },
          responseTime: 2000,
          success: true
        });
      }

      const recommendations = performanceMonitor.getOptimizationRecommendations();
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].type).toBe('compression');
      expect(recommendations[0].priority).toBe('high');
    });

    it('should track token usage trends', () => {
      const currentHour = new Date().getHours();

      performanceMonitor.recordAPICall({
        service: 'gemini',
        operation: 'trend_test',
        tokenCount: {
          input: 100,
          output: 50,
          total: 150
        },
        responseTime: 1000,
        success: true
      });

      const trends = performanceMonitor.getTokenUsageTrends(24);
      const currentHourData = trends.find(t => t.hour === currentHour);

      expect(currentHourData).toBeDefined();
      expect(currentHourData?.tokens).toBe(150);
      expect(currentHourData?.calls).toBe(1);
    });

    it('should calculate compression ratios correctly', () => {
      const originalText = 'This is a long conversation with many details about meeting planning and scheduling that could be compressed significantly.';
      const compressedText = 'Meeting planning discussion.';

      const ratio = performanceMonitor.calculateCompressionRatio(originalText, compressedText);
      expect(ratio).toBeLessThan(1);
      expect(ratio).toBeGreaterThan(0);
    });

    it('should identify most expensive operations', () => {
      // Record different operations with varying token costs
      performanceMonitor.recordAPICall({
        service: 'gemini',
        operation: 'expensive_op',
        tokenCount: { input: 500, output: 200, total: 700 },
        responseTime: 1000,
        success: true
      });

      performanceMonitor.recordAPICall({
        service: 'gemini',
        operation: 'cheap_op',
        tokenCount: { input: 50, output: 20, total: 70 },
        responseTime: 500,
        success: true
      });

      const expensive = performanceMonitor.getMostExpensiveOperations(2);
      expect(expensive[0].operation).toBe('expensive_op');
      expect(expensive[0].totalTokens).toBe(700);
    });
  });

  describe('Context Compression', () => {
    it('should compress context using simple strategy', async () => {
      const result = await contextEngine.getCompressedContext('simple');

      expect(result.compressedContext).toBeDefined();
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeLessThanOrEqual(1);
      expect(result.compressionStrategy).toBe('simple');
      expect(result.tokensSaved).toBeGreaterThanOrEqual(0);
    });

    it('should generate conversation summary', async () => {
      const mockSummary = 'Intent: meeting\nDetails: john@example.com, sarah@company.com, mike@team.org, tomorrow 1:30pm\nStatus: planning\nNext: confirm details';

      vi.mocked(summarizeConversation).mockResolvedValue(mockSummary);

      const summary = await contextEngine.generateConversationSummary();

      expect(summary.summary).toBe(mockSummary);
      expect(summary.meetingIntent).toBe(true);
      expect(summary.participantsMentioned).toContain('john@example.com');
      expect(summary.participantsMentioned).toContain('sarah@company.com');
      expect(summary.participantsMentioned).toContain('mike@team.org');
    });

    it('should use AI summarization for hybrid strategy with long conversations', async () => {
      // Create a very long conversation that exceeds token threshold
      const longMessages = Array.from({ length: 20 }, (_, i) => ({
        id: `long_${i}`,
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `This is a very long message ${i} with extensive content about meeting planning, scheduling details, participant coordination, agenda items, time management, resource allocation, budget discussions, project roadmaps, quarterly planning, and many other topics that will significantly increase the token count to trigger AI summarization in the hybrid compression strategy.`,
        timestamp: new Date()
      }));

      // Manually set messages to avoid async complications
      contextEngine['contextData'].messages = [...testMessages, ...longMessages];

      const mockSummary = 'Intent: meeting\nDetails: multiple participants, scheduling discussion\nStatus: planning\nNext: finalize';
      vi.mocked(summarizeConversation).mockResolvedValue(mockSummary);

      const result = await contextEngine.getCompressedContext('hybrid');

      expect(result.compressionStrategy).toBe('ai_summarization');
      expect(result.compressionRatio).toBeLessThan(1);
    });

    it('should provide performance metrics for conversation', () => {
      const metrics = contextEngine.getPerformanceMetrics();

      expect(metrics.tokenEfficiency).toBeGreaterThan(0);
      expect(metrics.averageMessageLength).toBeGreaterThan(0);
      expect(metrics.contextUtilization).toBeGreaterThanOrEqual(0);
      expect(metrics.compressionEffectiveness).toBeGreaterThanOrEqual(0);
    });

    it('should provide optimization recommendations', () => {
      // Add many messages to trigger recommendations
      const manyMessages = Array.from({ length: 25 }, (_, i) => ({
        id: `many_${i}`,
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `This is a very long message ${i} with lots of details about various topics that could benefit from compression and optimization to reduce token usage.`,
        timestamp: new Date()
      }));

      // Manually add to context data to avoid async complications in test
      contextEngine['contextData'].messages.push(...manyMessages);

      const recommendations = contextEngine.getOptimizationRecommendations();

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toHaveProperty('type');
      expect(recommendations[0]).toHaveProperty('priority');
      expect(recommendations[0]).toHaveProperty('description');
      expect(recommendations[0]).toHaveProperty('estimatedTokenSavings');
    });

    it('should apply auto-optimization', async () => {
      // Add many messages to trigger optimization
      const manyMessages = Array.from({ length: 30 }, (_, i) => ({
        id: `auto_${i}`,
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `Auto optimization test message ${i} with substantial content that will trigger compression recommendations.`,
        timestamp: new Date()
      }));

      // Manually add to context data
      contextEngine['contextData'].messages.push(...manyMessages);

      const result = await contextEngine.applyAutoOptimization();

      expect(result.applied).toBe(true);
      expect(result.strategy).toBeDefined();
      expect(result.tokensSaved).toBeGreaterThanOrEqual(0);
      expect(result.newTokenCount).toBeGreaterThan(0);
    });
  });

  describe('Token Budget Management', () => {
    it('should check token budget compliance', () => {
      // Clear any existing metrics first
      performanceMonitor['metrics'] = [];

      // Record usage within budget
      performanceMonitor.recordAPICall({
        service: 'gemini',
        operation: 'budget_test',
        tokenCount: { input: 100, output: 50, total: 150 },
        responseTime: 1000,
        success: true
      });

      const budget = performanceMonitor.checkTokenBudget(1);

      expect(budget.withinBudget).toBe(true);
      expect(budget.usage).toBe(150);
      expect(budget.utilizationPercent).toBeLessThan(100);
    });

    it('should detect budget overuse', () => {
      // Record high usage
      for (let i = 0; i < 20; i++) {
        performanceMonitor.recordAPICall({
          service: 'gemini',
          operation: 'overuse_test',
          tokenCount: { input: 800, output: 200, total: 1000 },
          responseTime: 1000,
          success: true
        });
      }

      const budget = performanceMonitor.checkTokenBudget(1);

      expect(budget.withinBudget).toBe(false);
      expect(budget.utilizationPercent).toBeGreaterThan(100);
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should handle AI summarization failures gracefully', async () => {
      vi.mocked(summarizeConversation).mockRejectedValue(new Error('AI service unavailable'));

      const result = await contextEngine.getCompressedContext('ai_summarization');

      // Should fall back to simple compression
      expect(result.compressionStrategy).toBe('simple');
      expect(result.compressedContext).toBeDefined();
    });

    it('should record failed API calls', () => {
      // Clear any existing metrics first
      performanceMonitor['metrics'] = [];

      performanceMonitor.recordAPICall({
        service: 'gemini',
        operation: 'failed_test',
        tokenCount: { input: 100, output: 0, total: 100 },
        responseTime: 5000,
        success: false,
        error: 'API timeout'
      });

      const stats = performanceMonitor.getPerformanceStats(1);
      expect(stats.successRate).toBe(0);
      expect(stats.totalCalls).toBe(1);
    });
  });

  describe('Memory Management', () => {
    it('should clear old metrics to prevent memory bloat', () => {
      // Add many metrics
      for (let i = 0; i < 1500; i++) {
        performanceMonitor.recordAPICall({
          service: 'gemini',
          operation: 'memory_test',
          tokenCount: { input: 50, output: 25, total: 75 },
          responseTime: 1000,
          success: true
        });
      }

      const stats = performanceMonitor.getPerformanceStats(24);
      // Should be capped at maxMetricsHistory (1000)
      expect(stats.totalCalls).toBeLessThanOrEqual(1000);
    });

    it('should export comprehensive performance data', () => {
      performanceMonitor.recordAPICall({
        service: 'gemini',
        operation: 'export_test',
        tokenCount: { input: 100, output: 50, total: 150 },
        responseTime: 1200,
        success: true
      });

      const exportData = performanceMonitor.exportMetrics(24);

      expect(exportData.summary).toBeDefined();
      expect(exportData.recommendations).toBeDefined();
      expect(exportData.trends).toBeDefined();
      expect(exportData.expensiveOperations).toBeDefined();
    });
  });
});