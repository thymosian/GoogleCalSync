import { User } from '../../shared/schema';
import { logError, ErrorCategory, ErrorSeverity, createErrorContext } from './errorLogger.js';

/**
 * Calendar API error types and handling
 * Requirements: 5.4 - Handle calendar API errors gracefully without blocking workflow
 */

export interface CalendarError {
  code: string;
  message: string;
  retryable: boolean;
  suggestedAction: string;
  fallbackBehavior?: string;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
}

export interface ErrorHandlingResult {
  success: boolean;
  error?: CalendarError;
  shouldRetry: boolean;
  retryAfter?: number; // milliseconds
  fallbackData?: any;
}

/**
 * Default retry configuration for calendar API operations
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2
};

/**
 * Calendar API error codes and their handling strategies
 */
const ERROR_HANDLING_MAP: Record<string, CalendarError> = {
  // Authentication errors
  '401': {
    code: '401',
    message: 'Authentication failed - token expired or invalid',
    retryable: false,
    suggestedAction: 'Re-authenticate with Google Calendar',
    fallbackBehavior: 'Continue without calendar integration'
  },
  
  // Permission errors
  '403': {
    code: '403',
    message: 'Insufficient permissions for calendar access',
    retryable: false,
    suggestedAction: 'Grant additional calendar permissions',
    fallbackBehavior: 'Continue with limited functionality'
  },
  
  // Rate limiting / quota errors
  '429': {
    code: '429',
    message: 'API quota exceeded - too many requests',
    retryable: true,
    suggestedAction: 'Wait and retry automatically',
    fallbackBehavior: 'Use cached data or continue without real-time checks'
  },
  
  // Server errors
  '500': {
    code: '500',
    message: 'Google Calendar service temporarily unavailable',
    retryable: true,
    suggestedAction: 'Retry automatically',
    fallbackBehavior: 'Continue without calendar integration'
  },
  
  '502': {
    code: '502',
    message: 'Google Calendar service gateway error',
    retryable: true,
    suggestedAction: 'Retry automatically',
    fallbackBehavior: 'Continue without calendar integration'
  },
  
  '503': {
    code: '503',
    message: 'Google Calendar service unavailable',
    retryable: true,
    suggestedAction: 'Retry automatically',
    fallbackBehavior: 'Continue without calendar integration'
  },
  
  // Network errors
  'NETWORK_ERROR': {
    code: 'NETWORK_ERROR',
    message: 'Network connection failed',
    retryable: true,
    suggestedAction: 'Check internet connection and retry',
    fallbackBehavior: 'Continue in offline mode'
  },
  
  // Timeout errors
  'TIMEOUT': {
    code: 'TIMEOUT',
    message: 'Request timed out',
    retryable: true,
    suggestedAction: 'Retry with longer timeout',
    fallbackBehavior: 'Continue without real-time data'
  }
};

/**
 * Calculates exponential backoff delay
 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  return Math.min(delay, config.maxDelay);
}

/**
 * Adds jitter to prevent thundering herd problem
 */
function addJitter(delay: number): number {
  return delay + Math.random() * 1000; // Add up to 1 second of jitter
}

/**
 * Determines if an error is retryable based on error code
 */
function isRetryableError(error: any): boolean {
  const errorCode = getErrorCode(error);
  const errorInfo = ERROR_HANDLING_MAP[errorCode];
  return errorInfo?.retryable || false;
}

/**
 * Extracts error code from various error formats
 */
function getErrorCode(error: any): string {
  // Network errors (check before generic code check)
  if (error.message?.includes('network') || error.code === 'ENOTFOUND') {
    return 'NETWORK_ERROR';
  }
  
  // Timeout errors (check before generic code check)
  if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT' || error.code === 'TIMEOUT') {
    return 'TIMEOUT';
  }
  
  // Google API errors
  if (error.code) {
    return error.code.toString();
  }
  
  // HTTP response errors
  if (error.response?.status) {
    return error.response.status.toString();
  }
  
  // Default to unknown error
  return 'UNKNOWN';
}

/**
 * Creates a standardized calendar error from various error types
 */
function createCalendarError(error: any): CalendarError {
  const errorCode = getErrorCode(error);
  const knownError = ERROR_HANDLING_MAP[errorCode];
  
  if (knownError) {
    return knownError;
  }
  
  // Create error for unknown cases
  return {
    code: errorCode,
    message: error.message || 'Unknown calendar API error',
    retryable: false,
    suggestedAction: 'Contact support if the issue persists',
    fallbackBehavior: 'Continue without calendar integration'
  };
}

/**
 * Main calendar error handler with retry logic and exponential backoff
 * Requirements: 5.4 - Add retry logic for transient calendar API failures
 * Requirements: 5.4 - Handle quota exceeded errors with exponential backoff
 */
export class CalendarErrorHandler {
  private retryConfig: RetryConfig;
  
  constructor(retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.retryConfig = retryConfig;
  }
  
