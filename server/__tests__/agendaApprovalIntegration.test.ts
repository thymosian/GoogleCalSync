import { describe, it, expect, beforeEach, vi } from 'vitest';
import { workflowChatIntegration } from '../workflowChatIntegration.js';

// Mock the agenda generator
vi.mock('../agendaGenerator.js', () => ({
  agendaGenerator: {
    generateAgenda: vi.fn(),
    formatAgenda: vi.fn(),
    validateAgenda: vi.fn()
  }
}));

describe('Agenda Approval Integration', () => {
  const userId = 'test-user-123';
  const conversationId = 'test-conversation-456';

  beforeEach(() => {
    // Clear any cached instances
    workflowChatIntegration.clearAllCache();
  });

  it('should handle complete agenda approval workflow', async () => {
    // Mock agenda generator responses
    const { agendaGenerator } = await import('../agendaGenerator.js');
    
    const mockAgendaContent = {
      title: 'Team Sync Meeting',
      duration: 60,
      topics: [
        { title: 'Project Updates', duration: 30 },
        { title: 'Planning Discussion', duration: 20 },
        { title: 'Action Items', duration: 10 }
      ],
      actionItems: []
    };

    const formattedAgenda = `# Team Sync Meeting

**Duration:** 60 minutes

## Agenda Items

1. **Project Updates** (30 min)
   Review current progress and status updates

2. **Planning Discussion** (20 min)
   Discuss upcoming milestones and priorities

3. **Action Items** (10 min)
   Define action items and next steps

## Action Items

1. Follow up on discussion points [MEDIUM]
`;

    vi.mocked(agendaGenerator.generateAgenda).mockResolvedValue(mockAgendaContent);
    vi.mocked(agendaGenerator.formatAgenda).mockReturnValue(formattedAgenda);
    vi.mocked(agendaGenerator.validateAgenda).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: []
    });

    // Step 1: Start with a meeting creation request
    const step1Response = await workflowChatIntegration.processMessage(
      userId,
      'I need to schedule a team sync meeting for tomorrow at 2 PM',
      conversationId
    );

    expect(step1Response.workflow.currentStep).toBe('meeting_type_selection');

    // Step 2: Select meeting type
    const step2Response = await workflowChatIntegration.handleUIBlockInteraction(
      userId,
      'meeting_type_selection',
      { type: 'online' },
      conversationId
    );

    expect(step2Response.workflow.currentStep).toBe('attendee_collection');

    // Step 3: Add attendees
    const step3Response = await workflowChatIntegration.handleUIBlockInteraction(
      userId,
      'attendee_management',
      { 
        attendees: [
          { email: 'john@example.com', firstName: 'John', isValidated: true, isRequired: true },
          { email: 'sarah@example.com', firstName: 'Sarah', isValidated: true, isRequired: true }
        ]
      },
      conversationId
    );

    expect(step3Response.workflow.currentStep).toBe('meeting_details_collection');

    // Step 4: Provide meeting details
    await workflowChatIntegration.updateMeetingData(
      userId,
      {
        title: 'Team Sync Meeting',
        startTime: new Date('2024-01-15T14:00:00Z'),
        endTime: new Date('2024-01-15T15:00:00Z')
      },
      conversationId
    );

    // Step 5: Advance to validation
    const step5Response = await workflowChatIntegration.advanceWorkflowStep(
      userId,
      'validation',
      undefined,
      conversationId
    );

    expect(step5Response.success).toBe(true);

    // Step 6: Advance to agenda generation
    const step6Response = await workflowChatIntegration.advanceWorkflowStep(
      userId,
      'agenda_generation',
      undefined,
      conversationId
    );

    expect(step6Response.success).toBe(true);
    expect(step6Response.workflow.currentStep).toBe('agenda_approval');

    // Step 7: Handle agenda approval workflow
    const step7Response = await workflowChatIntegration.advanceWorkflowStep(
      userId,
      'agenda_approval',
      undefined,
      conversationId
    );

    expect(step7Response.success).toBe(true);
    expect(step7Response.workflow.currentStep).toBe('agenda_approval');

    // Step 8: Update agenda content
    const updatedAgenda = formattedAgenda.replace('Team Sync Meeting', 'Weekly Team Sync');
    
    vi.mocked(agendaGenerator.validateAgenda).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: ['Consider adding presenter names']
    });

    const step8Response = await workflowChatIntegration.handleUIBlockInteraction(
      userId,
      'agenda_editor',
      { 
        action: 'update',
        agenda: updatedAgenda
      },
      conversationId
    );

    expect(step8Response.workflow.meetingData.agenda).toBe(updatedAgenda);
    expect(step8Response.validation.warnings).toContain('Consider adding presenter names');

    // Step 9: Approve the agenda
    const step9Response = await workflowChatIntegration.handleUIBlockInteraction(
      userId,
      'agenda_editor',
      { 
        action: 'approve',
        agenda: updatedAgenda
      },
      conversationId
    );

    expect(step9Response.workflow.currentStep).toBe('approval');
    expect(step9Response.message).toContain('Agenda approved successfully');

    // Verify the final meeting data includes the approved agenda
    const finalState = await workflowChatIntegration.getWorkflowState(userId, conversationId);
    expect(finalState.workflow.meetingData.agenda).toBe(updatedAgenda);
    expect(finalState.workflow.currentStep).toBe('approval');
  });

  it('should handle agenda regeneration during approval', async () => {
    // Mock agenda generator responses
    const { agendaGenerator } = await import('../agendaGenerator.js');
    
    const originalAgenda = '# Original Agenda\n\n1. Topic 1 (30 min)\n2. Topic 2 (30 min)';
    const regeneratedAgenda = '# Regenerated Agenda\n\n1. Updated Topic 1 (25 min)\n2. Updated Topic 2 (25 min)\n3. New Topic 3 (10 min)';

    const mockRegeneratedContent = {
      title: 'Updated Meeting',
      duration: 60,
      topics: [
        { title: 'Updated Topic 1', duration: 25 },
        { title: 'Updated Topic 2', duration: 25 },
        { title: 'New Topic 3', duration: 10 }
      ],
      actionItems: []
    };

    // Set up initial state with agenda approval step
    await workflowChatIntegration.updateMeetingData(
      userId,
      {
        title: 'Test Meeting',
        type: 'online',
        startTime: new Date('2024-01-15T14:00:00Z'),
        endTime: new Date('2024-01-15T15:00:00Z'),
        attendees: [{ email: 'test@example.com', firstName: 'Test', isValidated: true, isRequired: true }],
        agenda: originalAgenda
      },
      conversationId
    );

    await workflowChatIntegration.advanceWorkflowStep(
      userId,
      'agenda_approval',
      undefined,
      conversationId
    );

    // Mock regeneration
    vi.mocked(agendaGenerator.generateAgenda).mockResolvedValue(mockRegeneratedContent);
    vi.mocked(agendaGenerator.formatAgenda).mockReturnValue(regeneratedAgenda);
    vi.mocked(agendaGenerator.validateAgenda).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: []
    });

    // Trigger agenda regeneration
    const regenerateResponse = await workflowChatIntegration.handleUIBlockInteraction(
      userId,
      'agenda_editor',
      { 
        action: 'regenerate'
      },
      conversationId
    );

    expect(regenerateResponse.message).toContain('Agenda regenerated successfully');
    expect(regenerateResponse.workflow.meetingData.agenda).toBe(regeneratedAgenda);
    expect(regenerateResponse.workflow.currentStep).toBe('agenda_approval');

    // Verify agenda generator was called
    expect(agendaGenerator.generateAgenda).toHaveBeenCalled();
    expect(agendaGenerator.formatAgenda).toHaveBeenCalledWith(mockRegeneratedContent);
  });

  it('should handle agenda validation errors during approval', async () => {
    // Mock agenda generator to return validation errors
    const { agendaGenerator } = await import('../agendaGenerator.js');
    
    const invalidAgenda = 'Too short';

    vi.mocked(agendaGenerator.validateAgenda).mockReturnValue({
      isValid: false,
      errors: ['Agenda is too short', 'Missing time allocations'],
      warnings: ['Consider adding action items']
    });

    // Set up initial state
    await workflowChatIntegration.updateMeetingData(
      userId,
      {
        title: 'Test Meeting',
        type: 'online',
        startTime: new Date('2024-01-15T14:00:00Z'),
        endTime: new Date('2024-01-15T15:00:00Z'),
        attendees: [{ email: 'test@example.com', firstName: 'Test', isValidated: true, isRequired: true }],
        agenda: invalidAgenda
      },
      conversationId
    );

    await workflowChatIntegration.advanceWorkflowStep(
      userId,
      'agenda_approval',
      undefined,
      conversationId
    );

    // Try to approve invalid agenda
    const approveResponse = await workflowChatIntegration.handleUIBlockInteraction(
      userId,
      'agenda_editor',
      { 
        action: 'approve',
        agenda: invalidAgenda
      },
      conversationId
    );

    expect(approveResponse.validation.errors).toContain('Agenda is too short');
    expect(approveResponse.validation.errors).toContain('Missing time allocations');
    expect(approveResponse.validation.warnings).toContain('Consider adding action items');
    expect(approveResponse.workflow.currentStep).toBe('agenda_approval');
    expect(approveResponse.message).toContain('Cannot approve agenda with validation errors');
  });
});