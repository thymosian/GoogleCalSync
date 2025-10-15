import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MeetingWorkflowOrchestrator } from '../meetingWorkflowOrchestrator.js';
import { ConversationContextEngine } from '../conversationContext.js';
import { BusinessRulesEngine } from '../businessRules.js';
import { AttendeeValidator } from '../attendeeValidator.js';
import { agendaGenerator } from '../agendaGenerator.js';
import type { ConversationMessage, MeetingData } from '../../shared/schema.js';

// Mock the agenda generator
vi.mock('../agendaGenerator.js', () => ({
  agendaGenerator: {
    generateAgenda: vi.fn(),
    formatAgenda: vi.fn(),
    validateAgenda: vi.fn()
  }
}));

describe('Agenda Approval Workflow', () => {
  let orchestrator: MeetingWorkflowOrchestrator;
  let contextEngine: ConversationContextEngine;
  let businessRules: BusinessRulesEngine;
  let attendeeValidator: AttendeeValidator;

  beforeEach(() => {
    // Create mock instances
    contextEngine = {
      addMessage: vi.fn(),
      getMessages: vi.fn().mockReturnValue([]),
      getCompressedContext: vi.fn().mockReturnValue({ compressedContext: 'test context' }),
      getCurrentMode: vi.fn().mockReturnValue('scheduling'),
      getContextData: vi.fn().mockReturnValue({ meetingData: {} }),
      updateMeetingData: vi.fn(),
      saveContext: vi.fn()
    } as any;

    businessRules = new BusinessRulesEngine();
    attendeeValidator = new AttendeeValidator();

    orchestrator = new MeetingWorkflowOrchestrator(
      contextEngine,
      businessRules,
      attendeeValidator
    );

    // Set up initial workflow state for agenda approval
    (orchestrator as any).workflowState = {
      currentStep: 'agenda_approval',
      meetingData: {
        id: 'test-meeting-123',
        title: 'Test Meeting',
        type: 'online',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
        attendees: [
          { email: 'test@example.com', firstName: 'Test', isValidated: true }
        ],
        agenda: '# Test Meeting Agenda\n\n1. Introduction (10 min)\n2. Discussion (40 min)\n3. Action Items (10 min)'
      },
      validationResults: [],
      pendingActions: [],
      isComplete: false,
      errors: []
    };
  });

  describe('handleAgendaApproval', () => {
    it('should create agenda editor UI block when agenda exists and is valid', async () => {
      // Mock agenda validation to return valid
      vi.mocked(agendaGenerator.validateAgenda).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      const response = await orchestrator.handleAgendaApproval();

      expect(response.message).toContain('Please review the agenda and approve it to proceed');
      expect(response.uiBlock).toBeDefined();
      expect(response.uiBlock?.type).toBe('agenda_editor');
      expect((response.uiBlock?.data as any).isApprovalMode).toBe(true);
      expect(response.nextStep).toBe('agenda_approval');
      expect(response.requiresUserInput).toBe(true);
    });

    it('should show validation errors when agenda is invalid', async () => {
      // Mock agenda validation to return invalid
      vi.mocked(agendaGenerator.validateAgenda).mockReturnValue({
        isValid: false,
        errors: ['Agenda is too short'],
        warnings: ['Consider adding time allocations']
      });

      const response = await orchestrator.handleAgendaApproval();

      expect(response.message).toContain('Please review and fix the agenda issues');
      expect(response.validationErrors).toContain('Agenda is too short');
      expect(response.warnings).toContain('Consider adding time allocations');
      expect(response.uiBlock).toBeDefined();
      expect(response.nextStep).toBe('agenda_approval');
    });

    it('should redirect to agenda generation when no agenda exists', async () => {
      // Remove agenda from meeting data
      (orchestrator as any).workflowState.meetingData.agenda = undefined;

      const response = await orchestrator.handleAgendaApproval();

      expect(response.message).toBe('Please create an agenda before proceeding.');
      expect(response.nextStep).toBe('agenda_generation');
      expect(response.validationErrors).toContain('Agenda is required');
    });
  });

  describe('updateAgenda', () => {
    it('should update agenda and validate it', async () => {
      const newAgenda = '# Updated Agenda\n\n1. New topic (30 min)\n2. Wrap up (30 min)';
      
      vi.mocked(agendaGenerator.validateAgenda).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: ['Consider adding action items']
      });

      const response = await orchestrator.updateAgenda(newAgenda);

      expect(response.message).toBe('Agenda updated successfully.');
      expect(response.nextStep).toBe('agenda_approval');
      expect(response.warnings).toContain('Consider adding action items');
      expect((orchestrator as any).workflowState.meetingData.agenda).toBe(newAgenda);
    });

    it('should handle validation errors in updated agenda', async () => {
      const invalidAgenda = 'Too short';
      
      vi.mocked(agendaGenerator.validateAgenda).mockReturnValue({
        isValid: false,
        errors: ['Agenda is too short'],
        warnings: []
      });

      const response = await orchestrator.updateAgenda(invalidAgenda);

      expect(response.message).toContain('Agenda updated with validation issues');
      expect(response.validationErrors).toContain('Agenda is too short');
    });
  });

  describe('regenerateAgenda', () => {
    it('should regenerate agenda using conversation context', async () => {
      const mockConversationMessages: ConversationMessage[] = [
        {
          id: 'msg1',
          role: 'user',
          content: 'Let\'s discuss the new product launch',
          timestamp: new Date()
        }
      ];

      const mockAgendaContent = {
        title: 'Product Launch Meeting',
        duration: 60,
        topics: [
          { title: 'Product Overview', duration: 20 },
          { title: 'Launch Strategy', duration: 30 },
          { title: 'Next Steps', duration: 10 }
        ],
        actionItems: []
      };

      const formattedAgenda = '# Product Launch Meeting\n\n1. Product Overview (20 min)\n2. Launch Strategy (30 min)\n3. Next Steps (10 min)';

      vi.mocked(contextEngine.getMessages).mockReturnValue(mockConversationMessages);
      vi.mocked(agendaGenerator.generateAgenda).mockResolvedValue(mockAgendaContent);
      vi.mocked(agendaGenerator.formatAgenda).mockReturnValue(formattedAgenda);
      vi.mocked(agendaGenerator.validateAgenda).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      const response = await orchestrator.regenerateAgenda();

      expect(response.message).toBe('Agenda regenerated successfully. Please review the updated content.');
      expect(response.nextStep).toBe('agenda_approval');
      expect((orchestrator as any).workflowState.meetingData.agenda).toBe(formattedAgenda);
      expect(agendaGenerator.generateAgenda).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Meeting',
          type: 'online'
        }),
        mockConversationMessages
      );
    });

    it('should handle regeneration errors gracefully', async () => {
      vi.mocked(agendaGenerator.generateAgenda).mockRejectedValue(new Error('AI service unavailable'));

      const response = await orchestrator.regenerateAgenda();

      expect(response.message).toBe('Failed to regenerate agenda. Please edit the current agenda manually.');
      expect(response.validationErrors).toContain('Agenda regeneration failed');
      expect(response.nextStep).toBe('agenda_approval');
    });
  });

  describe('approveAgenda', () => {
    it('should approve valid agenda and advance to final approval', async () => {
      const finalAgenda = '# Final Meeting Agenda\n\n1. Introduction (10 min)\n2. Main Discussion (40 min)\n3. Action Items (10 min)';
      
      vi.mocked(agendaGenerator.validateAgenda).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: ['Consider adding presenter names']
      });

      const response = await orchestrator.approveAgenda(finalAgenda);

      expect(response.message).toBe('Agenda approved successfully! Now let me show you the complete meeting details for final approval.');
      expect(response.nextStep).toBe('approval');
      expect(response.requiresUserInput).toBe(false);
      expect(response.warnings).toContain('Consider adding presenter names');
      expect((orchestrator as any).workflowState.meetingData.agenda).toBe(finalAgenda);
    });

    it('should reject invalid agenda approval', async () => {
      const invalidAgenda = 'Invalid agenda';
      
      vi.mocked(agendaGenerator.validateAgenda).mockReturnValue({
        isValid: false,
        errors: ['Agenda is too short', 'Missing time allocations'],
        warnings: []
      });

      const response = await orchestrator.approveAgenda(invalidAgenda);

      expect(response.message).toContain('Cannot approve agenda with validation errors');
      expect(response.validationErrors).toEqual(['Agenda is too short', 'Missing time allocations']);
      expect(response.nextStep).toBe('agenda_approval');
      expect(response.requiresUserInput).toBe(true);
    });
  });

  describe('workflow integration', () => {
    it('should handle agenda approval workflow step in executeCurrentStep', async () => {
      vi.mocked(agendaGenerator.validateAgenda).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      const message: ConversationMessage = {
        id: 'test-msg',
        role: 'user',
        content: 'Please review my agenda',
        timestamp: new Date()
      };

      const response = await (orchestrator as any).executeCurrentStep(message);

      expect(response.message).toContain('Please review the agenda and approve it to proceed');
      expect(response.uiBlock?.type).toBe('agenda_editor');
      expect(response.nextStep).toBe('agenda_approval');
    });

    it('should validate agenda approval transition', async () => {
      // Add validation results to make the transition valid
      (orchestrator as any).workflowState.validationResults = [{
        isValid: true,
        errors: [],
        warnings: []
      }];

      const transition = {
        fromStep: 'agenda_approval' as const,
        toStep: 'approval' as const,
        condition: () => true
      };

      const validation = await (orchestrator as any).validateTransition(transition);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should prevent approval transition without agenda', async () => {
      // Remove agenda
      (orchestrator as any).workflowState.meetingData.agenda = undefined;

      const transition = {
        fromStep: 'agenda_approval' as const,
        toStep: 'approval' as const,
        condition: () => true
      };

      const validation = await (orchestrator as any).validateTransition(transition);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Agenda must be approved before final approval');
    });
  });
});