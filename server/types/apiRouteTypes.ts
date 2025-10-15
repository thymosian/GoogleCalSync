import type { Request, Response, NextFunction } from 'express';
import type { 
    ConversationalChatRequest,
    UIBlockInteractionRequest,
    WorkflowStateUpdateRequest,
    WorkflowAdvancementRequest,
    MeetingIntentRequest,
    UIBlockInteractionResponse,
    WorkflowStateResponse,
    WorkflowAdvancementResponse,
    MeetingIntentResponse,
    APIErrorResponse
} from '../../shared/apiTypes.js';
import type { ConversationalResponse } from '../../shared/workflowTypes.js';
import type { User } from '../../shared/schema.js';

// ============================================================================
// Extended Request Types
// ============================================================================

/**
 * Base authenticated request interface
 */
export interface AuthenticatedRequest extends Request {
    user: User;
    isAuthenticated(): this is AuthenticatedRequest;
    validatedBody?: any;
    validatedParams?: any;
    validatedQuery?: any;
}

/**
 * Conversational chat request with typed body
 */
export interface ConversationalChatAPIRequest extends AuthenticatedRequest {
    body: ConversationalChatRequest;
    validatedBody?: import('../../shared/apiTypes.js').ConversationalChatRequestType;
}

/**
 * UI block interaction request with typed body
 */
export interface UIBlockInteractionAPIRequest extends AuthenticatedRequest {
    body: UIBlockInteractionRequest;
    validatedBody?: import('../../shared/apiTypes.js').UIBlockInteractionRequestType;
}

/**
 * Workflow state update request with typed body
 */
export interface WorkflowStateUpdateAPIRequest extends AuthenticatedRequest {
    body: WorkflowStateUpdateRequest;
    params: {
        conversationId: string;
    };
    validatedBody?: import('../../shared/apiTypes.js').WorkflowStateUpdateRequestType;
    validatedParams?: import('../../shared/apiTypes.js').ConversationIdParamType;
}

/**
 * Workflow advancement request with typed body
 */
export interface WorkflowAdvancementAPIRequest extends AuthenticatedRequest {
    body: WorkflowAdvancementRequest;
    params: {
        conversationId: string;
    };
    validatedBody?: import('../../shared/apiTypes.js').WorkflowAdvancementRequestType;
    validatedParams?: import('../../shared/apiTypes.js').ConversationIdParamType;
}

/**
 * Meeting intent extraction request with typed body
 */
export interface MeetingIntentAPIRequest extends AuthenticatedRequest {
    body: MeetingIntentRequest;
    validatedBody?: import('../../shared/apiTypes.js').MeetingIntentRequestType;
}

/**
 * Conversation history request with typed params
 */
export interface ConversationHistoryAPIRequest extends AuthenticatedRequest {
    params: {
        conversationId: string;
    };
    query: {
        page?: string;
        limit?: string;
        includeWorkflow?: string;
        fromDate?: string;
        toDate?: string;
    };
    validatedParams?: import('../../shared/apiTypes.js').ConversationIdParamType;
    validatedQuery?: import('../../shared/apiTypes.js').ConversationHistoryQueryType;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Typed response for conversational chat
 */
export type ConversationalChatAPIResponse = Response<ConversationalResponse | APIErrorResponse>;

/**
 * Typed response for UI block interactions
 */
export type UIBlockInteractionAPIResponse = Response<UIBlockInteractionResponse | APIErrorResponse>;

/**
 * Typed response for workflow state
 */
export type WorkflowStateAPIResponse = Response<WorkflowStateResponse | APIErrorResponse>;

/**
 * Typed response for workflow advancement
 */
export type WorkflowAdvancementAPIResponse = Response<WorkflowAdvancementResponse | APIErrorResponse>;

/**
 * Typed response for meeting intent extraction
 */
export type MeetingIntentAPIResponse = Response<MeetingIntentResponse | APIErrorResponse>;

// ============================================================================
// Route Handler Types
// ============================================================================

/**
 * Conversational chat route handler
 */
export type ConversationalChatHandler = (
    req: ConversationalChatAPIRequest,
    res: ConversationalChatAPIResponse,
    next: NextFunction
) => Promise<void> | void;

/**
 * UI block interaction route handler
 */
export type UIBlockInteractionHandler = (
    req: UIBlockInteractionAPIRequest,
    res: UIBlockInteractionAPIResponse,
    next: NextFunction
) => Promise<void> | void;

/**
 * Workflow state route handler
 */
export type WorkflowStateHandler = (
    req: WorkflowStateUpdateAPIRequest,
    res: WorkflowStateAPIResponse,
    next: NextFunction
) => Promise<void> | void;

/**
 * Workflow advancement route handler
 */
export type WorkflowAdvancementHandler = (
    req: WorkflowAdvancementAPIRequest,
    res: WorkflowAdvancementAPIResponse,
    next: NextFunction
) => Promise<void> | void;

/**
 * Meeting intent extraction route handler
 */
export type MeetingIntentHandler = (
    req: MeetingIntentAPIRequest,
    res: MeetingIntentAPIResponse,
    next: NextFunction
) => Promise<void> | void;

// ============================================================================
// Middleware Types
// ============================================================================

/**
 * Authentication middleware type
 */
export type AuthMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
) => void;

