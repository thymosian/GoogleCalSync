import { z } from "zod";
import { randomUUID } from "crypto";
import type {
    ConversationalResponse,
    UIBlockInteraction,
    WorkflowState,
    WorkflowStep
} from './workflowTypes.js';
import type { MeetingData, AttendeeData, ConversationMessage } from './schema.js';

// ============================================================================
// API Request Types
// ============================================================================

/**
 * Conversational chat API request
 */
export interface ConversationalChatRequest {
    message: string;
    conversationId?: string;
    context?: {
        currentMode?: string;
        meetingData?: Partial<MeetingData>;
        workflowStep?: WorkflowStep;
    };
    metadata?: {
        source: 'chat' | 'ui' | 'api';
        timestamp: string;
        userAgent?: string;
    };
}

/**
 * UI block interaction API request
 */
export interface UIBlockInteractionRequest {
    blockType: string;
    action: string;
    data: Record<string, any>;
    conversationId: string;
    metadata?: {
        timestamp: string;
        source: 'ui' | 'api';
        userAgent?: string;
    };
}

/**
 * Workflow state update request
 */
export interface WorkflowStateUpdateRequest {
    conversationId: string;
    workflowState: Partial<WorkflowState>;
    action: 'update' | 'advance' | 'reset' | 'validate';
    metadata?: {
        reason: string;
        source: 'user' | 'system' | 'api';
        timestamp: string;
    };
}

/**
 * Workflow advancement request
 */
export interface WorkflowAdvancementRequest {
    conversationId: string;
    targetStep?: WorkflowStep;
    skipValidation?: boolean;
    data?: Record<string, any>;
}

/**
 * Meeting intent extraction request
 */
