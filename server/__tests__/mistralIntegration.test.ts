import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { extractMeetingIntent, generateResponse } from '../aiInterface';
import { ConversationContextEngine } from '../conversationContext';
import type { ConversationMessage, User } from '../../shared/schema';

// Mock the Google Generative AI client
vi.mock('@google/generative-ai');

describe('Gemini AI Service Integration', () => {
  let mockGeminiClient: any;
  let mockUser: User;
  let contextEngine: ConversationContextEngine;

  beforeEach(() => {
    mockUser = {
      id: 'test-user-id',
      googleId: 'google-123',
      email: 'test@example.com',
      name: 'Test User',
      picture: null,
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token'
    };

    contextEngine = new ConversationContextEngine(mockUser.id);

    // Mock Gemini client
    mockGeminiClient = {
      generateContent: vi.fn()
    };
    
    const mockedGoogleAI = vi.mocked(require('@google/generative-ai').GoogleGenerativeAI);
    mockedGoogleAI.mockImplementation(() => ({
      getGenerativeModel: () => mockGeminiClient
    }));
  });

  describe('extractMeetingIntent', () => {
    it('should extract meeting intent from conversation', async () => {
      const mockResponse = {
        response: {
          text: () => JSON.stringify({
            intent: 'scheduling',
            confidence: 0.85,
            extractedFields: {
              title: 'Team Standup',
              startTime: '2024-01-15T10:00:00Z',
              type: 'online',
              attendees: ['john@example.com', 'jane@example.com']
            },
            missingFields: ['endTime']
          }),
          usageMetadata: {
            promptTokenCount: 50,
            candidatesTokenCount: 30,
            totalTokenCount: 80
          }
        }
      };

      mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

      const messages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'I need to schedule a team standup for tomorrow at 10 AM with John and Jane',
          timestamp: new Date()
        }
      ];

      const result = await extractMeetingIntent(messages, contextEngine);

      expect(result.intent).toBe('scheduling');
      expect(result.confidence).toBe(0.85);
      expect(result.extractedFields.title).toBe('Team Standup');
      expect(result.extractedFields.attendees).toEqual(['john@example.com', 'jane@example.com']);
      expect(result.missingFields).toContain('endTime');
    });

    it('should handle casual conversation intent', async () => {
      const mockResponse = {
        response: {
          text: () => JSON.stringify({
            intent: 'casual',
            confidence: 0.95,
            extractedFields: {},
            missingFields: []
          }),
          usageMetadata: {
            promptTokenCount: 20,
            candidatesTokenCount: 10,
            totalTokenCount: 30
          }
        }
      };

      mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

      const messages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'How are you doing today?',
          timestamp: new Date()
        }
      ];

      const result = await extractMeetingIntent(messages, contextEngine);

      expect(result.intent).toBe('casual');
      expect(result.confidence).toBe(0.95);
      expect(Object.keys(result.extractedFields)).toHaveLength(0);
    });

    it('should handle API errors gracefully', async () => {
      mockGeminiClient.generateContent.mockRejectedValue(new Error('API rate limit exceeded'));

      const messages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Schedule a meeting',
          timestamp: new Date()
        }
      ];

      const result = await extractMeetingIntent(messages, contextEngine);

      // Should return fallback response
      expect(result.intent).toBe('casual');
      expect(result.confidence).toBe(0.1);
      expect(result.extractedFields).toEqual({});
    });

    it('should handle malformed API responses', async () => {
      const mockResponse = {
        response: {
          text: () => 'Invalid JSON response',
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 5,
            totalTokenCount: 20
          }
        }
      };

      mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

      const messages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Schedule a meeting',
          timestamp: new Date()
        }
      ];

      const result = await extractMeetingIntent(messages, contextEngine);

      // Should return fallback response
      expect(result.intent).toBe('casual');
      expect(result.confidence).toBe(0.1);
    });

    it('should use conversation context for better intent detection', async () => {
      const mockResponse = {
        response: {
          text: () => JSON.stringify({
            intent: 'scheduling',
            confidence: 0.9,
            extractedFields: {
              title: 'Follow-up Meeting',
              type: 'online'
            },
            missingFields: ['startTime', 'attendees']
          }),
          usageMetadata: {
            promptTokenCount: 60,
            candidatesTokenCount: 25,
            totalTokenCount: 85
          }
        }
      };

      mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

      // Set up conversation context
      contextEngine.updateMeetingData({
        title: 'Previous Meeting',
        type: 'online'
      });

      const messages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'We discussed this in our last meeting',
          timestamp: new Date()
        },
        {
          id: 'msg-2',
          role: 'user',
          content: 'Let\'s schedule a follow-up',
          timestamp: new Date()
        }
      ];

      const result = await extractMeetingIntent(messages, contextEngine);

      expect(result.intent).toBe('scheduling');
      expect(result.extractedFields.title).toBe('Follow-up Meeting');
      expect(mockGeminiClient.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              parts: expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining('Previous Meeting')
                })
              ])
            })
          ])
        })
      );
    });
  });

  describe('generateResponse', () => {
    it('should generate contextual responses', async () => {
      const mockResponse = {
        response: {
          text: () => 'I can help you schedule that meeting. What time would work best for you?',
          usageMetadata: {
            promptTokenCount: 30,
            candidatesTokenCount: 20,
            totalTokenCount: 50
          }
        }
      };

      mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

      const messages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'I need to schedule a meeting',
          timestamp: new Date()
        }
      ];

      const response = await generateResponse(messages, contextEngine);

      expect(response).toBe('I can help you schedule that meeting. What time would work best for you?');
      expect(mockGeminiClient.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              parts: expect.arrayContaining([
                expect.objectContaining({
                  text: 'I need to schedule a meeting'
                })
              ])
            })
          ])
        })
      );
    });

    it('should handle response generation errors', async () => {
      mockGeminiClient.generateContent.mockRejectedValue(new Error('Service unavailable'));

      const messages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date()
        }
      ];

      const response = await generateResponse(messages, contextEngine);

      // Should return fallback response
      expect(response).toContain('I apologize');
      expect(response).toContain('temporarily unavailable');
    });

    it('should optimize token usage with context compression', async () => {
      const mockResponse = {
        response: {
          text: () => 'Based on our conversation, I understand you want to schedule a meeting.',
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 15,
            totalTokenCount: 115
          }
        }
      };

      mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

      // Create a long conversation that would need compression
      const longMessages: ConversationMessage[] = Array.from({ length: 20 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i} with some content that makes the conversation longer`,
        timestamp: new Date(Date.now() + i * 1000)
      }));

      const response = await generateResponse(longMessages, contextEngine);

      expect(response).toBe('Based on our conversation, I understand you want to schedule a meeting.');
      
      // Verify that the API was called with compressed context
      const callArgs = mockGeminiClient.generateContent.mock.calls[0][0];
      expect(callArgs.contents.length).toBeLessThan(longMessages.length);
    });

    it('should include system prompts for meeting scheduling context', async () => {
      const mockResponse = {
        response: {
          text: () => 'I\'ll help you schedule that meeting. Let me gather the details.',
          usageMetadata: {
            promptTokenCount: 40,
            candidatesTokenCount: 15,
            totalTokenCount: 55
          }
        }
      };

      mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

      contextEngine.setMode('scheduling');
      contextEngine.updateMeetingData({
        type: 'online',
        title: 'Team Meeting'
      });

      const messages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Let\'s set up the team meeting',
          timestamp: new Date()
        }
      ];

      await generateResponse(messages, contextEngine);

      const callArgs = mockGeminiClient.generateContent.mock.calls[0][0];
      
      // Check if system instruction is included in the request
      expect(callArgs.systemInstruction).toBeDefined();
      expect(callArgs.systemInstruction.parts[0].text).toContain('meeting scheduling');
      expect(callArgs.systemInstruction.parts[0].text).toContain('online');
    });
  });

  describe('error handling and resilience', () => {
    it('should handle network timeouts', async () => {
      mockGeminiClient.generateContent.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      const messages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Test message',
          timestamp: new Date()
        }
      ];

      const result = await extractMeetingIntent(messages, contextEngine);
      
      expect(result.intent).toBe('casual');
      expect(result.confidence).toBe(0.1);
    });

    it('should handle rate limiting with exponential backoff', async () => {
      let callCount = 0;
      mockGeminiClient.generateContent.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject({ status: 429, message: 'Rate limit exceeded' });
        }
        return Promise.resolve({
          response: {
            text: () => JSON.stringify({
              intent: 'casual',
              confidence: 0.8,
              extractedFields: {},
              missingFields: []
            }),
            usageMetadata: {
              promptTokenCount: 20,
              candidatesTokenCount: 10,
              totalTokenCount: 30
            }
          }
        });
      });

      const messages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Test message',
          timestamp: new Date()
        }
      ];

      const result = await extractMeetingIntent(messages, contextEngine);
      
      expect(callCount).toBe(3); // Should retry twice before succeeding
      expect(result.intent).toBe('casual');
      expect(result.confidence).toBe(0.8);
    });

    it('should validate API response structure', async () => {
      const invalidResponses = [
        { response: {} }, // Missing text method
        { response: { text: null } }, // Null text method
        { response: { text: () => null } }, // Null text content
        {} // Missing response
      ];

      for (const invalidResponse of invalidResponses) {
        mockGeminiClient.generateContent.mockResolvedValueOnce(invalidResponse);

        const messages: ConversationMessage[] = [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Test message',
            timestamp: new Date()
          }
        ];

        const result = await extractMeetingIntent(messages, contextEngine);
        
        expect(result.intent).toBe('casual');
        expect(result.confidence).toBe(0.1);
      }
    });
  });
});