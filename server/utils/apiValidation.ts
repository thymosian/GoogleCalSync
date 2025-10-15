import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import {
    conversationalChatRequestSchema,
    uiBlockInteractionRequestSchema,
    workflowStateUpdateRequestSchema,
    workflowAdvancementRequestSchema,
    meetingIntentRequestSchema,
    WORKFLOW_HTTP_STATUS,
    WORKFLOW_ERROR_CODES
} from '../../shared/apiTypes.js';
import type { 
    ValidationError, 
    RequestValidationResult,
    APIError 
} from '../types/apiRouteTypes.js';

// ============================================================================
// Validation Middleware Factory
// ============================================================================

/**
 * Creates validation middleware for request body
 */
export function validateRequestBody<T>(schema: z.ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = schema.safeParse(req.body);
            
            if (!result.success) {
                const validationErrors: ValidationError[] = result.error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                    value: err.path.reduce((obj, key) => obj?.[key], req.body),
                    code: err.code
                }));

                return res.status(WORKFLOW_HTTP_STATUS.VALIDATION_ERROR).json({
                    error: 'Request validation failed',
                    code: WORKFLOW_ERROR_CODES.INVALID_REQUEST,
                    details: {
                        validationErrors,
                        receivedFields: Object.keys(req.body || {})
                    },
                    timestamp: new Date().toISOString(),
                    suggestions: generateValidationSuggestions(validationErrors)
                });
            }

            // Replace request body with validated and transformed data
            req.body = result.data;
            next();
        } catch (error) {
            console.error('Validation middleware error:', error);
            return res.status(WORKFLOW_HTTP_STATUS.INTERNAL_ERROR).json({
                error: 'Internal validation error',
                code: WORKFLOW_ERROR_CODES.INTERNAL_ERROR,
                timestamp: new Date().toISOString()
            });
        }
    };
}

/**
 * Creates validation middleware for request parameters
 */
export function validateRequestParams<T>(schema: z.ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = schema.safeParse(req.params);
            
            if (!result.success) {
                const validationErrors: ValidationError[] = result.error.errors.map(err => ({
                    field: `params.${err.path.join('.')}`,
                    message: err.message,
                    value: err.path.reduce((obj, key) => obj?.[key], req.params),
                    code: err.code
                }));

                return res.status(WORKFLOW_HTTP_STATUS.BAD_REQUEST).json({
                    error: 'Parameter validation failed',
                    code: WORKFLOW_ERROR_CODES.INVALID_REQUEST,
                    details: { validationErrors },
                    timestamp: new Date().toISOString()
                });
            }

            req.params = result.data as any;
            next();
        } catch (error) {
            console.error('Parameter validation error:', error);
            return res.status(WORKFLOW_HTTP_STATUS.INTERNAL_ERROR).json({
                error: 'Internal validation error',
                code: WORKFLOW_ERROR_CODES.INTERNAL_ERROR,
                timestamp: new Date().toISOString()
            });
        }
    };
}

/**
 * Creates validation middleware for query parameters
 */
export function validateRequestQuery<T>(schema: z.ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = schema.safeParse(req.query);
            
            if (!result.success) {
                const validationErrors: ValidationError[] = result.error.errors.map(err => ({
                    field: `query.${err.path.join('.')}`,
                    message: err.message,
                    value: err.path.reduce((obj, key) => obj?.[key], req.query),
                    code: err.code
                }));

                return res.status(WORKFLOW_HTTP_STATUS.BAD_REQUEST).json({
                    error: 'Query parameter validation failed',
                    code: WORKFLOW_ERROR_CODES.INVALID_REQUEST,
                    details: { validationErrors },
                    timestamp: new Date().toISOString()
                });
            }

            req.query = result.data as any;
            next();
        } catch (error) {
            console.error('Query validation error:', error);
            return res.status(WORKFLOW_HTTP_STATUS.INTERNAL_ERROR).json({
                error: 'Internal validation error',
                code: WORKFLOW_ERROR_CODES.INTERNAL_ERROR,
                timestamp: new Date().toISOString()
            });
        }
    };
}

// ============================================================================
// Pre-configured Validation Middleware
// ============================================================================

/**
 * Validation middleware for conversational chat requests
 */
export const validateConversationalChatRequest = validateRequestBody(conversationalChatRequestSchema);

/**
 * Validation middleware for UI block interaction requests
 */
export const validateUIBlockInteractionRequest = validateRequestBody(uiBlockInteractionRequestSchema);

/**
 * Validation middleware for workflow state update requests
 */
export const validateWorkflowStateUpdateRequest = validateRequestBody(workflowStateUpdateRequestSchema);

/**
 * Validation middleware for workflow advancement requests
 */
export const validateWorkflowAdvancementRequest = validateRequestBody(workflowAdvancementRequestSchema);

/**
 * Validation middleware for meeting intent requests
 */
export const validateMeetingIntentRequest = validateRequestBody(meetingIntentRequestSchema);