export interface MeetingIntentRequest {
    message: string;
    context?: {
        previousMessages?: ConversationMessage[];
        currentMode?: string;
        existingMeetingData?: Partial<MeetingData>;
    };
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Standard API error response
 */
export interface APIErrorResponse {
    error: string;
    code: string;
    details?: Record<string, any>;
    timestamp: string;
    requestId?: string;
    suggestions?: string[];
}

/**
 * UI block interaction API response
 */
export interface UIBlockInteractionResponse {
    success: boolean;
    message: string;
    conversationId: string;
    nextUIBlock?: any; // UIBlock type from schema.ts
    workflowState: {
        currentStep: WorkflowStep;
        progress: number;
        requiresUserInput: boolean;
        isComplete: boolean;
    };
    validation: {
        errors: string[];
        warnings: string[];
        isValid: boolean;
    };
    metadata?: {
        processingTime: number;
        timestamp: string;
    };
}

/**
 * Workflow state retrieval response
 */
export interface WorkflowStateResponse {
    conversationId: string;
    workflowState: WorkflowState;
    isActive: boolean;
    lastUpdated: string;
    metadata: {
        version: string;
        source: string;
        validationStatus: 'valid' | 'invalid' | 'unknown';
    };
}

/**
 * Workflow advancement response
 */
export interface WorkflowAdvancementResponse {
    success: boolean;
    message: string;
    conversationId: string;
    previousStep: WorkflowStep;
    currentStep: WorkflowStep;
    nextUIBlock?: any; // UIBlock type
    validation: {
        errors: string[];
        warnings: string[];
        canProceed: boolean;
    };
    metadata: {
        advancementTime: number;
        timestamp: string;
    };
}

/**
 * Meeting intent extraction response
 */
export interface MeetingIntentResponse {
    hasIntent: boolean;
    confidence: number;
    intent: 'create_meeting' | 'schedule_meeting' | 'modify_meeting' | 'cancel_meeting' | 'other';
    extraction: {
        fields: {
            title?: string;
            startTime?: string;
            endTime?: string;
            duration?: number;
            attendees?: string[];
            location?: string;
            type?: 'physical' | 'online';
        };
        missing: string[];
        confidence: Record<string, number>;
    };
    shouldTriggerWorkflow: boolean;
    suggestedAction: string;
}

/**
 * Conversation history response
 */
export interface ConversationHistoryResponse {
    conversationId: string;
    messages: ConversationMessage[];
    workflowContext?: {
        currentStep: WorkflowStep;
        meetingData: Partial<MeetingData>;
        progress: number;
    };
    pagination: {
        page: number;
        limit: number;
        total: number;
        hasMore: boolean;
    };
    metadata: {
        createdAt: string;
        lastActivity: string;
        messageCount: number;
    };
}

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Conversational chat request schema
 */
export const conversationalChatRequestSchema = z.object({
    message: z.string().min(1).max(5000),
    conversationId: z.string().uuid().optional(),
    context: z.object({
        currentMode: z.enum(['casual', 'scheduling', 'approval']).optional(),
        meetingData: z.record(z.any()).optional(),
        workflowStep: z.enum([
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
        ]).optional(),
    }).optional(),
    metadata: z.object({
        source: z.enum(['chat', 'ui', 'api']),
        timestamp: z.string().datetime(),
        userAgent: z.string().optional(),
    }).optional(),
});

/**
 * UI block interaction data schemas for different block types
 */
export const meetingTypeSelectionDataSchema = z.object({
    type: z.enum(['physical', 'online']),
    location: z.string().optional(),
});

export const attendeeManagementDataSchema = z.object({
    attendees: z.array(z.object({
        email: z.string().email(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        profilePicture: z.string().url().optional(),
        isValidated: z.boolean().default(false),
        isRequired: z.boolean().default(true),
    })),
});

export const meetingApprovalDataSchema = z.object({
    approved: z.boolean(),
    changes: z.object({
        title: z.string().optional(),
        startTime: z.string().datetime().optional(),
        endTime: z.string().datetime().optional(),
        location: z.string().optional(),
        attendees: z.array(z.string().email()).optional(),
    }).optional(),
});

export const agendaEditorDataSchema = z.object({
    agenda: z.string().min(1).max(10000),
    approved: z.boolean().optional(),
    regenerate: z.boolean().optional(),
});

/**
 * UI block interaction request schema with enhanced validation
 */
export const uiBlockInteractionRequestSchema = z.object({
    blockType: z.enum([
        'meeting_type_selection',
        'attendee_management',
        'meeting_approval',
        'agenda_editor',
        'meeting_link_choice',
        'attendee_editor',
        'title_suggestions',
        'event_review'
    ]),
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
    data: z.union([
        meetingTypeSelectionDataSchema,
        attendeeManagementDataSchema,
        meetingApprovalDataSchema,
        agendaEditorDataSchema,
        z.record(z.any()) // fallback for other data types
    ]),
    conversationId: z.string().uuid(),
    metadata: z.object({
        timestamp: z.string().datetime(),
        source: z.enum(['ui', 'api']),
        userAgent: z.string().optional(),
    }).optional(),
});

/**
 * Enhanced workflow state schema with proper validation
 */
export const workflowStateValidationSchema = z.object({
    currentStep: z.enum([
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
    ]),
    meetingData: z.object({
        id: z.string().uuid().optional(),
        title: z.string().min(1).max(200).optional(),
        type: z.enum(['physical', 'online']).optional(),
        startTime: z.date().optional(),
        endTime: z.date().optional(),
        location: z.string().max(500).optional(),
        attendees: z.array(z.object({
            email: z.string().email(),
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            profilePicture: z.string().url().optional(),
            isValidated: z.boolean().default(false),
            isRequired: z.boolean().default(true),
        })).default([]),
        agenda: z.string().max(10000).optional(),
        meetingLink: z.string().url().optional(),
        status: z.enum(['draft', 'pending_approval', 'approved', 'created']).default('draft'),
    }),
    validationResults: z.array(z.object({
        field: z.string(),
        isValid: z.boolean(),
        message: z.string(),
        severity: z.enum(['error', 'warning', 'info']),
    })),
    pendingActions: z.array(z.string()),
    isComplete: z.boolean(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
    timeCollectionComplete: z.boolean(),
    attendeeCollectionComplete: z.boolean(),
    progress: z.number().min(0).max(100),
});

/**
 * Workflow state update request schema
 */
export const workflowStateUpdateRequestSchema = z.object({
    conversationId: z.string().uuid(),
    workflowState: workflowStateValidationSchema.partial(),
    action: z.enum(['update', 'advance', 'reset', 'validate']),
    metadata: z.object({
        reason: z.string().min(1).max(500),
        source: z.enum(['user', 'system', 'api']),
        timestamp: z.string().datetime(),
    }).optional(),
});

/**
 * Workflow advancement request schema
 */
export const workflowAdvancementRequestSchema = z.object({
    conversationId: z.string().uuid(),
    targetStep: z.enum([
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
    ]).optional(),
    skipValidation: z.boolean().default(false),
    data: z.record(z.any()).optional(),
});

/**
 * Meeting intent request schema
 */
export const meetingIntentRequestSchema = z.object({
    message: z.string().min(1).max(5000),
    context: z.object({
        previousMessages: z.array(z.object({
            id: z.string(),
            role: z.enum(['user', 'assistant']),
            content: z.string(),
            timestamp: z.date(),
        })).optional(),
        currentMode: z.enum(['casual', 'scheduling', 'approval']).optional(),
        existingMeetingData: z.object({
            id: z.string().uuid().optional(),
            title: z.string().optional(),
            type: z.enum(['physical', 'online']).optional(),
            startTime: z.date().optional(),
            endTime: z.date().optional(),
            location: z.string().optional(),
            attendees: z.array(z.string().email()).optional(),
        }).optional(),
    }).optional(),
});

// ============================================================================
// Route Parameter Validation Schemas
// ============================================================================

/**
 * Conversation ID parameter schema
 */
export const conversationIdParamSchema = z.object({
    conversationId: z.string().uuid(),
});

/**
 * Meeting ID parameter schema
 */
export const meetingIdParamSchema = z.object({
    meetingId: z.string().uuid(),
});

/**
 * User ID parameter schema
 */
export const userIdParamSchema = z.object({
    userId: z.string().uuid(),
});

// ============================================================================
// Query Parameter Validation Schemas
// ============================================================================

/**
 * Pagination query schema
 */
export const paginationQuerySchema = z.object({
    page: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 100).optional(),
});

/**
 * Conversation history query schema
 */
export const conversationHistoryQuerySchema = paginationQuerySchema.extend({
    includeWorkflow: z.string().regex(/^(true|false)$/).transform(s => s === 'true').optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
});

/**
 * Workflow state query schema
 */
export const workflowStateQuerySchema = z.object({
    includeHistory: z.string().regex(/^(true|false)$/).transform(s => s === 'true').optional(),
    validateConsistency: z.string().regex(/^(true|false)$/).transform(s => s === 'true').optional(),
});

// ============================================================================
// API Endpoint Types
// ============================================================================

/**
 * API endpoint configuration
 */
export interface APIEndpoint {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    description: string;
    requestSchema?: z.ZodSchema;
    responseSchema?: z.ZodSchema;
    requiresAuth: boolean;
    rateLimit?: {
        requests: number;
        window: number; // in seconds
    };
}

/**
 * Workflow API endpoints configuration
 */
export const WORKFLOW_API_ENDPOINTS: Record<string, APIEndpoint> = {
    conversationalChat: {
        method: 'POST',
        path: '/api/chat/conversational',
        description: 'Send message to conversational meeting scheduler',
        requestSchema: conversationalChatRequestSchema,
        requiresAuth: true,
        rateLimit: { requests: 60, window: 60 }
    },
    uiBlockInteraction: {
        method: 'POST',
        path: '/api/workflow/ui-interaction',
        description: 'Handle UI block interactions',
        requestSchema: uiBlockInteractionRequestSchema,
        requiresAuth: true,
        rateLimit: { requests: 100, window: 60 }
    },
    workflowState: {
        method: 'GET',
        path: '/api/workflow/state/:conversationId',
        description: 'Retrieve workflow state for conversation',
        requiresAuth: true,
        rateLimit: { requests: 120, window: 60 }
    },
    workflowAdvancement: {
        method: 'POST',
        path: '/api/workflow/advance/:conversationId',
        description: 'Advance workflow to next step',
        requestSchema: workflowAdvancementRequestSchema,
        requiresAuth: true,
        rateLimit: { requests: 30, window: 60 }
    },
    meetingIntent: {
        method: 'POST',
        path: '/api/ai/extract-meeting',
        description: 'Extract meeting intent from message',
        requestSchema: meetingIntentRequestSchema,
        requiresAuth: true,
        rateLimit: { requests: 100, window: 60 }
    },
    conversationHistory: {
        method: 'GET',
        path: '/api/conversations/:conversationId/history',
        description: 'Retrieve conversation history with workflow context',
        requiresAuth: true,
        rateLimit: { requests: 60, window: 60 }
    }
};

// ============================================================================
// Response Validation Schemas
// ============================================================================

/**
 * API error response schema
 */
export const apiErrorResponseSchema = z.object({
    error: z.string().min(1),
    code: z.string().min(1),
    details: z.record(z.any()).optional(),
    timestamp: z.string().datetime(),
    requestId: z.string().uuid().optional(),
    suggestions: z.array(z.string()).optional(),
});

/**
 * UI block interaction response schema
 */
export const uiBlockInteractionResponseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    conversationId: z.string().uuid(),
    nextUIBlock: z.any().optional(), // UIBlock schema from schema.ts
    workflowState: z.object({
        currentStep: z.enum([
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
        ]),
        progress: z.number().min(0).max(100),
        requiresUserInput: z.boolean(),
        isComplete: z.boolean(),
    }),
    validation: z.object({
        errors: z.array(z.string()),
        warnings: z.array(z.string()),
        isValid: z.boolean(),
    }),
    metadata: z.object({
        processingTime: z.number().min(0),
        timestamp: z.string().datetime(),
    }).optional(),
});

