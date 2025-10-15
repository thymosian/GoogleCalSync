import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingWorkflowOrchestrator } from '../meetingWorkflowOrchestrator';
import { ConversationContextEngine } from '../conversationContext';
import { BusinessRulesEngine } from '../businessRules';
import { AttendeeValidator } from '../attendeeValidator';
import type { User, MeetingData } from '../../shared/schema';

// Mock the Google Calendar module
vi.mock('../googleCalendar', () => ({
  createCalendarEvent: vi.fn().mockResolvedValue({
    id: 'test-event-id',
    googleEventId: 'google-event-id',
    title: 'Test Meeting',
    description: 'Test meeting description',
    startTime: '2024-01-15T10:00:00Z',
    endTime: '2024-01-15T11:00:00Z',
    meetingLink: 'https://meet.google.com/test-link',
    attendees: ['test@example.com'],
    status: 'confirmed',
    htmlLink: 'https://calendar.google.com/event/test'
  })
}));

// Mock the database
vi.mock('../storage', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: 'stored-event-id',
          googleEventId: 'google-event-id',
          title: 'Test Meeting',
          userId: 'test-user-id',
          startTime: new Date('2024-01-15T10:00:00Z'),
          endTime: new Date('2024-01-15T11:00:00Z'),
          meetingLink: 'https://meet.google.com/test-link',
          attendees: ['test@example.com'],
          agenda: 'Test agenda'
        }])
      })
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined)
      })
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([])
        })
      })
    })
  }
}));

