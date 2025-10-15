/**
 * User Feedback Service for Meeting Workflow
 * Requirements: 5.1, 5.2, 5.3 - Provide clear feedback about workflow steps and requirements
 */

import type { WorkflowStep } from './meetingWorkflowOrchestrator.js';
import type { CalendarAccessStatus } from './calendarAccessVerifier.js';
import type { AvailabilityResult } from './calendarAvailabilityService.js';

export interface ProgressIndicator {
  currentStep: WorkflowStep;
  totalSteps: number;
  completedSteps: number;
  stepName: string;
  stepDescription: string;
  progress: number; // 0-100
}

export interface UserFeedbackMessage {
  type: 'info' | 'success' | 'warning' | 'error' | 'progress';
  title: string;
  message: string;
  details?: string[];
  actionRequired?: boolean;
  suggestedActions?: string[];
  progressIndicator?: ProgressIndicator;
}

/**
 * Workflow step definitions with user-friendly names and descriptions
 */
export const WORKFLOW_STEP_INFO: Record<WorkflowStep, { name: string; description: string; order: number }> = {
  'intent_detection': {
    name: 'Understanding Request',
    description: 'Analyzing your meeting request',
    order: 1
  },
  'calendar_access_verification': {
    name: 'Calendar Access',
    description: 'Verifying calendar permissions',
    order: 2
  },
  'meeting_type_selection': {
    name: 'Meeting Type',
    description: 'Determining meeting format',
    order: 3
  },
  'time_date_collection': {
    name: 'Time & Date',
    description: 'Collecting meeting schedule',
    order: 4
  },
  'availability_check': {
    name: 'Availability Check',
    description: 'Checking calendar conflicts',
    order: 5
  },
  'conflict_resolution': {
    name: 'Conflict Resolution',
    description: 'Resolving scheduling conflicts',
    order: 6
  },
  'attendee_collection': {
    name: 'Attendees',
    description: 'Managing meeting attendees',
    order: 7
  },
  'meeting_details_collection': {
    name: 'Meeting Details',
    description: 'Collecting additional details',
    order: 8
  },
  'validation': {
    name: 'Validation',
    description: 'Validating meeting information',
    order: 9
  },
  'agenda_generation': {
    name: 'Agenda Creation',
    description: 'Generating meeting agenda',
    order: 10
  },
  'agenda_approval': {
    name: 'Agenda Review',
    description: 'Reviewing and approving agenda',
    order: 11
  },
  'approval': {
    name: 'Final Review',
    description: 'Final meeting approval',
    order: 12
  },
  'creation': {
    name: 'Creating Meeting',
    description: 'Creating calendar event',
    order: 13
  },
  'completed': {
    name: 'Complete',
    description: 'Meeting successfully created',
    order: 14
  }
};

/**
 * User Feedback Service for providing clear workflow communication
 */
export class UserFeedbackService {
  
  /**
   * Creates progress indicator for current workflow step
   * Requirements: 5.2 - Show clear messages about workflow step transitions
   */
  createProgressIndicator(currentStep: WorkflowStep): ProgressIndicator {
    const stepInfo = WORKFLOW_STEP_INFO[currentStep];
    const totalSteps = Object.keys(WORKFLOW_STEP_INFO).length;
    const completedSteps = stepInfo.order - 1;
    const progress = Math.round((completedSteps / totalSteps) * 100);
    
    return {
      currentStep,
      totalSteps,
      completedSteps,
      stepName: stepInfo.name,
      stepDescription: stepInfo.description,
      progress
    };
  }
  
