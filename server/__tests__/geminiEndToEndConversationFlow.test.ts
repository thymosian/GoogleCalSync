import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { MeetingWorkflowOrchestrator } from '../meetingWorkflowOrchestrator';
import { ConversationContextEngine } from '../conversationContext';
import { BusinessRulesEngine } from '../businessRules';
import { AttendeeValidator } from '../attendeeValidator';
import { AgendaGenerator } from '../agendaGenerator';
import { extractMeetingIntent, generateMeetingTitles, generateMeetingAgenda } from '../aiInterface';
import type { ConversationMessage, User, MeetingData } from '../../shared/schema';

// Mock all dependencies
vi.mock('../conversationContext');
vi.mock('../businessRules');
vi.mock('../attendeeValidator');
vi.mock('../agendaGenerator');
vi.mock('../gemini');
vi.mock('../googleCalendar');
vi.mock('../gmailService');
vi.mock('../storage');

describe('Gemini End-to-End Conversation Flows', () => {
  let orchestrator: MeetingWorkflowOrchestrator;
  let mockContextEngine: any;
  let mockBusinessRules: any;
  let mockAttendeeValidator: any;
  let mockAgendaGenerator: any;
  let mockUser: User;

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

    // Mock ConversationContextEngine with all required methods
    mockContextEngine = {
      addMessage: vi.fn(),
      getMessages: vi.fn().mockReturnValue([]),
      getCompressedContext: vi.fn().mockReturnValue({
        compressedContext: 'User wants to schedule a team meeting for tomorrow',
        tokenCount: 100,
        compressionRatio: 0.8
      }),
      updateMeetingData: vi.fn(),
      getCurrentMode: vi.fn().mockReturnValue('casual'),
      setMode: vi.fn(),
      getMeetingData: vi.fn().mockReturnValue(undefined),
      getConversationId: vi.fn().mockReturnValue('session-123'),
      getContextData: vi.fn().mockReturnValue({
        meetingData: undefined,
        conversationMode: 'casual',
        lastActivity: new Date(),
        messageCount: 0
      }),
      saveContext: vi.fn().mockResolvedValue(undefined)
    };

    // Mock BusinessRulesEngine
    mockBusinessRules = {
      validateMeeting: vi.fn().mockReturnValue({
        isValid: true,
        errors: [],
        warnings: []
      }),
      validateMeetingType: vi.fn().mockReturnValue({
        isValid: true,
        errors: [],
        warnings: []
      }),
      enforceAttendeeRequirement: vi.fn().mockReturnValue(true),
      validateAttendees: vi.fn().mockReturnValue({
        isValid: true,
        errors: [],
        warnings: []
      })
    };

    // Mock AttendeeValidator
    mockAttendeeValidator = {
      validateEmail: vi.fn().mockResolvedValue({
        email: 'john@example.com',
        isValid: true,
        exists: true,
        firstName: 'John',
        isGoogleUser: true
      }),
      validateBatch: vi.fn().mockResolvedValue([
        {
          email: 'john@example.com',
          isValid: true,
          exists: true,
          firstName: 'John',
          isGoogleUser: true
        },
        {
          email: 'jane@example.com',
          isValid: true,
          exists: true,
          firstName: 'Jane',
          isGoogleUser: true
        }
      ])
    };

    // Mock AgendaGenerator
    mockAgendaGenerator = {
      generateAgenda: vi.fn().mockResolvedValue({
        title: 'Team Meeting Agenda',
        duration: 60,
        topics: [
          { title: 'Welcome & Introductions', duration: 10, description: 'Team introductions' },
          { title: 'Project Updates', duration: 30, description: 'Current project status' },
          { title: 'Action Items', duration: 20, description: 'Next steps and assignments' }
        ],
        actionItems: [
          { task: 'Follow up on project milestones', priority: 'high' as const, assignee: 'Team Lead' }
        ]
      }),
      formatAgenda: vi.fn().mockReturnValue(`# Team Meeting Agenda

## Meeting Details
- **Duration:** 60 minutes
- **Type:** Online Meeting

## Agenda Items
1. **Welcome & Introductions** (10 min)
2. **Project Updates** (30 min)
3. **Action Items** (20 min)

## Action Items
- Follow up on project milestones [HIGH]
`)
    };

    // Mock constructors
    (ConversationContextEngine as Mock).mockImplementation(() => mockContextEngine);
    (BusinessRulesEngine as Mock).mockImplementation(() => mockBusinessRules);
    (AttendeeValidator as Mock).mockImplementation(() => mockAttendeeValidator);
    (AgendaGenerator as Mock).mockImplementation(() => mockAgendaGenerator);

    orchestrator = new MeetingWorkflowOrchestrator(
      mockContextEngine,
      mockBusinessRules,
      mockAttendeeValidator,
      mockUser
    );
  });

  describe('Complete Meeting Scheduling Workflow with Gemini', () => {
    it('should handle complete meeting scheduling conversation flow using Gemini', async () => {
      // Step 1: Initial scheduling intent with Gemini extraction
      const initialMessage: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'I need to schedule a team standup for tomorrow at 9 AM with the development team',
        timestamp: new Date()
      };

      // Mock Gemini intent extraction
      (extractMeetingIntent as Mock).mockResolvedValue({
        intent: 'scheduling',
        confidence: 0.92,
        extractedFields: {
          title: 'Team Standup',
          startTime: new Date('2024-01-16T09:00:00Z'),
          type: 'online',
          attendees: ['development team']
        },
        missingFields: ['endTime', 'specific_attendees']
      });

      let response = await orchestrator.processMessage(initialMessage);
      
      // Verify Gemini was called for intent extraction
      expect(extractMeetingIntent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: 'I need to schedule a team standup for tomorrow at 9 AM with the development team'
          })
        ])
      );

      expect(response.nextStep).toBe('meeting_type_selection');
      expect(mockContextEngine.addMessage).toHaveBeenCalledWith(initialMessage);

      // Step 2: Meeting type confirmation (auto-detected as online)
      response = await orchestrator.advanceToStep('attendee_collection', {
        type: 'online',
        title: 'Team Standup',
        startTime: new Date('2024-01-16T09:00:00Z')
      });

      expect(response.nextStep).toBe('attendee_collection');
      expect(response.uiBlock?.type).toBe('attendee_management');

      // Step 3: Add specific attendees
      const attendeeMessage: ConversationMessage = {
        id: 'msg-2',
        role: 'user',
        content: 'Add john@example.com, jane@example.com, and bob@example.com',
        timestamp: new Date()
      };

      // Update meeting data with validated attendees
      mockContextEngine.getMeetingData.mockReturnValue({
        type: 'online',
        title: 'Team Standup',
        startTime: new Date('2024-01-16T09:00:00Z'),
        attendees: [
          { email: 'john@example.com', firstName: 'John', isValidated: true, isRequired: true },
          { email: 'jane@example.com', firstName: 'Jane', isValidated: true, isRequired: true },
          { email: 'bob@example.com', firstName: 'Bob', isValidated: true, isRequired: true }
        ]
      });

      response = await orchestrator.processMessage(attendeeMessage);
      expect(response.nextStep).toBe('meeting_details_collection');

      // Verify attendee validation was called
      expect(mockAttendeeValidator.validateBatch).toHaveBeenCalled();

      // Step 4: Complete meeting details with duration
      response = await orchestrator.advanceToStep('validation', {
        endTime: new Date('2024-01-16T09:15:00Z') // 15-minute standup
      });

      expect(response.nextStep).toBe('validation');

      // Step 5: Validation passes, move to agenda generation using Gemini
      (generateMeetingAgenda as Mock).mockResolvedValue(`# Daily Standup Agenda

## Meeting Details
- **Duration:** 15 minutes
- **Type:** Online Meeting

## Agenda Items
1. **Yesterday's Progress** (5 min)
   - What did you accomplish yesterday?
2. **Today's Goals** (5 min)
   - What will you work on today?
3. **Blockers & Impediments** (5 min)
   - Any obstacles or help needed?

## Action Items
- Address any blockers identified
- Follow up on dependencies
`);

      response = await orchestrator.advanceToStep('agenda_generation');
      expect(response.nextStep).toBe('agenda_approval');
      expect(response.uiBlock?.type).toBe('agenda_editor');

      // Verify Gemini was used for agenda generation
      expect(generateMeetingAgenda).toHaveBeenCalled();

      // Step 6: Approve agenda
      const approvedAgenda = `# Daily Standup Agenda

## Meeting Details
- **Duration:** 15 minutes
- **Type:** Online Meeting

## Agenda Items
1. **Yesterday's Progress** (5 min)
2. **Today's Goals** (5 min)
3. **Blockers & Impediments** (5 min)

## Action Items
- Address any blockers identified
`;

      response = await orchestrator.approveAgenda(approvedAgenda);
      expect(response.nextStep).toBe('approval');

      // Step 7: Final approval and meeting creation
      response = await orchestrator.createApprovalWorkflow();
      expect(response.nextStep).toBe('approval');
      expect(response.uiBlock?.type).toBe('meeting_approval');

      // Verify the complete workflow maintained conversation context
      expect(mockContextEngine.getCompressedContext).toHaveBeenCalled();
      expect(mockContextEngine.updateMeetingData).toHaveBeenCalled();
    });

    it('should handle agenda generation with conversation context using Gemini', async () => {
      // Set up meeting data with conversation context
      const conversationMessages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'We need to discuss the Q4 budget planning and resource allocation',
          timestamp: new Date('2024-01-15T10:00:00Z')
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'I can help you schedule a meeting for budget planning. What time works best?',
          timestamp: new Date('2024-01-15T10:01:00Z')
        },
        {
          id: 'msg-3',
          role: 'user',
          content: 'Tomorrow at 2 PM would be perfect. We also need to review the current project status',
          timestamp: new Date('2024-01-15T10:02:00Z')
        }
      ];

      mockContextEngine.getMessages.mockReturnValue(conversationMessages);

      const meetingData: MeetingData = {
        title: 'Q4 Planning Meeting',
        type: 'online',
        startTime: new Date('2024-01-16T14:00:00Z'),
        endTime: new Date('2024-01-16T15:00:00Z'),
        attendees: [
          { email: 'manager@example.com', firstName: 'Manager', isValidated: true, isRequired: true },
          { email: 'lead@example.com', firstName: 'Lead', isValidated: true, isRequired: true }
        ],
        status: 'draft'
      };

      mockContextEngine.getMeetingData.mockReturnValue(meetingData);

      // Mock Gemini agenda generation with context awareness
      (generateMeetingAgenda as Mock).mockResolvedValue(`# Q4 Planning Meeting Agenda

## Meeting Details
- **Duration:** 60 minutes
- **Type:** Online Meeting

## Agenda Items
1. **Welcome & Objectives** (5 min)
2. **Q4 Budget Review** (25 min)
   - Current budget status
   - Resource allocation priorities
3. **Project Status Review** (20 min)
   - Current project progress
   - Resource requirements
4. **Action Items & Next Steps** (10 min)

## Action Items
- Finalize Q4 budget allocation [HIGH]
- Review resource requirements by department [MEDIUM]
- Schedule follow-up meetings with project leads [LOW]
`);

      // Generate agenda using conversation context
      response = await orchestrator.advanceToStep('agenda_generation');

      // Verify Gemini was called with conversation context
      expect(generateMeetingAgenda).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Q4 Planning Meeting',
          type: 'online'
        }),
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('Q4 budget planning')
          }),
          expect.objectContaining({
            content: expect.stringContaining('project status')
          })
        ])
      );

      expect(response.nextStep).toBe('agenda_approval');
      expect(response.uiBlock?.type).toBe('agenda_editor');
    });

    it('should handle attendee validation with conversation context', async () => {
      const attendeeMessage: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Add the entire marketing team - that\'s sarah@example.com, mike@example.com, and lisa@example.com',
        timestamp: new Date()
      };

      // Mock attendee validation with mixed results
      mockAttendeeValidator.validateBatch.mockResolvedValue([
        {
          email: 'sarah@example.com',
          isValid: true,
          exists: true,
          firstName: 'Sarah',
          lastName: 'Johnson',
          isGoogleUser: true
        },
        {
          email: 'mike@example.com',
          isValid: true,
          exists: true,
          firstName: 'Mike',
          lastName: 'Chen',
          isGoogleUser: true
        },
        {
          email: 'lisa@example.com',
          isValid: false,
          exists: false,
          isGoogleUser: false
        }
      ]);

      const response = await orchestrator.processMessage(attendeeMessage);

      // Verify attendee validation was called with extracted emails
      expect(mockAttendeeValidator.validateBatch).toHaveBeenCalledWith(
        expect.arrayContaining(['sarah@example.com', 'mike@example.com', 'lisa@example.com']),
        mockUser
      );

      // Should handle mixed validation results appropriately
      expect(response).toBeDefined();
      expect(mockContextEngine.addMessage).toHaveBeenCalledWith(attendeeMessage);
    });

    it('should maintain conversation context persistence throughout workflow', async () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'I need to schedule our weekly team retrospective',
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
          content: 'Friday at 3 PM works best. We need to discuss last sprint\'s challenges',
          timestamp: new Date('2024-01-15T09:02:00Z')
        },
        {
          id: 'msg-4',
          role: 'user',
          content: 'Also include the discussion about improving our deployment process',
          timestamp: new Date('2024-01-15T09:03:00Z')
        }
      ];

      // Process each message and verify context is maintained
      for (const message of messages) {
        await orchestrator.processMessage(message);
        expect(mockContextEngine.addMessage).toHaveBeenCalledWith(message);
      }

      // Verify context compression is used for token management
      expect(mockContextEngine.getCompressedContext).toHaveBeenCalled();

      // Verify conversation context is used in Gemini calls
      const compressedContext = mockContextEngine.getCompressedContext();
      expect(compressedContext.compressedContext).toContain('team meeting');
      expect(compressedContext.tokenCount).toBeGreaterThan(0);
      expect(compressedContext.compressionRatio).toBeGreaterThan(0);
    });
  });

  describe('Gemini Error Handling in Conversation Flows', () => {
    it('should handle Gemini API failures gracefully during intent extraction', async () => {
      // Mock Gemini API failure
      (extractMeetingIntent as Mock).mockRejectedValue(new Error('Gemini API unavailable'));

      const message: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Schedule a meeting for tomorrow',
        timestamp: new Date()
      };

      const response = await orchestrator.processMessage(message);

      // Should still provide a response with fallback behavior
      expect(response).toBeDefined();
      expect(response.nextStep).toBeDefined();
      expect(mockContextEngine.addMessage).toHaveBeenCalledWith(message);
    });

    it('should handle Gemini content safety filters during agenda generation', async () => {
      // Mock content safety filter error
      (generateMeetingAgenda as Mock).mockRejectedValue({
        name: 'GoogleGenerativeAIError',
        message: 'Content blocked by safety filters'
      });

      const meetingData: MeetingData = {
        title: 'Team Meeting',
        type: 'online',
        startTime: new Date('2024-01-16T10:00:00Z'),
        endTime: new Date('2024-01-16T11:00:00Z'),
        attendees: [],
        status: 'draft'
      };

      mockContextEngine.getMeetingData.mockReturnValue(meetingData);

      const response = await orchestrator.advanceToStep('agenda_generation');

      // Should handle safety filter gracefully and provide fallback
      expect(response).toBeDefined();
      expect(response.nextStep).toBe('agenda_approval');
      expect(mockAgendaGenerator.generateAgenda).toHaveBeenCalled();
    });

    it('should handle Gemini quota exceeded errors', async () => {
      // Mock quota exceeded error
      (extractMeetingIntent as Mock).mockRejectedValue({
        name: 'GoogleGenerativeAIError',
        message: 'Quota exceeded'
      });

      const message: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'I need to schedule a meeting',
        timestamp: new Date()
      };

      const response = await orchestrator.processMessage(message);

      // Should handle quota error gracefully
      expect(response).toBeDefined();
      expect(response.nextStep).toBeDefined();
      expect(mockContextEngine.addMessage).toHaveBeenCalledWith(message);
    });
  });

  describe('Conversation Context Integration with Gemini', () => {
    it('should use conversation history for better intent detection', async () => {
      const conversationHistory: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'We had a great discussion about the new product features',
          timestamp: new Date('2024-01-15T10:00:00Z')
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'That sounds productive! Is there anything specific you\'d like to follow up on?',
          timestamp: new Date('2024-01-15T10:01:00Z')
        },
        {
          id: 'msg-3',
          role: 'user',
          content: 'Yes, let\'s schedule a follow-up meeting to finalize the roadmap',
          timestamp: new Date('2024-01-15T10:02:00Z')
        }
      ];

      mockContextEngine.getMessages.mockReturnValue(conversationHistory);

      // Mock enhanced intent extraction with context
      (extractMeetingIntent as Mock).mockResolvedValue({
        intent: 'scheduling',
        confidence: 0.95, // Higher confidence due to context
        extractedFields: {
          title: 'Product Roadmap Follow-up',
          type: 'online',
          purpose: 'finalize product roadmap'
        },
        missingFields: ['startTime', 'endTime', 'attendees'],
        contextualInsights: {
          previousDiscussion: 'product features',
          followUpNature: 'roadmap finalization'
        }
      });

      const newMessage: ConversationMessage = {
        id: 'msg-4',
        role: 'user',
        content: 'Tomorrow at 2 PM would work',
        timestamp: new Date('2024-01-15T10:03:00Z')
      };

      const response = await orchestrator.processMessage(newMessage);

      // Verify Gemini was called with full conversation context
      expect(extractMeetingIntent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('product features')
          }),
          expect.objectContaining({
            content: expect.stringContaining('follow-up meeting')
          }),
          expect.objectContaining({
            content: expect.stringContaining('Tomorrow at 2 PM')
          })
        ])
      );

      expect(response).toBeDefined();
      expect(response.nextStep).toBeDefined();
    });

    it('should compress conversation context when token limit approaches', async () => {
      // Mock a long conversation that needs compression
      const longConversation = Array.from({ length: 50 }, (_, i) => ({
        id: `msg-${i}`,
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `Message ${i} with some content about meeting planning and scheduling`,
        timestamp: new Date(Date.now() - (50 - i) * 60000) // Messages from 50 minutes ago to now
      }));

      mockContextEngine.getMessages.mockReturnValue(longConversation);
      mockContextEngine.getCompressedContext.mockReturnValue({
        compressedContext: 'Extended conversation about meeting planning. User has been discussing various meeting requirements and scheduling preferences.',
        tokenCount: 150, // Compressed from much larger original
        compressionRatio: 0.3 // 70% compression
      });

      const newMessage: ConversationMessage = {
        id: 'msg-new',
        role: 'user',
        content: 'Let\'s finalize the meeting details',
        timestamp: new Date()
      };

      await orchestrator.processMessage(newMessage);

      // Verify compression was used
      expect(mockContextEngine.getCompressedContext).toHaveBeenCalled();

      // Verify Gemini received compressed context instead of full history
      expect(extractMeetingIntent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('finalize the meeting details')
          })
        ])
      );
    });
  });
});