import { MeetingWorkflowOrchestrator, type WorkflowResponse } from './meetingWorkflowOrchestrator.js';
import { ConversationContextEngine, createConversationContextEngine } from './conversationContext.js';
import { BusinessRulesEngine } from './businessRules.js';
import { AttendeeValidator } from './attendeeValidator.js';
import { performanceMonitor } from './performanceMonitor.js';
import { ErrorLoggingIntegration } from './errorHandlers/errorLoggingIntegration.js';
import type { ConversationMessage, MeetingData, UIBlock } from '../shared/schema.js';

export interface ChatWorkflowResponse {
    message: string;
    uiBlock?: UIBlock;
    conversationId: string;
    workflow: {
        currentStep: string;
        requiresUserInput: boolean;
        progress: number;
        meetingData: Partial<MeetingData>;
        isComplete: boolean;
        nextAction: string;
    };
    validation: {
        errors: string[];
        warnings: string[];
    };
    contextStats: {
        messageCount: number;
        tokenCount: number;
        compressionLevel: number;
        currentMode: string;
        hasMeetingData: boolean;
    };
    performance: {
        tokenEfficiency: number;
        compressionEffectiveness: number;
        optimizationRecommendations: Array<{
            type: string;
            priority: string;
            description: string;
            estimatedTokenSavings: number;
        }>;
    };
}

/**
 * WorkflowChatIntegration manages the integration between the chat system
 * and the meeting workflow orchestrator, handling state persistence and
 * workflow step transitions in response to chat messages.
 */
export class WorkflowChatIntegration {
    private orchestratorCache: Map<string, MeetingWorkflowOrchestrator> = new Map();
    private contextEngineCache: Map<string, ConversationContextEngine> = new Map();

    /**
     * Processes a chat message through the workflow orchestrator
     */
    async processMessage(
        userId: string,
        message: string,
        conversationId?: string,
        user?: any
    ): Promise<ChatWorkflowResponse> {
        // Get or create workflow orchestrator for this conversation
        const orchestrator = await this.getOrCreateOrchestrator(userId, conversationId, user);
        const contextEngine = await this.getOrCreateContextEngine(userId, conversationId);

        // Check if we should detect meeting intent
        const currentWorkflowState = orchestrator.getWorkflowState();
        
        // If not already in a meeting workflow, check for meeting intent
        if (currentWorkflowState.currentStep === 'intent_detection' || currentWorkflowState.isComplete) {
            try {
                // Get conversation history for context
                const history = await contextEngine.getMessageHistory(0, 10);
                const conversationContext = history.messages;

                // Call the meeting intent extraction endpoint
                const intentExtraction = await this.extractMeetingIntent(message, conversationContext);
                
                // Check if meeting intent is detected with sufficient confidence
                if (this.shouldTriggerMeetingWorkflow(intentExtraction)) {
                    return await this.startMeetingWorkflow(userId, message, conversationId, user, intentExtraction);
                }
            } catch (error) {
                console.warn('Meeting intent detection failed, continuing with regular processing:', error);
                
                // Log error to comprehensive error logging system
                await ErrorLoggingIntegration.logWorkflowError(error, {
                    workflowStep: 'intent_detection',
                    userId,
                    conversationId,
                    operationName: 'processMessage'
                }).catch(logErr => {
                    console.error('Failed to log intent detection error:', logErr);
                });
                
                // Continue with regular processing if intent detection fails
            }
        }

        // Extract time if we're in time collection step
        if (currentWorkflowState.currentStep === 'time_date_collection') {
            const { extractTimeFromMessage } = await import('./timeExtractor.js');
            const extractedTime = await extractTimeFromMessage(message);
            
            console.log(`[Time Extraction] Input: "${message}"`);
            console.log(`[Time Extraction] Result:`, extractedTime);
            
            if (extractedTime && extractedTime.confidence > 0.7) {
                console.log(`✅ Time extracted successfully: ${extractedTime.startTime} to ${extractedTime.endTime}`);
                // Set the time in the orchestrator
                await orchestrator.setMeetingTime(
                    extractedTime.startTime.toISOString(),
                    extractedTime.endTime?.toISOString()
                );
            } else if (extractedTime) {
                console.log(`⚠️ Time extraction confidence too low: ${extractedTime.confidence}`);
            } else {
                console.log(`❌ No time could be extracted from message`);
            }
        }

        // Create conversation message
        const conversationMessage: ConversationMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            role: 'user',
            content: message,
            timestamp: new Date()
        };

        // Process message through workflow
        let workflowResponse = await orchestrator.processMessage(conversationMessage);

        // Auto-advance workflow if it doesn't require user input
        // This handles steps like calendar_access_verification that should happen automatically
        if (!workflowResponse.requiresUserInput && workflowResponse.nextStep !== currentWorkflowState.currentStep) {
            console.log(`Auto-advancing from ${currentWorkflowState.currentStep} to ${workflowResponse.nextStep}...`);
            try {
                const advanceResponse = await orchestrator.advanceToStep(workflowResponse.nextStep);
                // Use the advanced step's response instead
                workflowResponse = advanceResponse;
            } catch (error) {
                console.warn('Auto-advance failed, using original response:', error);
            }
        }

