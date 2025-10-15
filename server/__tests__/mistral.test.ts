import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  extractMeetingIntent, 
  generateMeetingTitles, 
  verifyAttendees,
  generateMeetingAgenda,
  generateActionItems,
  getGeminiResponse,
  getContextualResponse,
  type MistralMessage
} from '../aiInterface';
import { MEETING_CREATION_PROMPTS } from '../prompts';

// Mock Google Generative AI
vi.mock('@google/generative-ai');

const mockedGoogleAI = GoogleGenerativeAI as any;

describe('Gemini AI Functions', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore all mocks after each test
    vi.restoreAllMocks();
  });

  describe('getGeminiResponse', () => {
    it('should get a response from Gemini AI', async () => {
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => 'Hello! How can I help you today?',
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 8,
              totalTokenCount: 18
            }
          }
        })
      };

      mockedGoogleAI.mockImplementation(() => ({
        getGenerativeModel: () => mockModel
      }));

      const messages: MistralMessage[] = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hi there!' }
      ];

      const result = await getGeminiResponse(messages);
      
      expect(result).toBe('Hello! How can I help you today?');
      expect(mockModel.generateContent).toHaveBeenCalled();
    });
  });

  describe('getContextualResponse', () => {
    it('should get a contextual response from Gemini AI', async () => {
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => 'Based on our conversation, I understand you want to schedule a meeting.',
            usageMetadata: {
              promptTokenCount: 25,
              candidatesTokenCount: 15,
              totalTokenCount: 40
            }
          }
        })
      };

      mockedGoogleAI.mockImplementation(() => ({
        getGenerativeModel: () => mockModel
      }));

      const conversationHistory: MistralMessage[] = [
        { role: 'user', content: 'I need to schedule a meeting' },
        { role: 'assistant', content: 'Sure, I can help with that. What is the meeting about?' }
      ];

      const userInput = 'It\'s about the quarterly review';

      const result = await getContextualResponse(conversationHistory, userInput);
      
      expect(result).toBe('Based on our conversation, I understand you want to schedule a meeting.');
      expect(mockModel.generateContent).toHaveBeenCalled();
    });
  });

  describe('extractMeetingIntent', () => {
    it('should extract meeting intent from user message', async () => {
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({
              intent: 'create_meeting',
              confidence: 0.9,
              fields: {
                startTime: null,
                endTime: null,
                duration: 60,
                purpose: 'project planning',
                participants: ['john@example.com'],
                suggestedTitle: 'Project Planning Session'
              },
              missing: ['startTime', 'endTime']
            }),
            usageMetadata: {
              promptTokenCount: 50,
              candidatesTokenCount: 30,
              totalTokenCount: 80
            }
          }
        })
      };

      mockedGoogleAI.mockImplementation(() => ({
        getGenerativeModel: () => mockModel
      }));

      const result = await extractMeetingIntent('Let\'s schedule a meeting for project planning');
      
      expect(result.intent).toBe('create_meeting');
      expect(result.confidence).toBe(0.9);
      expect(result.fields.purpose).toBe('project planning');
      expect(mockModel.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              role: 'user'
            })
          ])
        })
      );
    });

    it('should handle parsing errors gracefully', async () => {
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => 'Invalid JSON response',
            usageMetadata: {
              promptTokenCount: 20,
              candidatesTokenCount: 5,
              totalTokenCount: 25
            }
          }
        })
      };

      mockedGoogleAI.mockImplementation(() => ({
        getGenerativeModel: () => mockModel
      }));

      const result = await extractMeetingIntent('Schedule a meeting');
      
      expect(result.intent).toBe('other');
      expect(result.confidence).toBe(0);
    });
  });

  describe('generateMeetingTitles', () => {
    it('should generate meeting title suggestions', async () => {
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({
              suggestions: [
                'Project Planning Session',
                'Team Strategy Meeting',
                'Project Kickoff'
              ],
              context: 'Planning session for new project'
            }),
            usageMetadata: {
              promptTokenCount: 40,
              candidatesTokenCount: 25,
              totalTokenCount: 65
            }
          }
        })
      };

      mockedGoogleAI.mockImplementation(() => ({
        getGenerativeModel: () => mockModel
      }));

      const result = await generateMeetingTitles('project planning', ['john@example.com', 'jane@example.com']);
      
      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions[0]).toBe('Project Planning Session');
      expect(result.context).toBe('Planning session for new project');
    });
  });

  describe('verifyAttendees', () => {
    it('should verify attendee email addresses', async () => {
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify([
              {
                email: 'john@gmail.com',
                valid: true,
                trusted: true
              },
              {
                email: 'invalid-email',
                valid: false,
                trusted: false
              }
            ]),
            usageMetadata: {
              promptTokenCount: 30,
              candidatesTokenCount: 20,
              totalTokenCount: 50
            }
          }
        })
      };

      mockedGoogleAI.mockImplementation(() => ({
        getGenerativeModel: () => mockModel
      }));

      const result = await verifyAttendees(['john@gmail.com', 'invalid-email']);
      
      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('john@gmail.com');
      expect(result[0].valid).toBe(true);
      expect(result[0].trusted).toBe(true);
      expect(result[1].email).toBe('invalid-email');
      expect(result[1].valid).toBe(false);
      expect(result[1].trusted).toBe(false);
    });

    it('should fallback to basic validation on API error', async () => {
      const mockModel = {
        generateContent: vi.fn().mockRejectedValue(new Error('API Error'))
      };

      mockedGoogleAI.mockImplementation(() => ({
        getGenerativeModel: () => mockModel
      }));

      const result = await verifyAttendees(['john@gmail.com', 'invalid-email']);
      
      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('john@gmail.com');
      expect(result[0].valid).toBe(true);
      expect(result[0].trusted).toBe(true);
      expect(result[1].email).toBe('invalid-email');
      expect(result[1].valid).toBe(false);
    });
  });

  describe('generateMeetingAgenda', () => {
    it('should generate a meeting agenda', async () => {
      const mockAgenda = `
1. Welcome and Introductions (5 minutes)
2. Review of Project Goals (10 minutes)
3. Discussion of Timeline and Milestones (20 minutes)
4. Assignment of Action Items (10 minutes)
5. Closing Remarks (5 minutes)
      `;

      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => mockAgenda,
            usageMetadata: {
              promptTokenCount: 60,
              candidatesTokenCount: 40,
              totalTokenCount: 100
            }
          }
        })
      };

      mockedGoogleAI.mockImplementation(() => ({
        getGenerativeModel: () => mockModel
      }));

      const result = await generateMeetingAgenda(
        'Project Planning',
        'Plan the new project',
        ['john@example.com', 'jane@example.com'],
        60
      );
      
      expect(result).toContain('Welcome and Introductions');
      expect(result).toContain('Review of Project Goals');
    });
  });

  describe('generateActionItems', () => {
    it('should generate action items', async () => {
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify([
              {
                task: 'Create project timeline',
                assignee: 'john@example.com',
                deadline: '1 week',
                priority: 'high'
              },
              {
                task: 'Schedule follow-up meeting',
                assignee: 'jane@example.com',
                deadline: '2 weeks',
                priority: 'medium'
              }
            ]),
            usageMetadata: {
              promptTokenCount: 45,
              candidatesTokenCount: 35,
              totalTokenCount: 80
            }
          }
        })
      };

      mockedGoogleAI.mockImplementation(() => ({
        getGenerativeModel: () => mockModel
      }));

      const result = await generateActionItems(
        'Project Planning',
        'Plan the new project',
        ['john@example.com', 'jane@example.com'],
        ['Timeline', 'Resource allocation']
      );
      
      expect(result).toHaveLength(2);
      expect(result[0].task).toBe('Create project timeline');
      expect(result[0].assignee).toBe('john@example.com');
      expect(result[1].task).toBe('Schedule follow-up meeting');
    });
  });
});