/**
 * Workflow state response schema
 */
export const workflowStateResponseSchema = z.object({
    conversationId: z.string().uuid(),
    workflowState: workflowStateValidationSchema,
    isActive: z.boolean(),
    lastUpdated: z.string().datetime(),
    metadata: z.object({
        version: z.string(),
        source: z.string(),
        validationStatus: z.enum(['valid', 'invalid', 'unknown']),
    }),
});

/**
 * Workflow advancement response schema
 */
export const workflowAdvancementResponseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    conversationId: z.string().uuid(),
    previousStep: z.enum([
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
    ]),
    currentStep: z.enum([
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
    ]),
    nextUIBlock: z.any().optional(), // UIBlock type
    validation: z.object({
        errors: z.array(z.string()),
        warnings: z.array(z.string()),
        canProceed: z.boolean(),
    }),
    metadata: z.object({
        advancementTime: z.number().min(0),
        timestamp: z.string().datetime(),
    }),
});

/**
 * Meeting intent response schema
 */
export const meetingIntentResponseSchema = z.object({
    hasIntent: z.boolean(),
    confidence: z.number().min(0).max(1),
    intent: z.enum(['create_meeting', 'schedule_meeting', 'modify_meeting', 'cancel_meeting', 'other']),
    extraction: z.object({
        fields: z.object({
            title: z.string().optional(),
            startTime: z.string().datetime().optional(),
            endTime: z.string().datetime().optional(),
            duration: z.number().min(1).max(1440).optional(), // 1 minute to 24 hours
            attendees: z.array(z.string().email()).optional(),
            location: z.string().optional(),
            type: z.enum(['physical', 'online']).optional(),
        }),
        missing: z.array(z.string()),
        confidence: z.record(z.number().min(0).max(1)),
    }),
    shouldTriggerWorkflow: z.boolean(),
    suggestedAction: z.string(),
});

