/**
 * Dynamic Message Generator - Code-based grounding for contextual responses
 *
 * Instead of hardcoded strings, this generates dynamic messages based on:
 * - Current workflow state
 * - Meeting data context
 * - User conversation history
 * - Business rules and validation
 */

import type { WorkflowState } from './meetingWorkflowOrchestrator.js';
import { MeetingData } from '../shared/schema.js';

export interface MessageContext {
    workflowState: WorkflowState;
    meetingData: MeetingData;
    conversationHistory: Array<{ role: string; content: string; timestamp: Date }>;
    userMessage?: string;
    validationErrors?: string[];
    warnings?: string[];
    nextStep?: string;
}

export interface GeneratedMessage {
    message: string;
    uiBlock?: any;
    requiresUserInput: boolean;
    metadata?: {
        reasoning: string;
        confidence: number;
        contextUsed: string[];
    };
}

/**
 * Main message generator that creates contextual responses based on workflow state
 */
export class DynamicMessageGenerator {

    /**
     * Generate a contextual response based on current workflow state
     */
    static generateResponse(context: MessageContext): GeneratedMessage {
        const { workflowState, meetingData, validationErrors, warnings, nextStep } = context;

        // Determine response type based on workflow state
        const responseType = this.determineResponseType(context);

        switch (responseType) {
            case 'time_collection':
                return this.generateTimeCollectionMessage(context);

            case 'meeting_type_selection':
                return this.generateMeetingTypeSelectionMessage(context);

            case 'attendee_collection':
                return this.generateAttendeeCollectionMessage(context);

            case 'meeting_details_collection':
                return this.generateMeetingDetailsCollectionMessage(context);

            case 'validation_errors':
                return this.generateValidationErrorMessage(context);

            case 'completion':
                return this.generateCompletionMessage(context);

            case 'general_acknowledgment':
            default:
                return this.generateGeneralAcknowledgmentMessage(context);
        }
    }

    /**
     * Determine the type of response needed based on context
     */
    private static determineResponseType(context: MessageContext): string {
        const { workflowState, meetingData, validationErrors, nextStep } = context;

        if (validationErrors && validationErrors.length > 0) {
            return 'validation_errors';
        }

        if (workflowState.isComplete) {
            return 'completion';
        }

        switch (nextStep || workflowState.currentStep) {
            case 'time_date_collection':
                return 'time_collection';
            case 'meeting_type_selection':
                return 'meeting_type_selection';
            case 'attendee_collection':
                return 'attendee_collection';
            case 'meeting_details_collection':
                return 'meeting_details_collection';
            default:
                return 'general_acknowledgment';
        }
    }

    /**
     * Generate time collection message
     */
    private static generateTimeCollectionMessage(context: MessageContext): GeneratedMessage {
        const { meetingData } = context;

        let message = '';

        if (meetingData.type === 'online') {
            message = `Great! You're scheduling an ${meetingData.type} meeting. `;
        } else if (meetingData.type === 'physical') {
            message = `Perfect! You're scheduling a ${meetingData.type} meeting. `;
        } else {
            message = 'Let\'s set up your meeting. ';
        }

        // Add context-aware guidance
        if (!meetingData.startTime && !meetingData.endTime) {
            message += 'When would you like to schedule this meeting? Please provide the date and time (e.g., "tomorrow at 2pm" or "October 16 at 3:30pm").';
        } else if (meetingData.startTime && !meetingData.endTime) {
            message += `I see you've set the start time to ${new Date(meetingData.startTime).toLocaleString()}. What's the end time?`;
        } else {
            message += `Meeting time is set to ${new Date(meetingData.startTime!).toLocaleString()}. Let me check availability.`;
        }

        return {
            message,
            requiresUserInput: true,
            metadata: {
                reasoning: 'Time collection step with context-aware guidance',
                confidence: 0.9,
                contextUsed: ['meetingType', 'currentTime', 'startTime', 'endTime']
            }
        };
    }

