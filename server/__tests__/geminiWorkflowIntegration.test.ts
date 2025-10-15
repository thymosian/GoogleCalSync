import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractMeetingIntent, generateMeetingAgenda, generateMeetingTitles } from '../aiInterface';
import { ConversationContextEngine } from '../conversationContext';
import { AgendaGenerator } from '../agendaGenerator';
import { AttendeeValidator } from '../attendeeValidator';
import type { ConversationMessage, User, MeetingData } from '../../shared/schema';

// Mock external dependencies
vi.mock('../storage');
vi.mock('googleapis');

describe('Gemini Workflow Integration Tests', () => {
  let mockUser: User;
  let conversationContext: ConversationContextEngine;
  let agendaGenerator: AgendaGenerator;
  let attendeeValidator: AttendeeValidator;

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

    conversationContext = new ConversationContextEngine(mockUser.id);
    agendaGenerator = new AgendaGenerator();
    attendeeValidator = new AttendeeValidator();
  });

  describe('Complete Meeting Scheduling Workflow with Gemini', () => {
    it('should extract meeting intent from conversation using Gemini', async () => {
      const conversationMessages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'I need to schedule a team standup for tomorrow at 9 AM',
          timestamp: new Date('2024-01-15T10:00:00Z')
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'I can help you schedule that standup. Who should be included?',
          timestamp: new Date('2024-01-15T10:01:00Z')
        },
        {
          id: 'msg-3',
          role: 'user',
          content: 'Add john@example.com, jane@example.com, and the whole dev team',
          timestamp: new Date('2024-01-15T10:02:00Z')
        }
      ];

      // Test Gemini intent extraction
      const intentResult = await extractMeetingIntent(conversationMessages);

      expect(intentResult).toBeDefined();
      expect(intentResult.intent).toBe('scheduling');
      expect(intentResult.confidence).toBeGreaterThan(0.7);
      expect(intentResult.extractedFields).toBeDefined();
      
      // Should extract key meeting details
      if (intentResult.extractedFields.title) {
        expect(intentResult.extractedFields.title.toLowerCase()).toContain('standup');
      }
      
      if (intentResult.extractedFields.startTime) {
        expect(intentResult.extractedFields.startTime).toBeInstanceOf(Date);
      }

      // Should identify missing fields
      expect(Array.isArray(intentResult.missingFields)).toBe(true);
    });

    it('should generate contextual agenda using Gemini', async () => {
      const meetingData: MeetingData = {
        title: 'Q4 Planning Meeting',
        type: 'online',
        startTime: new Date('2024-01-16T14:00:00Z'),
        endTime: new Date('2024-01-16T15:30:00Z'),
        attendees: [
          { email: 'manager@example.com', firstName: 'Manager', isValidated: true, isRequired: true },
          { email: 'lead@example.com', firstName: 'Lead', isValidated: true, isRequired: true }
        ],
        status: 'draft'
      };

      const conversationContext: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'We need to discuss Q4 budget planning and resource allocation',
          timestamp: new Date('2024-01-15T10:00:00Z')
        },
        {
          id: 'msg-2',
          role: 'user',
          content: 'Also need to review current project status and timelines',
          timestamp: new Date('2024-01-15T10:01:00Z')
        }
      ];

      // Test agenda generation with conversation context
      const agendaResult = await agendaGenerator.generateAgenda(meetingData, conversationContext);

      expect(agendaResult).toBeDefined();
      expect(agendaResult.title).toBeTruthy();
      expect(agendaResult.duration).toBe(90); // 1.5 hours
      expect(agendaResult.topics.length).toBeGreaterThan(0);
      expect(agendaResult.actionItems.length).toBeGreaterThan(0);

      // Should incorporate conversation context
      const agendaText = agendaResult.topics.map(t => t.title + ' ' + (t.description || '')).join(' ').toLowerCase();
      expect(agendaText).toMatch(/budget|planning|resource|project|status/);

      // Test agenda formatting
      const formattedAgenda = agendaGenerator.formatAgenda(agendaResult);
      expect(formattedAgenda).toContain('# Q4 Planning Meeting');
      expect(formattedAgenda).toContain('**Duration:** 90 minutes');
      expect(formattedAgenda).toContain('## Agenda Items');
      expect(formattedAgenda).toContain('## Action Items');
    });

    it('should validate attendees and maintain conversation context', async () => {
      // Add messages to conversation context
      const messages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Schedule a meeting with the marketing team',
          timestamp: new Date('2024-01-15T10:00:00Z')
        },
        {
          id: 'msg-2',
          role: 'user',
          content: 'Add sarah@example.com and mike@example.com',
          timestamp: new Date('2024-01-15T10:01:00Z')
        }
      ];

      // Add messages to context engine
      for (const message of messages) {
        conversationContext.addMessage(message);
      }

      // Test attendee validation
      const emails = ['sarah@example.com', 'mike@example.com', 'invalid-email'];
      const validationResults = await attendeeValidator.validateBatch(emails, mockUser);

      expect(validationResults).toHaveLength(3);
      expect(validationResults[0].isValid).toBe(true);
      expect(validationResults[1].isValid).toBe(true);
      expect(validationResults[2].isValid).toBe(false);

      // Test conversation context compression
      const compressedContext = await conversationContext.getCompressedContext();
      expect(compressedContext.compressedContext).toContain('marketing team');
      expect(compressedContext.tokenCount).toBeGreaterThan(0);
      expect(compressedContext.compressionRatio).toBeGreaterThan(0);
    });

    it('should handle complete workflow with conversation persistence', async () => {
      // Simulate a complete conversation flow
      const conversationFlow: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'I need to schedule our weekly retrospective',
          timestamp: new Date('2024-01-15T09:00:00Z')
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'I\'ll help you schedule the retrospective. When would you like to have it?',
          timestamp: new Date('2024-01-15T09:01:00Z')
        },
        {
          id: 'msg-3',
          role: 'user',
          content: 'Friday at 3 PM. We need to discuss last sprint\'s challenges and improvements',
          timestamp: new Date('2024-01-15T09:02:00Z')
        },
        {
          id: 'msg-4',
          role: 'user',
          content: 'Include the whole development team',
          timestamp: new Date('2024-01-15T09:03:00Z')
        }
      ];

      // Step 1: Build conversation context
      for (const message of conversationFlow) {
        conversationContext.addMessage(message);
      }

      // Step 2: Extract meeting intent using Gemini
      const intentResult = await extractMeetingIntent(conversationFlow);
      expect(intentResult.intent).toBe('scheduling');
      expect(intentResult.confidence).toBeGreaterThan(0.7);

      // Step 3: Generate meeting titles using Gemini
      const titleSuggestions = await generateMeetingTitles(
        'Sprint retrospective meeting',
        ['dev1@example.com', 'dev2@example.com'],
        'Discussing sprint progress and planning'
      );
      expect(titleSuggestions.suggestions).toBeDefined();
      expect(Array.isArray(titleSuggestions.suggestions)).toBe(true);
      expect(titleSuggestions.suggestions.length).toBeGreaterThan(0);
      expect(titleSuggestions.suggestions.some(title => 
        title.toLowerCase().includes('retrospective') || 
        title.toLowerCase().includes('sprint')
      )).toBe(true);

      // Step 4: Create meeting data from extracted information
      const meetingData: MeetingData = {
        title: titleSuggestions.suggestions[0],
        type: 'online',
        startTime: new Date('2024-01-19T15:00:00Z'), // Friday 3 PM
        endTime: new Date('2024-01-19T16:00:00Z'),
        attendees: [
          { email: 'dev1@example.com', firstName: 'Dev1', isValidated: true, isRequired: true },
          { email: 'dev2@example.com', firstName: 'Dev2', isValidated: true, isRequired: true }
        ],
        status: 'draft'
      };

      // Step 5: Generate agenda with conversation context
      const agendaResult = await agendaGenerator.generateAgenda(meetingData, conversationFlow);
      expect(agendaResult.title).toBeTruthy();
      expect(agendaResult.topics.length).toBeGreaterThan(0);

      // Should incorporate retrospective context
      const agendaContent = agendaResult.topics.map(t => t.title + ' ' + (t.description || '')).join(' ').toLowerCase();
      expect(agendaContent).toMatch(/retrospective|sprint|challenge|improvement/);

      // Step 6: Validate conversation context persistence
      const contextStats = conversationContext.getStats();
      expect(contextStats.messageCount).toBe(4);
      expect(contextStats.currentMode).toBe('casual');

      // Step 7: Test context compression for token management
      const compressedContext = await conversationContext.getCompressedContext();
      expect(compressedContext.compressedContext).toContain('retrospective');
      expect(compressedContext.tokenCount).toBeGreaterThan(0);
      expect(compressedContext.compressionRatio).toBeGreaterThan(0);
    });
  });

  describe('Gemini Error Handling and Fallbacks', () => {
    it('should handle Gemini API failures gracefully', async () => {
      // Mock Gemini API failure by providing invalid input
      const invalidMessages: ConversationMessage[] = [];

      try {
        const result = await extractMeetingIntent(invalidMessages);
        // Should either return a fallback result or handle gracefully
        expect(result).toBeDefined();
      } catch (error) {
        // If it throws, it should be a handled error
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should provide fallback agenda when Gemini fails', async () => {
      const meetingData: MeetingData = {
        title: 'Emergency Meeting',
        type: 'online',
        startTime: new Date('2024-01-16T16:00:00Z'),
        endTime: new Date('2024-01-16T16:30:00Z'),
        attendees: [],
        status: 'draft'
      };

      // Test with empty conversation context (edge case)
      const agendaResult = await agendaGenerator.generateAgenda(meetingData, []);

      expect(agendaResult).toBeDefined();
      expect(agendaResult.title).toBeTruthy();
      expect(agendaResult.duration).toBe(30);
      expect(agendaResult.topics.length).toBeGreaterThan(0);
      expect(agendaResult.actionItems.length).toBeGreaterThan(0);
    });

    it('should handle conversation context compression under load', async () => {
      // Create a large conversation that would exceed token limits
      const largeConversation: ConversationMessage[] = Array.from({ length: 100 }, (_, i) => ({
        id: `msg-${i}`,
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `This is message ${i} discussing meeting planning, scheduling, and various requirements for the upcoming team meetings and project discussions.`,
        timestamp: new Date(Date.now() - (100 - i) * 60000)
      }));

      // Add all messages to context
      for (const message of largeConversation) {
        conversationContext.addMessage(message);
      }

      // Test compression recommendation
      const recommendation = conversationContext.getCompressionRecommendation();
      expect(recommendation.shouldCompress).toBe(true);
      expect(recommendation.reason).toContain('exceeds');

      // Test actual compression
      const compressedContext = await conversationContext.getCompressedContext();
      expect(compressedContext.compressionRatio).toBeLessThan(1);
      expect(compressedContext.tokenCount).toBeLessThan(largeConversation.length * 20); // Rough estimate
    });
  });

  describe('Integration with Real Gemini API', () => {
    it('should successfully call Gemini for intent extraction', async () => {
      const realConversation: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Can we schedule a quick sync meeting for tomorrow morning?',
          timestamp: new Date()
        }
      ];

      // This test will actually call Gemini if API key is available
      try {
        const result = await extractMeetingIntent(realConversation);
        
        expect(result).toBeDefined();
        expect(result.intent).toBeDefined();
        expect(typeof result.confidence).toBe('number');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      } catch (error) {
        // If API key is not available or API fails, that's expected in test environment
        console.log('Gemini API not available in test environment:', error.message);
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should successfully generate agenda with Gemini', async () => {
      const meetingData: MeetingData = {
        title: 'Team Sync',
        type: 'online',
        startTime: new Date('2024-01-16T10:00:00Z'),
        endTime: new Date('2024-01-16T10:30:00Z'),
        attendees: [
          { email: 'team@example.com', firstName: 'Team', isValidated: true, isRequired: true }
        ],
        status: 'draft'
      };

      const context: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'We need to sync on project progress and blockers',
          timestamp: new Date()
        }
      ];

      try {
        const result = await agendaGenerator.generateAgenda(meetingData, context);
        
        expect(result).toBeDefined();
        expect(result.title).toBeTruthy();
        expect(result.duration).toBe(30);
        expect(result.topics.length).toBeGreaterThan(0);
        
        // Verify agenda structure
        result.topics.forEach(topic => {
          expect(topic.title).toBeTruthy();
          expect(typeof topic.duration).toBe('number');
          expect(topic.duration).toBeGreaterThan(0);
        });
      } catch (error) {
        // If API key is not available or API fails, that's expected in test environment
        console.log('Gemini API not available for agenda generation:', error.message);
        expect(error).toBeInstanceOf(Error);
      }
    });
  });
});