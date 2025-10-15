import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import {
  generateResponse,
  getGeminiResponse,
  extractMeetingIntent,
  generateMeetingTitles,
  verifyAttendees,
  generateMeetingAgenda,
  generateActionItems,
  getContextualResponse,
  summarizeConversation,
  compressContext,
  analyzeMultiTurnIntent,
  convertToGeminiFormat,
  convertConversationToMistral,
  mapRoleToGemini,
  extractSystemInstruction,
  filterAndConvertMessages,
  processGeminiUsageMetadata,
  analyzeConversationContext,
  buildCompressedContext,
  calculateContextualConfidence,
  enhanceExtractionWithContext,
  extractParticipantsFromContext,
  extractTimeReferencesFromContext,
  extractTopicsFromContext
} from '../aiInterface';
import { ConversationContextEngine } from '../conversationContext';
import type { ConversationMessage, User, MeetingData } from '../../shared/schema';

// Mock the Google Generative AI client
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn()
}));

// Mock performance monitor
vi.mock('../performanceMonitor', () => ({
  performanceMonitor: {
    recordAPICall: vi.fn(),
    estimateTokenCount: vi.fn((text: string) => Math.ceil(text.length / 4))
  }
}));

// Mock AI service error handler
vi.mock('../errorHandlers/aiServiceErrorHandler', () => ({
  aiServiceErrorHandler: {
    classifyError: vi.fn((error: any) => ({
      message: error.message || 'AI service error',
      type: 'GEMINI_API_ERROR'
    }))
  }
}));

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

    const GoogleGenerativeAI = vi.mocked(require('@google/generative-ai').GoogleGenerativeAI);
    (GoogleGenerativeAI as any).mockImplementation(() => ({
      getGenerativeModel: () => mockGeminiClient
    }));
  });

  describe('Message Format Conversion', () => {
    describe('convertToGeminiFormat', () => {
      it('should convert Mistral messages to Gemini format', () => {
        const mistralMessages = [
          { role: 'system' as const, content: 'You are a helpful assistant' },
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi there!' }
        ];

        const result = convertToGeminiFormat(mistralMessages);

        expect(result.systemInstruction).toBe('You are a helpful assistant');
        expect(result.geminiMessages).toHaveLength(2);
        expect(result.geminiMessages[0]).toEqual({
          role: 'user',
          parts: [{ text: 'Hello' }]
        });
        expect(result.geminiMessages[1]).toEqual({
          role: 'model',
          parts: [{ text: 'Hi there!' }]
        });
      });

      it('should handle multiple system messages', () => {
        const mistralMessages = [
          { role: 'system' as const, content: 'System message 1' },
          { role: 'system' as const, content: 'System message 2' },
          { role: 'user' as const, content: 'Hello' }
        ];

        const result = convertToGeminiFormat(mistralMessages);

        expect(result.systemInstruction).toBe('System message 1\n\nSystem message 2');
        expect(result.geminiMessages).toHaveLength(1);
      });

      it('should handle messages without system instructions', () => {
        const mistralMessages = [
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi!' }
        ];

        const result = convertToGeminiFormat(mistralMessages);

        expect(result.systemInstruction).toBeUndefined();
        expect(result.geminiMessages).toHaveLength(2);
      });
    });

    describe('mapRoleToGemini', () => {
      it('should map roles correctly', () => {
        expect(mapRoleToGemini('user')).toBe('user');
        expect(mapRoleToGemini('assistant')).toBe('model');
        expect(mapRoleToGemini('system')).toBe('system');
      });
    });

    describe('convertConversationToMistral', () => {
      it('should convert ConversationMessage to Mistral format', () => {
        const conversationMessages: ConversationMessage[] = [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            timestamp: new Date()
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Hi there!',
            timestamp: new Date()
          }
        ];

        const result = convertConversationToMistral(conversationMessages);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          role: 'user',
          content: 'Hello'
        });
        expect(result[1]).toEqual({
          role: 'assistant',
          content: 'Hi there!'
        });
      });
    });
  });

  describe('Core Response Generation', () => {
    describe('getGeminiResponse', () => {
      it('should generate response using Gemini API', async () => {
        const mockResponse = {
          response: {
            text: () => 'I can help you with that!',
            usageMetadata: {
              promptTokenCount: 20,
              candidatesTokenCount: 15,
              totalTokenCount: 35
            }
          }
        };

        mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

        const messages = [
          { role: 'user' as const, content: 'Can you help me?' }
        ];

        const result = await getGeminiResponse(messages);

        expect(result).toBe('I can help you with that!');
        expect(mockGeminiClient.generateContent).toHaveBeenCalledWith({
          contents: [{
            role: 'user',
            parts: [{ text: 'Can you help me?' }]
          }]
        });
      });

      it('should handle custom system instructions', async () => {
        const mockResponse = {
          response: {
            text: () => 'Custom response',
            usageMetadata: {
              promptTokenCount: 25,
              candidatesTokenCount: 10,
              totalTokenCount: 35
            }
          }
        };

        mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

        const messages = [
          { role: 'system' as const, content: 'You are a calendar assistant' },
          { role: 'user' as const, content: 'Schedule a meeting' }
        ];

        const result = await getGeminiResponse(messages);

        expect(result).toBe('Custom response');
      });

      it('should handle API errors gracefully', async () => {
        mockGeminiClient.generateContent.mockRejectedValue(new Error('API rate limit exceeded'));

        const messages = [
          { role: 'user' as const, content: 'Hello' }
        ];

        await expect(getGeminiResponse(messages)).rejects.toThrow();
      });
    });

    describe('generateResponse', () => {
      it('should handle string input', async () => {
        const mockResponse = {
          response: {
            text: () => 'Response to string',
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 8,
              totalTokenCount: 18
            }
          }
        };

        mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

        const result = await generateResponse('Hello world');

        expect(result).toBe('Response to string');
      });

      it('should handle ConversationMessage array', async () => {
        const mockResponse = {
          response: {
            text: () => 'Response to conversation',
            usageMetadata: {
              promptTokenCount: 15,
              candidatesTokenCount: 12,
              totalTokenCount: 27
            }
          }
        };

        mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

        const messages: ConversationMessage[] = [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            timestamp: new Date()
          }
        ];

        const result = await generateResponse(messages);

        expect(result).toBe('Response to conversation');
      });

      it('should handle Mistral message array', async () => {
        const mockResponse = {
          response: {
            text: () => 'Response to mistral format',
            usageMetadata: {
              promptTokenCount: 12,
              candidatesTokenCount: 10,
              totalTokenCount: 22
            }
          }
        };

        mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

        const messages = [
          { role: 'user' as const, content: 'Hello' }
        ];

        const result = await generateResponse(messages);

        expect(result).toBe('Response to mistral format');
      });
    });
  });

  describe('Meeting Intent Extraction', () => {
    describe('extractMeetingIntent', () => {
      it('should extract meeting intent from conversation', async () => {
        const mockResponse = {
          response: {
            text: () => JSON.stringify({
              intent: 'scheduling',
              confidence: 0.85,
              fields: {
                suggestedTitle: 'Team Standup',
                startTime: '2024-01-15T10:00:00Z',
                participants: ['john@example.com', 'jane@example.com']
              },
              missing: ['endTime']
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
        expect(result.extractedFields.suggestedTitle).toBe('Team Standup');
        expect(result.extractedFields.participants).toEqual(['john@example.com', 'jane@example.com']);
        expect(result.missingFields).toContain('endTime');
      });

      it('should handle casual conversation intent', async () => {
        const mockResponse = {
          response: {
            text: () => JSON.stringify({
              intent: 'other',
              confidence: 0.95,
              fields: { participants: [] },
              missing: []
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

        expect(result.intent).toBe('other');
        expect(result.confidence).toBe(0.95);
        expect(Object.keys(result.extractedFields)).toHaveLength(1);
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

        expect(result.intent).toBe('other');
        expect(result.confidence).toBe(0);
      });
    });
  });

  describe('Meeting Generation Functions', () => {
    describe('generateMeetingTitles', () => {
      it('should generate meeting title suggestions', async () => {
        const mockResponse = {
          response: {
            text: () => JSON.stringify({
              suggestions: ['Team Standup', 'Daily Sync', 'Morning Meeting'],
              context: 'Daily team coordination'
            }),
            usageMetadata: {
              promptTokenCount: 30,
              candidatesTokenCount: 20,
              totalTokenCount: 50
            }
          }
        };

        mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

        const result = await generateMeetingTitles('daily standup', ['john@example.com', 'jane@example.com']);

        expect(result.suggestions).toHaveLength(3);
        expect(result.suggestions).toContain('Team Standup');
        expect(result.context).toBe('Daily team coordination');
      });

      it('should handle API errors with fallback suggestions', async () => {
        mockGeminiClient.generateContent.mockRejectedValue(new Error('API error'));

        await expect(generateMeetingTitles('meeting', ['test@example.com'])).rejects.toThrow();
      });

      it('should handle malformed JSON responses', async () => {
        const mockResponse = {
          response: {
            text: () => 'Invalid JSON',
            usageMetadata: {
              promptTokenCount: 25,
              candidatesTokenCount: 5,
              totalTokenCount: 30
            }
          }
        };

        mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

        const result = await generateMeetingTitles('meeting', ['test@example.com']);

        expect(result.suggestions).toEqual(['Team Meeting', 'Discussion Session', 'Project Sync']);
        expect(result.context).toBe('General meeting');
      });
    });

    describe('verifyAttendees', () => {
      it('should verify email addresses', async () => {
        const mockResponse = {
          response: {
            text: () => JSON.stringify([
              { email: 'valid@example.com', valid: true, trusted: true },
              { email: 'invalid-email', valid: false, trusted: false }
            ]),
            usageMetadata: {
              promptTokenCount: 25,
              candidatesTokenCount: 15,
              totalTokenCount: 40
            }
          }
        };

        mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

        const result = await verifyAttendees(['valid@example.com', 'invalid-email']);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          email: 'valid@example.com',
          valid: true,
          trusted: true
        });
        expect(result[1]).toEqual({
          email: 'invalid-email',
          valid: false,
          trusted: false
        });
      });

      it('should fallback to basic validation on API error', async () => {
        mockGeminiClient.generateContent.mockRejectedValue(new Error('API error'));

        const result = await verifyAttendees(['test@example.com', 'invalid-email']);

        expect(result).toHaveLength(2);
        expect(result[0].email).toBe('test@example.com');
        expect(result[0].valid).toBe(true);
        expect(result[1].email).toBe('invalid-email');
        expect(result[1].valid).toBe(false);
      });
    });

    describe('generateMeetingAgenda', () => {
      it('should generate meeting agenda', async () => {
        const mockResponse = {
          response: {
            text: () => '1. Welcome and introductions (5 min)\n2. Project updates (15 min)\n3. Next steps (10 min)',
            usageMetadata: {
              promptTokenCount: 40,
              candidatesTokenCount: 25,
              totalTokenCount: 65
            }
          }
        };

        mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

        const result = await generateMeetingAgenda(
          'Team Meeting',
          'Project sync',
          ['john@example.com', 'jane@example.com'],
          30
        );

        expect(result).toContain('Welcome and introductions');
        expect(result).toContain('Project updates');
        expect(result).toContain('Next steps');
      });

      it('should handle API errors gracefully', async () => {
        mockGeminiClient.generateContent.mockRejectedValue(new Error('API error'));

        await expect(generateMeetingAgenda('Meeting', 'Purpose', ['test@example.com'], 30))
          .rejects.toThrow();
      });
    });

    describe('generateActionItems', () => {
      it('should generate action items from meeting details', async () => {
        const mockResponse = {
          response: {
            text: () => JSON.stringify([
              {
                task: 'Review quarterly budget',
                assignee: 'john@example.com',
                dueDate: '2024-01-20',
                priority: 'high'
              },
              {
                task: 'Prepare presentation slides',
                assignee: 'jane@example.com',
                dueDate: '2024-01-18',
                priority: 'medium'
              }
            ]),
            usageMetadata: {
              promptTokenCount: 45,
              candidatesTokenCount: 35,
              totalTokenCount: 80
            }
          }
        };

        mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

        const result = await generateActionItems(
          'Budget Review Meeting',
          'Review quarterly budget and plan next steps',
          ['john@example.com', 'jane@example.com'],
          ['budget review', 'presentation preparation']
        );

        expect(result).toHaveLength(2);
        expect(result[0].task).toBe('Review quarterly budget');
        expect(result[0].assignee).toBe('john@example.com');
        expect(result[1].task).toBe('Prepare presentation slides');
      });

      it('should handle malformed JSON responses', async () => {
        const mockResponse = {
          response: {
            text: () => 'Invalid JSON response',
            usageMetadata: {
              promptTokenCount: 30,
              candidatesTokenCount: 5,
              totalTokenCount: 35
            }
          }
        };

        mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

        const result = await generateActionItems(
          'Meeting',
          'Purpose',
          ['test@example.com'],
          ['topic1']
        );

        expect(result).toEqual([]);
      });

      it('should handle API errors gracefully', async () => {
        mockGeminiClient.generateContent.mockRejectedValue(new Error('API error'));

        const result = await generateActionItems(
          'Meeting',
          'Purpose',
          ['test@example.com'],
          ['topic1']
        );

        expect(result).toEqual([]);
      });
    });
  });

  describe('Context Analysis Functions', () => {
    describe('analyzeConversationContext', () => {
      it('should analyze conversation for meeting patterns', () => {
        const messages: ConversationMessage[] = [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Let\'s schedule a meeting for tomorrow at 2 PM',
            timestamp: new Date()
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'I can help you schedule that meeting',
            timestamp: new Date()
          }
        ];

        const result = analyzeConversationContext(messages);

        expect(result.hasSchedulingIntent).toBe(true);
        expect(result.hasTimeReferences).toBe(true);
        expect(result.keywordDensity).toBeGreaterThan(0);
        expect(result.messageCount).toBe(2);
      });

      it('should extract participants from context', () => {
        const messages: ConversationMessage[] = [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Invite john@example.com and jane@company.com to the meeting',
            timestamp: new Date()
          }
        ];

        const result = analyzeConversationContext(messages);

        expect(result.extractedInfo.participants).toContain('john@example.com');
        expect(result.extractedInfo.participants).toContain('jane@company.com');
      });
    });

    describe('buildCompressedContext', () => {
      it('should build compressed context string', () => {
        const messages: ConversationMessage[] = [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Let\'s schedule a meeting',
            timestamp: new Date()
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'I can help with that',
            timestamp: new Date()
          }
        ];

        const contextAnalysis = analyzeConversationContext(messages);
        const result = buildCompressedContext(messages, contextAnalysis);

        expect(result).toContain('Recent conversation:');
        expect(result).toContain('U: Let\'s schedule a meeting');
        expect(result).toContain('A: I can help with that');
      });

      it('should include current meeting data if available', () => {
        const messages: ConversationMessage[] = [];
        const meetingData: MeetingData = {
          title: 'Existing Meeting',
          startTime: new Date('2024-01-15T10:00:00Z'),
          status: 'draft',
          attendees: [{ email: 'test@example.com', isValidated: true, isRequired: true }]
        };

        const contextAnalysis = analyzeConversationContext(messages, meetingData);
        const result = buildCompressedContext(messages, contextAnalysis);

        expect(result).toContain('Current meeting draft: Existing Meeting');
        expect(result).toContain('test@example.com');
      });
    });

    describe('calculateContextualConfidence', () => {
      it('should boost confidence for strong meeting context', () => {
        const extraction = { intent: 'scheduling', confidence: 0.5 } as any;
        const contextAnalysis = {
          keywordDensity: 0.4,
          hasSchedulingIntent: true,
          hasTimeReferences: true,
          messageCount: 3
        };

        const result = calculateContextualConfidence(extraction, contextAnalysis, 'yes, that works');

        expect(result).toBeGreaterThan(0.5);
        expect(result).toBeLessThanOrEqual(1);
      });

      it('should reduce confidence for unrelated messages', () => {
        const extraction = { intent: 'scheduling', confidence: 0.8 } as any;
        const contextAnalysis = {
          keywordDensity: 0.05,
          hasSchedulingIntent: false,
          hasTimeReferences: false,
          messageCount: 5
        };

        const result = calculateContextualConfidence(extraction, contextAnalysis, 'how is the weather?');

        expect(result).toBeLessThan(0.8);
        expect(result).toBeGreaterThanOrEqual(0);
      });
    });

    describe('enhanceExtractionWithContext', () => {
      it('should fill missing participants from context', () => {
        const extraction = {
          intent: 'scheduling',
          confidence: 0.8,
          fields: { participants: [] },
          missing: ['participants']
        } as any;

        const contextAnalysis = {
          extractedInfo: {
            participants: ['john@example.com', 'jane@example.com'],
            timeReferences: [],
            topics: []
          }
        };

        const result = enhanceExtractionWithContext(extraction, contextAnalysis);

        expect(result.fields.participants).toEqual(['john@example.com', 'jane@example.com']);
        expect(result.missing).not.toContain('participants');
      });

      it('should use current meeting data to fill gaps', () => {
        const extraction = {
          intent: 'scheduling',
          confidence: 0.8,
          fields: { participants: [] },
          missing: ['startTime', 'endTime']
        } as any;

        const contextAnalysis = { extractedInfo: { participants: [], timeReferences: [], topics: [] } };
        const currentMeetingData: MeetingData = {
          title: 'Existing Meeting',
          startTime: new Date('2024-01-15T10:00:00Z'),
          endTime: new Date('2024-01-15T11:00:00Z'),
          status: 'draft',
          attendees: []
        };

        const result = enhanceExtractionWithContext(extraction, contextAnalysis, currentMeetingData);

        expect(result.fields.startTime).toBe('2024-01-15T10:00:00.000Z');
        expect(result.fields.endTime).toBe('2024-01-15T11:00:00.000Z');
        expect(result.missing).not.toContain('startTime');
        expect(result.missing).not.toContain('endTime');
      });
    });
  });

  describe('Helper Functions', () => {
    describe('extractParticipantsFromContext', () => {
      it('should extract email addresses from messages', () => {
        const messages: ConversationMessage[] = [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Invite john@example.com and jane@company.org to the meeting',
            timestamp: new Date()
          }
        ];

        const result = extractParticipantsFromContext(messages);

        expect(result).toContain('john@example.com');
        expect(result).toContain('jane@company.org');
        expect(result).toHaveLength(2);
      });

      it('should remove duplicate emails', () => {
        const messages: ConversationMessage[] = [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Invite john@example.com',
            timestamp: new Date()
          },
          {
            id: 'msg-2',
            role: 'user',
            content: 'Also add john@example.com to the meeting',
            timestamp: new Date()
          }
        ];

        const result = extractParticipantsFromContext(messages);

        expect(result).toEqual(['john@example.com']);
      });
    });

    describe('extractTimeReferencesFromContext', () => {
      it('should extract time references from messages', () => {
        const messages: ConversationMessage[] = [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Let\'s meet tomorrow at 2:30 PM',
            timestamp: new Date()
          },
          {
            id: 'msg-2',
            role: 'user',
            content: 'How about next Monday?',
            timestamp: new Date()
          }
        ];

        const result = extractTimeReferencesFromContext(messages);

        expect(result).toContain('tomorrow');
        expect(result).toContain('2:30');
        expect(result).toContain('pm');
        expect(result).toContain('monday');
      });
    });

    describe('extractTopicsFromContext', () => {
      it('should extract topics from messages', () => {
        const messages: ConversationMessage[] = [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Let\'s discuss the quarterly budget review',
            timestamp: new Date()
          },
          {
            id: 'msg-2',
            role: 'user',
            content: 'We need to plan the product launch',
            timestamp: new Date()
          }
        ];

        const result = extractTopicsFromContext(messages);

        expect(result.length).toBeGreaterThan(0);
        expect(result.some(topic => topic.includes('quarterly budget'))).toBe(true);
      });
    });

    describe('processGeminiUsageMetadata', () => {
      it('should process Gemini usage metadata', () => {
        const usageMetadata = {
          promptTokenCount: 50,
          candidatesTokenCount: 30,
          totalTokenCount: 80
        };

        const result = processGeminiUsageMetadata(usageMetadata);

        expect(result.inputTokens).toBe(50);
        expect(result.outputTokens).toBe(30);
        expect(result.totalTokens).toBe(80);
      });

      it('should handle missing metadata', () => {
        const result = processGeminiUsageMetadata(null);

        expect(result.inputTokens).toBe(0);
        expect(result.outputTokens).toBe(0);
        expect(result.totalTokens).toBe(0);
      });
    });
  });

  describe('Error Handling and Resilience', () => {
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

      await expect(extractMeetingIntent(messages, contextEngine)).rejects.toThrow();
    });

    it('should handle rate limiting errors', async () => {
      const rateLimitError = { status: 429, message: 'Rate limit exceeded' };
      mockGeminiClient.generateContent.mockRejectedValue(rateLimitError);

      const messages = [{ role: 'user' as const, content: 'Test message' }];

      await expect(getGeminiResponse(messages)).rejects.toThrow();
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

        const messages = [{ role: 'user' as const, content: 'Test message' }];

        await expect(getGeminiResponse(messages)).rejects.toThrow();
      }
    });

    it('should handle content safety violations', async () => {
      const safetyError = {
        status: 400,
        message: 'Content blocked by safety filters'
      };
      mockGeminiClient.generateContent.mockRejectedValue(safetyError);

      const messages = [{ role: 'user' as const, content: 'Inappropriate content' }];

      await expect(getGeminiResponse(messages)).rejects.toThrow();
    });

    it('should handle model unavailable errors', async () => {
      const modelError = {
        status: 503,
        message: 'Model temporarily unavailable'
      };
      mockGeminiClient.generateContent.mockRejectedValue(modelError);

      const messages = [{ role: 'user' as const, content: 'Test message' }];

      await expect(getGeminiResponse(messages)).rejects.toThrow();
    });
  });
});