/**
 * Validation middleware type
 */
export type ValidationMiddleware<T = any> = (
    req: Request & { body: T },
    res: Response,
    next: NextFunction
) => void;

/**
 * Rate limiting middleware type
 */
export type RateLimitMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
) => void;

/**
 * Error handling middleware type
 */
export type ErrorMiddleware = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => void;

// ============================================================================
// Route Configuration Types
// ============================================================================

/**
 * Route configuration interface
 */
export interface RouteConfig {
    path: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    handler: Function;
    middleware?: Function[];
    validation?: {
        body?: any;
        params?: any;
        query?: any;
    };
    rateLimit?: {
        requests: number;
        window: number;
    };
    description?: string;
}

/**
 * API route group configuration
 */
export interface APIRouteGroup {
    prefix: string;
    routes: RouteConfig[];
    middleware?: Function[];
    description?: string;
}

// ============================================================================
// Error Handling Types
// ============================================================================

/**
 * API error with additional context
 */
export interface APIError extends Error {
    statusCode?: number;
    code?: string;
    details?: Record<string, any>;
    isOperational?: boolean;
}

/**
 * Validation error details
 */
export interface ValidationError {
    field: string;
    message: string;
    value?: any;
    code: string;
}

/**
 * Request validation result
 */
export interface RequestValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings?: ValidationError[];
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract request body type from handler
 */
export type ExtractRequestBody<T> = T extends (req: infer R, ...args: any[]) => any
    ? R extends { body: infer B }
        ? B
        : never
    : never;

/**
 * Extract response type from handler
 */
export type ExtractResponseType<T> = T extends (...args: any[]) => Response<infer R>
    ? R
    : never;

/**
 * API endpoint metadata
 */
export interface APIEndpointMetadata {
    path: string;
    method: string;
    description: string;
    requestSchema?: string;
    responseSchema?: string;
    requiresAuth: boolean;
    rateLimit?: {
        requests: number;
        window: number;
    };
    tags?: string[];
    deprecated?: boolean;
}

// ============================================================================
// Request Context Types
// ============================================================================

/**
 * Request context for workflow operations
 */
export interface WorkflowRequestContext {
    userId: string;
    conversationId?: string;
    workflowStep?: string;
    meetingId?: string;
    source: 'chat' | 'ui' | 'api';
    timestamp: Date;
    userAgent?: string;
    ipAddress?: string;
}

/**
 * Performance tracking context
 */
export interface PerformanceContext {
    requestId: string;
    startTime: number;
    endpoint: string;
    method: string;
    userId?: string;
}

// ============================================================================
// Response Builder Types
// ============================================================================

/**
 * Success response builder
 */
export interface SuccessResponseBuilder<T = any> {
    data: T;
    message?: string;
    metadata?: Record<string, any>;
}

