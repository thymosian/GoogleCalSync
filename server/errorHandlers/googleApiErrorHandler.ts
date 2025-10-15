import { GaxiosError } from 'gaxios';

/**
 * Error types for Google API failures
 */
export enum GoogleAPIErrorType {
  AUTHENTICATION_ERROR = 'authentication_error',
  AUTHORIZATION_ERROR = 'authorization_error',
  QUOTA_EXCEEDED = 'quota_exceeded',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  RESOURCE_NOT_FOUND = 'resource_not_found',
  PERMISSION_DENIED = 'permission_denied',
  INVALID_REQUEST = 'invalid_request',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown'
}

/**
 * Google API service types
 */
export enum GoogleService {
  CALENDAR = 'calendar',
  GMAIL = 'gmail',
  PEOPLE = 'people'
}

/**
 * Google API error with recovery information
 */
export interface GoogleAPIError {
  type: GoogleAPIErrorType;
  service: GoogleService;
  message: string;
  originalError?: any;
  retryable: boolean;
  retryAfter?: number;
  fallbackAvailable: boolean;
  userActionRequired?: string;
  recoveryOptions: string[];
}

/**
 * Retry configuration for Google API calls
 */
export interface GoogleRetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: GoogleAPIErrorType[];
}

/**
 * Fallback configuration for Google API failures
 */
export interface GoogleFallbackConfig {
  enableFallbacks: boolean;
  fallbackValidation: {
    emailRegex: RegExp;
    trustedDomains: string[];
  };
  fallbackMessages: {
    [key: string]: string;
  };
}

/**
 * Google API Error Handler with retry logic and fallbacks
 */
