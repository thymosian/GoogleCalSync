import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowChatIntegration } from '../workflowChatIntegration.js';

// Mock the dependencies
vi.mock('../conversationContext.js', () => ({
    createConversationContextEngine: vi.fn().mockResolvedValue({
        getConversationId: () => 'test-conversation-id',
        addMessage: vi.fn(),
        getCurrentMode: () => 'scheduling',
        getStats: () => ({
            messageCount: 5,
            tokenCount: 100,
            compressionLevel: 0,
            currentMode: 'scheduling',
            hasMeetingData: true
        }),
        updateMeetingData: vi.fn(),
        saveContext: vi.fn(),
        getMessageHistory: vi.fn().mockResolvedValue({
            messages: [],
            totalCount: 0,
            hasMore: false
        })
    })
}));

vi.mock('../meetingWorkflowOrchestrator.js', () => ({
    MeetingWorkflowOrchestrator: vi.fn().mockImplementation(() => ({
        processMessage: vi.fn().mockResolvedValue({
            message: 'I can help you schedule a meeting. What would you like to set up?',
            nextStep: 'meeting_type_selection',
            requiresUserInput: false,
            validationErrors: [],
            warnings: []
        }),
        getWorkflowSummary: () => ({
            step: 'intent_detection',
            progress: 10,
            meetingData: { status: 'draft', attendees: [] },
            isComplete: false,
            hasErrors: false,
            nextAction: 'Waiting for meeting intent'
        }),
        resetWorkflow: vi.fn(),
        advanceToStep: vi.fn().mockResolvedValue({
            message: 'Advanced to meeting_type_selection',
            nextStep: 'meeting_type_selection',
            requiresUserInput: true,
            validationErrors: [],
            warnings: []
        }),
        processStepTransition: vi.fn().mockResolvedValue({
            message: 'Transition successful',
            nextStep: 'attendee_collection',
            requiresUserInput: true,
            validationErrors: [],
            warnings: []
        })
    }))
}));