/**
 * Conversation history response schema
 */
export const conversationHistoryResponseSchema = z.object({
    conversationId: z.string().uuid(),
    messages: z.array(z.object({
        id: z.string(),
        role: z.enum(['user', 'assistant']),
        content: z.string(),
        timestamp: z.date(),
        metadata: z.object({
            intent: z.string().optional(),
            confidence: z.number().optional(),
            extractedFields: z.record(z.any()).optional(),
            workflowStep: z.string().optional(),
            requiresUserInput: z.boolean().optional(),
            validationErrors: z.array(z.string()).optional(),
            warnings: z.array(z.string()).optional(),
            workflowState: z.record(z.any()).optional(),
            uiBlockType: z.string().optional(),
            uiBlockData: z.record(z.any()).optional(),
            isSystemMessage: z.boolean().optional(),
        }).optional(),
    })),
    workflowContext: z.object({
        currentStep: z.enum([
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
        ]),
        meetingData: z.object({
            id: z.string().uuid().optional(),
            title: z.string().optional(),
            type: z.enum(['physical', 'online']).optional(),
            startTime: z.date().optional(),
            endTime: z.date().optional(),
            location: z.string().optional(),
            attendees: z.array(z.object({
                email: z.string().email(),
                firstName: z.string().optional(),
                lastName: z.string().optional(),
                profilePicture: z.string().url().optional(),
                isValidated: z.boolean().default(false),
                isRequired: z.boolean().default(true),
            })).default([]),
            agenda: z.string().optional(),
            meetingLink: z.string().url().optional(),
            status: z.enum(['draft', 'pending_approval', 'approved', 'created']).default('draft'),
        }),
        progress: z.number().min(0).max(100),
    }).optional(),
    pagination: z.object({
        page: z.number().min(1),
        limit: z.number().min(1).max(100),
        total: z.number().min(0),
        hasMore: z.boolean(),
    }),
    metadata: z.object({
        createdAt: z.string().datetime(),
        lastActivity: z.string().datetime(),
        messageCount: z.number().min(0),
    }),
});

