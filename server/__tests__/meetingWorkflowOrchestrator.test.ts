import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { MeetingWorkflowOrchestrator, type WorkflowStep, type WorkflowState } from '../meetingWorkflowOrchestrator';
import { ConversationContextEngine } from '../conversationContext';
import { BusinessRulesEngine } from '../businessRules';
import { AttendeeValidator } from '../attendeeValidator';
import type { ConversationMessage, User, MeetingData } from '../../shared/schema';

// Mock dependencies
vi.mock('../conversationContext');
vi.mock('../businessRules');
vi.mock('../attendeeValidator');
vi.mock('../agendaGenerator');
vi.mock('../googleCalendar');
vi.mock('../storage');

const mockUser: User = {
  id: 'test-user-id',
  googleId: 'google-123',
  email: 'test@example.com',
  name: 'Test User',
  picture: null,
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token'
};

describe('MeetingWorkflowOrchestrator', () => {
  let orchestrator: MeetingWorkflowOrchestrator;
  let mockContextEngine: any;
  let mockBusinessRules: any;
  let mockAttendeeValidator: any;

  beforeEach(() => {
    // Create mock instances
    mockContextEngine = {
      addMessage: vi.fn(),
      getMessages: vi.fn().mockReturnValue([]),
      getCompressedContext: vi.fn().mockReturnValue({
        compressedContext: 'test context',
        tokenCount: 100,
        compressionRatio: 1
      }),
      updateMeetingData: vi.fn(),
      getCurrentMode: vi.fn().mockReturnValue('casual'),
      setMode: vi.fn()
    };

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
      enforceAttendeeRequirement: vi.fn().mockReturnValue(true)
    };

    mockAttendeeValidator = {
      validateBatch: vi.fn().mockResolvedValue([]),
      validateEmail: vi.fn().mockResolvedValue({
        email: 'test@example.com',
        isValid: true,
        exists: true,
        isGoogleUser: true
      })
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

  describe('initialization', () => {
    it('should initialize with default workflow state', () => {
      const state = orchestrator.getWorkflowState();
      
      expect(state.currentStep).toBe('intent_detection');
      expect(state.meetingData.status).toBe('draft');
      expect(state.meetingData.attendees).toEqual([]);
      expect(state.isComplete).toBe(false);
      expect(state.errors).toEqual([]);
    });

    it('should initialize workflow transitions', () => {
      // Test that orchestrator can handle basic workflow transitions
      expect(orchestrator).toBeDefined();
      expect(typeof orchestrator.processMessage).toBe('function');
      expect(typeof orchestrator.advanceToStep).toBe('function');
    });
  });

  describe('processMessage', () => {
    it('should add message to context engine', async () => {
      const message: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'I need to schedule a meeting',
        timestamp: new Date()
      };

      await orchestrator.processMessage(message);

      expect(mockContextEngine.addMessage).toHaveBeenCalledWith(message);
    });

    it('should return appropriate response for intent detection', async () => {
      const message: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'I need to schedule a meeting for tomorrow',
        timestamp: new Date()
      };

      const response = await orchestrator.processMessage(message);

      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('nextStep');
      expect(response).toHaveProperty('requiresUserInput');
    });
  });

  describe('workflow state management', () => {
    it('should get current workflow state', () => {
      const state = orchestrator.getWorkflowState();
      
      expect(state).toHaveProperty('currentStep');
      expect(state).toHaveProperty('meetingData');
      expect(state).toHaveProperty('validationResults');
      expect(state).toHaveProperty('isComplete');
    });

    it('should advance to specific workflow step', async () => {
      const response = await orchestrator.advanceToStep('meeting_type_selection');
      
      expect(response).toHaveProperty('nextStep');
      expect(response.nextStep).toBe('meeting_type_selection');
    });

    it('should validate step transitions', async () => {
      // Try to advance to an invalid step
      const response = await orchestrator.processStepTransition(
        'intent_detection',
        'completed' // Invalid jump
      );

      // Should handle invalid transitions gracefully
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('validationErrors');
    });
  });

  describe('meeting type detection', () => {
    it('should detect online meeting from context', async () => {
      mockContextEngine.getCompressedContext.mockReturnValue({
        compressedContext: 'zoom meeting online video call',
        tokenCount: 100,
        compressionRatio: 1
      });

      const type = await orchestrator.detectMeetingType();
      expect(type).toBe('online');
    });

    it('should detect physical meeting from context', async () => {
      mockContextEngine.getCompressedContext.mockReturnValue({
        compressedContext: 'conference room office location in person',
        tokenCount: 100,
        compressionRatio: 1
      });

      const type = await orchestrator.detectMeetingType();
      expect(type).toBe('physical');
    });

    it('should return unknown when type cannot be determined', async () => {
      mockContextEngine.getCompressedContext.mockReturnValue({
        compressedContext: 'general meeting discussion',
        tokenCount: 100,
        compressionRatio: 1
      });

      const type = await orchestrator.detectMeetingType();
      expect(type).toBe('unknown');
    });
  });

  describe('meeting validation', () => {
    it('should validate meeting data using business rules', async () => {
      const validation = await orchestrator.validateMeetingData();
      
      expect(mockBusinessRules.validateMeeting).toHaveBeenCalled();
      expect(validation).toHaveProperty('isValid');
      expect(validation).toHaveProperty('errors');
      expect(validation).toHaveProperty('warnings');
    });

    it('should handle validation failures', async () => {
      mockBusinessRules.validateMeeting.mockReturnValue({
        isValid: false,
        errors: ['Online meetings require attendees'],
        warnings: []
      });

      const validation = await orchestrator.validateMeetingData();
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Online meetings require attendees');
    });
  });

  describe('agenda generation workflow', () => {
    it('should handle agenda generation step', async () => {
      // Set up meeting data
      const state = orchestrator.getWorkflowState();
      state.meetingData = {
        title: 'Test Meeting',
        type: 'online',
        startTime: new Date(),
        endTime: new Date(Date.now() + 60 * 60 * 1000)
      };

      const response = await orchestrator.handleAgendaGeneration();

      expect(response.nextStep).toBe('agenda_approval');
      expect(response.uiBlock?.type).toBe('agenda_editor');
      expect(response.requiresUserInput).toBe(true);
    });

    it('should handle agenda approval step', async () => {
      // Set up meeting data with agenda
      const state = orchestrator.getWorkflowState();
      state.meetingData = {
        title: 'Test Meeting',
        agenda: 'Test agenda content',
        startTime: new Date(),
        endTime: new Date(Date.now() + 60 * 60 * 1000)
      };

      const response = await orchestrator.handleAgendaApproval();

      expect(response.uiBlock?.type).toBe('agenda_editor');
      expect(response.requiresUserInput).toBe(true);
    });

    it('should update agenda during approval', async () => {
      const newAgenda = 'Updated agenda content';
      
      const response = await orchestrator.updateAgenda(newAgenda);
      
      expect(response.nextStep).toBe('agenda_approval');
      expect(orchestrator.getWorkflowState().meetingData.agenda).toBe(newAgenda);
    });

    it('should approve agenda and advance workflow', async () => {
      const finalAgenda = 'Final approved agenda';
      
      const response = await orchestrator.approveAgenda(finalAgenda);
      
      expect(response.nextStep).toBe('approval');
      expect(orchestrator.getWorkflowState().meetingData.agenda).toBe(finalAgenda);
      expect(orchestrator.getWorkflowState().meetingData.status).toBe('pending_approval');
    });
  });

  describe('meeting creation workflow', () => {
    it('should handle meeting creation successfully', async () => {
      // Mock successful calendar creation
      const mockCreateCalendarEvent = vi.fn().mockResolvedValue({
        id: 'event-123',
        googleEventId: 'google-event-123',
        title: 'Test Meeting',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        meetingLink: 'https://meet.google.com/test-link',
        htmlLink: 'https://calendar.google.com/event/123'
      });

      // Mock database operations
      const mockDb = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: 'db-event-123',
              title: 'Test Meeting'
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

      // Set up complete meeting data
      const state = orchestrator.getWorkflowState();
      state.meetingData = {
        title: 'Test Meeting',
        type: 'online',
        startTime: new Date(),
        endTime: new Date(Date.now() + 60 * 60 * 1000),
        attendees: [{ email: 'test@example.com', isValidated: true, isRequired: true }],
        agenda: 'Test agenda'
      };

      const response = await orchestrator.handleMeetingCreation();

      expect(response.nextStep).toBe('completed');
      expect(response.message).toContain('Meeting created successfully');
      expect(orchestrator.getWorkflowState().isComplete).toBe(true);
    });

    it('should handle meeting creation errors', async () => {
      // Mock calendar creation failure
      const mockCreateCalendarEvent = vi.fn().mockRejectedValue(new Error('Calendar API error'));

      vi.doMock('../googleCalendar', () => ({
        createCalendarEvent: mockCreateCalendarEvent
      }));

      const response = await orchestrator.handleMeetingCreation();

      expect(response.nextStep).toBe('creation');
      expect(response.validationErrors).toBeDefined();
      expect(response.message).toContain('Failed to create meeting');
    });

    it('should require user authentication for meeting creation', async () => {
      // Create orchestrator without user
      const orchestratorNoUser = new MeetingWorkflowOrchestrator(
        mockContextEngine,
        mockBusinessRules,
        mockAttendeeValidator
      );

      const response = await orchestratorNoUser.handleMeetingCreation();

      expect(response.validationErrors).toContain('User authentication required');
      expect(response.message).toContain('user authentication required');
    });
  });

  describe('approval workflow', () => {
    it('should create approval workflow with valid data', async () => {
      // Set up complete meeting data
      const state = orchestrator.getWorkflowState();
      state.meetingData = {
        title: 'Test Meeting',
        type: 'online',
        startTime: new Date(),
        endTime: new Date(Date.now() + 60 * 60 * 1000),
        attendees: [{ email: 'test@example.com', isValidated: true, isRequired: true }]
      };

      const response = await orchestrator.createApprovalWorkflow();

      expect(response.nextStep).toBe('approval');
      expect(response.uiBlock?.type).toBe('meeting_approval');
      expect(response.requiresUserInput).toBe(true);
    });

    it('should prevent approval with invalid data', async () => {
      mockBusinessRules.validateMeeting.mockReturnValue({
        isValid: false,
        errors: ['Missing required fields'],
        warnings: []
      });

      const response = await orchestrator.createApprovalWorkflow();

      expect(response.validationErrors).toContain('Missing required fields');
      expect(response.message).toContain('Cannot proceed to approval');
    });
  });

  describe('error handling', () => {
    it('should handle context engine errors gracefully', async () => {
      mockContextEngine.addMessage.mockRejectedValue(new Error('Context error'));

      const message: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'test message',
        timestamp: new Date()
      };

      // Should not throw, but handle error gracefully
      await expect(orchestrator.processMessage(message)).resolves.toBeDefined();
    });

    it('should handle business rules validation errors', async () => {
      mockBusinessRules.validateMeeting.mockImplementation(() => {
        throw new Error('Validation error');
      });

      // Should handle validation errors gracefully
      await expect(orchestrator.validateMeetingData()).resolves.toBeDefined();
    });
  });

  describe('workflow transitions', () => {
    it('should validate workflow transitions correctly', async () => {
      // Test valid transition
      const response1 = await orchestrator.processStepTransition(
        'intent_detection',
        'meeting_type_selection'
      );
      expect(response1.nextStep).toBe('meeting_type_selection');

      // Test invalid transition from wrong current step
      const response2 = await orchestrator.processStepTransition(
        'approval', // Wrong current step
        'completed'
      );
      expect(response2.validationErrors).toBeDefined();
      expect(response2.message).toContain('Invalid transition');
    });

    it('should handle step transitions with data', async () => {
      const meetingData = {
        type: 'online' as const,
        title: 'Test Meeting'
      };

      const response = await orchestrator.advanceToStep('meeting_type_selection', meetingData);

      expect(response.nextStep).toBe('meeting_type_selection');
      expect(orchestrator.getWorkflowState().meetingData.type).toBe('online');
      expect(orchestrator.getWorkflowState().meetingData.title).toBe('Test Meeting');
    });
  });

  describe('time-first conversation flow', () => {
    it('should proceed to time collection after meeting type selection', async () => {
      // Set up meeting type
      const state = orchestrator.getWorkflowState();
      state.meetingData.type = 'online';
      
      const response = await orchestrator.setMeetingType('online');
      
      expect(response.nextStep).toBe('time_date_collection');
      expect(response.message).toContain('time and date first');
    });

    it('should prevent attendee collection without time collection complete', async () => {
      // Set up online meeting without time collection complete
      const state = orchestrator.getWorkflowState();
      state.meetingData.type = 'online';
      state.timeCollectionComplete = false;
      
      const response = await orchestrator.advanceToStep('attendee_collection');
      
      expect(response.validationErrors).toContain('Time collection must be completed before attendee collection');
      expect(response.nextStep).toBe('time_date_collection');
    });

    it('should prevent attendee collection without start and end time', async () => {
      // Set up online meeting with timeCollectionComplete but no actual times
      const state = orchestrator.getWorkflowState();
      state.meetingData.type = 'online';
      state.timeCollectionComplete = true;
      // No startTime or endTime set
      
      const response = await orchestrator.advanceToStep('attendee_collection');
      
      expect(response.validationErrors).toContain('Meeting start and end time must be established before attendee collection');
      expect(response.nextStep).toBe('time_date_collection');
    });

    it('should allow attendee collection only after time is properly set', async () => {
      // Set up complete time collection
      const state = orchestrator.getWorkflowState();
      state.meetingData.type = 'online';
      state.meetingData.startTime = new Date();
      state.meetingData.endTime = new Date(Date.now() + 60 * 60 * 1000);
      state.timeCollectionComplete = true;
      state.availabilityResult = { isAvailable: true, conflicts: [] };
      
      const response = await orchestrator.advanceToStep('attendee_collection');
      
      expect(response.nextStep).toBe('attendee_collection');
      expect(response.uiBlock?.type).toBe('attendee_management');
      expect(response.message).toContain('time set for');
    });

    it('should set meeting time and mark time collection complete', async () => {
      const startTime = new Date();
      const endTime = new Date(Date.now() + 60 * 60 * 1000);
      
      const response = await orchestrator.setMeetingTime(startTime, endTime);
      
      expect(response.nextStep).toBe('availability_check');
      expect(orchestrator.getWorkflowState().timeCollectionComplete).toBe(true);
      expect(orchestrator.getWorkflowState().meetingData.startTime).toBe(startTime);
      expect(orchestrator.getWorkflowState().meetingData.endTime).toBe(endTime);
    });

    it('should enforce time-first flow in availability check transitions', async () => {
      // Mock availability service
      const mockAvailabilityService = {
        checkCalendarAvailability: vi.fn().mockResolvedValue({
          isAvailable: true,
          conflicts: []
        })
      };
      
      vi.doMock('../calendarAvailabilityService', () => ({
        CalendarAvailabilityService: mockAvailabilityService
      }));

      // Set up meeting without time collection complete
      const state = orchestrator.getWorkflowState();
      state.meetingData.type = 'online';
      state.meetingData.startTime = new Date();
      state.meetingData.endTime = new Date(Date.now() + 60 * 60 * 1000);
      state.timeCollectionComplete = false; // Not complete
      state.availabilityResult = { isAvailable: true, conflicts: [] };
      
      const response = await orchestrator.advanceToStep('availability_check');
      
      // Should redirect to time collection even if availability is good
      expect(response.nextStep).toBe('time_date_collection');
      expect(response.validationErrors).toContain('Time collection incomplete');
    });

    it('should validate attendee collection transition requirements', async () => {
      // Test transition validation for attendee collection
      const state = orchestrator.getWorkflowState();
      
      // Test without time collection complete
      state.timeCollectionComplete = false;
      state.meetingData.type = 'online';
      
      const response1 = await orchestrator.processStepTransition(
        'availability_check',
        'attendee_collection'
      );
      
      expect(response1.validationErrors).toContain('Time collection must be completed before attendee collection');
      
      // Test without start/end time
      state.timeCollectionComplete = true;
      state.meetingData.startTime = undefined;
      state.meetingData.endTime = undefined;
      
      const response2 = await orchestrator.processStepTransition(
        'availability_check',
        'attendee_collection'
      );
      
      expect(response2.validationErrors).toContain('Meeting start and end time must be established before attendee collection');
    });
  });

  describe('attendee UI trigger integration', () => {
    it('should trigger attendee UI after time collection for online meetings', async () => {
      // Set up complete time collection and availability check
      const state = orchestrator.getWorkflowState();
      state.currentStep = 'attendee_collection';
      state.timeCollectionComplete = true;
      state.meetingData.type = 'online';
      state.meetingData.startTime = new Date('2024-01-15T10:00:00Z');
      state.meetingData.endTime = new Date('2024-01-15T11:00:00Z');
      state.availabilityResult = { isAvailable: true, conflicts: [] };

      const response = await orchestrator.triggerAttendeeManagementUI();

      expect(response.uiBlock).toBeDefined();
      expect(response.uiBlock?.type).toBe('attendee_management');
      expect(response.uiBlock?.data.meetingType).toBe('online');
      expect(response.uiBlock?.data.isRequired).toBe(true);
      expect(response.nextStep).toBe('attendee_collection');
      expect(response.requiresUserInput).toBe(true);
    });

    it('should include proper attendee data format in UI block', async () => {
      // Set up meeting with existing attendees
      const state = orchestrator.getWorkflowState();
      state.currentStep = 'attendee_collection';
      state.timeCollectionComplete = true;
      state.meetingData.type = 'online';
      state.meetingData.startTime = new Date('2024-01-15T10:00:00Z');
      state.meetingData.endTime = new Date('2024-01-15T11:00:00Z');
      state.meetingData.attendees = [
        { email: 'test@example.com', firstName: 'Test', lastName: 'User', isValidated: true, isRequired: true }
      ];
      state.availabilityResult = { isAvailable: true, conflicts: [] };

      const response = await orchestrator.triggerAttendeeManagementUI();

      expect(response.uiBlock?.data.attendees).toHaveLength(1);
      expect(response.uiBlock?.data.attendees[0]).toMatchObject({
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        isValidated: true,
        isRequired: true
      });
    });

    it('should not trigger attendee UI for physical meetings', async () => {
      // Set up physical meeting
      const state = orchestrator.getWorkflowState();
      state.timeCollectionComplete = true;
      state.meetingData.type = 'physical';
      state.meetingData.startTime = new Date('2024-01-15T10:00:00Z');
      state.meetingData.endTime = new Date('2024-01-15T11:00:00Z');
      state.availabilityResult = { isAvailable: true, conflicts: [] };

      const response = await orchestrator.triggerAttendeeManagementUI();

      expect(response.nextStep).toBe('meeting_details_collection');
      expect(response.uiBlock).toBeUndefined();
      expect(response.message).toContain('only required for online meetings');
    });

    it('should require time collection before triggering attendee UI', async () => {
      // Set up meeting without time collection complete
      const state = orchestrator.getWorkflowState();
      state.timeCollectionComplete = false;
      state.meetingData.type = 'online';

      const response = await orchestrator.triggerAttendeeManagementUI();

      expect(response.nextStep).toBe('time_date_collection');
      expect(response.validationErrors).toContain('Time collection incomplete');
      expect(response.uiBlock).toBeUndefined();
    });

    it('should require availability check before triggering attendee UI', async () => {
      // Set up meeting without availability check
      const state = orchestrator.getWorkflowState();
      state.timeCollectionComplete = true;
      state.meetingData.type = 'online';
      state.meetingData.startTime = new Date('2024-01-15T10:00:00Z');
      state.meetingData.endTime = new Date('2024-01-15T11:00:00Z');
      state.availabilityResult = undefined; // No availability check performed

      const response = await orchestrator.triggerAttendeeManagementUI();

      expect(response.nextStep).toBe('availability_check');
      expect(response.validationErrors).toContain('Availability check required');
      expect(response.uiBlock).toBeUndefined();
    });
  });
});