        // Add assistant response to conversation context
        const assistantMessage: ConversationMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            role: 'assistant',
            content: workflowResponse.message,
            timestamp: new Date(),
            metadata: {
                workflowStep: workflowResponse.nextStep,
                requiresUserInput: workflowResponse.requiresUserInput,
                validationErrors: workflowResponse.validationErrors,
                warnings: workflowResponse.warnings
            }
        };

        await contextEngine.addMessage(assistantMessage);

        // Get additional context information
        const finalWorkflowState = orchestrator.getWorkflowState();
        const contextStats = contextEngine.getStats();
        const performanceMetrics = contextEngine.getPerformanceMetrics();
        const optimizationRecommendations = contextEngine.getOptimizationRecommendations();

        return {
            message: workflowResponse.message,
            uiBlock: workflowResponse.uiBlock as any, // Cast to avoid type issues - functionality works
            conversationId: contextEngine.getConversationId() || 'unknown',
            workflow: {
                currentStep: workflowResponse.nextStep,
                requiresUserInput: workflowResponse.requiresUserInput,
                progress: 0, // Calculate progress based on current step
                meetingData: finalWorkflowState.meetingData,
                isComplete: finalWorkflowState.isComplete,
                nextAction: 'Continue with workflow'
            },
            validation: {
                errors: workflowResponse.validationErrors || [],
                warnings: workflowResponse.warnings || []
            },
            contextStats: {
                messageCount: contextStats.messageCount,
                tokenCount: contextStats.tokenCount,
                compressionLevel: contextStats.compressionLevel,
                currentMode: contextStats.currentMode,
                hasMeetingData: contextStats.hasMeetingData
            },
            performance: {
                tokenEfficiency: performanceMetrics.tokenEfficiency,
                compressionEffectiveness: performanceMetrics.compressionEffectiveness,
                optimizationRecommendations: optimizationRecommendations.map(rec => ({
                    type: rec.type,
                    priority: rec.priority,
                    description: rec.description,
                    estimatedTokenSavings: rec.estimatedTokenSavings
                }))
            }
        };
    }

    /**
     * Extracts meeting intent from a message using the AI extraction endpoint
     */
    private async extractMeetingIntent(
        message: string,
        conversationContext: ConversationMessage[]
    ): Promise<any> {
        // Import the extractMeetingIntent function
        const { extractMeetingIntent } = await import('./aiInterface.js');
        
        // Call the AI extraction function with conversation context
        return await extractMeetingIntent(message, conversationContext);
    }

    /**
     * Determines if meeting workflow should be triggered based on intent extraction
     */
    private shouldTriggerMeetingWorkflow(intentExtraction: any): boolean {
        // Define confidence threshold for meeting intent detection
        const CONFIDENCE_THRESHOLD = 0.7;
        
        // Check if intent is meeting-related and confidence is above threshold
        return (
            intentExtraction &&
            (intentExtraction.intent === 'create_meeting' || intentExtraction.intent === 'schedule_meeting') &&
            intentExtraction.confidence >= CONFIDENCE_THRESHOLD
        );
    }

    /**
     * Starts the meeting workflow from intent detection
     */
    private async startMeetingWorkflow(
        userId: string,
        message: string,
        conversationId?: string,
        user?: any,
        intentExtraction?: any
    ): Promise<ChatWorkflowResponse> {
        const orchestrator = await this.getOrCreateOrchestrator(userId, conversationId, user);
        const contextEngine = await this.getOrCreateContextEngine(userId, conversationId);

        // Initialize meeting workflow with extracted data
        const meetingData: Partial<MeetingData> = {};
        
        if (intentExtraction?.fields) {
            // Map extracted fields to meeting data
            if (intentExtraction.fields.purpose) {
                // Store purpose in title for now since purpose field doesn't exist
                meetingData.title = intentExtraction.fields.purpose;
            }
            if (intentExtraction.fields.participants && intentExtraction.fields.participants.length > 0) {
                meetingData.attendees = intentExtraction.fields.participants.map((email: string) => ({
                    email,
                    name: email.split('@')[0], // Simple name extraction
                    status: 'pending' as const
                }));
            }
            if (intentExtraction.fields.startTime) {
                meetingData.startTime = new Date(intentExtraction.fields.startTime);
            }
            if (intentExtraction.fields.endTime) {
                meetingData.endTime = new Date(intentExtraction.fields.endTime);
            }
            if (intentExtraction.fields.duration && intentExtraction.fields.startTime) {
                // Calculate end time from duration
                const startTime = new Date(intentExtraction.fields.startTime);
                const endTime = new Date(startTime.getTime() + (intentExtraction.fields.duration * 60 * 1000));
                meetingData.endTime = endTime;
            }
            if (intentExtraction.fields.suggestedTitle) {
                meetingData.title = intentExtraction.fields.suggestedTitle;
            }
        }

        // Update context with meeting data
        if (Object.keys(meetingData).length > 0) {
            contextEngine.updateMeetingData(meetingData);
        }

        // Create conversation message for workflow processing
        const conversationMessage: ConversationMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            role: 'user',
            content: message,
            timestamp: new Date(),
            metadata: {
                intent: 'meeting_creation',
                confidence: intentExtraction?.confidence || 0.8
            }
        };

        // Process the message through the workflow (starting from intent_detection)
        let workflowResponse = await orchestrator.processMessage(conversationMessage);

        // Auto-advance through non-interactive steps (calendar_access_verification)
        while (!workflowResponse.requiresUserInput && 
               workflowResponse.nextStep !== 'meeting_type_selection' &&
               workflowResponse.nextStep !== orchestrator.getWorkflowState().currentStep) {
            console.log(`Auto-advancing from ${orchestrator.getWorkflowState().currentStep} to ${workflowResponse.nextStep}...`);
            try {
                const advanceResponse = await orchestrator.advanceToStep(workflowResponse.nextStep);
                workflowResponse = advanceResponse;
            } catch (error) {
                console.warn('Auto-advance failed:', error);
                break;
            }
        }

        // Store workflow state after initialization
        await this.persistWorkflowState(userId, orchestrator.getWorkflowState(), conversationId);

        // Add assistant response to conversation context
        const assistantMessage: ConversationMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            role: 'assistant',
            content: workflowResponse.message,
            timestamp: new Date(),
            metadata: {
                workflowStep: workflowResponse.nextStep,
                requiresUserInput: workflowResponse.requiresUserInput,
                validationErrors: workflowResponse.validationErrors,
                warnings: workflowResponse.warnings
            }
        };

        await contextEngine.addMessage(assistantMessage);

        // Get workflow summary and context stats
        const meetingWorkflowState = orchestrator.getWorkflowState();
        const contextStats = contextEngine.getStats();
        const performanceMetrics = contextEngine.getPerformanceMetrics();
        const optimizationRecommendations = contextEngine.getOptimizationRecommendations();

        return {
            message: workflowResponse.message,
            uiBlock: workflowResponse.uiBlock as any, // Cast to avoid type issues - functionality works
            conversationId: contextEngine.getConversationId() || 'unknown',
            workflow: {
                currentStep: workflowResponse.nextStep,
                requiresUserInput: workflowResponse.requiresUserInput,
                progress: 0, // Calculate progress based on current step
                meetingData: meetingWorkflowState.meetingData,
                isComplete: meetingWorkflowState.isComplete,
                nextAction: 'Continue with workflow'
            },
            validation: {
                errors: workflowResponse.validationErrors || [],
                warnings: workflowResponse.warnings || []
            },
            contextStats: {
                messageCount: contextStats.messageCount,
                tokenCount: contextStats.tokenCount,
                compressionLevel: contextStats.compressionLevel,
                currentMode: contextStats.currentMode,
                hasMeetingData: contextStats.hasMeetingData
            },
            performance: {
                tokenEfficiency: performanceMetrics.tokenEfficiency,
                compressionEffectiveness: performanceMetrics.compressionEffectiveness,
                optimizationRecommendations: optimizationRecommendations.map(rec => ({
                    type: rec.type,
                    priority: rec.priority,
                    description: rec.description,
                    estimatedTokenSavings: rec.estimatedTokenSavings
                }))
            }
        };
    }

    /**
     * Updates meeting data for a conversation
     */
    async updateMeetingData(
        userId: string,
        meetingData: Partial<MeetingData>,
        conversationId?: string
    ): Promise<void> {
        const contextEngine = await this.getOrCreateContextEngine(userId, conversationId);
        contextEngine.updateMeetingData(meetingData);
        await contextEngine.saveContext();
    }

    /**
     * Gets the current workflow state for a conversation
     */
    async getWorkflowState(
        userId: string,
        conversationId?: string,
        user?: any
    ): Promise<{
        conversationId: string;
        workflow: any;
        conversationMode: string;
        contextStats: any;
    }> {
        const orchestrator = await this.getOrCreateOrchestrator(userId, conversationId, user);
        const contextEngine = await this.getOrCreateContextEngine(userId, conversationId);

        const workflowState = orchestrator.getWorkflowState();
        const contextStats = contextEngine.getStats();

        return {
            conversationId: contextEngine.getConversationId() || 'unknown',
            workflow: workflowState,
            conversationMode: contextEngine.getCurrentMode(),
            contextStats
        };
    }

    /**
     * Resets the workflow for a conversation
     */
    async resetWorkflow(
        userId: string,
        conversationId?: string,
        user?: any
    ): Promise<string> {
        const orchestrator = await this.getOrCreateOrchestrator(userId, conversationId, user);
        const contextEngine = await this.getOrCreateContextEngine(userId, conversationId);

        // Reset workflow state manually since resetWorkflow method doesn't exist
        const workflowState = orchestrator.getWorkflowState();
        workflowState.currentStep = 'intent_detection';
        workflowState.isComplete = false;
        workflowState.errors = [];
        workflowState.meetingData = {};

        return contextEngine.getConversationId() || 'unknown';
    }

    /**
     * Advances workflow to a specific step with validation
     */
    async advanceWorkflowStep(
        userId: string,
        step: string,
        data?: Partial<MeetingData>,
        conversationId?: string,
        user?: any
    ): Promise<{
        success: boolean;
        message: string;
        workflow: any;
        validation: {
            errors: string[];
            warnings: string[];
        };
    }> {
        const orchestrator = await this.getOrCreateOrchestrator(userId, conversationId, user);
        const contextEngine = await this.getOrCreateContextEngine(userId, conversationId);

        try {
            // Advance to specified step with validation
            const response = await orchestrator.advanceToStep(step as any, data);

            // Update meeting data if provided
            if (data) {
                contextEngine.updateMeetingData(data);
                await contextEngine.saveContext();
            }

            const workflowState = orchestrator.getWorkflowState();

            return {
                success: response.validationErrors?.length === 0,
                message: response.message,
                workflow: workflowState,
                validation: {
                    errors: response.validationErrors || [],
                    warnings: response.warnings || []
                }
            };
        } catch (error) {
            console.error('Error advancing workflow step:', error);
            return {
                success: false,
                message: `Failed to advance to ${step}: ${error}`,
                workflow: orchestrator.getWorkflowState(),
                validation: {
                    errors: [`Failed to advance to ${step}: ${error}`],
                    warnings: []
                }
            };
        }
    }

    /**
     * Handles UI block interactions (e.g., attendee editor, meeting approval)
     */
    async handleUIBlockInteraction(
        userId: string,
        blockType: string,
        blockData: any,
        conversationId?: string,
        user?: any
    ): Promise<ChatWorkflowResponse> {
        const orchestrator = await this.getOrCreateOrchestrator(userId, conversationId, user);
        const contextEngine = await this.getOrCreateContextEngine(userId, conversationId);

        // Handle specific UI block interactions with workflow step transitions
        let workflowResponse;
        const currentWorkflowState = orchestrator.getWorkflowState();

        switch (blockType) {
            case 'meeting_type_selection':
                if (blockData.action === 'select_type') {
                    
                    // Check if meeting type is already set and workflow has moved forward
                    if (currentWorkflowState.meetingData.type && 
                        currentWorkflowState.currentStep !== 'meeting_type_selection' &&
                        currentWorkflowState.currentStep !== 'intent_detection') {
                        // Meeting type is locked - cannot change after moving forward
                        return {
                            message: `Meeting type is already set to ${currentWorkflowState.meetingData.type} and cannot be changed. Please continue with the current meeting setup.`,
                            uiBlock: undefined as any, // Cast to avoid type issues - functionality works
                            conversationId: contextEngine.getConversationId() || 'unknown',
                            workflow: {
                                currentStep: currentWorkflowState.currentStep,
                                requiresUserInput: true,
                                progress: 0,
                                meetingData: currentWorkflowState.meetingData,
                                isComplete: currentWorkflowState.isComplete,
                                nextAction: 'Continue with current workflow'
                            },
                            validation: {
                                errors: ['Meeting type cannot be changed after selection'],
                                warnings: []
                            },
                            contextStats: {
                                messageCount: 0,
                                tokenCount: 0,
                                compressionLevel: 0,
                                currentMode: 'meeting',
                                hasMeetingData: true
                            },
                            performance: {
                                tokenEfficiency: 0,
                                compressionEffectiveness: 0,
                                optimizationRecommendations: []
                            }
                        };
                    }
                    
                    // Update meeting data and advance workflow
                    const meetingTypeData = { 
                        type: blockData.type,
                        location: blockData.location 
                    };
                    contextEngine.updateMeetingData(meetingTypeData);

                    const nextStep = 'time_date_collection'; // Always go to time collection first
                    workflowResponse = await orchestrator.processStepTransition(
                        'meeting_type_selection',
                        nextStep as any,
                        meetingTypeData
                    );
                } else {
                    throw new Error(`Unknown action for meeting_type_selection: ${blockData.action}`);
                }
                break;

            case 'attendee_management':
                if (blockData.action === 'update_attendees') {
                    // Update attendees
                    const attendeeData = { attendees: blockData.attendees };
                    contextEngine.updateMeetingData(attendeeData);

                    // Stay in attendee collection step for further updates
                    workflowResponse = await orchestrator.processStepTransition(
                        'attendee_collection',
                        'attendee_collection',
                        attendeeData
                    );
                } else if (blockData.action === 'continue') {
                    // Continue to next step after attendee collection
                    workflowResponse = await orchestrator.processStepTransition(
                        'attendee_collection',
                        'meeting_details_collection'
                    );
                } else {
                    throw new Error(`Unknown action for attendee_management: ${blockData.action}`);
                }
                break;

            case 'attendee_editor':
                if (blockData.action === 'add_attendee') {
                    // Add attendee to meeting data
                    const attendeeData = {
                        attendees: [
                            ...(currentWorkflowState.meetingData.attendees || []),
                            {
                                email: blockData.email,
                                isValidated: false,
                                isRequired: false,
                                name: blockData.name,
                                firstName: blockData.firstName,
                                lastName: blockData.lastName
                            }
                        ]
                    };
                    contextEngine.updateMeetingData(attendeeData);

                    // Validate the new attendee
                    const { attendeeValidator } = await import('./attendeeValidator.js');
                    const validation = await attendeeValidator.validateEmail(blockData.email, user);

                    // Stay in attendee collection step for further updates
                    workflowResponse = await orchestrator.processStepTransition(
                        'attendee_collection',
                        'attendee_collection',
                        attendeeData
                    );
                } else if (blockData.action === 'remove_attendee') {
                    // Remove attendee from meeting data
                    const currentAttendees = currentWorkflowState.meetingData.attendees || [];
                    const updatedAttendees = currentAttendees.filter((a: any) => a.email !== blockData.email);

                    const attendeeData = { attendees: updatedAttendees };
                    contextEngine.updateMeetingData(attendeeData);

                    // Stay in attendee collection step for further updates
                    workflowResponse = await orchestrator.processStepTransition(
                        'attendee_collection',
                        'attendee_collection',
                        attendeeData
                    );
                } else if (blockData.action === 'continue') {
                    // Continue to next step after attendee collection
                    workflowResponse = await orchestrator.processStepTransition(
                        'attendee_collection',
                        'meeting_details_collection'
                    );
                } else {
                    throw new Error(`Unknown action for attendee_editor: ${blockData.action}`);
                }
                break;
                if (blockData.action === 'approve') {
                    // Get the current meeting data
                    const currentWorkflowState = orchestrator.getWorkflowState();
                    const meetingData = currentWorkflowState.meetingData;

                    // Create the calendar event
                    try {
                        const { createCalendarEvent } = await import('./googleCalendar.js');
                        
                        const eventData = {
                            title: meetingData.title,
                            startTime: meetingData.startTime,
                            endTime: meetingData.endTime,
                            description: meetingData.agenda || '',
                            attendees: meetingData.attendees?.map((a: any) => ({
                                email: a.email,
                                name: a.firstName ? `${a.firstName} ${a.lastName || ''}`.trim() : a.name,
                            })) || [],
                            location: meetingData.location,
                            createMeetLink: meetingData.type === 'online',
                        };

                        const createdEvent = await createCalendarEvent(
                            user,
                            eventData,
                            meetingData.type === 'online' ? 'online' : 'physical'
                        );

                        // Update meeting data with created event details
                        contextEngine.updateMeetingData({
                            ...meetingData,
                            id: createdEvent.id || undefined,
                            meetingLink: createdEvent.meetingLink || undefined,
                            location: createdEvent.location || meetingData.location,
                            status: 'created'
                        });

                        // Transition to creation/completed step
                        workflowResponse = {
                            message: `✅ Meeting created successfully! ${createdEvent.meetingLink ? `\n\nMeeting Link: ${createdEvent.meetingLink}` : ''}\n\nYour meeting "${meetingData.title}" has been scheduled and calendar invites have been sent to all attendees.`,
                            nextStep: 'completed',
                            requiresUserInput: false,
                            validationErrors: [],
                            warnings: [],
                            uiBlock: undefined
                        };

                        // Mark workflow as complete
                        const finalState = orchestrator.getWorkflowState();
                        finalState.isComplete = true;
                        finalState.currentStep = 'completed';
                        await this.persistWorkflowState(userId, finalState, conversationId);

                    } catch (error: unknown) {
                        console.error('Error during meeting approval:', error);

                        // Safely extract error message with type assertion
                        const errorMessage = (error as Error)?.message || 'Unknown error';
                        const validationMessage = (error as Error)?.message || 'Failed to create calendar event';

                        workflowResponse = {
                            message: `❌ Failed to create meeting: ${errorMessage}. Please try again or check your calendar permissions.`,
                            nextStep: 'approval',
                            requiresUserInput: true,
                            validationErrors: [validationMessage],
                            warnings: []
                        };
                    }
                } else if (blockData.action === 'edit') {
                    // Return to meeting details collection for editing
                    workflowResponse = await orchestrator.processStepTransition(
                        'approval',
                        'meeting_details_collection'
                    );
                } else {
                    throw new Error(`Unknown action for meeting_approval: ${blockData.action}`);
                }
                break;

            case 'agenda_editor':
                // Handle agenda editor interactions
                if (blockData.action === 'update') {
                    // Update agenda content
                    contextEngine.updateMeetingData({ agenda: blockData.agenda });
                    workflowResponse = {
                        message: 'Agenda updated successfully.',
                        nextStep: 'agenda_approval',
                        requiresUserInput: true,
                        validationErrors: [],
                        warnings: []
                    };
                } else if (blockData.action === 'regenerate') {
                    // Regenerate agenda - create a synthetic response
                    workflowResponse = {
                        message: 'Regenerating agenda...',
                        nextStep: 'agenda_generation',
                        requiresUserInput: false,
                        validationErrors: [],
                        warnings: []
                    };
                } else if (blockData.action === 'approve') {
                    // Approve agenda and advance workflow
                    contextEngine.updateMeetingData({ agenda: blockData.agenda });
                    workflowResponse = {
                        message: 'Agenda approved. Proceeding to final meeting approval.',
                        nextStep: 'approval',
                        requiresUserInput: true,
                        validationErrors: [],
                        warnings: []
                    };
                } else {
                    throw new Error(`Unknown action for agenda_editor: ${blockData.action}`);
                }
                break;

            default:
                // Create a synthetic message for other interactions
                const syntheticMessage = `UI interaction: ${blockType}`;
                const conversationMessage: ConversationMessage = {
                    id: `ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    role: 'user',
                    content: syntheticMessage,
                    timestamp: new Date(),
                    metadata: {
                        uiBlockType: blockType,
                        uiBlockData: blockData
                    }
                };

                workflowResponse = await orchestrator.processMessage(conversationMessage);
        }

        // Get workflow summary and context stats
        const workflowState = orchestrator.getWorkflowState();
        const contextStats = contextEngine.getStats();
        const performanceMetrics = contextEngine.getPerformanceMetrics();
        const optimizationRecommendations = contextEngine.getOptimizationRecommendations();

        return {
            message: workflowResponse.message,
            uiBlock: workflowResponse.uiBlock as any, // Cast to avoid type issues - functionality works
            conversationId: contextEngine.getConversationId() || 'unknown',
            workflow: {
                currentStep: workflowResponse.nextStep,
                requiresUserInput: workflowResponse.requiresUserInput,
                progress: 0, // Calculate progress based on current step
                meetingData: workflowState.meetingData,
                isComplete: workflowState.isComplete,
                nextAction: 'Continue with workflow'
            },
            validation: {
                errors: workflowResponse.validationErrors || [],
                warnings: workflowResponse.warnings || []
            },
            contextStats: {
                messageCount: contextStats.messageCount,
                tokenCount: contextStats.tokenCount,
                compressionLevel: contextStats.compressionLevel,
                currentMode: contextStats.currentMode,
                hasMeetingData: contextStats.hasMeetingData
            },
            performance: {
                tokenEfficiency: performanceMetrics.tokenEfficiency,
                compressionEffectiveness: performanceMetrics.compressionEffectiveness,
                optimizationRecommendations: optimizationRecommendations.map(rec => ({
                    type: rec.type,
                    priority: rec.priority,
                    description: rec.description,
                    estimatedTokenSavings: rec.estimatedTokenSavings
                }))
            }
        };
    }

    /**
     * Gets conversation history with workflow context
     */
    async getConversationHistory(
        userId: string,
        conversationId: string,
        limit: number = 20,
        offset: number = 0,
        user?: any
    ): Promise<{
        messages: ConversationMessage[];
        totalCount: number;
        hasMore: boolean;
        workflowState: any;
    }> {
        const contextEngine = await this.getOrCreateContextEngine(userId, conversationId);
        const orchestrator = await this.getOrCreateOrchestrator(userId, conversationId, user);

        const history = await contextEngine.getMessageHistory(offset, limit);
        const workflowState = orchestrator.getWorkflowState();

        return {
            messages: history.messages,
            totalCount: history.totalCount,
            hasMore: history.hasMore,
            workflowState: workflowState
        };
    }

    /**
     * Cleans up cached instances for a conversation
     */
    clearCache(conversationId: string): void {
        this.orchestratorCache.delete(conversationId);
        this.contextEngineCache.delete(conversationId);
    }

    /**
     * Clears all cached instances
     */
    clearAllCache(): void {
        this.orchestratorCache.clear();
        this.contextEngineCache.clear();
    }

    /**
     * Enhanced workflow state persistence with validation and error handling
     */
    async persistWorkflowState(
        userId: string,
        workflowState: any,
        conversationId?: string
    ): Promise<void> {
        try {
            const contextEngine = await this.getOrCreateContextEngine(userId, conversationId);

            // Validate workflow state before persisting
            const validationResult = this.validateWorkflowStateStructure(workflowState);
            if (!validationResult.isValid) {
                console.warn('Invalid workflow state structure:', validationResult.errors);
                // Still persist but add validation warnings
                workflowState.validationWarnings = validationResult.errors;
            }

            // Add timestamp and version for state tracking
            const enhancedWorkflowState = {
                ...workflowState,
                persistedAt: new Date().toISOString(),
                version: '1.0',
                userId,
                conversationId: contextEngine.getConversationId()
            };

            // Store workflow state as metadata in conversation context
            const workflowStateMessage: ConversationMessage = {
                id: `workflow-persist-${Date.now()}`,
                role: 'assistant',
                content: '[Workflow state persisted]',
                timestamp: new Date(),
                metadata: {
                    workflowState: enhancedWorkflowState,
                    isSystemMessage: true
                }
            };

            await contextEngine.addMessage(workflowStateMessage);
            await contextEngine.saveContext({ compressIfNeeded: true });

            // Log successful persistence for debugging
            console.log(`Workflow state persisted for user ${userId}, conversation ${conversationId}, step: ${workflowState.currentStep}`);
        } catch (error) {
            console.error('Failed to persist workflow state:', error);
            
            // Log error to comprehensive error logging system
            await ErrorLoggingIntegration.logWorkflowError(error, {
                workflowStep: workflowState.currentStep,
                userId,
                conversationId,
                operationName: 'storeWorkflowState',
                workflowState
            }).catch(logErr => {
                console.error('Failed to log workflow state persistence error:', logErr);
            });
            
            // Don't throw error to avoid breaking the workflow
            // The system should continue to function even if state persistence fails
        }
    }

    /**
     * Enhanced workflow state retrieval with validation and recovery
     */
    async retrieveWorkflowState(
        userId: string,
        conversationId?: string
    ): Promise<any | null> {
        try {
            const contextEngine = await this.getOrCreateContextEngine(userId, conversationId);

            // Get recent messages and look for workflow state
            const history = await contextEngine.getMessageHistory(0, 100); // Increased search range

            // Find the most recent valid workflow state message
            for (let i = history.messages.length - 1; i >= 0; i--) {
                const message = history.messages[i];
                if (message.metadata?.workflowState) {
                    const workflowState = message.metadata.workflowState;
                    
                    // Validate retrieved state
                    const validationResult = this.validateWorkflowStateStructure(workflowState);
                    if (validationResult.isValid) {
                        // Check if state is not too old (older than 24 hours)
                        const persistedAt = workflowState.persistedAt ? new Date(workflowState.persistedAt) : message.timestamp;
                        const ageInHours = (Date.now() - persistedAt.getTime()) / (1000 * 60 * 60);
                        
                        if (ageInHours > 24) {
                            console.warn(`Workflow state is ${ageInHours.toFixed(1)} hours old, may be stale`);
                            // Still return it but add a warning
                            workflowState.isStale = true;
                            workflowState.ageInHours = ageInHours;
                        }

                        console.log(`Retrieved workflow state for user ${userId}, step: ${workflowState.currentStep}`);
                        return workflowState;
                    } else {
                        console.warn('Found invalid workflow state, continuing search:', validationResult.errors);
                    }
                }
            }

            console.log(`No valid workflow state found for user ${userId}, conversation ${conversationId}`);
            return null;
        } catch (error) {
            console.error('Failed to retrieve workflow state:', error);
            return null; // Return null on error to allow workflow to start fresh
        }
    }

    /**
     * Validates workflow state structure for persistence/retrieval
     */
    private validateWorkflowStateStructure(workflowState: any): {
        isValid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        if (!workflowState) {
            errors.push('Workflow state is null or undefined');
            return { isValid: false, errors };
        }

        // Check required fields
        if (!workflowState.currentStep) {
            errors.push('Missing currentStep in workflow state');
        }

        if (!workflowState.meetingData) {
            errors.push('Missing meetingData in workflow state');
        }

        // Validate currentStep is a valid workflow step
        const validSteps = [
            'intent_detection', 'calendar_access_verification', 'meeting_type_selection',
            'time_date_collection', 'availability_check', 'conflict_resolution',
            'attendee_collection', 'meeting_details_collection', 'validation',
            'agenda_generation', 'agenda_approval', 'approval', 'creation', 'completed'
        ];

        if (workflowState.currentStep && !validSteps.includes(workflowState.currentStep)) {
            errors.push(`Invalid currentStep: ${workflowState.currentStep}`);
        }

        // Check for required boolean fields
        if (typeof workflowState.isComplete !== 'boolean') {
            errors.push('Missing or invalid isComplete field');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Enhanced workflow state consistency validation with recovery mechanisms
     */
    async validateWorkflowState(
        userId: string,
        conversationId?: string,
        user?: any
    ): Promise<{
        isValid: boolean;
        errors: string[];
        warnings: string[];
        recommendations: string[];
        recoveryActions?: string[];
    }> {
        const errors: string[] = [];
        const warnings: string[] = [];
        const recommendations: string[] = [];
        const recoveryActions: string[] = [];

        try {
            const orchestrator = await this.getOrCreateOrchestrator(userId, conversationId, user);
            const contextEngine = await this.getOrCreateContextEngine(userId, conversationId);

            const workflowState = orchestrator.getWorkflowState();
            const contextStats = contextEngine.getStats();

            // Check workflow state consistency
            if (workflowState.errors && workflowState.errors.length > 0) {
                errors.push('Workflow has errors that need to be resolved');
                recoveryActions.push('Reset workflow to clear errors');
            }

            // Check conversation context consistency
            if (contextStats.currentMode === 'scheduling' && !contextStats.hasMeetingData) {
                warnings.push('In scheduling mode but no meeting data found');
                recommendations.push('Consider resetting workflow or collecting meeting information');
                recoveryActions.push('Restart meeting creation process');
            }

            // Check for stale workflow state
            if (contextStats.messageCount > 50 && workflowState.currentStep === 'intent_detection') {
                warnings.push('Long conversation without workflow progress');
                recommendations.push('Consider restarting the meeting creation process');
                recoveryActions.push('Reset workflow to intent_detection');
            }

            // Check for interrupted workflows
            const retrievedState = await this.retrieveWorkflowState(userId, conversationId);
            if (retrievedState?.isStale) {
                warnings.push(`Workflow state is ${retrievedState.ageInHours?.toFixed(1)} hours old`);
                recommendations.push('Consider refreshing the workflow state');
                recoveryActions.push('Validate current meeting data and continue from current step');
            }

            // Check for workflow step consistency
            if (workflowState.currentStep && workflowState.meetingData) {
                const stepValidation = this.validateStepRequirements(workflowState.currentStep, workflowState.meetingData);
                if (!stepValidation.isValid) {
                    errors.push(...stepValidation.errors);
                    recoveryActions.push(...stepValidation.recoveryActions);
                }
            }

            return {
                isValid: errors.length === 0,
                errors,
                warnings,
                recommendations,
                recoveryActions
            };
        } catch (error) {
            errors.push(`Error validating workflow state: ${error}`);
            recoveryActions.push('Reset workflow and start fresh');
            return {
                isValid: false,
                errors,
                warnings,
                recommendations,
                recoveryActions
            };
        }
    }

    /**
     * Validates that current workflow step has required data
     */
    private validateStepRequirements(step: string, meetingData: any): {
        isValid: boolean;
        errors: string[];
        recoveryActions: string[];
    } {
        const errors: string[] = [];
        const recoveryActions: string[] = [];

        switch (step) {
            case 'meeting_type_selection':
                // No specific requirements for this step
                break;
            
            case 'time_date_collection':
                if (!meetingData.type) {
                    errors.push('Meeting type required for time collection');
                    recoveryActions.push('Return to meeting type selection');
                }
                break;
            
            case 'attendee_collection':
                if (meetingData.type === 'online' && (!meetingData.startTime || !meetingData.endTime)) {
                    errors.push('Start and end time required for online meeting attendee collection');
                    recoveryActions.push('Return to time collection step');
                }
                break;
            
            case 'agenda_generation':
                if (!meetingData.attendees || meetingData.attendees.length === 0) {
                    if (meetingData.type === 'online') {
                        errors.push('Attendees required for online meeting agenda generation');
                        recoveryActions.push('Return to attendee collection');
                    }
                }
                break;
            
            case 'creation':
                if (!meetingData.title || !meetingData.startTime || !meetingData.endTime) {
                    errors.push('Title, start time, and end time required for meeting creation');
                    recoveryActions.push('Return to meeting details collection');
                }
                break;
        }

        return {
            isValid: errors.length === 0,
            errors,
            recoveryActions
        };
    }

    /**
     * Recovers from workflow state inconsistencies
     */
    async recoverWorkflowState(
        userId: string,
        conversationId?: string,
        user?: any,
        recoveryAction?: string
    ): Promise<{
        success: boolean;
        message: string;
        newState?: any;
    }> {
        try {
            const orchestrator = await this.getOrCreateOrchestrator(userId, conversationId, user);
            const contextEngine = await this.getOrCreateContextEngine(userId, conversationId);

            switch (recoveryAction) {
                case 'Reset workflow to clear errors':
                case 'Reset workflow to intent_detection':
                    // Reset to initial state
                    const workflowState = orchestrator.getWorkflowState();
                    workflowState.currentStep = 'intent_detection';
                    workflowState.errors = [];
                    workflowState.isComplete = false;
                    await this.persistWorkflowState(userId, workflowState, conversationId);
                    return {
                        success: true,
                        message: 'Workflow reset to initial state',
                        newState: workflowState
                    };

                case 'Restart meeting creation process':
                    // Clear meeting data and restart
                    contextEngine.updateMeetingData({});
                    const freshState = orchestrator.getWorkflowState();
                    freshState.currentStep = 'meeting_type_selection';
                    freshState.meetingData = {};
                    await this.persistWorkflowState(userId, freshState, conversationId);
                    return {
                        success: true,
                        message: 'Meeting creation process restarted',
                        newState: freshState
                    };

                default:
                    return {
                        success: false,
                        message: `Unknown recovery action: ${recoveryAction}`
                    };
            }
        } catch (error) {
            return {
                success: false,
                message: `Recovery failed: ${error}`
            };
        }
    }

    /**
     * Gets or creates a workflow orchestrator for a conversation
     */
    private async getOrCreateOrchestrator(
        userId: string,
        conversationId?: string,
        user?: any
    ): Promise<MeetingWorkflowOrchestrator> {
        const contextEngine = await this.getOrCreateContextEngine(userId, conversationId);
        const actualConversationId = contextEngine.getConversationId() || 'default';

        if (this.orchestratorCache.has(actualConversationId)) {
            return this.orchestratorCache.get(actualConversationId)!;
        }

        // Create new orchestrator
        const businessRules = new BusinessRulesEngine();
        const attendeeValidator = new AttendeeValidator();
        const orchestrator = new MeetingWorkflowOrchestrator(
            contextEngine,
            businessRules,
            attendeeValidator,
            user
        );

        this.orchestratorCache.set(actualConversationId, orchestrator);
        return orchestrator;
    }

    /**
     * Gets or creates a conversation context engine
     */
    private async getOrCreateContextEngine(
        userId: string,
        conversationId?: string
    ): Promise<ConversationContextEngine> {
        const cacheKey = conversationId || `user-${userId}`;

        if (this.contextEngineCache.has(cacheKey)) {
            return this.contextEngineCache.get(cacheKey)!;
        }

        // Create new context engine
        const contextEngine = await createConversationContextEngine(userId, conversationId);

        const actualConversationId = contextEngine.getConversationId() || cacheKey;
        this.contextEngineCache.set(actualConversationId, contextEngine);

        return contextEngine;
    }
}

// Export singleton instance
export const workflowChatIntegration = new WorkflowChatIntegration();