/**
 * Error response builder
 */
export interface ErrorResponseBuilder {
    error: string;
    code: string;
    statusCode: number;
    details?: Record<string, any>;
    suggestions?: string[];
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for authenticated request
 */
export function isAuthenticatedRequest(req: Request): req is AuthenticatedRequest {
    return req.user !== undefined && typeof req.isAuthenticated === 'function';
}

/**
 * Type guard for API error
 */
export function isAPIError(error: any): error is APIError {
    return error instanceof Error && 
           ('statusCode' in error || 'code' in error);
}

/**
 * Type guard for validation error
 */
export function isValidationError(error: any): error is ValidationError {
    return error && 
           typeof error.field === 'string' && 
           typeof error.message === 'string' && 
           typeof error.code === 'string';
}

// ============================================================================
// Validation Utilities for Route Handlers
// ============================================================================

/**
 * Validates and extracts typed data from validated request
 */
export function getValidatedRequestData<T>(req: AuthenticatedRequest): T {
    if (!req.validatedBody) {
        throw new Error('Request body not validated. Ensure validation middleware is applied.');
    }
    return req.validatedBody as T;
}

/**
 * Validates and extracts typed parameters from validated request
 */
export function getValidatedParams<T>(req: AuthenticatedRequest): T {
    if (!req.validatedParams) {
        throw new Error('Request parameters not validated. Ensure parameter validation middleware is applied.');
    }
    return req.validatedParams as T;
}

/**
 * Validates and extracts typed query parameters from validated request
 */
export function getValidatedQuery<T>(req: AuthenticatedRequest): T {
    if (!req.validatedQuery) {
        throw new Error('Request query not validated. Ensure query validation middleware is applied.');
    }
    return req.validatedQuery as T;
}

/**
 * Creates a typed error response
 */
export function createTypedErrorResponse(
    res: Response,
    statusCode: number,
    error: string,
    code: string,
    details?: Record<string, any>
): void {
    res.status(statusCode).json({
        error,
        code,
        details,
        timestamp: new Date().toISOString(),
        requestId: require('crypto').randomUUID(),
    });
}

/**
 * Creates a typed success response
 */
export function createTypedSuccessResponse<T>(
    res: Response,
    data: T,
    statusCode: number = 200,
    metadata?: Record<string, any>
): void {
    res.status(statusCode).json({
        ...data,
        ...(metadata && { metadata }),
    });
}

// ============================================================================
// Route Handler Wrapper Types
// ============================================================================

/**
 * Async route handler wrapper with error handling
 */
export type AsyncRouteHandler<TReq extends AuthenticatedRequest = AuthenticatedRequest, TRes = any> = (
    req: TReq,
    res: Response<TRes>,
    next: NextFunction
) => Promise<void>;

/**
 * Validated route handler with typed request data
 */
export type ValidatedRouteHandler<
    TBody = any,
    TParams = any,
    TQuery = any,
    TRes = any
> = (
    req: AuthenticatedRequest & {
        validatedBody: TBody;
        validatedParams: TParams;
        validatedQuery: TQuery;
    },
    res: Response<TRes>,
    next: NextFunction
) => Promise<void> | void;

// ============================================================================
// Constants
// ============================================================================

/**
 * Default pagination settings
 */
export const DEFAULT_PAGINATION = {
    page: 1,
    limit: 20,
    maxLimit: 100
} as const;

/**
 * Request timeout settings
 */
export const REQUEST_TIMEOUTS = {
    default: 30000, // 30 seconds
    workflow: 60000, // 60 seconds
    aiProcessing: 120000, // 2 minutes
} as const;

/**
 * Rate limit configurations
 */
export const RATE_LIMITS = {
    conversationalChat: { requests: 60, window: 60 },
    uiBlockInteraction: { requests: 100, window: 60 },
    workflowState: { requests: 120, window: 60 },
    workflowAdvancement: { requests: 30, window: 60 },
    meetingIntent: { requests: 100, window: 60 },
} as const;