// ============================================================================
// Type Guards and Utilities
// ============================================================================

/**
 * Type guard for API error response
 */
export function isAPIErrorResponse(response: any): response is APIErrorResponse {
    try {
        apiErrorResponseSchema.parse(response);
        return true;
    } catch {
        return false;
    }
}

/**
 * Type guard for conversational response
 */
export function isConversationalResponse(response: any): response is ConversationalResponse {
    return response &&
        typeof response.message === 'string' &&
        typeof response.conversationId === 'string' &&
        response.workflow &&
        response.validation;
}

/**
 * Type guard for UI block interaction response
 */
export function isUIBlockInteractionResponse(response: any): response is UIBlockInteractionResponse {
    try {
        uiBlockInteractionResponseSchema.parse(response);
        return true;
    } catch {
        return false;
    }
}

/**
 * Type guard for workflow state response
 */
export function isWorkflowStateResponse(response: any): response is WorkflowStateResponse {
    try {
        workflowStateResponseSchema.parse(response);
        return true;
    } catch {
        return false;
    }
}

/**
 * Type guard for workflow advancement response
 */
export function isWorkflowAdvancementResponse(response: any): response is WorkflowAdvancementResponse {
    try {
        workflowAdvancementResponseSchema.parse(response);
        return true;
    } catch {
        return false;
    }
}

/**
 * Type guard for meeting intent response
 */
export function isMeetingIntentResponse(response: any): response is MeetingIntentResponse {
    try {
        meetingIntentResponseSchema.parse(response);
        return true;
    } catch {
        return false;
    }
}

/**
 * Type guard for conversation history response
 */
export function isConversationHistoryResponse(response: any): response is ConversationHistoryResponse {
    try {
        conversationHistoryResponseSchema.parse(response);
        return true;
    } catch {
        return false;
    }
}

// ============================================================================
// HTTP Status Code Mappings
// ============================================================================

/**
 * HTTP status codes for workflow API responses
 */
export const WORKFLOW_HTTP_STATUS = {
    // Success responses
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,

    // Client error responses
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    VALIDATION_ERROR: 422,
    RATE_LIMITED: 429,

    // Server error responses
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
    WORKFLOW_ERROR: 520, // Custom status for workflow-specific errors
} as const;

/**
 * Error code mappings for workflow API
 */
export const WORKFLOW_ERROR_CODES = {
    // Authentication errors
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    AUTH_EXPIRED: 'AUTH_EXPIRED',
    AUTH_INVALID: 'AUTH_INVALID',

    // Validation errors
    INVALID_REQUEST: 'INVALID_REQUEST',
    MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
    INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',

    // Workflow errors
    WORKFLOW_NOT_FOUND: 'WORKFLOW_NOT_FOUND',
    WORKFLOW_STEP_INVALID: 'WORKFLOW_STEP_INVALID',
    WORKFLOW_STATE_CORRUPTED: 'WORKFLOW_STATE_CORRUPTED',
    WORKFLOW_TRANSITION_INVALID: 'WORKFLOW_TRANSITION_INVALID',

    // Business rule errors
    BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
    ATTENDEE_LIMIT_EXCEEDED: 'ATTENDEE_LIMIT_EXCEEDED',
    CALENDAR_ACCESS_DENIED: 'CALENDAR_ACCESS_DENIED',

    // System errors
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const;

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validates request data against schema and returns typed result
 */
export function validateRequest<T>(
    schema: z.ZodSchema<T>,
    data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
    try {
        const validatedData = schema.parse(data);
        return { success: true, data: validatedData };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errors = error.errors.map(err =>
                `${err.path.join('.')}: ${err.message}`
            );
            return { success: false, errors };
        }
        return { success: false, errors: ['Unknown validation error'] };
    }
}