vi.mock('../businessRules.js', () => ({
    BusinessRulesEngine: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('../attendeeValidator.js', () => ({
    AttendeeValidator: vi.fn().mockImplementation(() => ({}))
}));

describe('WorkflowChatIntegration', () => {
    let workflowIntegration: WorkflowChatIntegration;
    const testUserId = 'test-user-123';

    beforeEach(() => {
        workflowIntegration = new WorkflowChatIntegration();
        vi.clearAllMocks();
    });

    describe('processMessage', () => {
        it('should process a message through the workflow orchestrator', async () => {
            const message = 'I want to schedule a meeting';

            const response = await workflowIntegration.processMessage(
                testUserId,
                message
            );

            expect(response).toMatchObject({
                message: 'I can help you schedule a meeting. What would you like to set up?',
                conversationId: 'test-conversation-id',
                workflow: {
                    currentStep: 'meeting_type_selection',
                    requiresUserInput: false,
                    progress: 10,
                    isComplete: false,
                    nextAction: 'Waiting for meeting intent'
                },
                validation: {
                    errors: [],
                    warnings: []
                },
                contextStats: {
                    messageCount: 5,
                    tokenCount: 100,
                    compressionLevel: 0,
                    currentMode: 'scheduling',
                    hasMeetingData: true
                }
            });
        });

        it('should handle conversation with specific conversation ID', async () => {
            const message = 'Let me schedule a team meeting';
            const conversationId = 'specific-conversation-123';

            const response = await workflowIntegration.processMessage(
                testUserId,
                message,
                conversationId
            );

            expect(response.conversationId).toBe('test-conversation-id');
            expect(response.workflow.currentStep).toBe('meeting_type_selection');
        });
    });

    describe('updateMeetingData', () => {
        it('should update meeting data for a conversation', async () => {
            const meetingData = {
                title: 'Team Standup',
                type: 'online' as const,
                attendees: [{ email: 'test@example.com', isValidated: true, isRequired: true }]
            };

            await workflowIntegration.updateMeetingData(
                testUserId,
                meetingData
            );

            // Should not throw any errors
            expect(true).toBe(true);
        });
    });

    describe('getWorkflowState', () => {
        it('should return current workflow state', async () => {
            const state = await workflowIntegration.getWorkflowState(testUserId);

            expect(state).toMatchObject({
                conversationId: 'test-conversation-id',
                workflow: {
                    step: 'intent_detection',
                    progress: 10,
                    isComplete: false,
                    nextAction: 'Waiting for meeting intent'
                },
                conversationMode: 'scheduling'
            });
        });
    });

    describe('advanceWorkflowStep', () => {
        it('should advance workflow to a specific step', async () => {
            const result = await workflowIntegration.advanceWorkflowStep(
                testUserId,
                'meeting_type_selection'
            );

            expect(result).toMatchObject({
                success: true,
                message: 'Advanced to meeting_type_selection',
                workflow: {
                    step: 'intent_detection',
                    progress: 10,
                    isComplete: false
                },
                validation: {
                    errors: [],
                    warnings: []
                }
            });
        });

        it('should handle workflow step advancement with data', async () => {
            const stepData = { type: 'online' as const };

            const result = await workflowIntegration.advanceWorkflowStep(
                testUserId,
                'attendee_collection',
                stepData
            );

            expect(result.success).toBe(true);
        });
    });

    describe('handleUIBlockInteraction', () => {
        it('should handle meeting type selection interaction', async () => {
            const blockData = { type: 'online' as const };

            const response = await workflowIntegration.handleUIBlockInteraction(
                testUserId,
                'meeting_type_selection',
                blockData
            );

            expect(response).toMatchObject({
                message: 'Transition successful',
                workflow: {
                    currentStep: 'attendee_collection',
                    requiresUserInput: true
                },
                validation: {
                    errors: [],
                    warnings: []
                }
            });
        });

        it('should handle attendee management interaction', async () => {
            const blockData = {
                attendees: [
                    { email: 'user1@example.com', isValidated: true, isRequired: true },
                    { email: 'user2@example.com', isValidated: true, isRequired: true }
                ]
            };

            const response = await workflowIntegration.handleUIBlockInteraction(
                testUserId,
                'attendee_management',
                blockData
            );

            expect(response.workflow.currentStep).toBe('attendee_collection');
        });

        it('should handle meeting approval interaction', async () => {
            const blockData = { approved: true };

            const response = await workflowIntegration.handleUIBlockInteraction(
                testUserId,
                'meeting_approval',
                blockData
            );

            expect(response.workflow.currentStep).toBe('attendee_collection');
        });
    });

    describe('resetWorkflow', () => {
        it('should reset workflow for a conversation', async () => {
            const conversationId = await workflowIntegration.resetWorkflow(testUserId);

            expect(conversationId).toBe('test-conversation-id');
        });
    });

    describe('validateWorkflowState', () => {
        it('should validate workflow state consistency', async () => {
            const validation = await workflowIntegration.validateWorkflowState(testUserId);

            expect(validation).toMatchObject({
                isValid: expect.any(Boolean),
                errors: expect.any(Array),
                warnings: expect.any(Array),
                recommendations: expect.any(Array)
            });
        });
    });

    describe('getConversationHistory', () => {
        it('should retrieve conversation history with workflow context', async () => {
            const history = await workflowIntegration.getConversationHistory(
                testUserId,
                'test-conversation-id',
                10,
                0
            );

            expect(history).toMatchObject({
                messages: [],
                totalCount: 0,
                hasMore: false,
                workflowState: {
                    step: 'intent_detection',
                    progress: 10,
                    isComplete: false
                }
            });
        });
    });

    describe('cache management', () => {
        it('should clear cache for specific conversation', () => {
            workflowIntegration.clearCache('test-conversation-id');
            // Should not throw any errors
            expect(true).toBe(true);
        });

        it('should clear all cache', () => {
            workflowIntegration.clearAllCache();
            // Should not throw any errors
            expect(true).toBe(true);
        });
    });
});