  /**
   * Executes a calendar API operation with automatic retry and error handling
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    user?: User
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Log the error for monitoring
        console.error(`Calendar API error on attempt ${attempt} for ${operationName}:`, {
          error: error instanceof Error ? error.message : String(error),
          code: getErrorCode(error),
          userId: user?.id,
          attempt
        });

        // Log to comprehensive error logging system
        await logError(error, createErrorContext(
          user?.id,
          undefined,
          undefined,
          operationName
        ), ErrorCategory.CALENDAR, ErrorSeverity.HIGH, {
          calendarErrorCode: getErrorCode(error),
          attempt,
          maxRetries: this.retryConfig.maxRetries + 1,
          retryable: isRetryableError(error)
        }).catch(logErr => {
          console.error('Failed to log calendar error:', logErr);
        });
        
        // Check if we should retry
        if (attempt <= this.retryConfig.maxRetries && isRetryableError(error)) {
          const delay = this.calculateRetryDelay(attempt, error);
          
          console.log(`Retrying ${operationName} in ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})`);
          
          await this.sleep(delay);
          continue;
        }
        
        // No more retries or non-retryable error
        break;
      }
    }
    
    // All retries exhausted, throw the last error
    throw lastError;
  }
  
  /**
   * Handles calendar API errors and provides structured error information
   */
  handleError(error: any, operationName: string, user?: User): ErrorHandlingResult {
    const calendarError = createCalendarError(error);
    
    // Log error for monitoring
    console.error(`Calendar API error in ${operationName}:`, {
      code: calendarError.code,
      message: calendarError.message,
      userId: user?.id,
      retryable: calendarError.retryable
    });
    
    return {
      success: false,
      error: calendarError,
      shouldRetry: calendarError.retryable,
      retryAfter: calendarError.retryable ? this.calculateRetryDelay(1, error) : undefined
    };
  }
  
  /**
   * Provides fallback behavior when calendar operations fail
   * Requirements: 5.4 - Provide fallback behavior when calendar access is unavailable
   */
  getFallbackBehavior(operationName: string, error: any): any {
    const calendarError = createCalendarError(error);
    
    switch (operationName) {
      case 'checkAvailability':
        return {
          isAvailable: true, // Assume available when can't check
          conflicts: [],
          suggestedAlternatives: [],
          fallbackMode: true,
          message: 'Calendar availability check unavailable - proceeding with assumption of no conflicts'
        };
        
      case 'verifyAccess':
        return {
          hasAccess: false,
          tokenValid: false,
          needsRefresh: false,
          scopes: [],
          fallbackMode: true,
          message: 'Calendar access verification unavailable - continuing without calendar integration'
        };
        
      case 'suggestAlternatives':
        return {
          alternatives: this.generateBasicTimeAlternatives(),
          fallbackMode: true,
          message: 'Using basic time suggestions due to calendar service unavailability'
        };
        
      case 'createEvent':
        // For event creation, we can't provide a meaningful fallback
        throw new Error(`Calendar event creation failed: ${calendarError.message}. ${calendarError.suggestedAction}`);
        
      default:
        return {
          fallbackMode: true,
          message: `${operationName} unavailable due to calendar service issues`
        };
    }
  }
  
  /**
   * Calculates retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number, error: any): number {
    const errorCode = getErrorCode(error);
    
    // Special handling for rate limiting
    if (errorCode === '429') {
      // For rate limiting, use longer delays
      const baseDelay = Math.max(this.retryConfig.baseDelay * 2, 5000); // At least 5 seconds
      const delay = baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
      return addJitter(Math.min(delay, this.retryConfig.maxDelay));
    }
    
    // Standard exponential backoff
    const delay = calculateBackoffDelay(attempt, this.retryConfig);
    return addJitter(delay);
  }
  
  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Generates basic time alternatives when calendar service is unavailable
   */
  private generateBasicTimeAlternatives(): any[] {
    const now = new Date();
    const alternatives = [];
    
    // Suggest 1 hour later
    const alt1 = new Date(now.getTime() + 60 * 60 * 1000);
    alternatives.push({
      startTime: alt1,
      endTime: new Date(alt1.getTime() + 60 * 60 * 1000),
      duration: 60,
      isAvailable: true,
      fallbackSuggestion: true
    });
    
    // Suggest 2 hours later
    const alt2 = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    alternatives.push({
      startTime: alt2,
      endTime: new Date(alt2.getTime() + 60 * 60 * 1000),
      duration: 60,
      isAvailable: true,
      fallbackSuggestion: true
    });
    
    // Suggest tomorrow same time
    const alt3 = new Date(now);
    alt3.setDate(alt3.getDate() + 1);
    alternatives.push({
      startTime: alt3,
      endTime: new Date(alt3.getTime() + 60 * 60 * 1000),
      duration: 60,
      isAvailable: true,
      fallbackSuggestion: true
    });
    
    return alternatives;
  }
  
  /**
   * Checks if calendar service is currently experiencing issues
   */
  async checkServiceHealth(): Promise<{ healthy: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      // Simple health check - could be expanded to ping Google Calendar API
      // For now, we'll assume healthy unless we have evidence otherwise
      return { healthy: true, issues: [] };
    } catch (error) {
      issues.push('Calendar service health check failed');
      return { healthy: false, issues };
    }
  }
}

/**
 * Singleton instance for global use
 */
export const calendarErrorHandler = new CalendarErrorHandler();

/**
 * Utility function to wrap calendar operations with error handling
 */
export async function withCalendarErrorHandling<T>(
  operation: () => Promise<T>,
  operationName: string,
  user?: User,
  provideFallback: boolean = true
): Promise<T> {
  try {
    return await calendarErrorHandler.executeWithRetry(operation, operationName, user);
  } catch (error) {
    if (provideFallback) {
      const fallback = calendarErrorHandler.getFallbackBehavior(operationName, error);
      if (fallback !== undefined) {
        console.warn(`Using fallback for ${operationName}:`, fallback);
        return fallback as T;
      }
    }
    
    // Re-throw if no fallback available or fallback disabled
    throw error;
  }
}

/**
 * Decorator for automatic error handling on calendar service methods
 */
export function handleCalendarErrors(operationName: string, provideFallback: boolean = true) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const user = args.find(arg => arg && typeof arg === 'object' && arg.id && arg.accessToken);
      
      return withCalendarErrorHandling(
        () => originalMethod.apply(this, args),
        operationName,
        user,
        provideFallback
      );
    };
    
    return descriptor;
  };
}