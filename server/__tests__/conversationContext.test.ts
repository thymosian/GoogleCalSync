import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationContextEngine, createConversationContextEngine } from '../conversationContext';
import type { ConversationMessage } from '../../shared/schema';

// Mock the conversationStorage module
vi.mock('../conversationStorage', () => ({
  conversationStorage: {
    getOrCreateSession: vi.fn().mockResolvedValue({
      id: 'session-123',
      userId: 'test-user-123',
      startTime: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      compressionLevel: 0,
      currentMode: 'casual',
      hasMeetingData: false
    }),
    getActiveSession: vi.fn().mockResolvedValue(null),
    getConversationContext: vi.fn().mockResolvedValue(null),
    getUserConversationContexts: vi.fn().mockResolvedValue([]),
    getRecentMessages: vi.fn().mockResolvedValue([]),
    getMessageCount: vi.fn().mockResolvedValue(0),
    storeChatMessage: vi.fn().mockResolvedValue({
      id: 'msg-123',
      userId: 'test-user-123',
      role: 'user',
      content: 'test message',
      timestamp: new Date()
    }),
    updateConversationContext: vi.fn().mockResolvedValue(undefined),
    compressConversationContext: vi.fn().mockResolvedValue(undefined),
    getUserConversationStats: vi.fn().mockResolvedValue({
      totalContexts: 0,
      activeContexts: 0,
      totalMessages: 0,
      averageMessagesPerContext: 0,
      compressionEvents: 0
    })
  }
}));

describe('ConversationContextEngine', () => {
  let engine: ConversationContextEngine;
  const testUserId = 'test-user-123';

  beforeEach(() => {
    engine = new ConversationContextEngine(testUserId);
  });

  it('should initialize with default values', () => {
    expect(engine.getCurrentMode()).toBe('casual');
    expect(engine.getMeetingData()).toBeUndefined();
    expect(engine.getConversationId()).toBeNull();
  });

  it('should detect mode transition to scheduling', () => {
    const message: ConversationMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'I need to schedule a meeting for tomorrow',
      timestamp: new Date()
    };

    engine.setMode('casual');
    const contextData = engine.getContextData();
    contextData.messages.push(message);

    const newMode = engine.detectModeTransition();
    expect(newMode).toBe('scheduling');
  });

  it('should detect mode transition to approval', () => {
    const message: ConversationMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'Yes, that looks good. Please create the meeting.',
      timestamp: new Date()
    };

    engine.setMode('scheduling');
    const contextData = engine.getContextData();
    contextData.messages.push(message);

    const newMode = engine.detectModeTransition();
    expect(newMode).toBe('approval');
  });

  it('should update meeting data', () => {
    engine.updateMeetingData({
      title: 'Test Meeting',
      type: 'online'
    });

    const meetingData = engine.getMeetingData();
    expect(meetingData?.title).toBe('Test Meeting');
    expect(meetingData?.type).toBe('online');
    expect(meetingData?.status).toBe('draft');
  });

  it('should provide conversation statistics', () => {
    const stats = engine.getStats();
    expect(stats.messageCount).toBe(0);
    expect(stats.currentMode).toBe('casual');
    expect(stats.hasMeetingData).toBe(false);
    expect(stats.compressionLevel).toBe(0);
  });

  it('should estimate token count correctly', () => {
    const messages: ConversationMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello world',
        timestamp: new Date()
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Hi there!',
        timestamp: new Date()
      }
    ];

    // Access private method through any cast for testing
    const tokenCount = (engine as any).estimateTokenCount(messages);
    expect(tokenCount).toBeGreaterThan(0);
    expect(tokenCount).toBe(Math.ceil(('Hello world' + 'Hi there!').length / 4));
  });

  it('should compress context correctly', async () => {
    const result = await engine.getCompressedContext();
    expect(result.compressedContext).toContain('Mode: casual');
    expect(result.tokenCount).toBeGreaterThan(0);
    expect(result.compressionRatio).toBe(1); // No compression needed for empty context
  });

  it('should provide compression recommendations', () => {
    const recommendation = engine.getCompressionRecommendation();
    expect(recommendation).toHaveProperty('shouldCompress');
    expect(recommendation).toHaveProperty('reason');
    expect(recommendation).toHaveProperty('recommendedStrategy');
    expect(recommendation.recommendedStrategy).toHaveProperty('keepRecentCount');
    expect(recommendation.recommendedStrategy).toHaveProperty('keepInitialCount');
  });

  it('should handle context compression with many messages', async () => {
    const messages: ConversationMessage[] = Array.from({ length: 50 }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i} with some content to test compression`,
      timestamp: new Date(Date.now() + i * 1000)
    }));

    // Access private method through any cast for testing
    const contextData = engine.getContextData();
    contextData.messages = messages;

    const result = await engine.getCompressedContext();
    expect(result.tokenCount).toBeGreaterThan(0);
    expect(result.compressedContext).toContain('Mode: casual');
  });

  it('should detect mode transitions based on message content', () => {
    const schedulingMessage: ConversationMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'Can we schedule a meeting for next week?',
      timestamp: new Date()
    };

    const approvalMessage: ConversationMessage = {
      id: 'msg-2',
      role: 'user',
      content: 'Yes, please create the meeting',
      timestamp: new Date()
    };

    // Test scheduling detection - directly manipulate context data for testing
    engine['contextData'].messages = [schedulingMessage];
    engine.setMode('casual');
    expect(engine.detectModeTransition()).toBe('scheduling');

    // Test approval detection
    engine['contextData'].messages = [schedulingMessage, approvalMessage];
    engine.setMode('scheduling');
    expect(engine.detectModeTransition()).toBe('approval');
  });

  it('should maintain meeting data consistency', () => {
    const meetingData1 = {
      title: 'First Meeting',
      type: 'online' as const
    };

    const meetingData2 = {
      startTime: new Date(),
      attendees: [{
        email: 'test@example.com',
        isValidated: true,
        isRequired: true
      }]
    };

    engine.updateMeetingData(meetingData1);
    engine.updateMeetingData(meetingData2);

    const finalData = engine.getMeetingData();
    expect(finalData?.title).toBe('First Meeting');
    expect(finalData?.type).toBe('online');
    expect(finalData?.startTime).toBeDefined();
    expect(finalData?.attendees).toEqual([{
      email: 'test@example.com',
      isValidated: true,
      isRequired: true
    }]);
  });

  it('should handle session management', async () => {
    // Mock the conversationStorage methods
    const mockSession = {
      id: 'session-123',
      userId: testUserId,
      startTime: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      compressionLevel: 0,
      currentMode: 'casual' as const,
      hasMeetingData: false
    };

    // Test session creation
    const session = await engine.createNewSession();
    expect(session).toBeDefined();
    expect(engine.getConversationId()).toBeTruthy();
  });

  it('should handle message history retrieval', async () => {
    // Test with no conversation ID
    const history = await engine.getMessageHistory(0, 10);
    expect(history.messages).toEqual([]);
    expect(history.totalCount).toBe(0);
    expect(history.hasMore).toBe(false);
  });

  it('should handle context retrieval', async () => {
    const contextData = await engine.retrieveContext('non-existent-id');
    expect(contextData).toBeNull();
  });

  it('should handle user contexts retrieval', async () => {
    const contexts = await engine.retrieveUserContexts(5);
    expect(Array.isArray(contexts)).toBe(true);
  });
});