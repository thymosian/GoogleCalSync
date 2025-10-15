/**
 * Error Logging Integration Service
 * Provides convenient methods to integrate comprehensive error logging throughout the application
 * Requirements: 7.3 - Implement structured error logging for debugging and monitoring
 */

import { 
  logError, 
  logCriticalError, 
  logNetworkError, 
  logAPIError as logAPIErrorBase, 
  logWorkflowError as logWorkflowErrorBase, 
  logAuthenticationError, 
  logValidationError as logValidationErrorBase, 
  logBusinessLogicError,
  ErrorCategory, 
  ErrorSeverity, 
  createErrorContext,
  categorizeError,
  determineSeverity
} from './errorLogger.js';

/**
 * Enhanced error logging with automatic categorization and context extraction
 */
export class ErrorLoggingIntegration {
  /**
   * Log error with automatic categorization and severity determination
   */
  static async logErrorWithContext(
    error: Error | any,
    context: {
      userId?: string;
      conversationId?: string;
      workflowStep?: string;
      operationName?: string;
      requestId?: string;
      sessionId?: string;
      userAgent?: string;
      ipAddress?: string;
      req?: any; // Express request object
    } = {},
    overrides: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    try {
      // Extract context from request object if provided
      let enrichedContext = { ...context };
      if (context.req) {
        enrichedContext = {
          ...enrichedContext,
          userId: enrichedContext.userId || context.req.user?.id,
          requestId: enrichedContext.requestId || context.req.headers['x-request-id'],
          userAgent: enrichedContext.userAgent || context.req.headers['user-agent'],
          ipAddress: enrichedContext.ipAddress || context.req.ip,
          operationName: enrichedContext.operationName || `${context.req.method} ${context.req.path}`
        };
      }

      // Create error context
      const errorContext = createErrorContext(
        enrichedContext.userId,
        enrichedContext.conversationId,
        enrichedContext.workflowStep,
        enrichedContext.operationName,
        enrichedContext.requestId,
        enrichedContext.sessionId,
        enrichedContext.userAgent,
        enrichedContext.ipAddress
      );

      // Determine category and severity if not provided
      const category = overrides.category || categorizeError(error);
      const severity = overrides.severity || determineSeverity(error);

      // Add additional metadata
      const metadata = {
        ...overrides.metadata,
        errorName: error.name,
        errorCode: error.code,
        statusCode: error.status || error.statusCode,
        stack: error.stack,
        timestamp: new Date().toISOString()
      };

      // Log the error
      await logError(error, errorContext, category, severity, metadata);

    } catch (loggingError) {
      // Fallback logging to prevent infinite loops
      console.error('Error in error logging integration:', loggingError);
      console.error('Original error:', error);
    }
  }

  /**
   * Log API-related errors with enhanced context
   */
  static async logAPIError(
    error: Error | any,
    context: {
      endpoint?: string;
      method?: string;
      statusCode?: number;
      responseTime?: number;
      userId?: string;
      requestId?: string;
      req?: any;
    } = {}
  ): Promise<void> {
    const metadata = {
      endpoint: context.endpoint,
      method: context.method,
      statusCode: context.statusCode || error.status || error.statusCode,
      responseTime: context.responseTime,
      isClientError: (context.statusCode || error.status) >= 400 && (context.statusCode || error.status) < 500,
      isServerError: (context.statusCode || error.status) >= 500
    };

    const severity = metadata.isServerError ? ErrorSeverity.HIGH : 
                    metadata.isClientError ? ErrorSeverity.LOW : 
                    ErrorSeverity.MEDIUM;

    await this.logErrorWithContext(error, {
      userId: context.userId,
      requestId: context.requestId,
      operationName: `${context.method || 'API'} ${context.endpoint || 'request'}`,
      req: context.req
    }, {
      category: ErrorCategory.API,
      severity,
      metadata
    });
  }

  /**
   * Log workflow-related errors with workflow context
   */
  static async logWorkflowError(
    error: Error | any,
    context: {
      workflowStep?: string;
      workflowState?: any;
      userId?: string;
      conversationId?: string;
      meetingId?: string;
      operationName?: string;
    } = {}
  ): Promise<void> {
    const metadata = {
      workflowStep: context.workflowStep,
      workflowState: context.workflowState ? JSON.stringify(context.workflowState) : undefined,
      meetingId: context.meetingId,
      hasWorkflowState: !!context.workflowState
    };

    await this.logErrorWithContext(error, {
      userId: context.userId,
      conversationId: context.conversationId,
      workflowStep: context.workflowStep,
      operationName: context.operationName || 'workflow_operation'
    }, {
      category: ErrorCategory.WORKFLOW,
      severity: ErrorSeverity.MEDIUM,
      metadata
    });
  }

  /**
   * Log authentication-related errors
   */
  static async logAuthError(
    error: Error | any,
    context: {
      userId?: string;
      authMethod?: string;
      tokenType?: string;
      provider?: string;
      req?: any;
    } = {}
  ): Promise<void> {
    const metadata = {
      authMethod: context.authMethod,
      tokenType: context.tokenType,
      provider: context.provider,
      hasUserId: !!context.userId
    };

    await this.logErrorWithContext(error, {
      userId: context.userId,
      operationName: `auth_${context.authMethod || 'unknown'}`,
      req: context.req
    }, {
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.HIGH,
      metadata
    });
  }