/**
 * Validates response data against schema
 */
export function validateResponse<T>(
    schema: z.ZodSchema<T>,
    data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
    return validateRequest(schema, data);
}

/**
 * Creates a validation middleware for Express routes
 */
export function createValidationMiddleware<T>(schema: z.ZodSchema<T>) {
    return (req: any, res: any, next: any) => {
        const result = validateRequest(schema, req.body);
        if (result.success) {
            req.validatedBody = result.data;
            next();
        } else {
            return res.status(400).json({
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: { validationErrors: (result as { success: false; errors: string[] }).errors },
                timestamp: new Date().toISOString(),
            });
        }
    };
}

/**
 * Creates a validation middleware for request parameters
 */
export function createParamsValidationMiddleware<T>(schema: z.ZodSchema<T>) {
    return (req: any, res: any, next: any) => {
        const result = validateRequest(schema, req.params);
        if (result.success) {
            req.validatedParams = result.data;
            next();
        } else {
            return res.status(400).json({
                error: 'Parameter validation failed',
                code: 'PARAMETER_VALIDATION_ERROR',
                details: { validationErrors: (result as { success: false; errors: string[] }).errors },
                timestamp: new Date().toISOString(),
            });
        }
    };
}

/**
 * Creates a validation middleware for query parameters
 */
export function createQueryValidationMiddleware<T>(schema: z.ZodSchema<T>) {
    return (req: any, res: any, next: any) => {
        const result = validateRequest(schema, req.query);
        if (result.success) {
            req.validatedQuery = result.data;
            next();
        } else {
            return res.status(400).json({
                error: 'Query validation failed',
                code: 'QUERY_VALIDATION_ERROR',
                details: { validationErrors: (result as { success: false; errors: string[] }).errors },
                timestamp: new Date().toISOString(),
            });
        }
    };
}

/**
 * Validates UI block interaction data based on block type
 */
export function validateUIBlockInteractionData(
    blockType: string,
    action: string,
    data: unknown
): { success: true; data: any } | { success: false; errors: string[] } {
    try {
        switch (blockType) {
            case 'meeting_type_selection':
                if (action === 'type_select') {
                    return validateRequest(meetingTypeSelectionDataSchema, data);
                }
                break;
            case 'attendee_management':
                if (action === 'attendees_update') {
                    return validateRequest(attendeeManagementDataSchema, data);
                }
                break;
            case 'meeting_approval':
                if (action === 'approve' || action === 'edit') {
                    return validateRequest(meetingApprovalDataSchema, data);
                }
                break;
            case 'agenda_editor':
                if (action === 'agenda_update' || action === 'agenda_approve' || action === 'agenda_regenerate') {
                    return validateRequest(agendaEditorDataSchema, data);
                }
                break;
        }

        // Fallback to generic validation
        return { success: true, data };
    } catch (error) {
        return { success: false, errors: ['Invalid UI block interaction data'] };
    }
}

/**
 * Validates workflow state consistency
 */
export function validateWorkflowStateConsistency(
    workflowState: any
): { isValid: true } | { isValid: false; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
        // Validate basic structure
        const result = validateRequest(workflowStateValidationSchema, workflowState);
        if (!result.success) {
            errors.push(...(result as { success: false; errors: string[] }).errors);
        }

        const state = result.success ? result.data : workflowState;

        // Business rule validations
        if (state.meetingData?.type === 'online' &&
            (!state.meetingData.attendees || state.meetingData.attendees.length === 0)) {
            if (state.currentStep !== 'attendee_collection' &&
                state.currentStep !== 'intent_detection' &&
                state.currentStep !== 'calendar_access_verification' &&
                state.currentStep !== 'meeting_type_selection') {
                errors.push('Online meetings must have at least one attendee');
            }
        }

        // Progress consistency
        const stepOrder = [
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

        const currentStepIndex = stepOrder.indexOf(state.currentStep);
        const expectedProgress = Math.round((currentStepIndex / (stepOrder.length - 1)) * 100);

        if (Math.abs(state.progress - expectedProgress) > 10) {
            warnings.push(`Progress (${state.progress}%) may not match current step (${state.currentStep})`);
        }

        // Time validation
        if (state.meetingData?.startTime && state.meetingData?.endTime) {
            const start = new Date(state.meetingData.startTime);
            const end = new Date(state.meetingData.endTime);

            if (start >= end) {
                errors.push('Meeting start time must be before end time');
            }

            if (start < new Date()) {
                warnings.push('Meeting is scheduled in the past');
            }
        }

        return errors.length > 0
            ? { isValid: false, errors, warnings }
            : { isValid: true };

    } catch (error) {
        errors.push('Failed to validate workflow state structure');
        return { isValid: false, errors, warnings };
    }
}

