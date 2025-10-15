import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { MeetingWorkflowOrchestrator } from '../meetingWorkflowOrchestrator';
import { ConversationContextEngine } from '../conversationContext';
import { BusinessRulesEngine } from '../businessRules';
import { AttendeeValidator } from '../attendeeValidator';
import { extractMeetingIntent } from '../aiInterface';
import type { ConversationMessage, User } from '../../shared/schema';

// Mock all dependencies
vi.mock('../conversationContext');
vi.mock('../businessRules');
vi.mock('../attendeeValidator');
vi.mock('../gemini');
vi.mock('../agendaGenerator');
vi.mock('../googleCalendar');
vi.mock('../gmailService');
vi.mock('../storage');

describe('End-to-End Meeting Creation Workflow', () => {
  let orchestrator: MeetingWorkflowOrchestrator;
  let mockContextEngine: any;
  let mockBusinessRules: any;
  let mockAttendeeValidator: any;
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

    // Mock ConversationContextEngine
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

    // Mock constructors
    (ConversationContextEngine as Mock).mockImplementation(() => mockContextEngine);
    (BusinessRulesEngine as Mock).mockImplementation(() => mockBusinessRules);
    (AttendeeValidator as Mock).mockImplementation(() => mockAttendeeValidator);

    orchestrator = new MeetingWorkflowOrchestrator(
      mockContextEngine,
      mockBusinessRules,
      mockAttendeeValidator,
      mockUser
    );
  });

  describe('Complete Online Meeting Creation Flow', () => {
    it('should handle complete online meeting creation workflow', async () => {
      // Step 1: Initial scheduling intent
      const initialMessage: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'I need to schedule a team meeting for tomorrow at 2 PM',
        timestamp: new Date()
      };

      // Mock intent extraction
      (extractMeetingIntent as Mock).mockResolvedValue({
        intent: 'scheduling',
        confidence: 0.9,
        extractedFields: {
          title: 'Team Meeting',
          startTime: new Date('2024-01-16T14:00:00Z'),
          type: 'online'
        },
        missingFields: ['endTime', 'attendees']
      });

      let response = await orchestrator.processMessage(initialMessage);
      expect(response.nextStep).toBe('meeting_type_selection');

      // Step 2: Meeting type selection (auto-detected as online)
      response = await orchestrator.advanceToStep('attendee_collection', {
        type: 'online',
        title: 'Team Meeting',
        startTime: new Date('2024-01-16T14:00:00Z')
      });

      expect(response.nextStep).toBe('attendee_collection');
      expect(response.uiBlock?.type).toBe('attendee_management');

      // Step 3: Add attendees
      const attendeeMessage: ConversationMessage = {
        id: 'msg-2',
        role: 'user',
        content: 'Add john@example.com and jane@example.com',
        timestamp: new Date()
      };

      // Update meeting data with attendees
      mockContextEngine.getMeetingData.mockReturnValue({
        type: 'online',
        title: 'Team Meeting',
        startTime: new Date('2024-01-16T14:00:00Z'),
        attendees: [
          { email: 'john@example.com', firstName: 'John', isValidated: true, isRequired: true },
          { email: 'jane@example.com', firstName: 'Jane', isValidated: true, isRequired: true }
        ]
      });

      response = await orchestrator.processMessage(attendeeMessage);
      expect(response.nextStep).toBe('meeting_details_collection');

      // Step 4: Complete meeting details
      response = await orchestrator.advanceToStep('validation', {
        endTime: new Date('2024-01-16T15:00:00Z') // 1 hour meeting
      });

      expect(response.nextStep).toBe('validation');

      // Step 5: Validation passes, move to agenda generation
      response = await orchestrator.advanceToStep('agenda_generation');
      expect(response.nextStep).toBe('agenda_approval');
      expect(response.uiBlock?.type).toBe('agenda_editor');

      // Step 6: Approve agenda
      const approvedAgenda = `# Team Meeting Agenda

## Meeting Details
- **Duration:** 60 minutes
- **Type:** Online Meeting

## Agenda Items
1. **Welcome & Introductions** (10 min)
2. **Project Updates** (30 min)
3. **Action Items** (20 min)

## Action Items
- Follow up on project milestones [HIGH]
`;

      response = await orchestrator.approveAgenda(approvedAgenda);
      expect(response.nextStep).toBe('approval');

      // Step 7: Final approval
      response = await orchestrator.createApprovalWorkflow();
      expect(response.nextStep).toBe('approval');
      expect(response.uiBlock?.type).toBe('meeting_approval');

      // Step 8: Create meeting
      // Mock successful calendar creation
      const mockCreateCalendarEvent = vi.fn().mockResolvedValue({
        id: 'calendar-event-123',
        googleEventId: 'google-event-123',
        title: 'Team Meeting',
        startTime: '2024-01-16T14:00:00Z',
        endTime: '2024-01-16T15:00:00Z',
        meetingLink: 'https://meet.google.com/team-meeting',
        attendees: ['john@example.com', 'jane@example.com'],
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event/123'
      });

      // Mock database storage
      const mockDb = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: 'stored-event-123',
              title: 'Team Meeting',
              meetingLink: 'https://meet.google.com/team-meeting'
            }])
          })
        })
      };

      vi.doMock('../googleCalendar', () => ({
        createCalendarEvent: mockCreateCalendarEvent
      }));

      vi.doMock('../storage', () => ({
        db: mockDb
      }));

      response = await orchestrator.handleMeetingCreation();

      expect(response.nextStep).toBe('completed');
      expect(response.message).toContain('Meeting created successfully');
      expect(response.message).toContain('Team Meeting');
      expect(response.message).toContain('https://meet.google.com/team-meeting');
      expect(orchestrator.getWorkflowState().isComplete).toBe(true);
    });

    it('should handle validation failures during workflow', async () => {
      // Set up invalid meeting data (online meeting without attendees)
      mockBusinessRules.validateMeeting.mockReturnValue({
        isValid: false,
        errors: ['Online meetings must have at least one attendee'],
        warnings: []
      });

      const response = await orchestrator.createApprovalWorkflow();

      expect(response.validationErrors).toContain('Online meetings must have at least one attendee');
      expect(response.message).toContain('Cannot proceed to approval');
      expect(response.requiresUserInput).toBe(true);
    });

    it('should handle attendee validation failures', async () => {
      mockAttendeeValidator.validateBatch.mockResolvedValue([
        {
          email: 'valid@example.com',
          isValid: true,
          exists: true,
          firstName: 'Valid',
          isGoogleUser: true
        },
        {
          email: 'invalid@example.com',
          isValid: false,
          exists: false,
          isGoogleUser: false
        }
      ]);

      const attendeeMessage: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Add valid@example.com and invalid@example.com',
        timestamp: new Date()
      };

      const response = await orchestrator.processMessage(attendeeMessage);

      // Should handle mixed validation results appropriately
      expect(response).toBeDefined();
    });
  });

  describe('Complete Physical Meeting Creation Flow', () => {
    it('should handle physical meeting creation workflow', async () => {
      // Step 1: Initial message for physical meeting
      const initialMessage: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Let\'s meet in the conference room tomorrow at 10 AM',
        timestamp: new Date()
      };

      // Mock intent extraction for physical meeting
      (extractMeetingIntent as Mock).mockResolvedValue({
        intent: 'scheduling',
        confidence: 0.85,
        extractedFields: {
          title: 'Meeting',
          startTime: new Date('2024-01-16T10:00:00Z'),
          type: 'physical',
          location: 'conference room'
        },
        missingFields: ['endTime']
      });

      let response = await orchestrator.processMessage(initialMessage);
      expect(response.nextStep).toBe('meeting_type_selection');

      // Step 2: Physical meeting type detected
      response = await orchestrator.advanceToStep('meeting_details_collection', {
        type: 'physical',
        location: 'Conference Room A',
        title: 'Team Meeting',
        startTime: new Date('2024-01-16T10:00:00Z')
      });

      expect(response.nextStep).toBe('meeting_details_collection');

      // Step 3: Complete meeting details
      response = await orchestrator.advanceToStep('validation', {
        endTime: new Date('2024-01-16T11:00:00Z')
      });

      // Step 4: Skip attendee collection for physical meeting (optional)
      response = await orchestrator.advanceToStep('agenda_generation');
      expect(response.nextStep).toBe('agenda_approval');

      // Step 5: Approve agenda
      const physicalMeetingAgenda = `# Team Meeting Agenda

## Meeting Details
- **Duration:** 60 minutes
- **Type:** Physical Meeting
- **Location:** Conference Room A

## Agenda Items
1. **Welcome** (5 min)
2. **Discussion** (50 min)
3. **Wrap-up** (5 min)
`;

      response = await orchestrator.approveAgenda(physicalMeetingAgenda);
      expect(response.nextStep).toBe('approval');

      // Step 6: Create physical meeting
      const mockCreateCalendarEvent = vi.fn().mockResolvedValue({
        id: 'physical-event-123',
        googleEventId: 'google-physical-123',
        title: 'Team Meeting',
        startTime: '2024-01-16T10:00:00Z',
        endTime: '2024-01-16T11:00:00Z',
        location: 'Conference Room A',
        meetingLink: undefined, // No meeting link for physical meetings
        attendees: [],
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event/physical'
      });

      const mockDb = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: 'stored-physical-123',
              title: 'Team Meeting',
              location: 'Conference Room A'
            }])
          })
        })
      };

      vi.doMock('../googleCalendar', () => ({
        createCalendarEvent: mockCreateCalendarEvent
      }));

      vi.doMock('../storage', () => ({
        db: mockDb
      }));

      response = await orchestrator.handleMeetingCreation();

      expect(response.nextStep).toBe('completed');
      expect(response.message).toContain('Meeting created successfully');
      expect(response.message).toContain('Conference Room A');
      expect(response.message).not.toContain('Meeting Link');
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('should handle AI service failures gracefully', async () => {
      // Mock AI service failure
      (extractMeetingIntent as Mock).mockRejectedValue(new Error('AI service unavailable'));

      const message: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Schedule a meeting',
        timestamp: new Date()
      };

      const response = await orchestrator.processMessage(message);

      // Should still provide a response, possibly with fallback behavior
      expect(response).toBeDefined();
      expect(response.nextStep).toBeDefined();
    });

    it('should handle calendar creation failures', async () => {
      // Set up complete meeting data
      const state = orchestrator.getWorkflowState();
      state.meetingData = {
        title: 'Test Meeting',
        type: 'online',
        startTime: new Date('2024-01-16T10:00:00Z'),
        endTime: new Date('2024-01-16T11:00:00Z'),
        attendees: [
          { email: 'test@example.com', firstName: 'Test', isValidated: true, isRequired: true }
        ],
        agenda: 'Test agenda',
        status: 'approved'
      };

      // Mock calendar creation failure
      const mockCreateCalendarEvent = vi.fn().mockRejectedValue(
        new Error('Calendar API quota exceeded')
      );

      vi.doMock('../googleCalendar', () => ({
        createCalendarEvent: mockCreateCalendarEvent
      }));

      const response = await orchestrator.handleMeetingCreation();

      expect(response.nextStep).toBe('creation');
      expect(response.requiresUserInput).toBe(true);
      expect(response.message).toContain('Failed to create meeting');
      expect(response.validationErrors).toContain('Calendar API quota exceeded');
    });

    it('should handle workflow state corruption', async () => {
      // Corrupt the workflow state
      (orchestrator as any).workflowState = {
        currentStep: 'invalid_step',
        meetingData: null,
        validationResults: [],
        pendingActions: [],
        isComplete: false,
        errors: []
      };

      const message: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Continue with meeting',
        timestamp: new Date()
      };

      // Should handle corrupted state gracefully
      const response = await orchestrator.processMessage(message);
      expect(response).toBeDefined();
    });

    it('should handle concurrent workflow modifications', async () => {
      // Simulate concurrent access to workflow state
      const message1: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Schedule meeting',
        timestamp: new Date()
      };

      const message2: ConversationMessage = {
        id: 'msg-2',
        role: 'user',
        content: 'Cancel that',
        timestamp: new Date()
      };

      // Process messages concurrently
      const [response1, response2] = await Promise.all([
        orchestrator.processMessage(message1),
        orchestrator.processMessage(message2)
      ]);

      // Both should complete without errors
      expect(response1).toBeDefined();
      expect(response2).toBeDefined();
    });
  });

  describe('Workflow State Persistence', () => {
    it('should persist workflow state across steps', async () => {
      // Start workflow
      const initialMessage: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Schedule a meeting',
        timestamp: new Date()
      };

      await orchestrator.processMessage(initialMessage);

      // Advance through multiple steps
      await orchestrator.advanceToStep('meeting_type_selection', { type: 'online' });
      await orchestrator.advanceToStep('attendee_collection', {
        attendees: [{ email: 'test@example.com', isValidated: true, isRequired: true }]
      });

      const finalState = orchestrator.getWorkflowState();

      expect(finalState.meetingData.type).toBe('online');
      expect(finalState.meetingData.attendees).toHaveLength(1);
      expect(finalState.currentStep).toBe('attendee_collection');
    });

    it('should maintain conversation context throughout workflow', async () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'I need to schedule a team standup',
          timestamp: new Date()
        },
        {
          id: 'msg-2',
          role: 'user',
          content: 'Make it for tomorrow at 9 AM',
          timestamp: new Date()
        },
        {
          id: 'msg-3',
          role: 'user',
          content: 'Add the whole development team',
          timestamp: new Date()
        }
      ];

      for (const message of messages) {
        await orchestrator.processMessage(message);
        expect(mockContextEngine.addMessage).toHaveBeenCalledWith(message);
      }

      // Context should be maintained and used for decision making
      expect(mockContextEngine.getCompressedContext).toHaveBeenCalled();
    });
  });
});