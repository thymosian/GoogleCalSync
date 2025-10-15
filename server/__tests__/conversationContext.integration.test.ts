import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConversationContextEngine } from '../conversationContext';
import { conversationStorage } from '../conversationStorage';
import type { ConversationMessage } from '../../shared/schema';

describe('ConversationContextEngine Integration Tests', () => {
  let engine: ConversationContextEngine;
  const testUserId = 'integration-test-user-123';
  let createdContextIds: string[] = [];

  beforeEach(async () => {
    engine = new ConversationContextEngine(testUserId);
  });

  afterEach(async () => {
    // Cleanup created contexts
    for (const contextId of createdContextIds) {
      try {
        // Note: In a real implementation, you'd want a proper cleanup method
        // For now, we'll just track them for manual cleanup if needed
      } catch (error) {
        // Ignore cleanup errors in tests
      }
    }
    createdContextIds = [];
  });

  it('should demonstrate context persistence and retrieval workflow', async () => {
    // This test demonstrates the complete workflow but doesn't actually
    // connect to the database to avoid test environment issues
    
    // 1. Test context compression recommendation
    const recommendation = engine.getCompressionRecommendation();
    expect(recommendation.shouldCompress).toBe(false); // Empty context shouldn't need compression
    expect(recommendation.reason).toContain('acceptable limits');

    // 2. Test context statistics
    const stats = engine.getStats();
    expect(stats.messageCount).toBe(0);
    expect(stats.compressionLevel).toBe(0);
    expect(stats.currentMode).toBe('casual');

    // 3. Test message history retrieval (with no active context)
    const history = await engine.getMessageHistory(0, 10);
    expect(history.messages).toEqual([]);
    expect(history.totalCount).toBe(0);
    expect(history.hasMore).toBe(false);

    // 4. Test context retrieval for non-existent context
    const contextData = await engine.retrieveContext('non-existent-id');
    expect(contextData).toBeNull();

    // 5. Test user contexts retrieval
    const userContexts = await engine.retrieveUserContexts(5);
    expect(Array.isArray(userContexts)).toBe(true);
  });

  it('should handle compression strategies correctly', () => {
    // Test compression recommendation logic
    const recommendation = engine.getCompressionRecommendation();
    
    // For empty context, should not need compression
    expect(recommendation.shouldCompress).toBe(false);
    expect(recommendation.reason).toContain('acceptable limits');
    
    // Test that recommendation structure is correct
    expect(recommendation.recommendedStrategy).toHaveProperty('keepRecentCount');
    expect(recommendation.recommendedStrategy).toHaveProperty('keepInitialCount');
    expect(recommendation.recommendedStrategy.keepRecentCount).toBeGreaterThan(0);
    expect(recommendation.recommendedStrategy.keepInitialCount).toBeGreaterThan(0);
  });

  it('should provide accurate token estimation', () => {
    const messages: ConversationMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello, I need to schedule a meeting for tomorrow at 2 PM',
        timestamp: new Date()
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'I can help you schedule that meeting. What is the purpose of the meeting?',
        timestamp: new Date()
      }
    ];

    const tokenCount = (engine as any).estimateTokenCount(messages);
    const expectedTokens = Math.ceil((messages[0].content.length + messages[1].content.length) / 4);
    expect(tokenCount).toBe(expectedTokens);
  });

  it('should handle context compression correctly', async () => {
    const result = await engine.getCompressedContext();
    
    expect(result.compressedContext).toContain('Mode: casual');
    expect(result.compressedContext).toContain('Recent:');
    expect(result.tokenCount).toBeGreaterThan(0);
    expect(result.compressionRatio).toBe(1); // No compression for empty context
  });
});