/**
 * Type-safe error response builder
 */
export function createErrorResponse(
    error: string,
    code: WorkflowErrorCode,
    statusCode: WorkflowHTTPStatus,
    details?: Record<string, any>,
    suggestions?: string[]
): APIErrorResponse {
    return {
        error,
        code,
        details,
        timestamp: new Date().toISOString(),
        requestId: randomUUID(),
        suggestions,
    };
}

/**
 * Type-safe success response builder
 */
export function createSuccessResponse<T>(
    data: T,
    message?: string,
    metadata?: Record<string, any>
): T & { metadata?: Record<string, any> } {
    return {
        ...data,
        ...(metadata && { metadata }),
    };
}

// ============================================================================
// Type Exports
// ============================================================================

// Export Zod inferred types for requests
export type ConversationalChatRequestType = z.infer<typeof conversationalChatRequestSchema>;
export type UIBlockInteractionRequestType = z.infer<typeof uiBlockInteractionRequestSchema>;
export type WorkflowStateUpdateRequestType = z.infer<typeof workflowStateUpdateRequestSchema>;
export type WorkflowAdvancementRequestType = z.infer<typeof workflowAdvancementRequestSchema>;
export type MeetingIntentRequestType = z.infer<typeof meetingIntentRequestSchema>;

// Export Zod inferred types for responses
export type APIErrorResponseType = z.infer<typeof apiErrorResponseSchema>;
export type UIBlockInteractionResponseType = z.infer<typeof uiBlockInteractionResponseSchema>;
export type WorkflowStateResponseType = z.infer<typeof workflowStateResponseSchema>;
export type WorkflowAdvancementResponseType = z.infer<typeof workflowAdvancementResponseSchema>;
export type MeetingIntentResponseType = z.infer<typeof meetingIntentResponseSchema>;
export type ConversationHistoryResponseType = z.infer<typeof conversationHistoryResponseSchema>;

// Export UI block data types
export type MeetingTypeSelectionDataType = z.infer<typeof meetingTypeSelectionDataSchema>;
export type AttendeeManagementDataType = z.infer<typeof attendeeManagementDataSchema>;
export type MeetingApprovalDataType = z.infer<typeof meetingApprovalDataSchema>;
export type AgendaEditorDataType = z.infer<typeof agendaEditorDataSchema>;

// Export workflow state validation type
export type WorkflowStateValidationType = z.infer<typeof workflowStateValidationSchema>;

// Export parameter validation types
export type ConversationIdParamType = z.infer<typeof conversationIdParamSchema>;
export type MeetingIdParamType = z.infer<typeof meetingIdParamSchema>;
export type UserIdParamType = z.infer<typeof userIdParamSchema>;

// Export query validation types
export type PaginationQueryType = z.infer<typeof paginationQuerySchema>;
export type ConversationHistoryQueryType = z.infer<typeof conversationHistoryQuerySchema>;
export type WorkflowStateQueryType = z.infer<typeof workflowStateQuerySchema>;

// Export HTTP status and error code types
export type WorkflowHTTPStatus = typeof WORKFLOW_HTTP_STATUS[keyof typeof WORKFLOW_HTTP_STATUS];
export type WorkflowErrorCode = typeof WORKFLOW_ERROR_CODES[keyof typeof WORKFLOW_ERROR_CODES];

// Export validation result types
export interface ValidationResult<T = any> {
    success: boolean;
    data?: T;
    errors?: string[];
    warnings?: string[];
}

export interface WorkflowStateValidationResult {
    isValid: boolean;
    errors?: string[];
    warnings?: string[];
}

