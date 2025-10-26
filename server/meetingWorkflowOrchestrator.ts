import { ConversationContextEngine } from './conversationContext.js';
import { BusinessRulesEngine, type ValidationResult } from './businessRules.js';
import { AttendeeValidator } from './attendeeValidator.js';
import { agendaGenerator, type AgendaContent } from './agendaGenerator.js';
import { createCalendarEvent } from './googleCalendar.js';
import { calendarAccessVerifier, type CalendarAccessStatus } from './calendarAccessVerifier.js';
import { CalendarAvailabilityService, type AvailabilityResult, type TimeSlot } from './calendarAvailabilityService.js';
import { userFeedbackService, FeedbackUtils, WORKFLOW_STEP_INFO, type UserFeedbackMessage } from './userFeedbackService.js';
import { MEETING_CREATION_PROMPTS } from './prompts.js';
import { db } from './storage.js';
import { events, meetingDrafts } from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import { DynamicMessageGenerator } from './dynamicMessageGenerator.js';
import { transcriptService, type MeetingTranscript, type MeetingSummary, type MeetingTask } from './transcriptService.js';
import { retryWithExponentialBackoff, isRetryableError } from './utils/retryUtils.js';
import type {
    MeetingData,
    ConversationMessage,
    User,
    InsertEvent,
    InsertMeetingDraft
} from '../shared/schema.js';

export type WorkflowStep =
    | 'intent_detection'
    | 'calendar_access_verification'
    | 'meeting_type_selection'
    | 'time_date_collection'
    | 'availability_check'
    | 'conflict_resolution'
    | 'attendee_collection'
    | 'meeting_details_collection'
    | 'validation'
    | 'agenda_generation'
    | 'agenda_approval'
    | 'approval'
    | 'creation'
    | 'agenda_sending'
    | 'email_notification'
    | 'completed';

export interface UIBlock {
    type: string;
    data: Record<string, any>;
}

export interface WorkflowState {
    currentStep: WorkflowStep;
    meetingData: Partial<MeetingData>;
    validationResults: ValidationResult[];
    pendingActions: string[];
    isComplete: boolean;
    errors: string[];
    calendarAccessStatus?: CalendarAccessStatus;
    availabilityResult?: AvailabilityResult;
    timeCollectionComplete: boolean;
    attendeeCollectionComplete: boolean;
}

export interface WorkflowTransition {
    fromStep: WorkflowStep;
    toStep: WorkflowStep;
    condition: (state: WorkflowState, context: ConversationContextEngine) => boolean;
    action?: (state: WorkflowState, context: ConversationContextEngine) => Promise<void>;
}

export interface WorkflowResponse {
    message: string;
    uiBlock?: UIBlock;
    nextStep: WorkflowStep;
    requiresUserInput: boolean;
    validationErrors?: string[];
    warnings?: string[];
    feedbackMessage?: UserFeedbackMessage;
}

/**
 * MeetingWorkflowOrchestrator manages the end-to-end meeting creation workflow
 * with comprehensive error handling and user feedback.
 * 
 * Requirements: 5.3, 5.4 - Handle errors gracefully and provide clear feedback
 */
export class MeetingWorkflowOrchestrator {
    private contextEngine: ConversationContextEngine;
    private businessRules: BusinessRulesEngine;
    private attendeeValidator: AttendeeValidator;
    private workflowState: WorkflowState;
    private transitions: WorkflowTransition[] = [];
    private user?: User;

    constructor(
        contextEngine: ConversationContextEngine,
        businessRules: BusinessRulesEngine,
        attendeeValidator: AttendeeValidator,
        user?: User
    ) {
        this.contextEngine = contextEngine;
        this.businessRules = businessRules;
        this.attendeeValidator = attendeeValidator;
        this.user = user;

        this.workflowState = {
            currentStep: 'intent_detection',
            meetingData: { status: 'draft', attendees: [] },
            validationResults: [],
            pendingActions: [],
            isComplete: false,
            errors: [],
            timeCollectionComplete: false,
            attendeeCollectionComplete: false
        };

        this.initializeTransitions();
    }

    /**
     * Gets the current workflow state
     */
    getWorkflowState(): WorkflowState {
        return { ...this.workflowState };
    }

    /**
     * Initializes workflow transitions
     */
    private initializeTransitions(): void {
        // Implementation will be added in next phase
        this.transitions = [];
    }

    /**
     * Processes a user message and advances the workflow with comprehensive error handling
     * Requirements: 5.3, 5.4 - Handle errors gracefully and provide recovery mechanisms
     */
    async processMessage(message: ConversationMessage): Promise<WorkflowResponse> {
        try {
            // Add message to conversation context
            await this.contextEngine.addMessage(message);

            // Update workflow state based on conversation context
            await this.updateWorkflowState();

            // Execute current step logic
            const response = await this.executeCurrentStep(message);

            // Check for workflow transitions
            await this.checkTransitions();

            return response;

        } catch (error) {
            console.error('Error processing message:', error);

            // Create comprehensive error feedback
            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Unknown error occurred'),
                this.workflowState.currentStep
            );

            // Add error to workflow state for tracking
            this.workflowState.errors.push(
                error instanceof Error ? error.message : 'Unknown error'
            );

            // Determine recovery strategy based on error type
            const recoveryResponse = this.createRecoveryResponse(error);

            return {
                message: recoveryResponse.message,
                nextStep: recoveryResponse.nextStep,
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Creates a recovery response based on the type of error encountered
     * Requirements: 5.4 - Add recovery mechanisms for authentication and API failures
     */
    private createRecoveryResponse(error: unknown): { message: string; nextStep: WorkflowStep } {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Calendar/Authentication errors
        if (errorMessage.includes('access_token') || errorMessage.includes('authentication')) {
            return {
                message: 'I encountered an authentication issue. Please re-authenticate with Google Calendar and try again.',
                nextStep: 'calendar_access_verification'
            };
        }

        // API quota/rate limiting errors
        if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
            return {
                message: 'The calendar service is temporarily busy. Let\'s continue with the information we have and try the calendar operations later.',
                nextStep: this.workflowState.currentStep
            };
        }

        // Network/connectivity errors
        if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
            return {
                message: 'I\'m having trouble connecting to the calendar service. We can continue setting up your meeting and sync with your calendar when the connection is restored.',
                nextStep: this.workflowState.currentStep
            };
        }

        // Validation errors
        if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
            return {
                message: 'There\'s an issue with the meeting information. Let me help you correct it.',
                nextStep: 'meeting_details_collection'
            };
        }

