import { z } from "zod";
import type { 
    WorkflowStep,
    WorkflowState,
    UIBlockInteraction,
    ValidationResult as WorkflowValidationResult
} from './workflowTypes.js';
import type { 
    ValidationResult,
    WorkflowStateValidationResult,
    UIBlockInteractionRequestType,
    WorkflowStateValidationType
} from './apiTypes.js';
import {
    workflowStateValidationSchema,
    uiBlockInteractionRequestSchema,
    validateUIBlockInteractionData,
    validateWorkflowStateConsistency
} from './apiTypes.js';

// ============================================================================
// Comprehensive Validation Functions
// ============================================================================

/**
 * Validates a complete UI block interaction request
 */
export function validateUIBlockInteractionRequest(
    data: unknown
): ValidationResult<UIBlockInteractionRequestType> {
    try {
        // First validate the basic structure
        const basicValidation = uiBlockInteractionRequestSchema.safeParse(data);
        if (!basicValidation.success) {
            return {
                success: false,
                errors: basicValidation.error.errors.map(err => 
                    `${err.path.join('.')}: ${err.message}`
                )
            };
        }

        const validatedData = basicValidation.data;

        // Then validate the specific UI block data
        const dataValidation = validateUIBlockInteractionData(
            validatedData.blockType,
            validatedData.action,
            validatedData.data
        );

        if (!dataValidation.success) {
            return {
                success: false,
                errors: (dataValidation as { success: false; errors?: string[] }).errors || ['UI block data validation failed']
            };
        }

        return {
            success: true,
            data: validatedData
        };
    } catch (error) {
        return {
            success: false,
            errors: ['Failed to validate UI block interaction request']
        };
    }
}

/**
 * Validates workflow state with business rules
 */
export function validateWorkflowState(
    data: unknown
): ValidationResult<WorkflowStateValidationType> & WorkflowStateValidationResult {
    try {
        // First validate the schema structure
        const schemaValidation = workflowStateValidationSchema.safeParse(data);
        if (!schemaValidation.success) {
            return {
                success: false,
                isValid: false,
                errors: schemaValidation.error.errors.map(err => 
                    `${err.path.join('.')}: ${err.message}`
                )
            };
        }

        const validatedData = schemaValidation.data;

        // Then validate business rules and consistency
        const consistencyValidation = validateWorkflowStateConsistency(validatedData);
        
        if (consistencyValidation.isValid) {
            return {
                success: true,
                isValid: true,
                data: validatedData,
                warnings: (consistencyValidation as { isValid: true; warnings?: string[] }).warnings
            };
        } else {
            const failedValidation = consistencyValidation as { isValid: false; errors: string[]; warnings: string[] };
            return {
                success: false,
                isValid: false,
                data: validatedData,
                errors: failedValidation.errors,
                warnings: failedValidation.warnings
            };
        }
    } catch (error) {
        return {
            success: false,
            isValid: false,
            errors: ['Failed to validate workflow state']
        };
    }
}

/**
 * Validates workflow step transition
 */
