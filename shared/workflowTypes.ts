import { z } from "zod";
import type { UIBlock, MeetingData, ConversationMessage, AttendeeData } from './schema.js';

// ============================================================================
// Core Workflow Types
// ============================================================================

/**
 * Workflow step enumeration for meeting creation process
 */
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
    | 'completed';

/**
 * Validation result interface for business rules and data validation
 */
export interface ValidationResult {
    field: string;
    isValid: boolean;
    message: string;
    severity: 'error' | 'warning' | 'info';
}

/**
 * Core workflow state interface
 */
export interface WorkflowState {
    currentStep: WorkflowStep;
    meetingData: Partial<MeetingData>;
    validationResults: ValidationResult[];
    pendingActions: string[];
    isComplete: boolean;
    errors: string[];
    warnings: string[];
    timeCollectionComplete: boolean;
    attendeeCollectionComplete: boolean;
    progress: number; // 0-100 percentage
}

/**
 * Workflow transition definition for step management
 */
export interface WorkflowTransition {
    fromStep: WorkflowStep;
    toStep: WorkflowStep;
    condition: (state: WorkflowState) => boolean;
    action?: (state: WorkflowState) => Promise<void>;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Core workflow response interface
 */
export interface WorkflowResponse {
    message: string;
    uiBlock?: UIBlock;
    nextStep: WorkflowStep;
    requiresUserInput: boolean;
    workflow: {
        currentStep: WorkflowStep;
        progress: number;
        isComplete: boolean;
        nextAction: string;
    };
    validation: {
        errors: string[];
        warnings: string[];
    };
}

/**
 * Enhanced conversational response interface for frontend integration
 */
export interface ConversationalResponse {
    message: string;
    conversationId: string;
    uiBlock?: UIBlock;
    workflow: {
        currentStep: WorkflowStep;
        progress: number;
        requiresUserInput: boolean;
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
    performance?: {
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
 * Chat workflow response interface for internal workflow processing
 */
export interface ChatWorkflowResponse extends ConversationalResponse {
    // Inherits all ConversationalResponse properties
    // This interface exists for backward compatibility and internal use
}

// ============================================================================
// UI Block Handler Types
// ============================================================================

/**
 * UI block interaction event types
 */
export type UIBlockAction = 
    | 'type_select'
    | 'attendees_update'
    | 'continue'
    | 'approve'
    | 'edit'
    | 'agenda_update'
    | 'agenda_approve'
    | 'agenda_regenerate';

/**
 * UI block interaction data interface
 */
export interface UIBlockInteraction {
    blockType: string;
    action: UIBlockAction;
    data: Record<string, any>;
    conversationId: string;
    timestamp: Date;
}

/**
 * UI block event handlers interface for frontend components
 */
export interface UIBlockHandlers {
    onTypeSelect: (type: 'physical' | 'online', meetingId: string, location?: string) => Promise<void>;
    onAttendeesUpdate: (attendees: AttendeeData[], meetingId: string) => Promise<void>;
    onContinue: (meetingId: string) => Promise<void>;
    onApprove: (meetingId: string) => Promise<void>;
    onEdit: (meetingId: string) => Promise<void>;
    onAgendaUpdate: (agenda: string, meetingId: string) => Promise<void>;
    onAgendaApprove: (agenda: string, meetingId: string) => Promise<void>;
    onAgendaRegenerate: (meetingId: string) => Promise<void>;
}

// ============================================================================
// Workflow Status and Progress Types
// ============================================================================

/**
 * Workflow status enumeration
 */
export type WorkflowStatus = 
    | 'not_started'
    | 'in_progress'
    | 'waiting_for_input'
    | 'validating'
    | 'completed'
    | 'failed'
    | 'cancelled';

/**
 * Workflow progress information
 */
export interface WorkflowProgress {
    currentStep: WorkflowStep;
    completedSteps: WorkflowStep[];
    totalSteps: number;
    percentage: number;
    estimatedTimeRemaining?: number; // in minutes
    nextRequiredAction: string;
}

/**
 * Workflow metadata for tracking and analytics
 */
export interface WorkflowMetadata {
    startedAt: Date;
    lastUpdatedAt: Date;
    completedAt?: Date;
    userId: string;
    conversationId: string;
    workflowVersion: string;
    source: 'chat' | 'ui' | 'api';
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Workflow step schema for validation
 */
export const workflowStepSchema = z.enum([
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
]);

/**
 * Validation result schema
 */
export const validationResultSchema = z.object({
    field: z.string(),
    isValid: z.boolean(),
    message: z.string(),
    severity: z.enum(['error', 'warning', 'info']),
});

/**
 * Workflow state schema for validation
 */
export const workflowStateSchema = z.object({
    currentStep: workflowStepSchema,
    meetingData: z.record(z.any()), // Partial<MeetingData> - using record for flexibility
    validationResults: z.array(validationResultSchema),
    pendingActions: z.array(z.string()),
    isComplete: z.boolean(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
    timeCollectionComplete: z.boolean(),
    attendeeCollectionComplete: z.boolean(),
    progress: z.number().min(0).max(100),
});

/**
 * UI block interaction schema
 */
export const uiBlockInteractionSchema = z.object({
    blockType: z.string(),
    action: z.enum([
        'type_select',
        'attendees_update',
        'continue',
        'approve',
        'edit',
        'agenda_update',
        'agenda_approve',
        'agenda_regenerate'
    ]),
    data: z.record(z.any()),
    conversationId: z.string(),
    timestamp: z.date(),
});

/**
 * Conversational response schema
 */
export const conversationalResponseSchema = z.object({
    message: z.string(),
    conversationId: z.string(),
    uiBlock: z.any().optional(), // UIBlock schema is defined in schema.ts
    workflow: z.object({
        currentStep: workflowStepSchema,
        progress: z.number().min(0).max(100),
        requiresUserInput: z.boolean(),
        meetingData: z.record(z.any()),
        isComplete: z.boolean(),
        nextAction: z.string(),
    }),
    validation: z.object({
        errors: z.array(z.string()),
        warnings: z.array(z.string()),
    }),
    contextStats: z.object({
        messageCount: z.number(),
        tokenCount: z.number(),
        compressionLevel: z.number(),
        currentMode: z.string(),
        hasMeetingData: z.boolean(),
    }),
    performance: z.object({
        tokenEfficiency: z.number(),
        compressionEffectiveness: z.number(),
        optimizationRecommendations: z.array(z.object({
            type: z.string(),
            priority: z.string(),
            description: z.string(),
            estimatedTokenSavings: z.number(),
        })),
    }).optional(),
});

// ============================================================================
// Type Exports
// ============================================================================

// Export Zod inferred types
export type WorkflowStepType = z.infer<typeof workflowStepSchema>;
export type ValidationResultType = z.infer<typeof validationResultSchema>;
export type WorkflowStateType = z.infer<typeof workflowStateSchema>;
export type UIBlockInteractionType = z.infer<typeof uiBlockInteractionSchema>;
export type ConversationalResponseType = z.infer<typeof conversationalResponseSchema>;

// Re-export commonly used types for convenience
export type { UIBlock, MeetingData, ConversationMessage, AttendeeData } from './schema.js';