/**
 * Validation middleware for conversation ID parameter
 */
export const validateConversationIdParam = validateRequestParams(
    z.object({
        conversationId: z.string().min(1, 'Conversation ID is required')
    })
);

/**
 * Validation middleware for pagination query parameters
 */
export const validatePaginationQuery = validateRequestQuery(
    z.object({
        page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
        limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 20),
        includeWorkflow: z.string().optional().transform(val => val === 'true')
    })
);

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validates data against schema and returns detailed result
 */
export function validateData<T>(
    data: unknown, 
    schema: z.ZodSchema<T>
): RequestValidationResult & { data?: T } {
    try {
        const result = schema.safeParse(data);
        
        if (result.success) {
            return {
                isValid: true,
                errors: [],
                data: result.data
            };
        }

        const errors: ValidationError[] = result.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            value: err.path.reduce((obj, key) => obj?.[key], data),
            code: err.code
        }));

        return {
            isValid: false,
            errors,
            warnings: generateValidationWarnings(errors)
        };
    } catch (error) {
        return {
            isValid: false,
            errors: [{
                field: 'root',
                message: 'Validation schema error',
                code: 'SCHEMA_ERROR'
            }]
        };
    }
}

/**
 * Generates helpful validation suggestions based on errors
 */
export function generateValidationSuggestions(errors: ValidationError[]): string[] {
    const suggestions: string[] = [];
    
    for (const error of errors) {
        switch (error.code) {
            case 'invalid_type':
                suggestions.push(`Field '${error.field}' should be of the correct type`);
                break;
            case 'too_small':
                suggestions.push(`Field '${error.field}' is too short or small`);
                break;
            case 'too_big':
                suggestions.push(`Field '${error.field}' is too long or large`);
                break;
            case 'invalid_string':
                suggestions.push(`Field '${error.field}' contains invalid characters`);
                break;
            case 'invalid_email':
                suggestions.push(`Field '${error.field}' should be a valid email address`);
                break;
            case 'required':
                suggestions.push(`Field '${error.field}' is required and cannot be empty`);
                break;
            default:
                suggestions.push(`Please check the value for field '${error.field}'`);
        }
    }
    
    return suggestions;
}

/**
 * Generates validation warnings for potential issues
 */
export function generateValidationWarnings(errors: ValidationError[]): ValidationError[] {
    const warnings: ValidationError[] = [];
    
    // Add warnings for common issues that might not be errors
    for (const error of errors) {
        if (error.field.includes('optional') || error.message.includes('optional')) {
            warnings.push({
                field: error.field,
                message: `Optional field '${error.field}' has validation issues`,
                code: 'OPTIONAL_FIELD_WARNING'
            });
        }
    }
    
    return warnings;
}

/**
 * Creates API error from validation result
 */
export function createValidationError(
    validationResult: RequestValidationResult,
    message: string = 'Validation failed'
): APIError {
    const error = new Error(message) as APIError;
    error.statusCode = WORKFLOW_HTTP_STATUS.VALIDATION_ERROR;
    error.code = WORKFLOW_ERROR_CODES.INVALID_REQUEST;
    error.details = {
        validationErrors: validationResult.errors,
        warnings: validationResult.warnings
    };
    error.isOperational = true;
    
    return error;
}

/**
 * Sanitizes request data by removing sensitive fields
 */
export function sanitizeRequestData(data: any): any {
    if (!data || typeof data !== 'object') {
        return data;
    }
    
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
    const sanitized = { ...data };
    
    for (const field of sensitiveFields) {
        if (field in sanitized) {
            sanitized[field] = '[REDACTED]';
        }
    }
    
    return sanitized;
}

/**
 * Validates and sanitizes request for logging
 */
export function prepareRequestForLogging(req: Request): any {
    return {
        method: req.method,
        path: req.path,
        query: sanitizeRequestData(req.query),
        body: sanitizeRequestData(req.body),
        headers: {
            'content-type': req.headers['content-type'],
            'user-agent': req.headers['user-agent'],
            'authorization': req.headers.authorization ? '[REDACTED]' : undefined
        },
        timestamp: new Date().toISOString()
    };
}

// ============================================================================
// Schema Validation Helpers
// ============================================================================

/**
 * Common validation schemas for reuse
 */
export const commonSchemas = {
    conversationId: z.string().min(1, 'Conversation ID is required'),
    meetingId: z.string().min(1, 'Meeting ID is required'),
    userId: z.string().min(1, 'User ID is required'),
    email: z.string().email('Invalid email format'),
    timestamp: z.string().datetime('Invalid timestamp format'),
    pagination: z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20)
    })
};

/**
 * Validation schema for common API parameters
 */
export const apiParameterSchemas = {
    conversationParams: z.object({
        conversationId: commonSchemas.conversationId
    }),
    meetingParams: z.object({
        meetingId: commonSchemas.meetingId
    }),
    paginationQuery: z.object({
        page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
        limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 20)
    })
};