export function validateWorkflowStepTransition(
    currentStep: WorkflowStep,
    targetStep: WorkflowStep,
    workflowState: Partial<WorkflowState>
): ValidationResult<{ canTransition: boolean; requiredActions: string[] }> {
    const stepOrder: WorkflowStep[] = [
        'intent_detection',
        'calendar_access_verification',
        'meeting_type_selection',
        'time_date_collection',
        'availability_check',
        'conflict_resolution',
        'attendee_collection',
        'meeting_details_collection',
        'validation',
        'agenda_generation',
        'agenda_approval',
        'approval',
        'creation',
        'completed'
    ];

    const currentIndex = stepOrder.indexOf(currentStep);
    const targetIndex = stepOrder.indexOf(targetStep);

    if (currentIndex === -1 || targetIndex === -1) {
        return {
            success: false,
            errors: ['Invalid workflow step']
        };
    }

    // Allow backward transitions for corrections
    if (targetIndex < currentIndex) {
        return {
            success: true,
            data: {
                canTransition: true,
                requiredActions: [`Reverting to ${targetStep} step`]
            }
        };
    }

    // Check if we can skip to the target step
    const requiredActions: string[] = [];
    const errors: string[] = [];

    // Validate step-specific requirements
    switch (targetStep) {
        case 'meeting_type_selection':
            if (!workflowState.meetingData) {
                errors.push('Meeting data must be initialized');
            }
            break;

        case 'attendee_collection':
            if (!workflowState.meetingData?.type) {
                errors.push('Meeting type must be selected first');
                requiredActions.push('Select meeting type');
            }
            break;

        case 'validation':
            if (workflowState.meetingData?.type === 'online' && 
                (!workflowState.meetingData.attendees || workflowState.meetingData.attendees.length === 0)) {
                errors.push('Online meetings require at least one attendee');
                requiredActions.push('Add attendees for online meeting');
            }
            if (!workflowState.meetingData?.startTime || !workflowState.meetingData?.endTime) {
                errors.push('Meeting time must be specified');
                requiredActions.push('Set meeting start and end time');
            }
            break;

        case 'agenda_generation':
            if (!workflowState.attendeeCollectionComplete) {
                errors.push('Attendee collection must be completed first');
                requiredActions.push('Complete attendee collection');
            }
            break;

        case 'creation':
            if (!workflowState.meetingData?.title) {
                errors.push('Meeting title is required');
                requiredActions.push('Set meeting title');
            }
            break;
    }

    if (errors.length > 0) {
        return {
            success: false,
            errors,
            data: {
                canTransition: false,
                requiredActions
            }
        };
    }

    return {
        success: true,
        data: {
            canTransition: true,
            requiredActions
        }
    };
}

/**
 * Validates meeting data completeness for a given workflow step
 */
export function validateMeetingDataCompleteness(
    meetingData: any,
    requiredStep: WorkflowStep
): ValidationResult<{ isComplete: boolean; missingFields: string[] }> {
    const missingFields: string[] = [];

    switch (requiredStep) {
        case 'meeting_type_selection':
            if (!meetingData?.type) missingFields.push('type');
            break;

        case 'time_date_collection':
            if (!meetingData?.startTime) missingFields.push('startTime');
            if (!meetingData?.endTime) missingFields.push('endTime');
            break;

        case 'attendee_collection':
            if (meetingData?.type === 'online' && 
                (!meetingData?.attendees || meetingData.attendees.length === 0)) {
                missingFields.push('attendees');
            }
            break;

        case 'meeting_details_collection':
            if (!meetingData?.title) missingFields.push('title');
            if (meetingData?.type === 'physical' && !meetingData?.location) {
                missingFields.push('location');
            }
            break;

        case 'validation':
        case 'creation':
            if (!meetingData?.title) missingFields.push('title');
            if (!meetingData?.type) missingFields.push('type');
            if (!meetingData?.startTime) missingFields.push('startTime');
            if (!meetingData?.endTime) missingFields.push('endTime');
            if (meetingData?.type === 'physical' && !meetingData?.location) {
                missingFields.push('location');
            }
            if (meetingData?.type === 'online' && 
                (!meetingData?.attendees || meetingData.attendees.length === 0)) {
                missingFields.push('attendees');
            }
            break;
    }

    return {
        success: true,
        data: {
            isComplete: missingFields.length === 0,
            missingFields
        }
    };
}

/**
 * Validates attendee data format and requirements
 */