  /**
   * Creates feedback message for workflow step transitions
   * Requirements: 5.1 - Clearly indicate what information will be collected in what order
   */
  createStepTransitionMessage(
    fromStep: WorkflowStep,
    toStep: WorkflowStep,
    context?: any
  ): UserFeedbackMessage {
    const progressIndicator = this.createProgressIndicator(toStep);
    const stepInfo = WORKFLOW_STEP_INFO[toStep];
    
    let message = '';
    let details: string[] = [];
    
    switch (toStep) {
      case 'calendar_access_verification':
        message = 'Checking your calendar access permissions...';
        details = ['Verifying existing authentication', 'No new permissions will be requested'];
        break;
        
      case 'meeting_type_selection':
        message = 'Let\'s determine the type of meeting you\'d like to schedule.';
        details = ['Online meetings require attendees', 'Physical meetings need location details'];
        break;
        
      case 'time_date_collection':
        message = 'Now let\'s establish when you\'d like to meet.';
        details = [
          'We\'ll collect the date and time first',
          'This helps us check availability before adding attendees'
        ];
        break;
        
      case 'availability_check':
        message = 'Checking your calendar for conflicts...';
        details = ['Scanning your calendar for the requested time', 'Will suggest alternatives if conflicts exist'];
        break;
        
      case 'conflict_resolution':
        message = 'Found scheduling conflicts - let\'s resolve them.';
        details = ['Alternative time slots have been suggested', 'Choose a new time or modify your request'];
        break;
        
      case 'attendee_collection':
        message = 'Time to add attendees to your meeting.';
        details = [
          'Use the attendee editor to add participants',
          'Email addresses will be validated automatically'
        ];
        break;
        
      case 'agenda_generation':
        message = 'Creating a meeting agenda based on our conversation...';
        details = ['Analyzing discussion topics', 'Generating structured agenda items'];
        break;
        
      case 'agenda_approval':
        message = 'Please review and approve the meeting agenda.';
        details = ['Edit agenda items as needed', 'Approve when ready to proceed'];
        break;
        
      case 'approval':
        message = 'Ready for final review - please confirm all meeting details.';
        details = ['Review all meeting information', 'Confirm to create the calendar event'];
        break;
        
      case 'creation':
        message = 'Creating your meeting in Google Calendar...';
        details = ['Adding event to your calendar', 'Sending invitations to attendees'];
        break;
        
      case 'completed':
        message = 'Meeting successfully created!';
        details = ['Calendar event has been created', 'Invitations sent to all attendees'];
        break;
        
      default:
        message = `Moving to ${stepInfo.name}...`;
        details = [stepInfo.description];
    }
    
    return {
      type: 'progress',
      title: `Step ${progressIndicator.completedSteps + 1}: ${stepInfo.name}`,
      message,
      details,
      progressIndicator
    };
  }
  
  /**
   * Creates feedback message for calendar access verification
   * Requirements: 5.2 - Indicate when calendar access is verified successfully
   */
  createCalendarAccessFeedback(accessStatus: CalendarAccessStatus): UserFeedbackMessage {
    if (accessStatus.hasAccess) {
      return {
        type: 'success',
        title: 'Calendar Access Verified',
        message: 'Your Google Calendar is connected and ready to use.',
        details: [
          'Calendar permissions are valid',
          'Ready to check availability and create events'
        ]
      };
    } else if (accessStatus.needsRefresh) {
      return {
        type: 'warning',
        title: 'Calendar Access Needs Refresh',
        message: 'Your calendar access token has expired and needs to be refreshed.',
        details: ['Attempting to refresh automatically', 'You may need to re-authenticate if this fails'],
        actionRequired: true,
        suggestedActions: ['Wait for automatic refresh', 'Re-authenticate if prompted']
      };
    } else {
      return {
        type: 'error',
        title: 'Calendar Access Required',
        message: 'Calendar access is needed to check availability and create meetings.',
        details: [accessStatus.error || 'Unknown calendar access error'],
        actionRequired: true,
        suggestedActions: ['Click to authenticate with Google Calendar', 'Grant calendar permissions']
      };
    }
  }
  