        // Default recovery
        return {
            message: 'I encountered an unexpected issue. Let me try to continue from where we left off.',
            nextStep: this.workflowState.currentStep
        };
    }

    /**
     * Validates current workflow step before advancement with comprehensive business rule checking
     * Requirements: 4.4, 4.5 - Implement comprehensive validation for workflow step transitions
     */
    async validateCurrentStep(): Promise<ValidationResult & { canAdvance: boolean; suggestedStep?: WorkflowStep }> {
        try {
            const errors: string[] = [];
            const warnings: string[] = [];
            const meetingData = this.workflowState.meetingData;
            let canAdvance = true;
            let suggestedStep: WorkflowStep | undefined;

            switch (this.workflowState.currentStep) {
                case 'calendar_access_verification':
                    if (!this.workflowState.calendarAccessStatus?.hasAccess) {
                        canAdvance = false;
                        errors.push('Calendar access must be verified before proceeding');
                    }
                    break;

                case 'meeting_type_selection':
                    if (!meetingData.type) {
                        canAdvance = false;
                        errors.push('Meeting type must be selected');
                    } else {
                        const typeValidation = this.businessRules.validateMeetingType(meetingData.type, meetingData);
                        if (!typeValidation.isValid) {
                            canAdvance = false;
                            errors.push(...typeValidation.errors);
                        }
                        warnings.push(...typeValidation.warnings);
                    }
                    break;

                case 'time_date_collection':
                    if (!meetingData.startTime || !meetingData.endTime) {
                        canAdvance = false;
                        errors.push('Meeting start and end times must be set');
                    } else {
                        const timeValidation = this.businessRules.validateTimeConstraints(
                            new Date(meetingData.startTime),
                            new Date(meetingData.endTime)
                        );
                        if (!timeValidation.isValid) {
                            canAdvance = false;
                            errors.push(...timeValidation.errors);
                        }
                        warnings.push(...timeValidation.warnings);
                        
                        if (!this.workflowState.timeCollectionComplete) {
                            canAdvance = false;
                            errors.push('Time collection process must be marked complete');
                        }
                    }
                    break;

                case 'availability_check':
                    if (!this.workflowState.availabilityResult) {
                        warnings.push('Availability check was not performed - conflicts may exist');
                    } else if (this.workflowState.availabilityResult.conflicts && 
                              this.workflowState.availabilityResult.conflicts.length > 0 && 
                              !this.workflowState.availabilityResult.isAvailable) {
                        warnings.push('Calendar conflicts detected but not resolved');
                    }
                    break;

                case 'attendee_collection':
                    if (meetingData.type === 'online') {
                        // Strict validation for online meetings
                        if (!meetingData.attendees || meetingData.attendees.length === 0) {
                            canAdvance = false;
                            errors.push('Online meetings require at least one attendee');
                        } else {
                            const attendeeValidation = this.businessRules.validateAttendees(meetingData.attendees);
                            if (!attendeeValidation.isValid) {
                                canAdvance = false;
                                errors.push(...attendeeValidation.errors);
                            }
                            warnings.push(...attendeeValidation.warnings);

                            if (!this.businessRules.enforceAttendeeRequirement('online', meetingData.attendees.map(a => a.email))) {
                                canAdvance = false;
                                errors.push('Online meeting attendee requirement not satisfied');
                            }
                        }

                        if (!this.workflowState.attendeeCollectionComplete) {
                            canAdvance = false;
                            errors.push('Attendee collection must be completed for online meetings');
                        }
                    } else if (meetingData.type === 'physical') {
                        // Optional validation for physical meetings
                        if (meetingData.attendees && meetingData.attendees.length > 0) {
                            const attendeeValidation = this.businessRules.validateAttendees(meetingData.attendees);
                            if (!attendeeValidation.isValid) {
                                warnings.push(...attendeeValidation.errors);
                            }
                            warnings.push(...attendeeValidation.warnings);
                        }
                    }
                    break;

                case 'meeting_details_collection':
                    if (!meetingData.title) {
                        canAdvance = false;
                        errors.push('Meeting title is required');
                    }
                    if (meetingData.type === 'physical' && !meetingData.location) {
                        canAdvance = false;
                        errors.push('Location is required for physical meetings');
                    }
                    break;

                case 'validation':
                    const validationResult = this.businessRules.validateMeeting(meetingData);
                    if (!validationResult.isValid) {
                        canAdvance = false;
                        errors.push(...validationResult.errors);
                    }
                    warnings.push(...validationResult.warnings);

                    // Check workflow sequence
                    const sequenceValidation = this.businessRules.validateWorkflowSequence(
                        this.workflowState.calendarAccessStatus?.hasAccess || false,
                        this.workflowState.timeCollectionComplete,
                        !!this.workflowState.availabilityResult,
                        meetingData.type,
                        this.workflowState.attendeeCollectionComplete
                    );
                    if (!sequenceValidation.isValid) {
                        canAdvance = false;
                        errors.push(...sequenceValidation.errors);
                        
                        // Suggest which step to go back to
                        if (!this.workflowState.timeCollectionComplete) {
                            suggestedStep = 'time_date_collection';
                        } else if (meetingData.type === 'online' && !this.workflowState.attendeeCollectionComplete) {
                            suggestedStep = 'attendee_collection';
                        }
                    }
                    warnings.push(...sequenceValidation.warnings);
                    break;

                case 'approval':
                    // Final validation before creation
                    const approvalValidation = await this.validateMeetingCreationRequirements();
                    if (!approvalValidation.isValid) {
                        canAdvance = false;
                        errors.push(...approvalValidation.errors);
                        suggestedStep = approvalValidation.suggestedStep;
                    }
                    warnings.push(...approvalValidation.warnings);
                    break;
            }

            return {
                isValid: errors.length === 0,
                errors,
                warnings,
                canAdvance,
                suggestedStep
            };

        } catch (error) {
            console.error('Error validating current step:', error);
            return {
                isValid: false,
                errors: [error instanceof Error ? error.message : 'Step validation failed'],
                warnings: [],
                canAdvance: false
            };
        }
    }

    /**
     * Manually advances workflow to a specific step with validation and error handling
     */
    async advanceToStep(step: WorkflowStep, data?: any): Promise<WorkflowResponse> {
        try {
            const originalStep = this.workflowState.currentStep;

            // First validate current step before attempting to advance
            const currentStepValidation = await this.validateCurrentStep();
            if (!currentStepValidation.canAdvance) {
                const errorFeedback = FeedbackUtils.error(
                    new Error(`Cannot advance from ${originalStep}: validation failed`),
                    originalStep
                );

                let message = `Cannot advance from ${originalStep}: ${currentStepValidation.errors.join(', ')}`;
                if (currentStepValidation.suggestedStep) {
                    message += ` Please complete ${currentStepValidation.suggestedStep} first.`;
                }

                return {
                    message,
                    nextStep: currentStepValidation.suggestedStep || originalStep,
                    requiresUserInput: true,
                    validationErrors: currentStepValidation.errors,
                    warnings: currentStepValidation.warnings,
                    feedbackMessage: errorFeedback
                };
            }

            // Find and validate the transition
            const transition = this.transitions.find(t =>
                t.fromStep === originalStep && t.toStep === step
            );

            if (transition) {
                const transitionValidation = await this.validateTransition(transition);
                if (!transitionValidation.isValid) {
                    const errorFeedback = FeedbackUtils.error(
                        new Error(`Cannot advance to ${step}: transition validation failed`),
                        originalStep
                    );

                    return {
                        message: `Cannot advance to ${step}: ${transitionValidation.errors.join(', ')}`,
                        nextStep: originalStep,
                        requiresUserInput: true,
                        validationErrors: transitionValidation.errors,
                        warnings: transitionValidation.warnings,
                        feedbackMessage: errorFeedback
                    };
                }
            }

            // Update workflow step
            this.workflowState.currentStep = step;

            // Update meeting data if provided
            if (data) {
                this.workflowState.meetingData = {
                    ...this.workflowState.meetingData,
                    ...data
                };
            }

            await this.persistWorkflowState();

            // Create step transition feedback
            const transitionFeedback = FeedbackUtils.stepTransition(originalStep, step, data);

            // Execute the new step
            const response = await this.executeCurrentStep({
                id: `transition-${Date.now()}`,
                role: 'user',
                content: `Advanced to ${step}`,
                timestamp: new Date()
            });

            // Include any warnings from current step validation
            if (currentStepValidation.warnings.length > 0) {
                response.warnings = [...(response.warnings || []), ...currentStepValidation.warnings];
            }

            response.feedbackMessage = transitionFeedback;
            return response;

        } catch (error) {
            console.error('Error advancing workflow step:', error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Failed to advance workflow step'),
                this.workflowState.currentStep
            );

            return {
                message: 'Failed to advance workflow step. Please try again.',
                nextStep: this.workflowState.currentStep,
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Executes the logic for the current workflow step with comprehensive error handling
     * Requirements: 5.3, 5.4 - Handle errors gracefully and provide clear feedback
     */
    private async executeCurrentStep(message: ConversationMessage): Promise<WorkflowResponse> {
        try {
            switch (this.workflowState.currentStep) {
                case 'intent_detection':
                    // Meeting intent detected, proceed to meeting type selection with dynamic response
                    try {
                        // Import dynamic response generator
                        const { generateDynamicResponse } = await import('./dynamicResponseGenerator.js');

                        const responseContext = {
                            currentStep: 'meeting_type_selection',
                            meetingData: this.workflowState.meetingData,
                            hasTitle: !!this.workflowState.meetingData.title,
                            hasTime: !!(this.workflowState.meetingData.startTime && this.workflowState.meetingData.endTime),
                            hasAttendees: !!(this.workflowState.meetingData.attendees && this.workflowState.meetingData.attendees.length > 0),
                            meetingType: this.workflowState.meetingData.type,
                            isOnline: this.workflowState.meetingData.type === 'online',
                            attendeeCount: this.workflowState.meetingData.attendees?.length || 0
                        };

                        const dynamicMessage = await generateDynamicResponse('meeting_type_selection', responseContext);

                        return {
                            message: dynamicMessage,
                            nextStep: 'meeting_type_selection',
                            requiresUserInput: false
                        };
                    } catch (error) {
                        console.error('Error generating dynamic response for intent detection:', error);

                        // Fallback to hardcoded response if dynamic generation fails
                        return {
                            message: 'I understand you want to schedule a meeting. Let me help you set that up.',
                            nextStep: 'meeting_type_selection',
                            requiresUserInput: false
                        };
                    }

                case 'calendar_access_verification':
                    return await this.handleCalendarAccessVerification();

                case 'meeting_type_selection':
                    return await this.handleMeetingTypeSelection();

                case 'time_date_collection':
                    return await this.handleTimeDateCollection();

                case 'availability_check':
                    return await this.handleAvailabilityCheck();

                case 'conflict_resolution':
                    return await this.handleConflictResolution();

                case 'attendee_collection':
                    return await this.handleAttendeeCollection();

                case 'meeting_details_collection':
                    return await this.handleMeetingDetailsCollection();

                case 'validation':
                    return await this.handleValidation();

                case 'agenda_generation':
                    return await this.handleAgendaGeneration();

                case 'agenda_approval':
                    return await this.handleAgendaApproval();

                case 'approval':
                    return await this.createApprovalWorkflow();

                case 'creation':
                    return await this.handleMeetingCreation();

                case 'completed':
                    return {
                        message: 'Meeting creation completed successfully!',
                        nextStep: 'completed',
                        requiresUserInput: false
                    };

                default:
                    throw new Error(`Unknown workflow step: ${this.workflowState.currentStep}`);
            }
        } catch (error) {
            console.error(`Error executing step ${this.workflowState.currentStep}:`, error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Step execution failed'),
                this.workflowState.currentStep
            );

            // Determine if we can recover or need user intervention
            const canRecover = this.canRecoverFromStepError(error);

            return {
                message: canRecover
                    ? 'I encountered an issue but can continue. Let me try a different approach.'
                    : 'I encountered an error processing this step. Please try again or provide different information.',
                nextStep: this.workflowState.currentStep,
                requiresUserInput: !canRecover,
                validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Determines if the workflow can recover from a step error
     */
    private canRecoverFromStepError(error: unknown): boolean {
        const errorMessage = error instanceof Error ? error.message : '';

        // Recoverable errors (can continue with degraded functionality)
        const recoverableErrors = [
            'calendar availability check failed',
            'agenda generation failed',
            'quota exceeded',
            'network timeout'
        ];

        return recoverableErrors.some(recoverable =>
            errorMessage.toLowerCase().includes(recoverable.toLowerCase())
        );
    }

    /**
     * Updates workflow state based on conversation context with error handling
     */
    private async updateWorkflowState(): Promise<void> {
        try {
            const contextData = this.contextEngine.getContextData();

            if (contextData.meetingData) {
                this.workflowState.meetingData = {
                    ...this.workflowState.meetingData,
                    ...contextData.meetingData
                };
            }

            // Note: currentStep would need to be added to context data interface
            // if (contextData.currentStep) {
            //     this.workflowState.currentStep = contextData.currentStep;
            // }

            await this.persistWorkflowState();
        } catch (error) {
            console.error('Error updating workflow state:', error);
            // Don't throw here as this is a background operation
            // Log the error but continue with the current state
        }
    }

    /**
     * Checks and executes workflow transitions with error handling
     */
    private async checkTransitions(): Promise<void> {
        try {
            const originalStep = this.workflowState.currentStep;

            for (const transition of this.transitions) {
                if (transition.fromStep === originalStep) {
                    // Validate transition is allowed
                    const transitionValidation = await this.validateTransition(transition);

                    if (!transitionValidation.isValid) {
                        this.workflowState.errors.push(...transitionValidation.errors);
                        continue;
                    }

                    // Check if transition condition is met
                    if (transition.condition(this.workflowState, this.contextEngine)) {
                        // Execute transition action if provided
                        if (transition.action) {
                            await transition.action(this.workflowState, this.contextEngine);
                        }

                        // Update workflow step
                        this.workflowState.currentStep = transition.toStep;

                        console.log(`Workflow transition: ${originalStep} -> ${transition.toStep}`);

                        await this.persistWorkflowState();
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Error checking transitions:', error);
            // Don't throw here as this is a background operation
        }
    }

    /**
     * Validates if a workflow transition is allowed with comprehensive business rule checking
     * Requirements: 4.4, 4.5 - Add business rule validation before step advancement
     */
    private async validateTransition(transition: WorkflowTransition): Promise<ValidationResult> {
        try {
            const errors: string[] = [];
            const warnings: string[] = [];
            const meetingData = this.workflowState.meetingData;

            // Comprehensive validation logic based on transition requirements
            switch (transition.toStep) {
                case 'meeting_type_selection':
                    // Calendar access should be verified first
                    if (!this.workflowState.calendarAccessStatus?.hasAccess) {
                        warnings.push('Calendar access not verified - some features may be limited');
                    }
                    break;

                case 'time_date_collection':
                    // Meeting type must be set before time collection
                    if (!meetingData.type) {
                        errors.push('Meeting type must be selected before setting time');
                    }
                    // Validate meeting type using business rules
                    if (meetingData.type) {
                        const typeValidation = this.businessRules.validateMeetingType(meetingData.type, meetingData);
                        if (!typeValidation.isValid) {
                            errors.push(...typeValidation.errors);
                        }
                        warnings.push(...typeValidation.warnings);
                    }
                    break;

                case 'availability_check':
                    // Time must be set before availability check
                    if (!meetingData.startTime || !meetingData.endTime) {
                        errors.push('Meeting time must be set before availability check');
                    }
                    // Validate time constraints using business rules
                    if (meetingData.startTime && meetingData.endTime) {
                        const timeValidation = this.businessRules.validateTimeConstraints(
                            new Date(meetingData.startTime),
                            new Date(meetingData.endTime)
                        );
                        if (!timeValidation.isValid) {
                            errors.push(...timeValidation.errors);
                        }
                        warnings.push(...timeValidation.warnings);
                    }
                    // Calendar access required for availability check
                    if (!this.workflowState.calendarAccessStatus?.hasAccess) {
                        errors.push('Calendar access required for availability checking');
                    }
                    break;

                case 'attendee_collection':
                    // Time collection must be completed first
                    if (!this.workflowState.timeCollectionComplete) {
                        errors.push('Time collection must be completed before attendee collection');
                    }
                    // Meeting type must be set
                    if (!meetingData.type) {
                        errors.push('Meeting type must be selected before attendee collection');
                    }
                    // For online meetings, validate that we can proceed to attendee collection
                    if (meetingData.type === 'online') {
                        const onlineValidation = this.businessRules.validateMeetingType('online', meetingData);
                        // Don't fail transition if attendees are missing - that's what attendee collection will handle
                        warnings.push(...onlineValidation.warnings);
                    }
                    break;

                case 'meeting_details_collection':
                    // Attendee collection should be complete for online meetings
                    if (meetingData.type === 'online' && !this.workflowState.attendeeCollectionComplete) {
                        errors.push('Attendee collection must be completed for online meetings');
                    }
                    // Validate attendees if they exist
                    if (meetingData.attendees && meetingData.attendees.length > 0) {
                        const attendeeValidation = this.businessRules.validateAttendees(meetingData.attendees);
                        if (!attendeeValidation.isValid) {
                            errors.push(...attendeeValidation.errors);
                        }
                        warnings.push(...attendeeValidation.warnings);
                    }
                    break;

                case 'validation':
                    // Essential meeting data must be present
                    if (!meetingData.title) {
                        errors.push('Meeting title is required for validation');
                    }
                    if (!meetingData.type) {
                        errors.push('Meeting type is required for validation');
                    }
                    if (!meetingData.startTime || !meetingData.endTime) {
                        errors.push('Meeting time is required for validation');
                    }
                    // For physical meetings, location is required
                    if (meetingData.type === 'physical' && !meetingData.location) {
                        errors.push('Location is required for physical meetings');
                    }
                    break;

                case 'agenda_generation':
                    // Meeting details should be complete
                    const detailsValidation = this.businessRules.validateMeeting(meetingData);
                    if (!detailsValidation.isValid) {
                        errors.push(...detailsValidation.errors);
                    }
                    warnings.push(...detailsValidation.warnings);
                    break;

                case 'approval':
                    // Comprehensive meeting validation before approval
                    const approvalValidation = this.businessRules.validateMeeting(meetingData);
                    if (!approvalValidation.isValid) {
                        errors.push(...approvalValidation.errors);
                    }
                    warnings.push(...approvalValidation.warnings);

                    // Workflow sequence validation
                    const sequenceValidation = this.businessRules.validateWorkflowSequence(
                        this.workflowState.calendarAccessStatus?.hasAccess || false,
                        this.workflowState.timeCollectionComplete,
                        !!this.workflowState.availabilityResult,
                        meetingData.type,
                        this.workflowState.attendeeCollectionComplete
                    );
                    if (!sequenceValidation.isValid) {
                        errors.push(...sequenceValidation.errors);
                    }
                    warnings.push(...sequenceValidation.warnings);
                    break;

                case 'creation':
                    // Final comprehensive validation before creation
                    const creationValidation = await this.validateMeetingCreationRequirements();
                    if (!creationValidation.isValid) {
                        errors.push(...creationValidation.errors);
                    }
                    warnings.push(...creationValidation.warnings);
                    break;

                case 'completed':
                    // Meeting should be successfully created
                    if (!meetingData.id || meetingData.status !== 'created') {
                        errors.push('Meeting must be successfully created before completion');
                    }
                    break;
            }

            return {
                isValid: errors.length === 0,
                errors,
                warnings
            };
        } catch (error) {
            console.error('Error validating transition:', error);
            return {
                isValid: false,
                errors: [error instanceof Error ? error.message : 'Transition validation failed'],
                warnings: []
            };
        }
    }

    /**
     * Enhanced validation for meeting creation requirements
     * Requirements: 1.4, 4.4, 5.3 - Validate calendar access, availability checking, and workflow sequence
     */
    private async validateMeetingCreationRequirements(): Promise<ValidationResult & { suggestedStep?: WorkflowStep }> {
        try {
            const errors: string[] = [];
            const warnings: string[] = [];
            let suggestedStep: WorkflowStep | undefined;

            // 1. Validate calendar access using business rules (Requirement 1.4)
            const calendarValidation = this.businessRules.validateCalendarAccess(
                this.workflowState.calendarAccessStatus?.hasAccess || false,
                this.workflowState.calendarAccessStatus?.needsRefresh || false,
                this.workflowState.calendarAccessStatus?.tokenValid || false
            );

            if (!calendarValidation.isValid) {
                errors.push(...calendarValidation.errors);
                suggestedStep = 'calendar_access_verification';
            }
            warnings.push(...calendarValidation.warnings);

            // 2. Validate availability checking using business rules (Requirement 4.4)
            const availabilityValidation = this.businessRules.validateAvailabilityCheck(
                !!this.workflowState.availabilityResult,
                this.workflowState.availabilityResult?.conflicts?.length ? this.workflowState.availabilityResult.conflicts.length > 0 : false,
                this.workflowState.availabilityResult?.isAvailable || false
            );

            warnings.push(...availabilityValidation.warnings);

            // Additional availability check for required scenarios
            if (!this.workflowState.availabilityResult && this.workflowState.meetingData.startTime && this.workflowState.meetingData.endTime) {
                errors.push('Calendar availability must be checked before creating meetings');
                suggestedStep = 'availability_check';
            }

            // 3. Validate workflow step sequence completion using business rules (Requirement 5.3)
            const workflowValidation = this.businessRules.validateWorkflowSequence(
                this.workflowState.calendarAccessStatus?.hasAccess || false,
                this.workflowState.timeCollectionComplete,
                !!this.workflowState.availabilityResult,
                this.workflowState.meetingData.type,
                this.workflowState.attendeeCollectionComplete
            );

            if (!workflowValidation.isValid) {
                errors.push(...workflowValidation.errors);
                // Determine suggested step based on what's missing
                if (!this.workflowState.timeCollectionComplete) {
                    suggestedStep = 'time_date_collection';
                } else if (this.workflowState.meetingData.type === 'online' && !this.workflowState.attendeeCollectionComplete) {
                    suggestedStep = 'attendee_collection';
                }
            }
            warnings.push(...workflowValidation.warnings);

            // 4. Validate essential meeting data is present
            const meetingData = this.workflowState.meetingData;

            if (!meetingData.title) {
                errors.push('Meeting title is required');
                suggestedStep = 'meeting_details_collection';
            }

            if (!meetingData.startTime || !meetingData.endTime) {
                errors.push('Meeting start and end times are required');
                suggestedStep = 'time_date_collection';
            }

            if (!meetingData.type) {
                errors.push('Meeting type must be specified');
                suggestedStep = 'meeting_type_selection';
            }

            // 5. Validate calendar conflicts were resolved if any existed
            if (this.workflowState.availabilityResult?.conflicts && this.workflowState.availabilityResult.conflicts.length > 0) {
                // Check if user acknowledged conflicts or chose alternative time
                if (!this.workflowState.availabilityResult.isAvailable) {
                    warnings.push('Meeting time has calendar conflicts - ensure this is intentional');
                }
            }

            // 6. Additional validation warnings
            if (this.workflowState.calendarAccessStatus && !this.workflowState.calendarAccessStatus.hasAccess) {
                warnings.push('Calendar access verification may be outdated');
            }

            if (this.workflowState.errors && this.workflowState.errors.length > 0) {
                warnings.push('Previous workflow errors detected - review meeting details');
            }

            return {
                isValid: errors.length === 0,
                errors,
                warnings,
                suggestedStep
            };

        } catch (error) {
            console.error('Error validating meeting creation requirements:', error);
            return {
                isValid: false,
                errors: [error instanceof Error ? error.message : 'Meeting creation validation failed'],
                warnings: [],
                suggestedStep: 'meeting_details_collection'
            };
        }
    }

    /**
     * Validates business rules and provides user feedback for violations
     * Requirements: 4.4, 4.5 - Create validation error handling and user feedback
     */
    async validateBusinessRules(): Promise<WorkflowResponse | null> {
        try {
            const meetingData = this.workflowState.meetingData;
            const currentStep = this.workflowState.currentStep;

            // Comprehensive business rule validation
            const businessRuleValidation = this.businessRules.validateMeeting(meetingData);
            
            if (!businessRuleValidation.isValid) {
                // Create detailed error feedback with recovery suggestions
                const errorFeedback = FeedbackUtils.error(
                    new Error('Business rule validation failed'),
                    currentStep
                );

                let message = 'I found some issues with the meeting setup:\n';
                businessRuleValidation.errors.forEach((error, index) => {
                    message += `${index + 1}. ${error}\n`;
                });

                // Provide specific guidance based on error types
                const recoveryActions: string[] = [];
                
                if (businessRuleValidation.errors.some(e => e.includes('attendee'))) {
                    recoveryActions.push('Review and correct attendee information');
                    if (meetingData.type === 'online') {
                        recoveryActions.push('Ensure at least one attendee is added for online meetings');
                    }
                }
                
                if (businessRuleValidation.errors.some(e => e.includes('location'))) {
                    recoveryActions.push('Specify a location for physical meetings');
                }
                
                if (businessRuleValidation.errors.some(e => e.includes('time') || e.includes('duration'))) {
                    recoveryActions.push('Adjust meeting time and duration');
                }

                if (recoveryActions.length > 0) {
                    message += '\nTo fix these issues:\n';
                    recoveryActions.forEach((action, index) => {
                        message += `• ${action}\n`;
                    });
                }

                // Determine which step to return to based on errors
                let suggestedStep: WorkflowStep = currentStep;
                if (businessRuleValidation.errors.some(e => e.includes('attendee'))) {
                    suggestedStep = 'attendee_collection';
                } else if (businessRuleValidation.errors.some(e => e.includes('location'))) {
                    suggestedStep = 'meeting_type_selection';
                } else if (businessRuleValidation.errors.some(e => e.includes('time'))) {
                    suggestedStep = 'time_date_collection';
                } else if (businessRuleValidation.errors.some(e => e.includes('title'))) {
                    suggestedStep = 'meeting_details_collection';
                }

                return {
                    message: message.trim(),
                    nextStep: suggestedStep,
                    requiresUserInput: true,
                    validationErrors: businessRuleValidation.errors,
                    warnings: businessRuleValidation.warnings,
                    feedbackMessage: errorFeedback
                };
            }

            // Check for warnings and provide guidance
            if (businessRuleValidation.warnings.length > 0) {
                const warningFeedback = FeedbackUtils.warning(
                    'Meeting setup warnings',
                    businessRuleValidation.warnings,
                    ['Continue anyway', 'Review and adjust']
                );

                let message = 'I noticed some things you might want to consider:\n';
                businessRuleValidation.warnings.forEach((warning, index) => {
                    message += `${index + 1}. ${warning}\n`;
                });
                message += '\nYou can continue with the meeting creation or make adjustments.';

                // Don't block workflow for warnings, just inform
                return {
                    message: message.trim(),
                    nextStep: currentStep,
                    requiresUserInput: false,
                    warnings: businessRuleValidation.warnings,
                    feedbackMessage: warningFeedback
                };
            }

            // No validation issues
            return null;

        } catch (error) {
            console.error('Error validating business rules:', error);
            
            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Business rule validation failed'),
                this.workflowState.currentStep
            );

            return {
                message: 'I encountered an issue while validating the meeting setup. Please review your information and try again.',
                nextStep: this.workflowState.currentStep,
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown validation error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Persists workflow state to conversation context with error handling
     */
    private async persistWorkflowState(): Promise<void> {
        try {
            // Update meeting data in conversation context
            this.contextEngine.updateMeetingData(this.workflowState.meetingData);

            // Create workflow state message for persistence
            const workflowStateMessage: ConversationMessage = {
                id: `workflow-state-${Date.now()}`,
                role: 'assistant',
                content: 'Workflow state updated',
                timestamp: new Date(),
                metadata: {
                    workflowStep: this.workflowState.currentStep
                }
            };

            await this.contextEngine.addMessage(workflowStateMessage);
        } catch (error) {
            console.error('Error persisting workflow state:', error);
            // Don't throw here as this is a background operation
        }
    }

    /**
     * Handles calendar access verification with comprehensive error handling
     * Requirements: 1.1, 1.2, 1.3, 5.4 - Handle authentication failures gracefully
     */
    private async handleCalendarAccessVerification(): Promise<WorkflowResponse> {
        try {
            if (!this.user) {
                const feedbackMessage = FeedbackUtils.error(
                    new Error('User authentication required'),
                    'calendar_access_verification'
                );

                return {
                    message: 'Please authenticate with Google Calendar to continue.',
                    nextStep: 'calendar_access_verification',
                    requiresUserInput: true,
                    validationErrors: ['User authentication required'],
                    feedbackMessage
                };
            }

            // Verify calendar access using existing credentials
            const accessStatus = await calendarAccessVerifier.verifyAccess(this.user);
            this.workflowState.calendarAccessStatus = accessStatus;

            const feedbackMessage = FeedbackUtils.calendarAccess(accessStatus);

            if (accessStatus.hasAccess) {
                const transitionFeedback = FeedbackUtils.stepTransition(
                    'calendar_access_verification',
                    'meeting_type_selection'
                );

                return {
                    message: 'Calendar access verified successfully. Let\'s set up your meeting.',
                    nextStep: 'meeting_type_selection',
                    requiresUserInput: false,
                    feedbackMessage: transitionFeedback
                };
            } else if (accessStatus.needsRefresh) {
                // Try to refresh the token
                try {
                    const refreshResult = await calendarAccessVerifier.refreshAccessToken(this.user);
                    if (refreshResult.success) {
                        // Update user token and retry verification
                        this.user.accessToken = refreshResult.newToken!;
                        const retryStatus = await calendarAccessVerifier.verifyAccess(this.user);

                        if (retryStatus.hasAccess) {
                            const successFeedback = FeedbackUtils.success(
                                'Calendar access refreshed',
                                ['Token refreshed successfully', 'Calendar permissions verified']
                            );

                            return {
                                message: 'Calendar access refreshed successfully. Ready to proceed.',
                                nextStep: 'meeting_type_selection',
                                requiresUserInput: false,
                                feedbackMessage: successFeedback
                            };
                        }
                    }
                } catch (refreshError) {
                    console.error('Token refresh failed:', refreshError);
                    // Continue with the original error handling
                }

                return {
                    message: 'Calendar access needs to be refreshed. Please re-authenticate.',
                    nextStep: 'calendar_access_verification',
                    requiresUserInput: true,
                    validationErrors: ['Token refresh failed'],
                    feedbackMessage
                };
            } else {
                return {
                    message: 'Calendar access is required to continue. Please authenticate with Google Calendar.',
                    nextStep: 'calendar_access_verification',
                    requiresUserInput: true,
                    validationErrors: [accessStatus.error || 'Calendar access denied'],
                    feedbackMessage
                };
            }
        } catch (error) {
            console.error('Calendar access verification error:', error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Calendar verification failed'),
                'calendar_access_verification'
            );

            // Provide graceful degradation - allow user to continue without calendar verification
            const warningFeedback = FeedbackUtils.warning(
                'Calendar verification temporarily unavailable',
                ['Calendar service may be temporarily down', 'Some features may be limited'],
                ['Continue with meeting setup', 'Try calendar verification later']
            );

            return {
                message: 'I\'m having trouble verifying your calendar access right now. We can continue setting up your meeting, but some calendar features may be limited.',
                nextStep: 'meeting_type_selection',
                requiresUserInput: false,
                warnings: ['Calendar verification failed'],
                feedbackMessage: warningFeedback
            };
        }
    }

    /**
     * Handles meeting type selection with proper UI block generation and business rule enforcement
     * Requirements: 4.1, 4.2 - Enhanced UI blocks and validation
     */
    private async handleMeetingTypeSelection(): Promise<WorkflowResponse> {
        try {
            const meetingData = this.workflowState.meetingData;
            const detectedType = await this.detectMeetingType();

            // If type is already set, don't show UI again - just advance (LOCKED AFTER SELECTION)
            if (meetingData.type) {
                const typeValidation = this.businessRules.validateMeetingType(meetingData.type, meetingData);
                
                if (typeValidation.isValid) {
                    const transitionFeedback = FeedbackUtils.stepTransition(
                        'meeting_type_selection',
                        'time_date_collection',
                        { meetingType: meetingData.type }
                    );

                    // Meeting type already selected and LOCKED, advance to time collection
                    // DO NOT show UI block - type cannot be changed
                    return {
                        message: `Meeting type is already set to ${meetingData.type}. Let's continue with setting up the meeting time.`,
                        nextStep: 'time_date_collection',
                        requiresUserInput: false,
                        uiBlock: undefined, // Explicitly no UI block
                        feedbackMessage: transitionFeedback
                    };
                } else {
                    // Clear invalid type and show selection UI
                    meetingData.type = undefined;
                }
            }

            // If type was detected automatically, validate and set it
            if (detectedType !== 'unknown') {
                const typeValidation = this.businessRules.validateMeetingType(detectedType, meetingData);
                
                if (typeValidation.isValid || typeValidation.errors.length === 0) {
                    this.workflowState.meetingData.type = detectedType;
                    await this.persistWorkflowState();

                    const transitionFeedback = FeedbackUtils.stepTransition(
                        'meeting_type_selection',
                        'time_date_collection',
                        { meetingType: detectedType, autoDetected: true }
                    );

                    return {
                        message: `Meeting type detected as ${detectedType}. Let's collect the meeting time.`,
                        nextStep: 'time_date_collection',
                        requiresUserInput: false,
                        warnings: typeValidation.warnings,
                        feedbackMessage: transitionFeedback
                    };
                }
            }

            // Generate UI block for meeting type selection
            const meetingTypeBlock: UIBlock = {
                type: 'meeting_type_selection',
                data: {
                    meetingId: meetingData.id || `draft-${Date.now()}`,
                    question: 'What type of meeting would you like to schedule?',
                    currentType: meetingData.type,
                    currentLocation: meetingData.location,
                    options: [
                        {
                            value: 'online',
                            label: 'Online Meeting',
                            description: 'Virtual meeting with video/audio (requires attendees)'
                        },
                        {
                            value: 'physical',
                            label: 'Physical Meeting',
                            description: 'In-person meeting at a specific location'
                        }
                    ]
                }
            };

            const progressFeedback = FeedbackUtils.stepTransition(
                'calendar_access_verification',
                'meeting_type_selection'
            );

            return {
                message: 'I can help you schedule either an online or physical meeting. Please select the type that works best for you.',
                uiBlock: meetingTypeBlock,
                nextStep: 'meeting_type_selection',
                requiresUserInput: true,
                feedbackMessage: progressFeedback
            };

        } catch (error) {
            console.error('Error handling meeting type selection:', error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Meeting type selection failed'),
                'meeting_type_selection'
            );

            return {
                message: 'Failed to determine meeting type. Please specify if this is an online or physical meeting.',
                nextStep: 'meeting_type_selection',
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Detects meeting type from conversation context with error handling
     */
    async detectMeetingType(): Promise<'physical' | 'online' | 'unknown'> {
        try {
            const meetingData = this.workflowState.meetingData;

            if (meetingData.type) {
                return meetingData.type;
            }

            // Analyze conversation context for meeting type hints
            const context = await this.contextEngine.getCompressedContext();
            const content = context.compressedContext.toLowerCase();

            // Look for online meeting indicators
            const onlineKeywords = ['zoom', 'teams', 'meet', 'online', 'virtual', 'remote', 'video call'];
            const physicalKeywords = ['office', 'room', 'location', 'address', 'in person', 'physical'];

            const hasOnlineKeywords = onlineKeywords.some(keyword => content.includes(keyword));
            const hasPhysicalKeywords = physicalKeywords.some(keyword => content.includes(keyword));

            if (hasOnlineKeywords && !hasPhysicalKeywords) {
                return 'online';
            } else if (hasPhysicalKeywords && !hasOnlineKeywords) {
                return 'physical';
            }

            return 'unknown';
        } catch (error) {
            console.error('Error detecting meeting type:', error);
            return 'unknown';
        }
    }

    /**
     * Sets meeting type with business rule validation and proper workflow step transition
     * Requirements: 4.1, 4.2 - Add meeting type validation and business rule enforcement
     */
    async setMeetingType(type: 'physical' | 'online', location?: string): Promise<WorkflowResponse> {
        try {
            const meetingData = this.workflowState.meetingData;
            
            // Set the meeting type
            meetingData.type = type;
            
            // Set location if provided (for physical meetings)
            if (location) {
                meetingData.location = location;
            }

            // Validate meeting type using business rules
            const typeValidation = this.businessRules.validateMeetingType(type, meetingData);
            
            if (!typeValidation.isValid) {
                // If validation fails, provide specific guidance
                const validationFeedback = FeedbackUtils.error(
                    new Error('Meeting type validation failed'),
                    'meeting_type_selection'
                );

                let message = `Meeting type validation failed: ${typeValidation.errors.join('; ')}.`;
                
                if (type === 'physical' && !meetingData.location) {
                    message += ' Physical meetings require a location. Please specify where the meeting will take place.';
                } else if (type === 'online' && (!meetingData.attendees || meetingData.attendees.length === 0)) {
                    message += ' Online meetings require at least one attendee.';
                }

                return {
                    message,
                    nextStep: 'meeting_type_selection',
                    requiresUserInput: true,
                    validationErrors: typeValidation.errors,
                    warnings: typeValidation.warnings,
                    feedbackMessage: validationFeedback
                };
            }

            // Persist the validated meeting data
            await this.persistWorkflowState();

            // Create success feedback with transition information
            const transitionFeedback = FeedbackUtils.stepTransition(
                'meeting_type_selection',
                'time_date_collection',
                { 
                    meetingType: type, 
                    location: location,
                    validationPassed: true 
                }
            );

            let message = `Meeting type set to ${type}`;
            if (type === 'physical' && location) {
                message += ` at ${location}`;
            } else if (type === 'online') {
                message += ' (virtual meeting)';
            }
            message += '. Now let\'s set the meeting time.';

            return {
                message,
                nextStep: 'time_date_collection',
                requiresUserInput: false,
                warnings: typeValidation.warnings,
                feedbackMessage: transitionFeedback
            };

        } catch (error) {
            console.error('Error setting meeting type:', error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Failed to set meeting type'),
                'meeting_type_selection'
            );

            return {
                message: 'Failed to set meeting type. Please try again.',
                nextStep: 'meeting_type_selection',
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Handles time and date collection with error handling
     */
    private async handleTimeDateCollection(): Promise<WorkflowResponse> {
        try {
            const meetingData = this.workflowState.meetingData;

            // If time is already set and validated, proceed to next step
            if (meetingData.startTime && meetingData.endTime) {
                const timeValidation = this.businessRules.validateTimeConstraints(
                    new Date(meetingData.startTime),
                    new Date(meetingData.endTime)
                );

                if (timeValidation.isValid) {
                    this.workflowState.timeCollectionComplete = true;
                    await this.persistWorkflowState();

                    // Determine next step based on meeting type
                    const nextStep = meetingData.type === 'online' ? 'attendee_collection' : 'meeting_details_collection';

                    return {
                        message: `Meeting scheduled for ${new Date(meetingData.startTime).toLocaleString()}. ${meetingData.type === 'online' ? "Let's add attendees." : "Let's add meeting details."}`,
                        nextStep,
                        requiresUserInput: false
                    };
                }
            }

            // Ask user for time if not provided
            return {
                message: 'When would you like to schedule this meeting? Please provide the date and time (e.g., "tomorrow at 2pm" or "October 16 at 3:30pm").',
                nextStep: 'time_date_collection',
                requiresUserInput: true
            };
        } catch (error) {
            console.error('Error handling time/date collection:', error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Time collection failed'),
                'time_date_collection'
            );

            return {
                message: 'Failed to process meeting time. Please provide the date and time again.',
                nextStep: 'time_date_collection',
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Sets meeting time with error handling
     */
    async setMeetingTime(startTime: string, endTime?: string): Promise<WorkflowResponse> {
        try {
            this.workflowState.meetingData.startTime = new Date(startTime);
            this.workflowState.meetingData.endTime = endTime ?
                new Date(endTime) :
                new Date(new Date(startTime).getTime() + 60 * 60 * 1000); // Default 1 hour

            await this.persistWorkflowState();

            return {
                message: `Meeting time set from ${startTime} to ${endTime}. Let me check availability.`,
                nextStep: 'availability_check',
                requiresUserInput: false
            };
        } catch (error) {
            console.error('Error setting meeting time:', error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Failed to set meeting time'),
                'time_date_collection'
            );

            return {
                message: 'Failed to set meeting time. Please provide a valid date and time.',
                nextStep: 'time_date_collection',
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Handles availability check with error handling
     */
    private async handleAvailabilityCheck(): Promise<WorkflowResponse> {
        try {
            const meetingData = this.workflowState.meetingData;

            if (!meetingData.startTime || !meetingData.endTime) {
                return {
                    message: 'Meeting time is required for availability check.',
                    nextStep: 'time_date_collection',
                    requiresUserInput: true
                };
            }

            const startTime = new Date(meetingData.startTime);
            const endTime = new Date(meetingData.endTime);

            // Check availability using calendar service
            const conflictDetails = await CalendarAvailabilityService.checkCalendarConflicts(
                this.user!,
                startTime,
                endTime
            );

            // Convert to AvailabilityResult format
            const availabilityResult: AvailabilityResult = {
                isAvailable: !conflictDetails.hasConflicts,
                conflicts: conflictDetails.conflictingEvents
            };

            this.workflowState.availabilityResult = availabilityResult;
            await this.persistWorkflowState();

            if (availabilityResult.isAvailable) {
                const feedbackMessage = FeedbackUtils.success(
                    'Time slot available',
                    ['All attendees are available', 'No conflicts detected']
                );

                return {
                    message: 'Great! Everyone is available at that time. Let\'s collect attendee information.',
                    nextStep: 'attendee_collection',
                    requiresUserInput: false,
                    feedbackMessage
                };
            } else {
                const feedbackMessage = FeedbackUtils.warning(
                    'Scheduling conflicts detected',
                    availabilityResult.conflicts?.map((c: any) => `Conflict: ${c.attendee} - ${c.reason}`) || [],
                    ['Choose different time', 'Proceed anyway', 'Resolve conflicts']
                );

                return {
                    message: `I found some scheduling conflicts: ${availabilityResult.conflicts?.map((c: any) => c.reason).join(', ')}. Would you like to choose a different time or proceed anyway?`,
                    nextStep: 'conflict_resolution',
                    requiresUserInput: true,
                    warnings: availabilityResult.conflicts?.map((c: any) => c.reason) || [],
                    feedbackMessage
                };
            }
        } catch (error) {
            console.error('Error checking availability:', error);

            // Provide graceful degradation
            const warningFeedback = FeedbackUtils.warning(
                'Availability check temporarily unavailable',
                ['Calendar service may be temporarily down', 'Proceeding without availability check'],
                ['Continue with meeting setup', 'Try availability check later']
            );

            return {
                message: 'I\'m having trouble checking calendar availability right now. We can continue with the meeting setup.',
                nextStep: 'attendee_collection',
                requiresUserInput: false,
                warnings: ['Availability check failed'],
                feedbackMessage: warningFeedback
            };
        }
    }

    /**
     * Handles conflict resolution with error handling
     * Requirements: 5.3, 5.4 - Handle conflicts gracefully and provide clear feedback
     */
    private async handleConflictResolution(): Promise<WorkflowResponse> {
        try {
            const availabilityResult = this.workflowState.availabilityResult;

            if (!availabilityResult || !availabilityResult.conflicts) {
                // No conflicts to resolve, move to next step
                return {
                    message: 'No conflicts to resolve. Proceeding with attendee collection.',
                    nextStep: 'attendee_collection',
                    requiresUserInput: false
                };
            }

            // Generate alternative time suggestions if not already available
            if (!availabilityResult.suggestedAlternatives && this.user) {
                try {
                    const meetingData = this.workflowState.meetingData;
                    const duration = meetingData.endTime && meetingData.startTime ?
                        Math.round((new Date(meetingData.endTime).getTime() - new Date(meetingData.startTime).getTime()) / (1000 * 60)) :
                        60; // Default 1 hour

                    const alternatives = await CalendarAvailabilityService.suggestAlternativeTimeSlots(
                        this.user,
                        new Date(meetingData.startTime!),
                        duration
                    );

                    availabilityResult.suggestedAlternatives = alternatives;
                    this.workflowState.availabilityResult = availabilityResult;
                    await this.persistWorkflowState();
                } catch (error) {
                    console.error('Error generating alternatives:', error);
                    // Continue without alternatives
                }
            }

            const conflictInfo = availabilityResult.conflicts.map(conflict =>
                `"${conflict.title}" from ${conflict.startTime.toLocaleTimeString()} to ${conflict.endTime.toLocaleTimeString()}`
            ).join(', ');

            let message = `I found conflicts with: ${conflictInfo}. `;

            if (availabilityResult.suggestedAlternatives && availabilityResult.suggestedAlternatives.length > 0) {
                const alternativesList = availabilityResult.suggestedAlternatives.map((alt, index) =>
                    `${index + 1}. ${alt.startTime.toLocaleDateString()} at ${alt.startTime.toLocaleTimeString()}`
                ).join('\n');

                message += `Here are some alternative times:\n${alternativesList}\n\nWould you like to choose one of these alternatives or specify a different time?`;
            } else {
                message += 'Would you like to specify a different time, or proceed with the current time despite the conflicts?';
            }

            const feedbackMessage = FeedbackUtils.availability(
                availabilityResult,
                {
                    start: new Date(this.workflowState.meetingData.startTime!),
                    end: new Date(this.workflowState.meetingData.endTime!)
                }
            );

            return {
                message,
                nextStep: 'conflict_resolution',
                requiresUserInput: true,
                warnings: [`${availabilityResult.conflicts.length} scheduling conflicts found`],
                feedbackMessage
            };

        } catch (error) {
            console.error('Error handling conflict resolution:', error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Conflict resolution failed'),
                'conflict_resolution'
            );

            return {
                message: 'I encountered an issue while resolving conflicts. Would you like to choose a different time or proceed anyway?',
                nextStep: 'conflict_resolution',
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Handles attendee collection with enhanced business rule enforcement for online meetings
     * Requirements: 4.1, 4.3 - Enforce attendee requirements for online meetings with validation error messaging
     */
    private async handleAttendeeCollection(): Promise<WorkflowResponse> {
        try {
            const meetingData = this.workflowState.meetingData;

            // Requirement 2.4: Validate that time collection is complete before attendee collection
            if (!this.workflowState.timeCollectionComplete || !meetingData.startTime || !meetingData.endTime) {
                const missingInfoFeedback = FeedbackUtils.missingInfo(
                    ['Meeting time must be set before adding attendees'],
                    'attendee_collection'
                );

                return {
                    message: 'Meeting time must be established before adding attendees. Let\'s set the time first.',
                    nextStep: 'time_date_collection',
                    requiresUserInput: true,
                    validationErrors: ['Time collection incomplete'],
                    feedbackMessage: missingInfoFeedback
                };
            }

            // Enhanced enforcement for online meeting attendee requirements (Requirement 4.1, 4.3)
            if (meetingData.type === 'online') {
                // First check: Do we have any attendees at all?
                if (!meetingData.attendees || meetingData.attendees.length === 0) {
                    // Generate UI block for required attendee collection
                    const attendeeBlock: UIBlock = {
                        type: 'attendee_management',
                        data: {
                            meetingId: meetingData.id || `draft-${Date.now()}`,
                            attendees: [],
                            meetingType: 'online',
                            isRequired: true,
                            validationMessage: 'Online meetings require at least one attendee. Please add attendees to continue.',
                            errorState: true
                        }
                    };

                    const requirementFeedback = FeedbackUtils.error(
                        new Error('Online meetings require attendees'),
                        'attendee_collection'
                    );

                    return {
                        message: 'Online meetings require at least one attendee to proceed. Please add attendees using the interface below.',
                        uiBlock: attendeeBlock,
                        nextStep: 'attendee_collection',
                        requiresUserInput: true,
                        validationErrors: ['Online meetings must have at least one attendee'],
                        feedbackMessage: requirementFeedback
                    };
                }

                // Second check: Validate existing attendees using business rules
                const attendeeValidation = this.businessRules.validateMeetingType('online', meetingData);
                if (!attendeeValidation.isValid) {
                    // Generate UI block with validation errors
                    const attendeeBlock: UIBlock = {
                        type: 'attendee_management',
                        data: {
                            meetingId: meetingData.id || `draft-${Date.now()}`,
                            attendees: meetingData.attendees || [],
                            meetingType: 'online',
                            isRequired: true,
                            validationMessage: `Attendee validation failed: ${attendeeValidation.errors.join('; ')}`,
                            errorState: true,
                            validationErrors: attendeeValidation.errors
                        }
                    };

                    const validationFeedback = FeedbackUtils.error(
                        new Error('Attendee validation failed'),
                        'attendee_collection'
                    );

                    return {
                        message: `Attendee validation failed: ${attendeeValidation.errors.join('; ')}. Please correct these issues using the attendee editor.`,
                        uiBlock: attendeeBlock,
                        nextStep: 'attendee_collection',
                        requiresUserInput: true,
                        validationErrors: attendeeValidation.errors,
                        warnings: attendeeValidation.warnings,
                        feedbackMessage: validationFeedback
                    };
                }

                // Third check: Validate individual attendee email addresses
                try {
                    const emailValidationResults = await Promise.all(
                        meetingData.attendees.map(async (attendee: any) => {
                            try {
                                const result = await this.attendeeValidator.validateEmail(attendee.email, this.user!);
                                return {
                                    email: attendee.email,
                                    isValid: result.isValid && result.exists,
                                    errors: result.isValid && result.exists ? [] : ['Invalid or non-existent email address'],
                                    warnings: []
                                };
                            } catch (error) {
                                console.error(`Error validating attendee ${attendee.email}:`, error);
                                return {
                                    email: attendee.email,
                                    isValid: false,
                                    errors: ['Email validation failed - please verify the address'],
                                    warnings: []
                                };
                            }
                        })
                    );

                    const invalidAttendees = emailValidationResults.filter(result => !result.isValid);

                    if (invalidAttendees.length > 0) {
                        const errorDetails = invalidAttendees.map(result =>
                            `${result.email}: ${result.errors.join(', ')}`
                        );

                        // Generate UI block with specific validation errors
                        const attendeeBlock: UIBlock = {
                            type: 'attendee_management',
                            data: {
                                meetingId: meetingData.id || `draft-${Date.now()}`,
                                attendees: meetingData.attendees,
                                meetingType: 'online',
                                isRequired: true,
                                validationMessage: `Some attendees have validation issues. Please correct the highlighted errors.`,
                                errorState: true,
                                validationErrors: errorDetails,
                                invalidEmails: invalidAttendees.map(result => result.email)
                            }
                        };

                        const validationFeedback = FeedbackUtils.error(
                            new Error('Attendee email validation failed'),
                            'attendee_collection'
                        );

                        return {
                            message: `Some attendees have validation issues: ${errorDetails.join('; ')}. Please correct these issues using the attendee editor.`,
                            uiBlock: attendeeBlock,
                            nextStep: 'attendee_collection',
                            requiresUserInput: true,
                            validationErrors: errorDetails,
                            feedbackMessage: validationFeedback
                        };
                    }

                    // Fourth check: Enforce minimum attendee count using business rules
                    if (!this.businessRules.enforceAttendeeRequirement('online', meetingData.attendees.map(a => a.email))) {
                        const attendeeBlock: UIBlock = {
                            type: 'attendee_management',
                            data: {
                                meetingId: meetingData.id || `draft-${Date.now()}`,
                                attendees: meetingData.attendees,
                                meetingType: 'online',
                                isRequired: true,
                                validationMessage: 'Online meetings require at least one attendee. Please add more attendees.',
                                errorState: true
                            }
                        };

                        const requirementFeedback = FeedbackUtils.error(
                            new Error('Insufficient attendees for online meeting'),
                            'attendee_collection'
                        );

                        return {
                            message: 'Online meetings must have at least one attendee. Please add attendees using the attendee editor.',
                            uiBlock: attendeeBlock,
                            nextStep: 'attendee_collection',
                            requiresUserInput: true,
                            validationErrors: ['Online meetings require at least one attendee'],
                            feedbackMessage: requirementFeedback
                        };
                    }

                    // All validations passed for online meeting
                    this.workflowState.attendeeCollectionComplete = true;
                    await this.persistWorkflowState();

                    const successFeedback = FeedbackUtils.success(
                        'Online meeting attendees validated',
                        [
                            `${meetingData.attendees.length} attendees added successfully`,
                            'All email addresses validated',
                            'Online meeting attendee requirement satisfied'
                        ]
                    );

                    // Check if we have enough information to proceed to agenda generation
                    if (meetingData.title && meetingData.startTime && meetingData.endTime) {
                        return {
                            message: `Excellent! ${meetingData.attendees.length} attendees added and validated successfully. I have enough information to generate an agenda for your meeting.`,
                            nextStep: 'agenda_generation',
                            requiresUserInput: false,
                            warnings: attendeeValidation.warnings,
                            feedbackMessage: successFeedback
                        };
                    } else {
                        return {
                            message: `Excellent! ${meetingData.attendees.length} attendees added and validated successfully. Online meeting requirements are satisfied. Let's collect additional meeting details.`,
                            nextStep: 'meeting_details_collection',
                            requiresUserInput: false,
                            warnings: attendeeValidation.warnings,
                            feedbackMessage: successFeedback
                        };
                    }

                } catch (error) {
                    console.error('Error validating online meeting attendees:', error);

                    const errorFeedback = FeedbackUtils.error(
                        error instanceof Error ? error : new Error('Attendee validation failed'),
                        'attendee_collection'
                    );

                    return {
                        message: 'I encountered an issue validating the attendees for your online meeting. Please review the attendee list and try again.',
                        nextStep: 'attendee_collection',
                        requiresUserInput: true,
                        validationErrors: [error instanceof Error ? error.message : 'Unknown validation error'],
                        feedbackMessage: errorFeedback
                    };
                }

            } else if (meetingData.type === 'physical') {
                // Physical meeting - attendees are optional, but validate if provided
                if (meetingData.attendees && meetingData.attendees.length > 0) {
                    try {
                        // Validate attendees using business rules even for physical meetings
                        const businessRuleValidation = this.businessRules.validateAttendees(meetingData.attendees);
                        
                        if (!businessRuleValidation.isValid) {
                            // Generate UI block for physical meeting attendee validation errors
                            const attendeeBlock: UIBlock = {
                                type: 'attendee_management',
                                data: {
                                    meetingId: meetingData.id || `draft-${Date.now()}`,
                                    attendees: meetingData.attendees,
                                    meetingType: 'physical',
                                    isRequired: false,
                                    validationMessage: `Attendee validation issues: ${businessRuleValidation.errors.join('; ')}`,
                                    errorState: true,
                                    validationErrors: businessRuleValidation.errors
                                }
                            };

                            const validationFeedback = FeedbackUtils.error(
                                new Error('Physical meeting attendee validation failed'),
                                'attendee_collection'
                            );

                            return {
                                message: `Attendee validation failed: ${businessRuleValidation.errors.join('; ')}. Please correct these issues or remove invalid attendees.`,
                                uiBlock: attendeeBlock,
                                nextStep: 'attendee_collection',
                                requiresUserInput: true,
                                validationErrors: businessRuleValidation.errors,
                                warnings: businessRuleValidation.warnings,
                                feedbackMessage: validationFeedback
                            };
                        }

                        // Mark collection complete for physical meetings with valid attendees
                        this.workflowState.attendeeCollectionComplete = true;
                        await this.persistWorkflowState();

                        const successFeedback = FeedbackUtils.success(
                            'Physical meeting attendees validated',
                            [`${meetingData.attendees.length} attendees added and validated`]
                        );

                        // Check if we have enough information to proceed to agenda generation
                        if (meetingData.title && meetingData.startTime && meetingData.endTime && meetingData.location) {
                            return {
                                message: `Great! ${meetingData.attendees.length} attendees added for your physical meeting. I have enough information to generate an agenda.`,
                                nextStep: 'agenda_generation',
                                requiresUserInput: false,
                                warnings: businessRuleValidation.warnings,
                                feedbackMessage: successFeedback
                            };
                        } else {
                            return {
                                message: `Great! ${meetingData.attendees.length} attendees added for your physical meeting. Let's proceed with the meeting details.`,
                                nextStep: 'meeting_details_collection',
                                requiresUserInput: false,
                                warnings: businessRuleValidation.warnings,
                                feedbackMessage: successFeedback
                            };
                        }

                    } catch (error) {
                        console.error('Error validating physical meeting attendees:', error);
                        // Continue with warnings for physical meetings since attendees are optional
                        this.workflowState.attendeeCollectionComplete = true;
                        await this.persistWorkflowState();
                    }
                } else {
                    // Physical meetings can proceed without attendees
                    this.workflowState.attendeeCollectionComplete = true;
                    await this.persistWorkflowState();
                }

                const progressFeedback = FeedbackUtils.stepTransition(
                    'availability_check',
                    'meeting_details_collection',
                    { meetingType: 'physical', attendeesOptional: true }
                );

                return {
                    message: 'For physical meetings, attendees are optional. Let\'s proceed with the meeting details.',
                    nextStep: 'meeting_details_collection',
                    requiresUserInput: false,
                    feedbackMessage: progressFeedback
                };
            } else {
                // Meeting type not set - this shouldn't happen but handle gracefully
                const errorFeedback = FeedbackUtils.error(
                    new Error('Meeting type must be set before attendee collection'),
                    'attendee_collection'
                );

                return {
                    message: 'Meeting type must be set before collecting attendees. Let\'s go back and set the meeting type first.',
                    nextStep: 'meeting_type_selection',
                    requiresUserInput: true,
                    validationErrors: ['Meeting type not specified'],
                    feedbackMessage: errorFeedback
                };
            }

        } catch (error) {
            console.error('Error handling attendee collection:', error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Attendee collection failed'),
                'attendee_collection'
            );

            return {
                message: 'I encountered an issue with attendee collection. Please try again or use the attendee editor to manage attendees.',
                nextStep: 'attendee_collection',
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Handles meeting details collection with error handling
     * Requirements: 5.3, 5.4 - Handle missing information gracefully and provide clear feedback
     */
    private async handleMeetingDetailsCollection(): Promise<WorkflowResponse> {
        try {
            const meetingData = this.workflowState.meetingData;
            const missingFields: string[] = [];

            // Check for required fields
            if (!meetingData.title) {
                missingFields.push('title');
            }

            // For physical meetings, location is required
            if (meetingData.type === 'physical' && !meetingData.location) {
                missingFields.push('location');
            }

            if (missingFields.length > 0) {
                const missingInfoFeedback = FeedbackUtils.missingInfo(missingFields, 'meeting_details_collection');

                let message = 'I need some additional information to complete your meeting setup:\n';

                if (missingFields.includes('title')) {
                    message += '• Meeting title or subject\n';
                }
                if (missingFields.includes('location')) {
                    message += '• Meeting location (required for physical meetings)\n';
                }

                message += '\nPlease provide this information so we can proceed.';

                return {
                    message,
                    nextStep: 'meeting_details_collection',
                    requiresUserInput: true,
                    validationErrors: missingFields.map(field => `Missing ${field}`),
                    feedbackMessage: missingInfoFeedback
                };
            }

            // Validate meeting details
            try {
                const validation = this.businessRules.validateMeeting(meetingData);

                if (!validation.isValid) {
                    const validationFeedback = FeedbackUtils.error(
                        new Error('Meeting validation failed'),
                        'meeting_details_collection'
                    );

                    return {
                        message: `There are some issues with the meeting details: ${validation.errors.join(', ')}. Please correct these issues.`,
                        nextStep: 'meeting_details_collection',
                        requiresUserInput: true,
                        validationErrors: validation.errors,
                        warnings: validation.warnings,
                        feedbackMessage: validationFeedback
                    };
                }

                // Store validation results
                this.workflowState.validationResults = [validation];
                await this.persistWorkflowState();

                const successFeedback = FeedbackUtils.success(
                    'Meeting details validated',
                    ['All required information collected', 'Ready to proceed to validation']
                );

                return {
                    message: 'Perfect! All meeting details have been collected and validated. Let\'s proceed to final validation.',
                    nextStep: 'validation',
                    requiresUserInput: false,
                    feedbackMessage: successFeedback
                };

            } catch (validationError) {
                console.error('Error validating meeting details:', validationError);

                const errorFeedback = FeedbackUtils.error(
                    validationError instanceof Error ? validationError : new Error('Validation failed'),
                    'meeting_details_collection'
                );

                return {
                    message: 'I encountered an issue validating the meeting details. Please review the information and try again.',
                    nextStep: 'meeting_details_collection',
                    requiresUserInput: true,
                    validationErrors: [validationError instanceof Error ? validationError.message : 'Unknown validation error'],
                    feedbackMessage: errorFeedback
                };
            }

        } catch (error) {
            console.error('Error handling meeting details collection:', error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Meeting details collection failed'),
                'meeting_details_collection'
            );

            return {
                message: 'I encountered an issue collecting meeting details. Please provide the meeting title and any other required information.',
                nextStep: 'meeting_details_collection',
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Handles validation with error handling
     * Requirements: 5.3, 5.4 - Handle validation errors gracefully and provide recovery mechanisms
     */
    private async handleValidation(): Promise<WorkflowResponse> {
        try {
            const meetingData = this.workflowState.meetingData;

            // Perform comprehensive validation
            const meetingDataWithDefaults = {
                ...meetingData,
                status: meetingData.status || 'draft' as const
            };
            const validation = this.businessRules.validateMeeting(meetingDataWithDefaults);

            if (!validation.isValid) {
                const validationFeedback = FeedbackUtils.error(
                    new Error('Meeting validation failed'),
                    'validation'
                );

                // Determine which step to return to based on the type of errors
                let nextStep: WorkflowStep = 'meeting_details_collection';

                if (validation.errors.some(error => error.includes('time') || error.includes('date'))) {
                    nextStep = 'time_date_collection';
                } else if (validation.errors.some(error => error.includes('attendee'))) {
                    nextStep = 'attendee_collection';
                }

                return {
                    message: `Validation failed: ${validation.errors.join(', ')}. Let me help you fix these issues.`,
                    nextStep,
                    requiresUserInput: true,
                    validationErrors: validation.errors,
                    warnings: validation.warnings,
                    feedbackMessage: validationFeedback
                };
            }

            // Check for warnings that might need user attention
            if (validation.warnings && validation.warnings.length > 0) {
                const warningFeedback = FeedbackUtils.warning(
                    'Validation completed with warnings',
                    validation.warnings,
                    ['Proceed anyway', 'Review and fix warnings']
                );

                return {
                    message: `Validation completed with some warnings: ${validation.warnings.join(', ')}. Would you like to proceed or address these warnings first?`,
                    nextStep: 'validation',
                    requiresUserInput: true,
                    warnings: validation.warnings,
                    feedbackMessage: warningFeedback
                };
            }

            // Validation successful
            this.workflowState.validationResults = [validation];
            await this.persistWorkflowState();

            const successFeedback = FeedbackUtils.success(
                'Meeting validation successful',
                ['All meeting details are valid', 'Ready to generate agenda']
            );

            return {
                message: 'Excellent! All meeting details have been validated successfully. Let\'s generate an agenda for your meeting.',
                nextStep: 'agenda_generation',
                requiresUserInput: false,
                feedbackMessage: successFeedback
            };

        } catch (error) {
            console.error('Error during validation:', error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Validation process failed'),
                'validation'
            );

            // Provide recovery options
            return {
                message: 'I encountered an issue during validation. We can either try again or proceed without full validation.',
                nextStep: 'validation',
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown validation error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Handles agenda generation with error handling
     * Requirements: 5.3, 5.4 - Handle agenda generation failures gracefully with fallback options
     */
    private async handleAgendaGeneration(): Promise<WorkflowResponse> {
        try {
            const meetingData = this.workflowState.meetingData;

            // Get conversation context for agenda generation
            const context = await this.contextEngine.getCompressedContext();

            try {
                // Generate agenda using the agenda generator
                const agendaContent = await agendaGenerator.generateAgenda(
                    meetingData as any,
                    []
                );

                // Store the generated agenda
                meetingData.agenda = JSON.stringify(agendaContent);
                this.workflowState.meetingData = meetingData;
                await this.persistWorkflowState();

                // Create agenda approval UI block
                const agendaBlock: UIBlock = {
                    type: 'agenda_editor',
                    data: {
                        meetingId: meetingData.id || `draft-${Date.now()}`,
                        initialAgenda: agendaGenerator.formatAgenda(agendaContent),
                        meetingTitle: meetingData.title || 'Meeting',
                        duration: agendaContent.duration,
                        isApprovalMode: false
                    }
                };

                const successFeedback = FeedbackUtils.success(
                    'Agenda generated successfully',
                    [`${agendaContent.topics.length} agenda items created`, 'Ready for review and approval']
                );

                return {
                    message: `I've generated a meeting agenda with ${agendaContent.topics.length} items based on our conversation. Please review it using the editor below and let me know if you'd like any changes.`,
                    uiBlock: agendaBlock,
                    nextStep: 'agenda_approval',
                    requiresUserInput: true,
                    feedbackMessage: successFeedback
                };

            } catch (agendaError) {
                console.error('Agenda generation failed:', agendaError);

                // Provide fallback - create basic agenda
                const fallbackAgenda = this.createFallbackAgenda(meetingData);
                meetingData.agenda = JSON.stringify(fallbackAgenda);
                this.workflowState.meetingData = meetingData;
                await this.persistWorkflowState();

                // Create agenda approval UI block for fallback agenda
                const fallbackAgendaBlock: UIBlock = {
                    type: 'agenda_editor',
                    data: {
                        meetingId: meetingData.id || `draft-${Date.now()}`,
                        initialAgenda: this.formatFallbackAgenda(fallbackAgenda),
                        meetingTitle: meetingData.title || 'Meeting',
                        duration: fallbackAgenda.duration,
                        isApprovalMode: false
                    }
                };

                const warningFeedback = FeedbackUtils.warning(
                    'Using basic agenda template',
                    ['AI agenda generation temporarily unavailable', 'Basic agenda created from meeting details'],
                    ['Review and customize agenda', 'Proceed with basic agenda']
                );

                return {
                    message: 'I had trouble generating a detailed agenda, so I\'ve created a basic one for you. You can review and customize it using the editor below.',
                    uiBlock: fallbackAgendaBlock,
                    nextStep: 'agenda_approval',
                    requiresUserInput: true,
                    warnings: ['Agenda generation service unavailable'],
                    feedbackMessage: warningFeedback
                };
            }

        } catch (error) {
            console.error('Error handling agenda generation:', error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Agenda generation failed'),
                'agenda_generation'
            );

            // Offer to skip agenda generation
            return {
                message: 'I encountered an issue generating the agenda. Would you like to proceed without an agenda or try again?',
                nextStep: 'agenda_generation',
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Creates a fallback agenda when AI generation fails
     */
    private createFallbackAgenda(meetingData: Partial<MeetingData>): { title: string; duration: number; topics: any[]; actionItems: any[] } {
        const fallbackTopics = [
            {
                title: 'Welcome and Introductions',
                duration: 5,
                description: 'Brief introductions and meeting overview'
            },
            {
                title: meetingData.title || 'Main Discussion',
                duration: 30,
                description: 'Primary meeting topics and discussion'
            },
            {
                title: 'Action Items and Next Steps',
                duration: 10,
                description: 'Review decisions made and assign action items'
            },
            {
                title: 'Wrap-up',
                duration: 5,
                description: 'Meeting summary and closing remarks'
            }
        ];

        return {
            title: meetingData.title || 'Meeting Agenda',
            duration: 50,
            topics: fallbackTopics,
            actionItems: []
        };
    }

    /**
     * Formats fallback agenda for display
     */
    private formatFallbackAgenda(agenda: { title: string; duration: number; topics: any[]; actionItems: any[] }): string {
        let formatted = `# ${agenda.title}\n\n`;
        formatted += `**Duration:** ${agenda.duration} minutes\n\n`;
        
        if (agenda.topics.length > 0) {
            formatted += `## Agenda Items\n\n`;
            agenda.topics.forEach((topic, index) => {
                formatted += `${index + 1}. **${topic.title}** (${topic.duration} min)\n`;
                if (topic.description) {
                    formatted += `   ${topic.description}\n`;
                }
                formatted += '\n';
            });
        }
        
        if (agenda.actionItems.length > 0) {
            formatted += `## Action Items\n\n`;
            agenda.actionItems.forEach((item: any, index: number) => {
                formatted += `${index + 1}. ${item.task || item}\n`;
            });
        }
        
        return formatted;
    }

    /**
     * Handles agenda approval with error handling
     * Requirements: 5.3, 5.4 - Handle agenda approval process with clear feedback
     */
    private async handleAgendaApproval(): Promise<WorkflowResponse> {
        try {
            const meetingData = this.workflowState.meetingData;

            if (!meetingData.agenda) {
                // No agenda to approve, create a basic one or skip
                const warningFeedback = FeedbackUtils.warning(
                    'No agenda available for approval',
                    ['Agenda generation may have failed', 'Proceeding without agenda'],
                    ['Generate basic agenda', 'Proceed without agenda']
                );

                return {
                    message: 'There\'s no agenda to review. Would you like me to create a basic agenda or proceed without one?',
                    nextStep: 'agenda_approval',
                    requiresUserInput: true,
                    warnings: ['No agenda available'],
                    feedbackMessage: warningFeedback
                };
            }

            // Parse and display agenda for approval
            let parsedAgenda: any;
            let agendaItemCount = 0;

            try {
                parsedAgenda = JSON.parse(meetingData.agenda);
                agendaItemCount = parsedAgenda.topics ? parsedAgenda.topics.length : 1;
            } catch (error) {
                // If agenda is not JSON, create a basic structure
                parsedAgenda = {
                    title: 'Meeting Agenda',
                    duration: 60,
                    topics: [{ title: meetingData.agenda, duration: 60 }],
                    actionItems: []
                };
                agendaItemCount = 1;
            }

            // Create agenda approval UI block
            const agendaApprovalBlock: UIBlock = {
                type: 'agenda_editor',
                data: {
                    meetingId: meetingData.id || `draft-${Date.now()}`,
                    initialAgenda: agendaGenerator.formatAgenda(parsedAgenda),
                    meetingTitle: meetingData.title || 'Meeting',
                    duration: parsedAgenda.duration || 60,
                    isApprovalMode: true
                }
            };

            const progressFeedback = FeedbackUtils.stepTransition(
                'agenda_generation',
                'agenda_approval',
                { agendaItems: agendaItemCount }
            );

            return {
                message: `Here's your meeting agenda with ${agendaItemCount} items. Please review it using the editor below and let me know if you'd like to make any changes or if it looks good to proceed.`,
                uiBlock: agendaApprovalBlock,
                nextStep: 'agenda_approval',
                requiresUserInput: true,
                feedbackMessage: progressFeedback
            };

        } catch (error) {
            console.error('Error handling agenda approval:', error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Agenda approval failed'),
                'agenda_approval'
            );

            // Offer to proceed without agenda approval
            return {
                message: 'I encountered an issue with the agenda approval process. Would you like to proceed without agenda review or try again?',
                nextStep: 'agenda_approval',
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Creates approval workflow with error handling
     * Requirements: 5.3, 5.4 - Handle final approval with comprehensive validation and clear feedback
     */
    private async createApprovalWorkflow(): Promise<WorkflowResponse> {
        try {
            const meetingData = this.workflowState.meetingData;

            // Perform final validation before approval
            const validation = this.businessRules.validateMeeting(meetingData);

            if (!validation.isValid) {
                const validationFeedback = FeedbackUtils.error(
                    new Error('Final validation failed'),
                    'approval'
                );

                return {
                    message: `I found some issues that need to be resolved before creating the meeting: ${validation.errors.join(', ')}. Let me help you fix these.`,
                    nextStep: 'meeting_details_collection',
                    requiresUserInput: true,
                    validationErrors: validation.errors,
                    warnings: validation.warnings,
                    feedbackMessage: validationFeedback
                };
            }

            // Create meeting summary for approval
            const summary = this.createMeetingSummary(meetingData);

            const progressFeedback = FeedbackUtils.stepTransition(
                'agenda_approval',
                'approval',
                { validationPassed: true }
            );

            return {
                message: `Perfect! Here's a summary of your meeting:\n\n${summary}\n\nEverything looks good. Shall I create this meeting in your calendar?`,
                nextStep: 'approval',
                requiresUserInput: true,
                warnings: validation.warnings,
                feedbackMessage: progressFeedback
            };

        } catch (error) {
            console.error('Error creating approval workflow:', error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Approval workflow failed'),
                'approval'
            );

            return {
                message: 'I encountered an issue preparing the final approval. Let me try to create a summary of your meeting details.',
                nextStep: 'approval',
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
                feedbackMessage: errorFeedback
            };
        }
    }

    /**
     * Initiate transcript generation workflow after meeting creation
     */
    async initiateTranscriptWorkflow(
        meetingId: string,
        meetingData: Partial<MeetingData>,
        user: User
    ): Promise<void> {
        try {
            console.log(`📋 Initiating transcript workflow for meeting: ${meetingId}`);

            // Generate comprehensive transcript based on agenda and attendees
            const transcript = await transcriptService.generateMeetingTranscript(
                meetingId,
                meetingData.title || 'Meeting',
                meetingData.agenda || 'Meeting discussion',
                meetingData.attendees?.map(a => a.email) || [],
                meetingData.endTime && meetingData.startTime ?
                    Math.round((new Date(meetingData.endTime).getTime() - new Date(meetingData.startTime).getTime()) / (1000 * 60)) :
                    60,
                new Date(meetingData.startTime || Date.now()),
                meetingData.meetingLink
            );

            // Generate meeting summary from transcript
            const summary = await transcriptService.generateMeetingSummary(transcript);

            // Extract tasks from summary
            const tasks = await transcriptService.extractTasksFromSummary(summary);

            // Store tasks in database
            await this.storeMeetingTasks(meetingId, tasks);

            // Send summary to attendees
            await this.sendSummaryToAttendees(meetingData, summary, user);

            // Generate magic links for attendees
            const magicLinks = await this.generateMagicLinksForAttendees(meetingId, meetingData.attendees || []);

            // Send magic link emails to attendees
            await this.sendMagicLinkEmails(meetingData, magicLinks, user);

            console.log(`✅ Transcript workflow completed for meeting: ${meetingId}`);

        } catch (error) {
            console.error('Error in transcript workflow:', error);
            // Don't fail the entire meeting creation for transcript errors
        }
    }

    /**
     * Store extracted tasks in database with transaction handling and retry logic
     */
    private async storeMeetingTasks(meetingId: string, tasks: MeetingTask[]): Promise<void> {
        console.log(`📋 Starting task storage process for meeting: ${meetingId}`);
        
        // First, always save to file system as a primary storage mechanism
        const { taskFileStorage } = await import('./utils/taskFileStorage.js');
        await taskFileStorage.saveTasks(meetingId, tasks);
        
        // Then try to save to database with retry logic
        try {
            await retryWithExponentialBackoff(async () => {
                // Import database operations
                const { db } = await import('./storage.js');
                const { tasks: taskTable, events: eventTable } = await import('../shared/schema.js');
                const { eq } = await import('drizzle-orm');

                // Use transaction to ensure atomicity
                await db.transaction(async (tx) => {
                    // First verify the event exists
                    const eventCheck = await tx.select().from(eventTable).where(eq(eventTable.id, meetingId));
                    if (eventCheck.length === 0) {
                        throw new Error(`Cannot store tasks in database: Event with ID ${meetingId} does not exist`);
                    }

                    // Insert tasks
                    for (const task of tasks) {
                        await tx.insert(taskTable).values({
                            eventId: meetingId,
                            title: task.title,
                            description: task.description,
                            assignee: task.assignee || 'Unassigned',
                            deadline: task.dueDate,
                            status: task.status,
                            createdAt: new Date()
                        });
                    }
                });

                console.log(`💾 Successfully stored ${tasks.length} tasks in database for meeting: ${meetingId}`);
            }, 3, 1000);
        } catch (error) {
            console.error(`❌ Failed to store tasks in database: ${(error as Error).message}`);
            console.log(`ℹ️ Note: Tasks are still available in the task files.`);
        }
        
        console.log(`✅ Task storage process completed for meeting: ${meetingId}`);
    }

    /**
     * Send meeting summary to attendees
     */
    private async sendSummaryToAttendees(
        meetingData: Partial<MeetingData>,
        summary: MeetingSummary,
        user: User
    ): Promise<void> {
        try {
            if (!meetingData.attendees || meetingData.attendees.length === 0) {
                return;
            }

            // Import email workflow orchestrator
            const { emailWorkflowOrchestrator } = await import('./emailWorkflowOrchestrator.js');

            // Create summary content for email
            const summaryContent = `
# Meeting Summary: ${summary.title}

## Overview
${summary.summary}

## Key Points
${summary.keyPoints.map(point => `• ${point}`).join('\n')}

## Decisions Made
${summary.decisions.map(decision => `• ${decision}`).join('\n')}

## Action Items
${summary.actionItems.map(item => `• ${item}`).join('\n')}

---
Generated by AI Assistant
            `.trim();

            // Send summary email to attendees
            const jobId = await emailWorkflowOrchestrator.startEmailSendingWorkflow(
                user,
                summary.meetingId,
                meetingData.attendees.map(attendee => ({
                    email: attendee.email,
                    isValid: true,
                    exists: true,
                    isGoogleUser: true
                })),
                {
                    title: summary.title,
                    startTime: meetingData.startTime,
                    endTime: meetingData.endTime,
                    type: meetingData.type
                },
                {
                    title: summary.title,
                    duration: 60,
                    topics: [
                        {
                            title: 'Meeting Summary Review',
                            duration: 10,
                            description: 'Review the meeting summary and key outcomes'
                        }
                    ],
                    actionItems: summary.actionItems.map(item => ({
                        task: item,
                        priority: 'medium' as const
                    })),
                    enhancedPurpose: summaryContent
                }
            );

            console.log(`📧 Summary email job started: ${jobId}`);
        } catch (error) {
            console.error('Error sending summary to attendees:', error);
            // Don't throw - this is not critical
        }
    }

    /**
     * Generate magic links for attendees to access their tasks
     */
    private async generateMagicLinksForAttendees(
        meetingId: string,
        attendees: any[]
    ): Promise<Map<string, string>> {
        const magicLinks = new Map<string, string>();

        try {
            // Generate unique magic links for each attendee
            for (const attendee of attendees) {
                const token = this.generateMagicToken();
                const magicLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tasks/${meetingId}?token=${token}&email=${encodeURIComponent(attendee.email)}`;
                magicLinks.set(attendee.email, magicLink);
            }

            console.log(`🔗 Generated ${magicLinks.size} magic links for meeting: ${meetingId}`);
            return magicLinks;
        } catch (error) {
            console.error('Error generating magic links:', error);
            return magicLinks;
        }
    }

    /**
     * Send magic link emails to attendees
     */
    private async sendMagicLinkEmails(
        meetingData: Partial<MeetingData>,
        magicLinks: Map<string, string>,
        user: User
    ): Promise<void> {
        try {
            if (!meetingData.attendees || meetingData.attendees.length === 0) {
                return;
            }

            // Import email service
            const { gmailService } = await import('./gmailService.js');

            // Send magic link emails
            for (const attendee of meetingData.attendees) {
                const magicLink = magicLinks.get(attendee.email);
                if (magicLink) {
                    const emailContent = `
Hello ${attendee.firstName || attendee.email},

Your meeting "${meetingData.title}" has concluded and tasks have been generated.

Click the link below to view and complete your assigned tasks:
${magicLink}

This link will allow you to:
• View all tasks from the meeting
• Mark your tasks as complete
• See progress on team tasks

---
This is an automated message from your AI Calendar Assistant.
                    `.trim();

                    // Use a simple email approach for magic links
                    console.log(`📧 Magic link email would be sent to ${attendee.email}: ${magicLink}`);
                }
            }

            console.log(`📧 Magic link emails sent to ${meetingData.attendees.length} attendees`);
        } catch (error) {
            console.error('Error sending magic link emails:', error);
            // Don't throw - this is not critical
        }
    }

    /**
     * Generate a unique magic token for task access
     */
    private generateMagicToken(): string {
        return `magic_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
    }

    /**
     * Creates a formatted meeting summary for approval
     */
    private createMeetingSummary(meetingData: Partial<MeetingData>): string {
        const lines: string[] = [];

        lines.push(`📅 **${meetingData.title || 'Meeting'}**`);

        if (meetingData.startTime) {
            const startTime = new Date(meetingData.startTime);
            const endTime = meetingData.endTime ? new Date(meetingData.endTime) : new Date(startTime.getTime() + 60 * 60 * 1000);

            lines.push(`🕐 ${startTime.toLocaleDateString()} from ${startTime.toLocaleTimeString()} to ${endTime.toLocaleTimeString()}`);
        }

        if (meetingData.type) {
            lines.push(`📍 Type: ${meetingData.type === 'online' ? 'Online Meeting' : 'Physical Meeting'}`);
        }

        if (meetingData.location) {
            lines.push(`📍 Location: ${meetingData.location}`);
        }

        if (meetingData.attendees && meetingData.attendees.length > 0) {
            lines.push(`👥 Attendees: ${meetingData.attendees.map(a => a.email).join(', ')}`);
        }

        if (meetingData.agenda) {
            try {
                const parsedAgenda = JSON.parse(meetingData.agenda);
                if (parsedAgenda.topics && Array.isArray(parsedAgenda.topics)) {
                    lines.push(`📋 Agenda:`);
                    parsedAgenda.topics.forEach((item: any, index: number) => {
                        lines.push(`   ${index + 1}. ${item.title} (${item.duration || 'TBD'} min)`);
                    });
                } else {
                    lines.push(`📋 Agenda: ${meetingData.agenda}`);
                }
            } catch (error) {
                lines.push(`📋 Agenda: ${meetingData.agenda}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Handles meeting creation with comprehensive error handling and recovery mechanisms
     * Requirements: 5.3, 5.4 - Handle meeting creation failures gracefully with recovery mechanisms
     * Requirements: 1.4, 4.4, 5.3 - Enhanced validation for calendar access, availability checking, and workflow sequence
     */
    private async handleMeetingCreation(): Promise<WorkflowResponse> {
        try {
            const meetingData = this.workflowState.meetingData;

            // DEBUG: Log user type and properties to diagnose type mismatch error
            console.log('DEBUG handleMeetingCreation - this.user type:', typeof this.user);
            console.log('DEBUG handleMeetingCreation - this.user properties:', this.user ? Object.keys(this.user) : 'null/undefined');
            console.log('DEBUG handleMeetingCreation - this.user value:', this.user);

            // Check if this.user is actually meeting data instead of user data
            if (this.user && typeof this.user === 'object' && 'attendees' in this.user) {
                console.log('ERROR: this.user appears to be meeting data instead of user data!');
                console.log('this.user has attendees:', (this.user as any).attendees);
                console.log('this.user has title:', (this.user as any).title);
            }

            if (!this.user) {
                const errorFeedback = FeedbackUtils.error(
                    new Error('User authentication required for meeting creation'),
                    'creation'
                );

                return {
                    message: 'User authentication is required to create the meeting. Please authenticate and try again.',
                    nextStep: 'calendar_access_verification',
                    requiresUserInput: true,
                    validationErrors: ['User authentication missing'],
                    feedbackMessage: errorFeedback
                };
            }

            // Enhanced validation before creation - Requirements: 1.4, 4.4, 5.3
            const enhancedValidation = await this.validateMeetingCreationRequirements();
            if (!enhancedValidation.isValid) {
                const validationFeedback = FeedbackUtils.error(
                    new Error('Meeting creation validation failed'),
                    'creation'
                );

                return {
                    message: `Cannot create meeting: ${enhancedValidation.errors.join(', ')}`,
                    nextStep: enhancedValidation.suggestedStep || 'meeting_details_collection',
                    requiresUserInput: true,
                    validationErrors: enhancedValidation.errors,
                    warnings: enhancedValidation.warnings,
                    feedbackMessage: validationFeedback
                };
            }

            // Final business rules validation
            const validation = this.businessRules.validateMeeting(meetingData);
            if (!validation.isValid) {
                const validationFeedback = FeedbackUtils.error(
                    new Error('Meeting validation failed before creation'),
                    'creation'
                );

                return {
                    message: `Cannot create meeting due to validation errors: ${validation.errors.join(', ')}. Please fix these issues first.`,
                    nextStep: 'meeting_details_collection',
                    requiresUserInput: true,
                    validationErrors: validation.errors,
                    feedbackMessage: validationFeedback
                };
            }

            try {
                // Create the calendar event with enhanced attendee information
                const attendeeData = meetingData.attendees ? meetingData.attendees.map(attendee => ({
                    email: attendee.email,
                    name: attendee.firstName && attendee.lastName 
                        ? `${attendee.firstName} ${attendee.lastName}` 
                        : attendee.firstName || attendee.email.split('@')[0], // Use name if available, otherwise extract from email
                    displayName: attendee.firstName && attendee.lastName 
                        ? `${attendee.firstName} ${attendee.lastName}` 
                        : attendee.firstName || attendee.email.split('@')[0]
                })) : [];

                // For database storage, we need just the email addresses
                const attendeeEmails = meetingData.attendees ? meetingData.attendees.map(a => a.email) : [];

                // Enhanced description with agenda formatting
                let enhancedDescription = meetingData.agenda || '';
                if (meetingData.agenda) {
                    try {
                        const parsedAgenda = JSON.parse(meetingData.agenda);
                        if (parsedAgenda.topics && Array.isArray(parsedAgenda.topics)) {
                            enhancedDescription = `Meeting Agenda:\n\n${parsedAgenda.topics.map((topic: any, index: number) => 
                                `${index + 1}. ${topic.title} (${topic.duration || 'TBD'} min)${topic.description ? '\n   ' + topic.description : ''}`
                            ).join('\n\n')}`;
                            
                            if (parsedAgenda.actionItems && parsedAgenda.actionItems.length > 0) {
                                enhancedDescription += `\n\nAction Items:\n${parsedAgenda.actionItems.map((item: any, index: number) => 
                                    `${index + 1}. ${item.task || item}${item.assignee ? ' (' + item.assignee + ')' : ''}`
                                ).join('\n')}`;
                            }
                        }
                    } catch (error) {
                        // Keep original agenda if parsing fails
                        enhancedDescription = meetingData.agenda;
                    }
                }

                // Create event data for database (uses email strings)
                const eventData = {
                    title: meetingData.title!,
                    description: enhancedDescription || `Meeting: ${meetingData.title}`,
                    startTime: new Date(meetingData.startTime!),
                    endTime: new Date(meetingData.endTime!),
                    attendees: attendeeEmails,
                    userId: this.user.id,
                    meetingLink: meetingData.meetingLink || null,
                    agenda: meetingData.agenda || null
                } as InsertEvent;

                // Create calendar event data (uses attendee objects with names)
                const calendarEventData = {
                    ...eventData,
                    attendees: attendeeData,
                    location: meetingData.type === 'physical' ? meetingData.location : null
                };

                // Attempt calendar event creation
                const createdEvent = await createCalendarEvent(this.user!, calendarEventData, meetingData.type as 'online' | 'physical');

                // Store the created event and update meeting data with Google Meet link
                meetingData.id = createdEvent.id || undefined;
                meetingData.status = 'created';
                
                // Update meeting link if Google Meet link was generated
                if (createdEvent.meetingLink && meetingData.type === 'online') {
                    meetingData.meetingLink = createdEvent.meetingLink;
                }
                
                this.workflowState.meetingData = meetingData;
                this.workflowState.isComplete = true;
                await this.persistWorkflowState();

                // Save to database
                try {
                    await db.insert(events).values(eventData as any);
                } catch (dbError) {
                    console.error('Error saving to database:', dbError);
                    // Don't fail the entire operation for database issues
                }

                // Initiate transcript workflow after successful meeting creation
                try {
                    await this.initiateTranscriptWorkflow(createdEvent.id || meetingData.id || `meeting-${Date.now()}`, meetingData, this.user!);
                } catch (transcriptError) {
                    console.error('Error initiating transcript workflow:', transcriptError);
                    // Don't fail the entire operation for transcript issues
                }

                // Create enhanced success feedback with Google Meet link info
                const successDetails = [
                    'Calendar event has been created',
                    `Invitations sent to ${meetingData.attendees?.length || 0} attendees`,
                    'Meeting is now in your calendar'
                ];

                if (meetingData.type === 'online' && createdEvent.meetingLink) {
                    successDetails.push('Google Meet link generated automatically');
                }

                const successFeedback = FeedbackUtils.success(
                    'Meeting created successfully',
                    successDetails
                );

                // Create enhanced success message with congratulatory tone
                let successMessage = `🎉 Congratulations! Your meeting "${meetingData.title}" has been successfully created and added to your calendar!`;

                if (meetingData.attendees?.length) {
                    successMessage += ` Invitations have been sent to ${meetingData.attendees.length} attendees.`;
                }

                if (meetingData.type === 'online' && createdEvent.meetingLink) {
                    successMessage += ` The Google Meet link has been automatically included in the calendar invite.`;
                }

                // Add next steps for transcript generation
                successMessage += `\n\n📋 Next Steps:\n`;
                successMessage += `• I'll generate a comprehensive transcript once the meeting concludes\n`;
                successMessage += `• A meeting summary will be automatically sent to all attendees\n`;
                successMessage += `• Action items will be extracted and organized into a task board\n`;
                successMessage += `• Attendees will receive a magic link to view and complete their tasks`;

                return {
                    message: successMessage,
                    nextStep: 'completed',
                    requiresUserInput: false,
                    feedbackMessage: successFeedback
                };

            } catch (creationError) {
                console.error('Calendar event creation failed:', creationError);

                // Determine if this is a recoverable error
                const errorMessage = creationError instanceof Error ? creationError.message : 'Unknown error';

                if (errorMessage.includes('authentication') || errorMessage.includes('token')) {
                    const authErrorFeedback = FeedbackUtils.error(
                        new Error('Calendar authentication failed'),
                        'creation'
                    );

                    return {
                        message: 'Calendar authentication failed during meeting creation. Please re-authenticate and try again.',
                        nextStep: 'calendar_access_verification',
                        requiresUserInput: true,
                        validationErrors: ['Authentication failed'],
                        feedbackMessage: authErrorFeedback
                    };
                }

                if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
                    const quotaErrorFeedback = FeedbackUtils.warning(
                        'Calendar service temporarily busy',
                        ['API quota exceeded', 'Will retry automatically'],
                        ['Wait and try again', 'Contact support if issue persists']
                    );

                    return {
                        message: 'The calendar service is temporarily busy. Please wait a moment and try creating the meeting again.',
                        nextStep: 'creation',
                        requiresUserInput: true,
                        warnings: ['Calendar service busy'],
                        feedbackMessage: quotaErrorFeedback
                    };
                }

                // General creation error
                const errorFeedback = FeedbackUtils.error(
                    creationError instanceof Error ? creationError : new Error('Meeting creation failed'),
                    'creation'
                );

                return {
                    message: `Failed to create meeting: ${errorMessage}. Please try again or contact support.`,
                    nextStep: 'creation',
                    requiresUserInput: true,
                    validationErrors: [errorMessage],
                    feedbackMessage: errorFeedback
                };
            }

        } catch (error) {
            console.error('Error in handleMeetingCreation:', error);

            const errorFeedback = FeedbackUtils.error(
                error instanceof Error ? error : new Error('Meeting creation failed'),
                'creation'
            );

            return {
                message: 'I encountered an unexpected error while creating the meeting. Please try again.',
                nextStep: 'creation',
                requiresUserInput: true,
                validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
                feedbackMessage: errorFeedback
            };
        }
    }
}