export function validateAttendeeData(
    attendees: any[],
    meetingType: 'physical' | 'online'
): ValidationResult<{ validAttendees: any[]; invalidEmails: string[] }> {
    const validAttendees: any[] = [];
    const invalidEmails: string[] = [];
    const errors: string[] = [];

    if (!Array.isArray(attendees)) {
        return {
            success: false,
            errors: ['Attendees must be an array']
        };
    }

    // Email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const attendee of attendees) {
        if (!attendee.email || typeof attendee.email !== 'string') {
            errors.push('Each attendee must have an email address');
            continue;
        }

        if (!emailRegex.test(attendee.email)) {
            invalidEmails.push(attendee.email);
            continue;
        }

        validAttendees.push({
            email: attendee.email,
            firstName: attendee.firstName || '',
            lastName: attendee.lastName || '',
            profilePicture: attendee.profilePicture || null,
            isValidated: attendee.isValidated || false,
            isRequired: attendee.isRequired !== false, // default to true
        });
    }

    // Business rule: online meetings require at least one attendee
    if (meetingType === 'online' && validAttendees.length === 0) {
        errors.push('Online meetings must have at least one valid attendee');
    }

    if (errors.length > 0) {
        return {
            success: false,
            errors,
            data: {
                validAttendees,
                invalidEmails
            }
        };
    }

    return {
        success: true,
        data: {
            validAttendees,
            invalidEmails
        }
    };
}

/**
 * Validates meeting time constraints
 */
export function validateMeetingTime(
    startTime: Date | string,
    endTime: Date | string
): ValidationResult<{ startTime: Date; endTime: Date; duration: number }> {
    try {
        const start = new Date(startTime);
        const end = new Date(endTime);
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check if dates are valid
        if (isNaN(start.getTime())) {
            errors.push('Invalid start time format');
        }
        if (isNaN(end.getTime())) {
            errors.push('Invalid end time format');
        }

        if (errors.length > 0) {
            return { success: false, errors };
        }

        // Business rule validations
        if (start >= end) {
            errors.push('Meeting start time must be before end time');
        }

        const now = new Date();
        if (start < now) {
            warnings.push('Meeting is scheduled in the past');
        }

        const duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60)); // minutes

        if (duration < 15) {
            warnings.push('Meeting duration is less than 15 minutes');
        }

        if (duration > 480) { // 8 hours
            warnings.push('Meeting duration is more than 8 hours');
        }

        if (errors.length > 0) {
            return { success: false, errors, warnings };
        }

        return {
            success: true,
            data: {
                startTime: start,
                endTime: end,
                duration
            },
            warnings
        };
    } catch (error) {
        return {
            success: false,
            errors: ['Failed to validate meeting time']
        };
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Combines multiple validation results
 */
export function combineValidationResults<T>(
    ...results: ValidationResult<T>[]
): ValidationResult<T[]> {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    const allData: T[] = [];

    for (const result of results) {
        if (result.errors) {
            allErrors.push(...result.errors);
        }
        if (result.warnings) {
            allWarnings.push(...result.warnings);
        }
        if (result.success && result.data) {
            allData.push(result.data);
        }
    }

    if (allErrors.length > 0) {
        return {
            success: false,
            errors: allErrors,
            warnings: allWarnings.length > 0 ? allWarnings : undefined
        };
    }

    return {
        success: true,
        data: allData,
        warnings: allWarnings.length > 0 ? allWarnings : undefined
    };
}

/**
 * Creates a validation summary for debugging
 */
export function createValidationSummary(
    validationResults: ValidationResult<any>[]
): {
    totalValidations: number;
    successCount: number;
    errorCount: number;
    warningCount: number;
    allErrors: string[];
    allWarnings: string[];
} {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const result of validationResults) {
        if (result.success) {
            successCount++;
        } else {
            errorCount++;
        }

        if (result.errors) {
            allErrors.push(...result.errors);
        }
        if (result.warnings) {
            allWarnings.push(...result.warnings);
        }
    }

    return {
        totalValidations: validationResults.length,
        successCount,
        errorCount,
        warningCount: allWarnings.length,
        allErrors,
        allWarnings
    };
}