  /**
   * Log database-related errors
   */
  static async logDatabaseError(
    error: Error | any,
    context: {
      operation?: string;
      table?: string;
      query?: string;
      userId?: string;
      req?: any;
    } = {}
  ): Promise<void> {
    const metadata = {
      operation: context.operation,
      table: context.table,
      query: context.query ? context.query.substring(0, 200) : undefined, // Truncate long queries
      isDatabaseConnection: error.message?.includes('connection') || error.code?.includes('CONN')
    };

    const severity = metadata.isDatabaseConnection ? ErrorSeverity.CRITICAL : ErrorSeverity.HIGH;

    await this.logErrorWithContext(error, {
      userId: context.userId,
      operationName: `db_${context.operation || 'query'}`,
      req: context.req
    }, {
      category: ErrorCategory.DATABASE,
      severity,
      metadata
    });
  }

  /**
   * Log validation errors with field context
   */
  static async logValidationError(
    error: Error | any,
    context: {
      fields?: string[];
      validationType?: string;
      inputData?: any;
      userId?: string;
      req?: any;
    } = {}
  ): Promise<void> {
    const metadata = {
      fields: context.fields,
      validationType: context.validationType,
      inputDataKeys: context.inputData ? Object.keys(context.inputData) : undefined,
      fieldCount: context.fields?.length || 0
    };

    await this.logErrorWithContext(error, {
      userId: context.userId,
      operationName: `validation_${context.validationType || 'unknown'}`,
      req: context.req
    }, {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      metadata
    });
  }

  /**
   * Log business logic errors with rule context
   */
  static async logBusinessRuleError(
    error: Error | any,
    context: {
      rule?: string;
      ruleType?: string;
      violatedConstraints?: string[];
      userId?: string;
      req?: any;
    } = {}
  ): Promise<void> {
    const metadata = {
      rule: context.rule,
      ruleType: context.ruleType,
      violatedConstraints: context.violatedConstraints,
      constraintCount: context.violatedConstraints?.length || 0
    };

    await this.logErrorWithContext(error, {
      userId: context.userId,
      operationName: `business_rule_${context.ruleType || 'validation'}`,
      req: context.req
    }, {
      category: ErrorCategory.BUSINESS_LOGIC,
      severity: ErrorSeverity.MEDIUM,
      metadata
    });
  }

  /**
   * Log calendar integration errors
   */
  static async logCalendarError(
    error: Error | any,
    context: {
      operation?: string;
      calendarId?: string;
      eventId?: string;
      userId?: string;
      provider?: string;
      req?: any;
    } = {}
  ): Promise<void> {
    const metadata = {
      operation: context.operation,
      calendarId: context.calendarId,
      eventId: context.eventId,
      provider: context.provider || 'google',
      isPermissionError: error.status === 403 || error.message?.includes('permission'),
      isQuotaError: error.status === 429 || error.message?.includes('quota')
    };

    const severity = metadata.isPermissionError || metadata.isQuotaError ? 
                    ErrorSeverity.HIGH : ErrorSeverity.MEDIUM;

    await this.logErrorWithContext(error, {
      userId: context.userId,
      operationName: `calendar_${context.operation || 'operation'}`,
      req: context.req
    }, {
      category: ErrorCategory.CALENDAR,
      severity,
      metadata
    });
  }

  /**
   * Log email-related errors
   */
  static async logEmailError(
    error: Error | any,
    context: {
      operation?: string;
      recipient?: string;
      emailType?: string;
      userId?: string;
      req?: any;
    } = {}
  ): Promise<void> {
    const metadata = {
      operation: context.operation,
      recipient: context.recipient ? 'provided' : 'not_provided', // Don't log actual email
      emailType: context.emailType,
      isDeliveryError: error.message?.includes('delivery') || error.message?.includes('bounce'),
      isAuthError: error.message?.includes('auth') || error.status === 401
    };

    const severity = metadata.isAuthError ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM;

    await this.logErrorWithContext(error, {
      userId: context.userId,
      operationName: `email_${context.operation || 'send'}`,
      req: context.req
    }, {
      category: ErrorCategory.EMAIL,
      severity,
      metadata
    });
  }

  /**
   * Create Express middleware for automatic error logging
   */
  static createExpressMiddleware() {
    return (error: any, req: any, res: any, next: any) => {
      // Log the error automatically
      this.logErrorWithContext(error, { req }).catch(logError => {
        console.error('Failed to log error in Express middleware:', logError);
      });

      // Continue with normal error handling
      next(error);
    };
  }

  /**
   * Create wrapper for async functions with automatic error logging
   */
  static wrapAsyncFunction<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context: {
      operationName?: string;
      category?: ErrorCategory;
      severity?: ErrorSeverity;
    } = {}
  ): T {
    return (async (...args: any[]) => {
      try {
        return await fn(...args);
      } catch (error) {
        await this.logErrorWithContext(error, {
          operationName: context.operationName || fn.name
        }, {
          category: context.category,
          severity: context.severity
        });
        throw error;
      }
    }) as T;
  }

  /**
   * Create decorator for class methods with automatic error logging
   */
  static logErrors(context: {
    operationName?: string;
    category?: ErrorCategory;
    severity?: ErrorSeverity;
  } = {}) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      const originalMethod = descriptor.value;
      
      descriptor.value = async function (...args: any[]) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          await ErrorLoggingIntegration.logErrorWithContext(error, {
            operationName: context.operationName || `${target.constructor.name}.${propertyKey}`
          }, {
            category: context.category,
            severity: context.severity
          });
          throw error;
        }
      };
      
      return descriptor;
    };
  }
}

// Export convenience functions
export const {
  logErrorWithContext,
  logAPIError: logAPIErrorIntegration,
  logWorkflowError: logWorkflowErrorIntegration,
  logAuthError,
  logDatabaseError,
  logValidationError: logValidationErrorIntegration,
  logBusinessRuleError,
  logCalendarError,
  logEmailError,
  createExpressMiddleware,
  wrapAsyncFunction,
  logErrors
} = ErrorLoggingIntegration;

// Export the class as default
export default ErrorLoggingIntegration;