  /**
   * Creates feedback message for availability checking results
   * Requirements: 5.2 - Provide feedback about availability checking and conflict resolution
   */
  createAvailabilityFeedback(
    availabilityResult: AvailabilityResult,
    requestedTime: { start: Date; end: Date }
  ): UserFeedbackMessage {
    const timeStr = this.formatTimeRange(requestedTime.start, requestedTime.end);
    
    if (availabilityResult.isAvailable) {
      return {
        type: 'success',
        title: 'Time Slot Available',
        message: `Great! You're available for ${timeStr}.`,
        details: ['No calendar conflicts found', 'Ready to proceed with attendee collection']
      };
    } else {
      const conflictCount = availabilityResult.conflicts.length;
      const conflictDetails = availabilityResult.conflicts.map(conflict => 
        `"${conflict.title}" (${this.formatTimeRange(conflict.startTime, conflict.endTime)})`
      );
      
      return {
        type: 'warning',
        title: 'Scheduling Conflicts Found',
        message: `Found ${conflictCount} conflict${conflictCount > 1 ? 's' : ''} for ${timeStr}.`,
        details: [
          `Conflicting events: ${conflictDetails.join(', ')}`,
          ...(availabilityResult.suggestedAlternatives ? 
            [`${availabilityResult.suggestedAlternatives.length} alternative times suggested`] : 
            ['No alternatives could be generated'])
        ],
        actionRequired: true,
        suggestedActions: [
          'Choose an alternative time slot',
          'Modify your requested time',
          'Proceed anyway if conflicts are acceptable'
        ]
      };
    }
  }
  
  /**
   * Creates feedback message for missing information
   * Requirements: 5.3 - Specify exactly what is needed to proceed when information is missing
   */
  createMissingInfoFeedback(missingFields: string[], currentStep: WorkflowStep): UserFeedbackMessage {
    const stepInfo = WORKFLOW_STEP_INFO[currentStep];
    
    const fieldDescriptions: Record<string, string> = {
      'title': 'Meeting title or subject',
      'startTime': 'Meeting start date and time',
      'endTime': 'Meeting end time or duration',
      'type': 'Meeting type (online or physical)',
      'location': 'Meeting location (for physical meetings)',
      'attendees': 'Meeting attendees (for online meetings)',
      'agenda': 'Meeting agenda or topics'
    };
    
    const missingDescriptions = missingFields.map(field => 
      fieldDescriptions[field] || field
    );
    
    return {
      type: 'info',
      title: 'Additional Information Needed',
      message: `To complete ${stepInfo.name.toLowerCase()}, we need some additional information.`,
      details: missingDescriptions.map(desc => `• ${desc}`),
      actionRequired: true,
      suggestedActions: [
        'Provide the missing information',
        'Ask for help if you\'re unsure about any requirements'
      ]
    };
  }
  
  /**
   * Creates feedback message for workflow errors
   * Requirements: 5.4 - Provide actionable guidance to resolve issues when workflow errors occur
   */
  createErrorFeedback(
    error: Error,
    currentStep: WorkflowStep,
    context?: any
  ): UserFeedbackMessage {
    const stepInfo = WORKFLOW_STEP_INFO[currentStep];
    
    let title = 'Workflow Error';
    let message = 'An error occurred during the meeting creation process.';
    let suggestedActions: string[] = [];
    
    // Handle specific error types
    if (error.message.includes('calendar')) {
      title = 'Calendar Service Error';
      message = 'There was an issue with the calendar service.';
      suggestedActions = [
        'Check your internet connection',
        'Try refreshing your calendar permissions',
        'Contact support if the issue persists'
      ];
    } else if (error.message.includes('authentication') || error.message.includes('token')) {
      title = 'Authentication Error';
      message = 'Your authentication has expired or is invalid.';
      suggestedActions = [
        'Re-authenticate with Google Calendar',
        'Check that you\'ve granted necessary permissions'
      ];
    } else if (error.message.includes('validation')) {
      title = 'Validation Error';
      message = 'Some of the meeting information is invalid or incomplete.';
      suggestedActions = [
        'Review and correct the highlighted fields',
        'Ensure all required information is provided'
      ];
    } else if (error.message.includes('network') || error.message.includes('timeout')) {
      title = 'Connection Error';
      message = 'Unable to connect to the calendar service.';
      suggestedActions = [
        'Check your internet connection',
        'Try again in a few moments',
        'Contact support if the issue continues'
      ];
    }
    
    return {
      type: 'error',
      title,
      message: `${message} (Step: ${stepInfo.name})`,
      details: [error.message],
      actionRequired: true,
      suggestedActions
    };
  }
  