describe('Google Calendar Integration', () => {
  let orchestrator: MeetingWorkflowOrchestrator;
  let mockUser: User;
  let mockContextEngine: ConversationContextEngine;
  let mockBusinessRules: BusinessRulesEngine;
  let mockAttendeeValidator: AttendeeValidator;

  beforeEach(() => {
    mockUser = {
      id: 'test-user-id',
      googleId: 'google-123',
      email: 'test@example.com',
      name: 'Test User',
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      picture: null
    };

    mockContextEngine = {
      getConversationId: vi.fn().mockReturnValue('test-conversation-id'),
      addMessage: vi.fn(),
      getCompressedContext: vi.fn().mockReturnValue({
        compressedContext: 'test context',
        tokenCount: 100,
        compressionRatio: 0.5
      }),
      updateMeetingData: vi.fn(),
      saveContext: vi.fn()
    } as any;

    mockBusinessRules = {
      validateMeeting: vi.fn().mockReturnValue({
        isValid: true,
        errors: [],
        warnings: []
      }),
      validateAttendees: vi.fn().mockReturnValue({
        isValid: true,
        errors: [],
        warnings: []
      })
    } as any;

    mockAttendeeValidator = {
      validateEmail: vi.fn(),
      validateBatch: vi.fn()
    } as any;

    orchestrator = new MeetingWorkflowOrchestrator(
      mockContextEngine,
      mockBusinessRules,
      mockAttendeeValidator,
      mockUser
    );
  });

  describe('handleMeetingCreation', () => {
    it('should create meeting in Google Calendar and store in database', async () => {
      // Set up meeting data
      const meetingData: Partial<MeetingData> = {
        title: 'Test Meeting',
        type: 'online',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
        attendees: [
          { email: 'test@example.com', firstName: 'Test', isValidated: true, isRequired: true }
        ],
        agenda: 'Test agenda',
        status: 'approved'
      };

      // Set workflow state
      (orchestrator as any).workflowState = {
        currentStep: 'creation',
        meetingData,
        validationResults: [],
        pendingActions: [],
        isComplete: false,
        errors: []
      };

      // Execute meeting creation
      const result = await orchestrator.handleMeetingCreation();

      // Verify the result
      expect(result.nextStep).toBe('completed');
      expect(result.requiresUserInput).toBe(false);
      expect(result.message).toContain('Meeting created successfully');
      expect(result.message).toContain('Test Meeting');
      expect(result.message).toContain('https://meet.google.com/test-link');
    });

    it('should handle physical meetings without meeting links', async () => {
      // Set up physical meeting data
      const meetingData: Partial<MeetingData> = {
        title: 'Physical Meeting',
        type: 'physical',
        location: 'Conference Room A',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
        attendees: [
          { email: 'test@example.com', firstName: 'Test', isValidated: true, isRequired: true }
        ],
        agenda: 'Physical meeting agenda',
        status: 'approved'
      };

      // Mock Google Calendar response for physical meeting
      const { createCalendarEvent } = await import('../googleCalendar');
      vi.mocked(createCalendarEvent).mockResolvedValueOnce({
        id: 'physical-event-id',
        googleEventId: 'google-physical-event-id',
        title: 'Physical Meeting',
        description: 'Physical meeting description',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        meetingLink: undefined, // No meeting link for physical meetings
        attendees: ['test@example.com'],
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event/physical'
      });

      // Set workflow state
      (orchestrator as any).workflowState = {
        currentStep: 'creation',
        meetingData,
        validationResults: [],
        pendingActions: [],
        isComplete: false,
        errors: []
      };

      // Execute meeting creation
      const result = await orchestrator.handleMeetingCreation();

      // Verify the result
      expect(result.nextStep).toBe('completed');
      expect(result.requiresUserInput).toBe(false);
      expect(result.message).toContain('Meeting created successfully');
      expect(result.message).toContain('Physical Meeting');
      expect(result.message).toContain('Conference Room A');
      expect(result.message).not.toContain('Meeting Link');
    });

    it('should handle errors during meeting creation', async () => {
      // Mock Google Calendar error
      const { createCalendarEvent } = await import('../googleCalendar');
      vi.mocked(createCalendarEvent).mockRejectedValueOnce(new Error('Calendar API error'));

      // Set up meeting data
      const meetingData: Partial<MeetingData> = {
        title: 'Test Meeting',
        type: 'online',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
        attendees: [
          { email: 'test@example.com', firstName: 'Test', isValidated: true, isRequired: true }
        ],
        status: 'approved'
      };

      // Set workflow state
      (orchestrator as any).workflowState = {
        currentStep: 'creation',
        meetingData,
        validationResults: [],
        pendingActions: [],
        isComplete: false,
        errors: []
      };

      // Execute meeting creation
      const result = await orchestrator.handleMeetingCreation();

      // Verify error handling
      expect(result.nextStep).toBe('creation');
      expect(result.requiresUserInput).toBe(true);
      expect(result.message).toContain('Failed to create meeting');
      expect(result.validationErrors).toContain('Calendar API error');
    });
  });

  describe('formatMeetingDescription', () => {
    it('should format meeting description with agenda and attendees', () => {
      const meetingData: Partial<MeetingData> = {
        type: 'online',
        attendees: [
          { email: 'john@example.com', firstName: 'John', lastName: 'Doe', isValidated: true, isRequired: true },
          { email: 'jane@example.com', firstName: 'Jane', isValidated: true, isRequired: true }
        ],
        agenda: '# Meeting Agenda\n\n1. **Introduction**\n2. Discussion\n3. Action Items',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z')
      };

      const description = (orchestrator as any).formatMeetingDescription(meetingData);

      expect(description).toContain('**Meeting Type:** Online Meeting');
      expect(description).toContain('**Attendees (2):**');
      expect(description).toContain('• John Doe (john@example.com)');
      expect(description).toContain('• Jane (jane@example.com)');
      expect(description).toContain('**Meeting Agenda:**');
      expect(description).toContain('**Duration:** 60 minutes');
      expect(description).toContain('Created via Conversational Meeting Scheduler');
    });

    it('should format physical meeting description with location', () => {
      const meetingData: Partial<MeetingData> = {
        type: 'physical',
        location: 'Conference Room A, Building 1',
        attendees: [
          { email: 'test@example.com', firstName: 'Test', isValidated: true, isRequired: true }
        ]
      };

      const description = (orchestrator as any).formatMeetingDescription(meetingData);

      expect(description).toContain('**Meeting Type:** Physical Meeting');
      expect(description).toContain('**Location:** Conference Room A, Building 1');
      expect(description).toContain('**Attendees (1):**');
    });
  });
});