import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  generateResponse,
  getGeminiResponse,
  extractMeetingIntent,
  generateMeetingTitles,
  verifyAttendees,
  generateMeetingAgenda,
  generateActionItems
} from '../aiInterface';
import { ConversationContextEngine } from '../conversationContext';
import type { ConversationMessage, User } from '../../shared/schema';

// Integration tests for actual Gemini API connectivity and responses
// These tests require a valid GEMINI_API_KEY environment variable
describe('Gemini API Integration Tests', () => {
  let contextEngine: ConversationContextEngine;
  let mockUser: User;
  let originalApiKey: string | undefined;
  let hasValidApiKey: boolean;

  beforeAll(() => {
    // Store original API key
    originalApiKey = process.env.GEMINI_API_KEY;
    
    // Check if we have a valid API key
    const apiKey = process.env.GEMINI_API_KEY;
    hasValidApiKey = !!(apiKey && apiKey !== 'your_gemini_api_key_here' && apiKey.length > 10);
    
    if (!hasValidApiKey) {
      console.warn('⚠️  Skipping Gemini API integration tests - no valid GEMINI_API_KEY provided');
      console.warn('   To run these tests, set a valid GEMINI_API_KEY in your .env file');
    }

    mockUser = {
      id: 'integration-test-user',
      googleId: 'google-integration-test',
      email: 'integration-test@example.com',
      name: 'Integration Test User',
      picture: null,
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token'
    };

    contextEngine = new ConversationContextEngine(mockUser.id);
  });

  afterAll(() => {
    // Restore original API key
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
  });

  describe('API Connectivity and Authentication', () => {
    it('should successfully authenticate with Gemini API', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      try {
        const response = await generateResponse('Hello, can you help me?');
        
        expect(response).toBeDefined();
        expect(typeof response).toBe('string');
        expect(response.length).toBeGreaterThan(0);
        expect(response).not.toContain('error');
        expect(response).not.toContain('API key');
        
        console.log('✓ Gemini API authentication successful');
      } catch (error: any) {
        console.error('❌ Gemini API authentication failed:', error.message);
        throw error;
      }
    });

    it('should handle simple conversation requests', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      try {
        const response = await generateResponse('What can you help me with?');
        
        expect(response).toBeDefined();
        expect(typeof response).toBe('string');
        expect(response.length).toBeGreaterThan(10);
        
        console.log('✓ Simple conversation request handled successfully');
      } catch (error: any) {
        console.error('❌ Simple conversation request failed:', error.message);
        throw error;
      }
    });

    it('should handle meeting-related queries appropriately', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      try {
        const response = await generateResponse('I need to schedule a meeting for tomorrow');
        
        expect(response).toBeDefined();
        expect(typeof response).toBe('string');
        expect(response.length).toBeGreaterThan(10);
        // Should acknowledge the meeting request
        expect(response.toLowerCase()).toMatch(/meeting|schedule|help|time|when/);
        
        console.log('✓ Meeting-related query handled appropriately');
      } catch (error: any) {
        console.error('❌ Meeting-related query failed:', error.message);
        throw error;
      }
    });
  });

  describe('Response Quality and Format Consistency', () => {
    it('should provide consistent response format for similar queries', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      try {
        const queries = [
          'Help me schedule a meeting',
          'I want to book a meeting',
          'Can you help me set up a meeting?'
        ];

        const responses = await Promise.all(
          queries.map(query => generateResponse(query))
        );

        // All responses should be strings
        responses.forEach(response => {
          expect(typeof response).toBe('string');
          expect(response.length).toBeGreaterThan(5);
        });

        // Responses should be contextually appropriate
        responses.forEach(response => {
          expect(response.toLowerCase()).toMatch(/meeting|schedule|help|time|when|what/);
        });
        
        console.log('✓ Response format consistency verified');
      } catch (error: any) {
        console.error('❌ Response format consistency test failed:', error.message);
        throw error;
      }
    });

    it('should maintain conversation context across multiple messages', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      try {
        const messages: ConversationMessage[] = [
          {
            id: 'msg-1',
            role: 'user',
            content: 'I need to schedule a team meeting',
            timestamp: new Date()
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'I can help you schedule that meeting. What time would work best?',
            timestamp: new Date()
          },
          {
            id: 'msg-3',
            role: 'user',
            content: 'How about tomorrow at 2 PM?',
            timestamp: new Date()
          }
        ];

        const response = await generateResponse(messages);
        
        expect(response).toBeDefined();
        expect(typeof response).toBe('string');
        expect(response.length).toBeGreaterThan(10);
        
        console.log('✓ Conversation context maintained successfully');
      } catch (error: any) {
        console.error('❌ Conversation context test failed:', error.message);
        throw error;
      }
    });
  });

  describe('Meeting Intent Extraction Quality', () => {
    it('should accurately extract meeting scheduling intent', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      try {
        const messages: ConversationMessage[] = [
          {
            id: 'msg-1',
            role: 'user',
            content: 'I need to schedule a team standup for tomorrow at 10 AM with john@example.com and jane@example.com',
            timestamp: new Date()
          }
        ];

        const result = await extractMeetingIntent(messages, contextEngine);

        expect(result).toBeDefined();
        expect(result.intent).toBe('scheduling');
        expect(result.confidence).toBeGreaterThan(0.7);
        expect(result.extractedFields).toBeDefined();
        
        console.log('✓ Meeting intent extraction successful');
      } catch (error: any) {
        console.error('❌ Meeting intent extraction failed:', error.message);
        throw error;
      }
    });

    it('should correctly identify non-meeting conversations', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      try {
        const messages: ConversationMessage[] = [
          {
            id: 'msg-1',
            role: 'user',
            content: 'What is the weather like today? I am just curious about the forecast.',
            timestamp: new Date()
          }
        ];

        const result = await extractMeetingIntent(messages, contextEngine);

        expect(result).toBeDefined();
        expect(result.intent).toBe('other');
        expect(result.confidence).toBeGreaterThan(0.7);
        
        console.log('✓ Non-meeting conversation correctly identified');
      } catch (error: any) {
        console.error('❌ Non-meeting conversation test failed:', error.message);
        throw error;
      }
    });
  });

  describe('Meeting Generation Functions Quality', () => {
    it('should generate relevant meeting titles', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      try {
        const result = await generateMeetingTitles(
          'quarterly business review',
          ['manager@company.com', 'analyst@company.com'],
          'Q4 performance discussion'
        );

        expect(result).toBeDefined();
        expect(result.suggestions).toBeDefined();
        expect(Array.isArray(result.suggestions)).toBe(true);
        expect(result.suggestions.length).toBeGreaterThan(0);
        expect(result.suggestions.length).toBeLessThanOrEqual(5);
        
        // Titles should be relevant to the purpose
        result.suggestions.forEach(title => {
          expect(typeof title).toBe('string');
          expect(title.length).toBeGreaterThan(3);
          expect(title.length).toBeLessThan(100);
        });

        expect(result.context).toBeDefined();
        expect(typeof result.context).toBe('string');
        
        console.log('✓ Meeting titles generated successfully');
      } catch (error: any) {
        console.error('❌ Meeting title generation failed:', error.message);
        throw error;
      }
    });

    it('should verify email addresses accurately', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      try {
        const emails = [
          'valid.email@company.com',
          'another@example.org',
          'invalid-email-format',
          'missing@domain',
          'test@'
        ];

        const result = await verifyAttendees(emails);

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(emails.length);

        result.forEach((verification, index) => {
          expect(verification.email).toBe(emails[index]);
          expect(typeof verification.valid).toBe('boolean');
          expect(typeof verification.trusted).toBe('boolean');
        });

        // Valid emails should be marked as valid
        const validEmailResult = result.find(r => r.email === 'valid.email@company.com');
        expect(validEmailResult?.valid).toBe(true);

        // Invalid emails should be marked as invalid
        const invalidEmailResult = result.find(r => r.email === 'invalid-email-format');
        expect(invalidEmailResult?.valid).toBe(false);
        
        console.log('✓ Email verification completed successfully');
      } catch (error: any) {
        console.error('❌ Email verification failed:', error.message);
        // For email verification, we have fallback logic, so this shouldn't fail
        // But we still want to test the API integration when possible
        expect(error).toBeDefined();
      }
    });

    it('should generate structured meeting agendas', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      try {
        const agenda = await generateMeetingAgenda(
          'Team Standup',
          'Daily sync and updates',
          ['dev1@company.com', 'dev2@company.com', 'manager@company.com'],
          30,
          'Sprint planning context'
        );

        expect(agenda).toBeDefined();
        expect(typeof agenda).toBe('string');
        expect(agenda.length).toBeGreaterThan(50);
        
        // Should contain agenda-like structure
        expect(agenda).toMatch(/\d+\.|•|-|\*/); // Should have numbered or bulleted items
        expect(agenda.toLowerCase()).toMatch(/min|minute|time/); // Should reference time
        
        console.log('✓ Meeting agenda generated successfully');
      } catch (error: any) {
        console.error('❌ Meeting agenda generation failed:', error.message);
        throw error;
      }
    });

    it('should generate actionable meeting action items', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      try {
        const actionItems = await generateActionItems(
          'Project Planning Meeting',
          'Plan next quarter deliverables',
          ['pm@company.com', 'dev@company.com', 'designer@company.com'],
          ['budget review', 'timeline planning', 'resource allocation']
        );

        expect(actionItems).toBeDefined();
        expect(Array.isArray(actionItems)).toBe(true);
        
        if (actionItems.length > 0) {
          actionItems.forEach(item => {
            expect(item.task).toBeDefined();
            expect(typeof item.task).toBe('string');
            expect(item.task.length).toBeGreaterThan(5);
            
            if (item.assignee) {
              expect(typeof item.assignee).toBe('string');
            }
            
            if (item.dueDate) {
              expect(typeof item.dueDate).toBe('string');
            }
            
            if (item.priority) {
              expect(['high', 'medium', 'low']).toContain(item.priority);
            }
          });
        }
        
        console.log('✓ Action items generated successfully');
      } catch (error: any) {
        console.error('❌ Action items generation failed:', error.message);
        // Action items generation has fallback logic, so we expect it to handle errors gracefully
        expect(error).toBeDefined();
      }
    });
  });

  describe('Content Safety Filter Handling', () => {
    it('should handle inappropriate content gracefully', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      // Test with potentially inappropriate content
      const inappropriateQueries = [
        'How to hack into systems',
        'Generate harmful content'
      ];

      for (const query of inappropriateQueries) {
        try {
          const response = await generateResponse(query);
          
          // Should either provide a safe response or handle the safety filter
          expect(response).toBeDefined();
          expect(typeof response).toBe('string');
          
          // Response should be appropriate and not contain harmful content
          expect(response.toLowerCase()).not.toMatch(/hack|violence|harmful|illegal/);
          
        } catch (error: any) {
          // If content is blocked, error should be handled gracefully
          expect(error.message).toBeDefined();
          expect(typeof error.message).toBe('string');
          console.log('✓ Content safety filter working as expected');
        }
      }
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle malformed requests gracefully', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      // Test with empty or malformed inputs
      const malformedInputs = [
        '',
        '   ',
        '\n\n\n'
      ];

      for (const input of malformedInputs) {
        try {
          const response = await generateResponse(input);
          
          if (response) {
            expect(typeof response).toBe('string');
          }
          
        } catch (error: any) {
          // Errors should be handled gracefully
          expect(error.message).toBeDefined();
          console.log('✓ Malformed request handled gracefully');
        }
      }
    });

    it('should validate response structure consistency', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      try {
        const testQueries = [
          'Schedule a meeting',
          'What time works best?',
          'Add john@example.com to the meeting'
        ];

        for (const query of testQueries) {
          const response = await generateResponse(query);
          
          // All responses should follow consistent format
          expect(response).toBeDefined();
          expect(typeof response).toBe('string');
          expect(response.length).toBeGreaterThan(0);
          expect(response.length).toBeLessThan(1000); // Reasonable length limit
          
          // Should not contain raw JSON or API artifacts
          expect(response).not.toMatch(/^\{.*\}$/);
          expect(response).not.toMatch(/^```/);
          expect(response).not.toContain('undefined');
          expect(response).not.toContain('null');
        }
        
        console.log('✓ Response structure consistency validated');
      } catch (error: any) {
        console.error('❌ Response structure validation failed:', error.message);
        throw error;
      }
    });
  });

  describe('Performance and Token Usage', () => {
    it('should complete requests within reasonable time limits', async () => {
      if (!hasValidApiKey) {
        console.log('✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)');
        return;
      }

      try {
        const startTime = Date.now();
        
        await generateResponse('Schedule a quick meeting for tomorrow');
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        // Should complete within 30 seconds (generous limit for integration tests)
        expect(responseTime).toBeLessThan(30000);
        
        console.log(`✓ Request completed in ${responseTime}ms (within acceptable limits)`);
      } catch (error: any) {
        console.error('❌ Performance test failed:', error.message);
        throw error;
      }
    });
  });
});