  /**
   * Creates feedback message for successful operations
   */
  createSuccessFeedback(
    operation: string,
    details?: string[]
  ): UserFeedbackMessage {
    return {
      type: 'success',
      title: 'Success',
      message: `${operation} completed successfully.`,
      details: details || []
    };
  }
  
  /**
   * Creates feedback message for warnings
   */
  createWarningFeedback(
    warning: string,
    details?: string[],
    suggestedActions?: string[]
  ): UserFeedbackMessage {
    return {
      type: 'warning',
      title: 'Warning',
      message: warning,
      details: details || [],
      suggestedActions: suggestedActions || []
    };
  }
  
  /**
   * Formats a time range for display
   */
  private formatTimeRange(start: Date, end: Date): string {
    const startStr = start.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    const endStr = end.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    return `${startStr} - ${endStr}`;
  }
  
  /**
   * Gets the next expected step information
   */
  getNextStepInfo(currentStep: WorkflowStep): { step: WorkflowStep; info: any } | null {
    const currentOrder = WORKFLOW_STEP_INFO[currentStep].order;
    const nextStep = Object.entries(WORKFLOW_STEP_INFO).find(
      ([_, info]) => info.order === currentOrder + 1
    );
    
    if (nextStep) {
      return {
        step: nextStep[0] as WorkflowStep,
        info: nextStep[1]
      };
    }
    
    return null;
  }
  
  /**
   * Creates a summary of workflow progress
   */
  createProgressSummary(currentStep: WorkflowStep, completedSteps: WorkflowStep[]): UserFeedbackMessage {
    const progressIndicator = this.createProgressIndicator(currentStep);
    const completedStepNames = completedSteps.map(step => WORKFLOW_STEP_INFO[step].name);
    
    return {
      type: 'info',
      title: 'Meeting Creation Progress',
      message: `You're ${progressIndicator.progress}% through the meeting creation process.`,
      details: [
        `Current step: ${progressIndicator.stepName}`,
        `Completed: ${completedStepNames.join(', ')}`,
        `Remaining: ${14 - progressIndicator.completedSteps} steps`
      ],
      progressIndicator
    };
  }
}

/**
 * Singleton instance for global use
 */
export const userFeedbackService = new UserFeedbackService();

/**
 * Utility functions for common feedback scenarios
 */
export const FeedbackUtils = {
  /**
   * Creates step transition feedback
   */
  stepTransition: (from: WorkflowStep, to: WorkflowStep, context?: any) =>
    userFeedbackService.createStepTransitionMessage(from, to, context),
  
  /**
   * Creates calendar access feedback
   */
  calendarAccess: (status: CalendarAccessStatus) =>
    userFeedbackService.createCalendarAccessFeedback(status),
  
  /**
   * Creates availability feedback
   */
  availability: (result: AvailabilityResult, time: { start: Date; end: Date }) =>
    userFeedbackService.createAvailabilityFeedback(result, time),
  
  /**
   * Creates missing info feedback
   */
  missingInfo: (fields: string[], step: WorkflowStep) =>
    userFeedbackService.createMissingInfoFeedback(fields, step),
  
  /**
   * Creates error feedback
   */
  error: (error: Error, step: WorkflowStep, context?: any) =>
    userFeedbackService.createErrorFeedback(error, step, context),
  
  /**
   * Creates success feedback
   */
  success: (operation: string, details?: string[]) =>
    userFeedbackService.createSuccessFeedback(operation, details),
  
  /**
   * Creates warning feedback
   */
  warning: (warning: string, details?: string[], actions?: string[]) =>
    userFeedbackService.createWarningFeedback(warning, details, actions)
};