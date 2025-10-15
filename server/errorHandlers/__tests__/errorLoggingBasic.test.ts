/**
 * Basic test suite for comprehensive error logging system
 * Requirements: 7.3 - Implement structured error logging for debugging and monitoring
 */

import { describe, it, expect } from 'vitest';
import {
    ErrorSeverity,
    ErrorCategory,
    createErrorContext,
    categorizeError,
    determineSeverity
} from '../errorLogger.js';
import { ErrorLoggingIntegration } from '../errorLoggingIntegration.js';

describe('Error Logging System - Basic Functionality', () => {
    describe('Error Context Creation', () => {
        it('should create error context with all fields', () => {
            const context = createErrorContext(
                'user123',
                'conv456',
                'test_step',
                'test_operation',
                'req789',
                'session123',
                'Mozilla/5.0',
                '192.168.1.1'
            );

            expect(context.userId).toBe('user123');
            expect(context.conversationId).toBe('conv456');
            expect(context.workflowStep).toBe('test_step');
            expect(context.operationName).toBe('test_operation');
            expect(context.requestId).toBe('req789');
            expect(context.sessionId).toBe('session123');
            expect(context.userAgent).toBe('Mozilla/5.0');
            expect(context.ipAddress).toBe('192.168.1.1');
            expect(context.environment).toBe('test');
            expect(context.timestamp).toBeInstanceOf(Date);
        });

        it('should create error context with minimal fields', () => {
            const context = createErrorContext();

            expect(context.userId).toBeUndefined();
            expect(context.conversationId).toBeUndefined();
            expect(context.environment).toBe('test');
            expect(context.timestamp).toBeInstanceOf(Date);
        });
    });

    describe('Error Categorization', () => {
        it('should categorize network errors correctly', () => {
            const networkError = new Error('ENOTFOUND: DNS resolution failed');
            const category = categorizeError(networkError);
            expect(category).toBe(ErrorCategory.NETWORK);
        });

        it('should categorize authentication errors correctly', () => {
            const authError = new Error('Unauthorized access');
            const category = categorizeError(authError);
            expect(category).toBe(ErrorCategory.AUTHENTICATION);
        });

        it('should categorize validation errors correctly', () => {
            const validationError = new Error('Validation failed: required field missing');
            const category = categorizeError(validationError);
            expect(category).toBe(ErrorCategory.VALIDATION);
        });

        it('should categorize API errors correctly', () => {
            const apiError = new Error('API request failed') as any;
            apiError.response = { status: 500 };
            const category = categorizeError(apiError);
            expect(category).toBe(ErrorCategory.API);
        });

        it('should categorize calendar errors correctly', () => {
            const calendarError = new Error('Google Calendar API error');
            const category = categorizeError(calendarError);
            expect(category).toBe(ErrorCategory.CALENDAR);
        });

        it('should categorize AI service errors correctly', () => {
            const aiError = new Error('Gemini model unavailable');
            const category = categorizeError(aiError);
            expect(category).toBe(ErrorCategory.AI_SERVICE);
        });

        it('should categorize workflow errors correctly', () => {
            const workflowError = new Error('Workflow orchestrator failed');
            const category = categorizeError(workflowError);
            expect(category).toBe(ErrorCategory.WORKFLOW);
        });

        it('should default to unknown category for unrecognized errors', () => {
            const unknownError = new Error('Some random error');
            const category = categorizeError(unknownError);
            expect(category).toBe(ErrorCategory.UNKNOWN);
        });
    });

    describe('Severity Determination', () => {
        it('should determine critical severity correctly', () => {
            const criticalError = new Error('Critical system failure');
            const severity = determineSeverity(criticalError);
            expect(severity).toBe(ErrorSeverity.CRITICAL);
        });

        it('should determine high severity for server errors', () => {
            const serverError = new Error('Internal server error') as any;
            serverError.status = 500;
            const severity = determineSeverity(serverError);
            expect(severity).toBe(ErrorSeverity.HIGH);
        });

        it('should determine low severity for validation errors', () => {
            const validationError = new Error('Validation failed');
            validationError.name = 'ValidationError';
            const severity = determineSeverity(validationError);
            expect(severity).toBe(ErrorSeverity.LOW);
        });

        it('should determine info severity for info messages', () => {
            const infoError = new Error('Info: Operation completed');
            const severity = determineSeverity(infoError);
            expect(severity).toBe(ErrorSeverity.INFO);
        });

        it('should default to medium severity', () => {
            const normalError = new Error('Some error');
            const severity = determineSeverity(normalError);
            expect(severity).toBe(ErrorSeverity.MEDIUM);
        });
    });

    describe('Error Logging Integration', () => {
        it('should have logErrorWithContext method', () => {
            expect(typeof ErrorLoggingIntegration.logErrorWithContext).toBe('function');
        });

        it('should have logAPIError method', () => {
            expect(typeof ErrorLoggingIntegration.logAPIError).toBe('function');
        });

        it('should have logWorkflowError method', () => {
            expect(typeof ErrorLoggingIntegration.logWorkflowError).toBe('function');
        });

        it('should have logAuthError method', () => {
            expect(typeof ErrorLoggingIntegration.logAuthError).toBe('function');
        });

        it('should have logDatabaseError method', () => {
            expect(typeof ErrorLoggingIntegration.logDatabaseError).toBe('function');
        });

        it('should have logValidationError method', () => {
            expect(typeof ErrorLoggingIntegration.logValidationError).toBe('function');
        });

        it('should have logBusinessRuleError method', () => {
            expect(typeof ErrorLoggingIntegration.logBusinessRuleError).toBe('function');
        });

        it('should have logCalendarError method', () => {
            expect(typeof ErrorLoggingIntegration.logCalendarError).toBe('function');
        });

        it('should have logEmailError method', () => {
            expect(typeof ErrorLoggingIntegration.logEmailError).toBe('function');
        });

        it('should have createExpressMiddleware method', () => {
            expect(typeof ErrorLoggingIntegration.createExpressMiddleware).toBe('function');
        });

        it('should have wrapAsyncFunction method', () => {
            expect(typeof ErrorLoggingIntegration.wrapAsyncFunction).toBe('function');
        });
    });

    describe('Error Enums', () => {
        it('should have all error severity levels', () => {
            expect(ErrorSeverity.CRITICAL).toBe('critical');
            expect(ErrorSeverity.HIGH).toBe('high');
            expect(ErrorSeverity.MEDIUM).toBe('medium');
            expect(ErrorSeverity.LOW).toBe('low');
            expect(ErrorSeverity.INFO).toBe('info');
        });

        it('should have all error categories', () => {
            expect(ErrorCategory.AUTHENTICATION).toBe('authentication');
            expect(ErrorCategory.NETWORK).toBe('network');
            expect(ErrorCategory.API).toBe('api');
            expect(ErrorCategory.DATABASE).toBe('database');
            expect(ErrorCategory.VALIDATION).toBe('validation');
            expect(ErrorCategory.BUSINESS_LOGIC).toBe('business_logic');
            expect(ErrorCategory.WORKFLOW).toBe('workflow');
            expect(ErrorCategory.CALENDAR).toBe('calendar');
            expect(ErrorCategory.EMAIL).toBe('email');
            expect(ErrorCategory.AI_SERVICE).toBe('ai_service');
            expect(ErrorCategory.SYSTEM).toBe('system');
            expect(ErrorCategory.USER_INPUT).toBe('user_input');
            expect(ErrorCategory.UNKNOWN).toBe('unknown');
        });
    });
});