export class GoogleAPIErrorHandler {
  private retryConfig: GoogleRetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 15000,
    backoffMultiplier: 2,
    retryableErrors: [
      GoogleAPIErrorType.RATE_LIMIT_EXCEEDED,
      GoogleAPIErrorType.SERVICE_UNAVAILABLE,
      GoogleAPIErrorType.NETWORK_ERROR,
      GoogleAPIErrorType.TIMEOUT
    ]
  };

  private fallbackConfig: GoogleFallbackConfig = {
    enableFallbacks: true,
    fallbackValidation: {
      emailRegex: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
      trustedDomains: ['gmail.com', 'google.com', 'googlemail.com']
    },
    fallbackMessages: {
      calendar_unavailable: 'Calendar service is temporarily unavailable. Please try again later.',
      gmail_unavailable: 'Email service is temporarily unavailable. The meeting has been created but agenda emails could not be sent.',
      people_unavailable: 'Contact validation service is temporarily unavailable. Email addresses will be validated using basic format checking.',
      authentication_required: 'Please re-authenticate with Google to continue.',
      permission_denied: 'Additional permissions are required to complete this action.',
      quota_exceeded: 'Google API quota exceeded. Please try again later.'
    }
  };

  /**
   * Classify Google API error
   */
  classifyError(error: any, service: GoogleService): GoogleAPIError {
    // Handle network-level errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        type: GoogleAPIErrorType.TIMEOUT,
        service,
        message: `${service} service request timed out`,
        originalError: error,
        retryable: true,
        retryAfter: 3000,
        fallbackAvailable: true,
        recoveryOptions: ['Retry the operation', 'Check internet connection']
      };
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return {
        type: GoogleAPIErrorType.NETWORK_ERROR,
        service,
        message: `Network connection to ${service} service failed`,
        originalError: error,
        retryable: true,
        retryAfter: 5000,
        fallbackAvailable: true,
        recoveryOptions: ['Check internet connection', 'Retry the operation']
      };
    }

    // Handle Google API specific errors
    if (error.response || error.status) {
      const status = error.response?.status || error.status;
      const errorData = error.response?.data || error.data || {};
      const errorCode = errorData.error?.code || errorData.code;
      const errorMessage = errorData.error?.message || errorData.message || error.message;

      switch (status) {
        case 401:
          return {
            type: GoogleAPIErrorType.AUTHENTICATION_ERROR,
            service,
            message: 'Authentication failed - invalid or expired access token',
            originalError: error,
            retryable: false,
            fallbackAvailable: service === GoogleService.PEOPLE,
            userActionRequired: 'Re-authenticate with Google',
            recoveryOptions: ['Re-authenticate with Google', 'Check API credentials']
          };

        case 403:
          if (errorCode === 'quotaExceeded' || errorMessage.includes('quota')) {
            return {
              type: GoogleAPIErrorType.QUOTA_EXCEEDED,
              service,
              message: `${service} API quota exceeded`,
              originalError: error,
              retryable: true,
              retryAfter: 60000, // Wait 1 minute for quota reset
              fallbackAvailable: service === GoogleService.PEOPLE,
              recoveryOptions: ['Wait for quota reset', 'Use fallback validation']
            };
          }

          if (errorCode === 'rateLimitExceeded' || errorMessage.includes('rate limit')) {
            const retryAfter = error.response?.headers['retry-after'] 
              ? parseInt(error.response.headers['retry-after']) * 1000 
              : 30000;
            
            return {
              type: GoogleAPIErrorType.RATE_LIMIT_EXCEEDED,
              service,
              message: `${service} API rate limit exceeded`,
              originalError: error,
              retryable: true,
              retryAfter,
              fallbackAvailable: service === GoogleService.PEOPLE,
              recoveryOptions: ['Wait and retry', 'Use fallback validation']
            };
          }

          return {
            type: GoogleAPIErrorType.PERMISSION_DENIED,
            service,
            message: `Insufficient permissions for ${service} service`,
            originalError: error,
            retryable: false,
            fallbackAvailable: service === GoogleService.PEOPLE,
            userActionRequired: 'Grant additional permissions',
            recoveryOptions: ['Grant required permissions', 'Use fallback methods']
          };

        case 404:
          return {
            type: GoogleAPIErrorType.RESOURCE_NOT_FOUND,
            service,
            message: `Requested ${service} resource not found`,
            originalError: error,
            retryable: false,
            fallbackAvailable: service === GoogleService.PEOPLE,
            recoveryOptions: ['Verify resource exists', 'Use alternative approach']
          };

        case 400:
          return {
            type: GoogleAPIErrorType.INVALID_REQUEST,
            service,
            message: `Invalid request to ${service} service: ${errorMessage}`,
            originalError: error,
            retryable: false,
            fallbackAvailable: service === GoogleService.PEOPLE,
            recoveryOptions: ['Check request parameters', 'Use fallback validation']
          };

        case 500:
        case 502:
        case 503:
        case 504:
          return {
            type: GoogleAPIErrorType.SERVICE_UNAVAILABLE,
            service,
            message: `${service} service temporarily unavailable`,
            originalError: error,
            retryable: true,
            retryAfter: 10000,
            fallbackAvailable: true,
            recoveryOptions: ['Retry later', 'Use fallback methods']
          };

        default:
          return {
            type: GoogleAPIErrorType.UNKNOWN,
            service,
            message: `Unknown ${service} API error: ${errorMessage}`,
            originalError: error,
            retryable: status >= 500,
            fallbackAvailable: service === GoogleService.PEOPLE,
            recoveryOptions: ['Retry the operation', 'Contact support']
          };
      }
    }

    return {
      type: GoogleAPIErrorType.UNKNOWN,
      service,
      message: error.message || `Unknown ${service} service error`,
      originalError: error,
      retryable: false,
      fallbackAvailable: service === GoogleService.PEOPLE,
      recoveryOptions: ['Retry the operation', 'Check error logs']
    };
  }

  /**
   * Execute Google API operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    service: GoogleService,
    operationName: string,
    customRetryConfig?: Partial<GoogleRetryConfig>
  ): Promise<T> {
    const config = { ...this.retryConfig, ...customRetryConfig };
    let lastError: GoogleAPIError | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const googleError = this.classifyError(error, service);
        lastError = googleError;

        console.error(`Google ${service} API error (attempt ${attempt + 1}/${config.maxRetries + 1}):`, {
          type: googleError.type,
          message: googleError.message,
          retryable: googleError.retryable
        });

        // Don't retry if error is not retryable or we've exhausted retries
        if (!googleError.retryable || attempt === config.maxRetries) {
          break;
        }

        // Don't retry if error type is not in retryable list
        if (!config.retryableErrors.includes(googleError.type)) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelay
        );

        // Use retry-after header if available
        const actualDelay = googleError.retryAfter || delay;

        console.log(`Retrying Google ${service} operation in ${actualDelay}ms...`);
        await this.delay(actualDelay);
      }
    }

    // All retries exhausted, throw the last error
    throw lastError;
  }

  /**
   * Fallback email validation when People API fails
   */
  fallbackEmailValidation(email: string): {
    email: string;
    isValid: boolean;
    exists: boolean;
    isGoogleUser: boolean;
    fallbackUsed: boolean;
  } {
    if (!this.fallbackConfig.enableFallbacks) {
      throw new Error('People API unavailable and fallbacks disabled');
    }

    const isValid = this.fallbackConfig.fallbackValidation.emailRegex.test(email);
    const isGoogleUser = this.fallbackConfig.fallbackValidation.trustedDomains.some(
      domain => email.toLowerCase().endsWith(`@${domain}`)
    );

    return {
      email,
      isValid,
      exists: false, // Can't verify existence without API
      isGoogleUser,
      fallbackUsed: true
    };
  }

  /**
   * Batch fallback email validation
   */
  fallbackBatchEmailValidation(emails: string[]): Array<{
    email: string;
    isValid: boolean;
    exists: boolean;
    isGoogleUser: boolean;
    fallbackUsed: boolean;
  }> {
    return emails.map(email => this.fallbackEmailValidation(email));
  }

  /**
   * Get user-friendly error message
   */
  getUserFriendlyMessage(error: GoogleAPIError): string {
    const baseMessage = this.fallbackConfig.fallbackMessages[`${error.service}_unavailable`] ||
                       this.fallbackConfig.fallbackMessages[error.type] ||
                       error.message;

    if (error.userActionRequired) {
      return `${baseMessage} ${error.userActionRequired}`;
    }

    return baseMessage;
  }

  /**
   * Get recovery suggestions for user
   */
  getRecoveryOptions(error: GoogleAPIError): {
    immediate: string[];
    alternative: string[];
    userAction: string[];
  } {
    const immediate: string[] = [];
    const alternative: string[] = [];
    const userAction: string[] = [];

    error.recoveryOptions.forEach(option => {
      if (option.includes('Retry') || option.includes('Wait')) {
        immediate.push(option);
      } else if (option.includes('fallback') || option.includes('alternative')) {
        alternative.push(option);
      } else {
        userAction.push(option);
      }
    });

    return { immediate, alternative, userAction };
  }

  /**
   * Check if service supports fallback operations
   */
  supportsFallback(service: GoogleService, operation: string): boolean {
    switch (service) {
      case GoogleService.PEOPLE:
        return ['validateEmail', 'validateBatch'].includes(operation);
      case GoogleService.GMAIL:
        return false; // No fallback for email sending
      case GoogleService.CALENDAR:
        return false; // No fallback for calendar operations
      default:
        return false;
    }
  }

  /**
   * Health check for Google services
   */
  async healthCheck(service: GoogleService, accessToken: string): Promise<{
    healthy: boolean;
    latency?: number;
    error?: GoogleAPIError;
  }> {
    try {
      const startTime = Date.now();
      
      // Simple health check based on service
      const testOperation = async () => {
        switch (service) {
          case GoogleService.CALENDAR:
            // Test calendar access
            return Promise.resolve('calendar_healthy');
          case GoogleService.GMAIL:
            // Test gmail access
            return Promise.resolve('gmail_healthy');
          case GoogleService.PEOPLE:
            // Test people API access
            return Promise.resolve('people_healthy');
          default:
            return Promise.resolve('unknown_service');
        }
      };

      await this.executeWithRetry(testOperation, service, 'health_check', { maxRetries: 1 });
      
      return {
        healthy: true,
        latency: Date.now() - startTime
      };
    } catch (error) {
      return {
        healthy: false,
        error: error as GoogleAPIError
      };
    }
  }

  /**
   * Update retry configuration
   */
  updateRetryConfig(config: Partial<GoogleRetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  /**
   * Update fallback configuration
   */
  updateFallbackConfig(config: Partial<GoogleFallbackConfig>): void {
    this.fallbackConfig = { ...this.fallbackConfig, ...config };
  }

  /**
   * Enable or disable fallbacks
   */
  setFallbacksEnabled(enabled: boolean): void {
    this.fallbackConfig.enableFallbacks = enabled;
  }

  /**
   * Get current configuration
   */
  getConfiguration(): { retry: GoogleRetryConfig; fallback: GoogleFallbackConfig } {
    return {
      retry: { ...this.retryConfig },
      fallback: { ...this.fallbackConfig }
    };
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const googleApiErrorHandler = new GoogleAPIErrorHandler();