    /**
     * Generate meeting type selection message
     */
    private static generateMeetingTypeSelectionMessage(context: MessageContext): GeneratedMessage {
        const { meetingData } = context;

        const uiBlock = {
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

        return {
            message: 'I can help you schedule either an online or physical meeting. Please select the type that works best for you.',
            uiBlock,
            requiresUserInput: true
        };
    }

    /**
     * Generate attendee collection message
     */
    private static generateAttendeeCollectionMessage(context: MessageContext): GeneratedMessage {
        const { meetingData } = context;

        let message = '';

        if (meetingData.type === 'online') {
            if (!meetingData.attendees || meetingData.attendees.length === 0) {
                message = 'For online meetings, I need to know who will be attending. Please provide the email addresses of the participants.';
            } else {
                const attendeeCount = meetingData.attendees.length;
                message = `I have ${attendeeCount} attendee${attendeeCount === 1 ? '' : 's'} so far. Do you want to add more participants?`;
            }
        } else {
            message = 'Let\'s add the participants for your meeting. Who will be attending?';
        }

        return {
            message,
            requiresUserInput: true
        };
    }

    /**
     * Generate meeting details collection message
     */
    private static generateMeetingDetailsCollectionMessage(context: MessageContext): GeneratedMessage {
        const { meetingData } = context;

        let message = '';

        if (meetingData.type === 'physical' && !meetingData.location) {
            message = 'For physical meetings, I need to know where it will take place. What\'s the location?';
        } else if (!meetingData.title) {
            message = 'What would you like to call this meeting? Please provide a title.';
        } else {
            message = 'I have your meeting title. Would you like to add any additional details like a description or agenda?';
        }

        return {
            message,
            requiresUserInput: true
        };
    }

    /**
     * Generate validation error message
     */
    private static generateValidationErrorMessage(context: MessageContext): GeneratedMessage {
        const { validationErrors = [] } = context;

        if (validationErrors.length === 0) {
            return this.generateGeneralAcknowledgmentMessage(context);
        }

        let message = 'I found some issues that need to be addressed:\n\n';

        validationErrors.forEach((error, index) => {
            message += `${index + 1}. ${error}\n`;
        });

        message += '\nPlease fix these issues and try again.';

        return {
            message,
            requiresUserInput: true
        };
    }

    /**
     * Generate completion message
     */
    private static generateCompletionMessage(context: MessageContext): GeneratedMessage {
        const { meetingData } = context;

        let message = 'Perfect! Your meeting has been successfully scheduled.';

        if (meetingData.title) {
            message += ` "${meetingData.title}"`;
        }

        if (meetingData.startTime) {
            message += ` is scheduled for ${new Date(meetingData.startTime).toLocaleString()}`;
        }

        if (meetingData.location) {
            message += ` at ${meetingData.location}`;
        }

        message += '.';

        return {
            message,
            requiresUserInput: false
        };
    }

    /**
     * Generate general acknowledgment message
     */
    private static generateGeneralAcknowledgmentMessage(context: MessageContext): GeneratedMessage {
        const { userMessage } = context;

        if (userMessage) {
            return {
                message: `I understand you said: "${userMessage}". Let me help you with that.`,
                requiresUserInput: true
            };
        }

        return {
            message: 'I\'m here to help with your meeting scheduling. What would you like to do?',
            requiresUserInput: true
        };
    }

    /**
     * Generate progress message
     */
    static generateProgressMessage(currentStep: string, progress: number): string {
        const stepDescriptions: Record<string, string> = {
            'intent_detection': 'Understanding your request',
            'calendar_access_verification': 'Checking calendar permissions',
            'meeting_type_selection': 'Selecting meeting type',
            'time_date_collection': 'Setting meeting time',
            'availability_check': 'Checking availability',
            'conflict_resolution': 'Resolving scheduling conflicts',
            'attendee_collection': 'Adding participants',
            'meeting_details_collection': 'Adding meeting details',
            'validation': 'Validating meeting information',
            'agenda_generation': 'Creating meeting agenda',
            'agenda_approval': 'Reviewing agenda',
            'approval': 'Final approval',
            'creation': 'Creating meeting',
            'completed': 'Meeting scheduled successfully'
        };

        const stepDescription = stepDescriptions[currentStep] || currentStep;
        return `Progress: ${stepDescription} (${Math.round(progress * 100)}% complete)`;
    }

    /**
     * Generate context-aware suggestions
     */
    static generateSuggestions(context: MessageContext): string[] {
        const { workflowState, meetingData } = context;
        const suggestions: string[] = [];

        // Time-based suggestions
        if (workflowState.currentStep === 'time_date_collection') {
            if (!meetingData.startTime) {
                suggestions.push('Try saying "tomorrow at 2pm" or "next Monday at 10am"');
                suggestions.push('You can also say "this Friday at 3pm"');
            }
        }

        // Attendee-based suggestions
        if (workflowState.currentStep === 'attendee_collection') {
            if (!meetingData.attendees || meetingData.attendees.length === 0) {
                suggestions.push('Add attendees by saying "include john@example.com and sarah@example.com"');
                suggestions.push('Or say "add my team members" if you have team contacts saved');
            }
        }

        return suggestions;
    }
}
