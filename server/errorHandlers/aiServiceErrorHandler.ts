import { performanceMonitor } from '../performanceMonitor.js';
import { logError, ErrorCategory, ErrorSeverity, createErrorContext } from './errorLogger.js';

/**
 * Error types for AI service failures
 */
export enum AIErrorType {
  NETWORK_ERROR = 'network_error',
  API_RATE_LIMIT = 'api_rate_limit',
  AUTHENTICATION_ERROR = 'authentication_error',
  INVALID_RESPONSE = 'invalid_response',
  TOKEN_LIMIT_EXCEEDED = 'token_limit_exceeded',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
  // Gemini-specific error types
  GEMINI_API_ERROR = 'gemini_api_error',
  CONTENT_FILTER_ERROR = 'content_filter_error',
  MODEL_UNAVAILABLE = 'model_unavailable',
  GENERATION_STOPPED = 'generation_stopped'
}

/**
 * AI service error with retry information
 */
export interface AIServiceError {
  type: AIErrorType;
  message: string;
  originalError?: any;
  retryable: boolean;
  retryAfter?: number;
  fallbackAvailable: boolean;
}

/**
 * Retry configuration for AI service calls
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: AIErrorType[];
}

/**
 * Fallback response configuration
 */
export interface FallbackConfig {
  enableFallbacks: boolean;
  fallbackResponses: {
    [key: string]: string;
  };
  fallbackIntentExtraction: any;
  fallbackTitleSuggestions: any;
}

/**
 * AI Service Error Handler with retry logic and fallbacks
 */
export class AIServiceErrorHandler {
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryableErrors: [
      AIErrorType.NETWORK_ERROR,
      AIErrorType.API_RATE_LIMIT,
      AIErrorType.SERVICE_UNAVAILABLE,
      AIErrorType.TIMEOUT,
      AIErrorType.MODEL_UNAVAILABLE
    ]
  };

  private fallbackConfig: FallbackConfig = {
    enableFallbacks: true,
    fallbackResponses: {
      general: "I'm having trouble processing that right now. Could you try rephrasing your request?",
      meeting_intent: "I understand you'd like to schedule something. Could you provide more details about the meeting?",
      title_generation: "Let me help you create a meeting title. What's the main purpose of this meeting?",
      agenda_generation: "I'll help you create an agenda. What are the main topics you'd like to discuss?",
      conversation_summary: "Recent conversation about meeting planning and scheduling.",
      content_filter: "I can't process that request due to content guidelines. Could you rephrase your message?",
      generation_stopped: "The response was interrupted. Please try asking your question differently.",
      model_unavailable: "The AI model is temporarily unavailable. Please try again in a moment."
    },
    fallbackIntentExtraction: {
      intent: 'other',
      confidence: 0,
      contextualConfidence: 0,
      fields: { participants: [] },
      missing: [],
      extractedFields: { participants: [] },
      missingFields: []
    },
    fallbackTitleSuggestions: {
      suggestions: ["Team Meeting", "Discussion Session", "Project Sync"],
      context: "General meeting"
    }
  };

  /**
   * Classify error type from Gemini API error or general error
   */
  classifyError(error: any): AIServiceError {
    // Handle network-level errors (timeout, connection issues)
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        type: AIErrorType.TIMEOUT,
        message: 'Request timed out',
        originalError: error,
        retryable: true,
        retryAfter: 2000,
        fallbackAvailable: true
      };
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return {
        type: AIErrorType.NETWORK_ERROR,
        message: 'Network connection failed',
        originalError: error,
        retryable: true,
        retryAfter: 3000,
        fallbackAvailable: true
      };
    }

    // Handle Gemini-specific errors
    if (error.status || error.message?.includes('GoogleGenerativeAI')) {
      return this.classifyGeminiError(error);
    }

    // Handle HTTP response errors (for backward compatibility)
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 401:
          return {
            type: AIErrorType.AUTHENTICATION_ERROR,
            message: 'Invalid API key or authentication failed',
            originalError: error,
            retryable: false,
            fallbackAvailable: true
          };

        case 429:
          const retryAfter = error.response.headers['retry-after']
            ? parseInt(error.response.headers['retry-after']) * 1000
            : 60000;
          return {
            type: AIErrorType.API_RATE_LIMIT,
            message: 'API rate limit exceeded',
            originalError: error,
            retryable: true,
            retryAfter,
            fallbackAvailable: true
          };

        case 413:
          return {
            type: AIErrorType.TOKEN_LIMIT_EXCEEDED,
            message: 'Token limit exceeded',
            originalError: error,
            retryable: false,
            fallbackAvailable: true
          };

        case 503:
        case 502:
        case 504:
          return {
            type: AIErrorType.SERVICE_UNAVAILABLE,
            message: 'AI service temporarily unavailable',
            originalError: error,
            retryable: true,
            retryAfter: 5000,
            fallbackAvailable: true
          };

        default:
          return {
            type: AIErrorType.UNKNOWN,
            message: data?.message || 'Unknown API error',
            originalError: error,
            retryable: status >= 500,
            fallbackAvailable: true
          };
      }
    }

    return {
      type: AIErrorType.UNKNOWN,
      message: error.message || 'Unknown error occurred',
      originalError: error,
      retryable: false,
      fallbackAvailable: true
    };
  }

  /**
   * Classify Gemini-specific errors
   */
  private classifyGeminiError(error: any): AIServiceError {
    const status = error.status;
    const message = error.message || '';

    // Handle specific Gemini error statuses
    switch (status) {
      case 400:
        // Check for content safety filter errors
        if (message.includes('SAFETY') || message.includes('content filter') || message.includes('blocked')) {
          return {
            type: AIErrorType.CONTENT_FILTER_ERROR,
            message: 'Content was blocked by safety filters',
            originalError: error,
            retryable: false,
            fallbackAvailable: true
          };
        }

        // Check for invalid request format
        if (message.includes('invalid') || message.includes('malformed')) {
          return {
            type: AIErrorType.INVALID_RESPONSE,
            message: 'Invalid request format',
            originalError: error,
            retryable: false,
            fallbackAvailable: true
          };
        }

        return {
          type: AIErrorType.GEMINI_API_ERROR,
          message: 'Bad request to Gemini API',
          originalError: error,
          retryable: false,
          fallbackAvailable: true
        };

      case 401:
        return {
          type: AIErrorType.AUTHENTICATION_ERROR,
          message: 'Invalid Gemini API key or authentication failed',
          originalError: error,
          retryable: false,
          fallbackAvailable: true
        };

      case 403:
        // Check for quota exceeded
        if (message.includes('quota') || message.includes('limit')) {
          return {
            type: AIErrorType.API_RATE_LIMIT,
            message: 'Gemini API quota exceeded',
            originalError: error,
            retryable: true,
            retryAfter: 60000, // 1 minute
            fallbackAvailable: true
          };
        }

        return {
          type: AIErrorType.AUTHENTICATION_ERROR,
          message: 'Access forbidden to Gemini API',
          originalError: error,
          retryable: false,
          fallbackAvailable: true
        };

      case 404:
        // Model not found
        if (message.includes('model') || message.includes('not found')) {
          return {
            type: AIErrorType.MODEL_UNAVAILABLE,
            message: 'Gemini model not available',
            originalError: error,
            retryable: true,
            retryAfter: 5000,
            fallbackAvailable: true
          };
        }

        return {
          type: AIErrorType.GEMINI_API_ERROR,
          message: 'Gemini API endpoint not found',
          originalError: error,
          retryable: false,
          fallbackAvailable: true
        };

      case 429:
        return {
          type: AIErrorType.API_RATE_LIMIT,
          message: 'Gemini API rate limit exceeded',
          originalError: error,
          retryable: true,
          retryAfter: 30000, // 30 seconds
          fallbackAvailable: true
        };

      case 500:
      case 502:
      case 503:
      case 504:
        return {
          type: AIErrorType.SERVICE_UNAVAILABLE,
          message: 'Gemini service temporarily unavailable',
          originalError: error,
          retryable: true,
          retryAfter: 10000,
          fallbackAvailable: true
        };

      default:
        // Check for generation stopped errors
        if (message.includes('STOP') || message.includes('generation stopped')) {
          return {
            type: AIErrorType.GENERATION_STOPPED,
            message: 'Generation stopped by Gemini',
            originalError: error,
            retryable: false,
            fallbackAvailable: true
          };
        }

        // Check for token limit errors
        if (message.includes('token') && (message.includes('limit') || message.includes('exceeded'))) {
          return {
            type: AIErrorType.TOKEN_LIMIT_EXCEEDED,
            message: 'Token limit exceeded for Gemini model',
            originalError: error,
            retryable: false,
            fallbackAvailable: true
          };
        }

        return {
          type: AIErrorType.GEMINI_API_ERROR,
          message: message || 'Unknown Gemini API error',
          originalError: error,
          retryable: status >= 500,
          fallbackAvailable: true
        };
    }
  }

  /**
   * Execute function with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    customRetryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.retryConfig, ...customRetryConfig };
    let lastError: AIServiceError | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const result = await operation();

        // Record successful operation
        performanceMonitor.recordAPICall({
          service: 'google',
          operation: operationName,
          tokenCount: { input: 0, output: 0, total: 0 },
          responseTime: Date.now() - startTime,
          success: true
        });

        return result;
      } catch (error) {
        const aiError = this.classifyError(error);
        lastError = aiError;

        // Record failed attempt
        performanceMonitor.recordAPICall({
          service: 'google',
          operation: operationName,
          tokenCount: { input: 0, output: 0, total: 0 },
          responseTime: Date.now() - Date.now(),
          success: false,
          error: aiError.message
        });

        console.error(`AI service error (attempt ${attempt + 1}/${config.maxRetries + 1}):`, {
          type: aiError.type,
          message: aiError.message,
          retryable: aiError.retryable
        });

        // Log to comprehensive error logging system
        await logError(error, createErrorContext(
          undefined,
          undefined,
          undefined,
          operationName
        ), ErrorCategory.AI_SERVICE, ErrorSeverity.HIGH, {
          aiErrorType: aiError.type,
          attempt: attempt + 1,
          maxRetries: config.maxRetries + 1,
          retryable: aiError.retryable,
          fallbackAvailable: aiError.fallbackAvailable
        }).catch(logErr => {
          console.error('Failed to log AI service error:', logErr);
        });

        // Don't retry if error is not retryable or we've exhausted retries
        if (!aiError.retryable || attempt === config.maxRetries) {
          break;
        }

        // Don't retry if error type is not in retryable list
        if (!config.retryableErrors.includes(aiError.type)) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelay
        );

        // Use retry-after header if available
        const actualDelay = aiError.retryAfter || delay;

        console.log(`Retrying in ${actualDelay}ms...`);
        await this.delay(actualDelay);
      }
    }

    // All retries exhausted, throw the last error
    throw lastError;
  }

  /**
   * Get fallback response for general conversation
   */
  getFallbackResponse(context: string = 'general'): string {
    if (!this.fallbackConfig.enableFallbacks) {
      throw new Error('AI service unavailable and fallbacks disabled');
    }

    return this.fallbackConfig.fallbackResponses[context] ||
      this.fallbackConfig.fallbackResponses.general;
  }

  /**
   * Get fallback response for content filter errors
   */
  getContentFilterFallback(): string {
    if (!this.fallbackConfig.enableFallbacks) {
      throw new Error('AI service unavailable and fallbacks disabled');
    }

    return this.fallbackConfig.fallbackResponses.content_filter;
  }

  /**
   * Get fallback response for generation stopped errors
   */
  getGenerationStoppedFallback(): string {
    if (!this.fallbackConfig.enableFallbacks) {
      throw new Error('AI service unavailable and fallbacks disabled');
    }

    return this.fallbackConfig.fallbackResponses.generation_stopped;
  }

  /**
   * Get fallback response for model unavailable errors
   */
  getModelUnavailableFallback(): string {
    if (!this.fallbackConfig.enableFallbacks) {
      throw new Error('AI service unavailable and fallbacks disabled');
    }

    return this.fallbackConfig.fallbackResponses.model_unavailable;
  }

  /**
   * Get fallback meeting intent extraction
   */
  getFallbackIntentExtraction(): any {
    if (!this.fallbackConfig.enableFallbacks) {
      throw new Error('AI service unavailable and fallbacks disabled');
    }

    return { ...this.fallbackConfig.fallbackIntentExtraction };
  }

  /**
   * Get fallback title suggestions
   */
  getFallbackTitleSuggestions(): any {
    if (!this.fallbackConfig.enableFallbacks) {
      throw new Error('AI service unavailable and fallbacks disabled');
    }

    return { ...this.fallbackConfig.fallbackTitleSuggestions };
  }

  /**
   * Get fallback agenda content
   */
  getFallbackAgenda(title: string, purpose: string, duration: number): string {
    if (!this.fallbackConfig.enableFallbacks) {
      throw new Error('AI service unavailable and fallbacks disabled');
    }

    return `# ${title}

**Meeting Purpose:** ${purpose}
**Duration:** ${duration} minutes

## Agenda Items

1. **Welcome & Introductions** (5 minutes)
   - Brief introductions if needed
   - Review meeting objectives

2. **Main Discussion** (${Math.max(duration - 15, 10)} minutes)
   - ${purpose}
   - Open discussion and questions

3. **Next Steps & Wrap-up** (10 minutes)
   - Summary of key points
   - Action items and follow-up
   - Schedule next meeting if needed

*This agenda was generated automatically. Please review and modify as needed.*`;
  }

  /**
   * Get fallback action items
   */
  getFallbackActionItems(purpose: string): any[] {
    if (!this.fallbackConfig.enableFallbacks) {
      throw new Error('AI service unavailable and fallbacks disabled');
    }

    return [
      {
        task: `Follow up on ${purpose}`,
        assignee: 'TBD',
        deadline: 'Next week',
        priority: 'medium'
      },
      {
        task: 'Schedule follow-up meeting if needed',
        assignee: 'Meeting organizer',
        deadline: 'End of week',
        priority: 'low'
      }
    ];
  }

  /**
   * Check if AI service is healthy
   */
  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    try {
      const startTime = Date.now();

      // Simple health check - try to get a basic response
      const testOperation = async () => {
        // This would be replaced with actual health check endpoint if available
        return Promise.resolve('healthy');
      };

      await this.executeWithRetry(testOperation, 'health_check', { maxRetries: 1 });

      return {
        healthy: true,
        latency: Date.now() - startTime
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update retry configuration
   */
  updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  /**
   * Update fallback configuration
   */
  updateFallbackConfig(config: Partial<FallbackConfig>): void {
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
  getConfiguration(): { retry: RetryConfig; fallback: FallbackConfig } {
    return {
      retry: { ...this.retryConfig },
      fallback: { ...this.fallbackConfig }
    };
  }

  /**
   * Execute operation with Gemini model fallback (flash → pro)
   */
  async executeWithModelFallback<T>(
    operation: (model: string) => Promise<T>,
    operationName: string,
    primaryModel: string = 'gemini-1.5-flash',
    fallbackModel: string = 'gemini-1.5-pro'
  ): Promise<T> {
    try {
      // Try with primary model first
      return await this.executeWithRetry(
        () => operation(primaryModel),
        `${operationName}_${primaryModel}`,
        { maxRetries: 2 } // Fewer retries before fallback
      );
    } catch (error: any) {
      const aiError = this.classifyError(error);

      // Only fallback for specific error types
      if (aiError.type === AIErrorType.MODEL_UNAVAILABLE ||
        aiError.type === AIErrorType.API_RATE_LIMIT ||
        aiError.type === AIErrorType.TOKEN_LIMIT_EXCEEDED) {

        console.log(`Primary model ${primaryModel} failed, falling back to ${fallbackModel}`);

        try {
          return await this.executeWithRetry(
            () => operation(fallbackModel),
            `${operationName}_${fallbackModel}_fallback`,
            { maxRetries: 1 } // Single retry for fallback model
          );
        } catch (fallbackError: any) {
          console.error(`Both models failed. Primary: ${aiError.message}, Fallback: ${fallbackError.message}`);
          throw fallbackError;
        }
      }

      // Re-throw original error if not suitable for model fallback
      throw error;
    }
  }

  /**
   * Check if quota limits are approaching and adjust request behavior
   */
  async executeWithQuotaAwareness<T>(
    operation: () => Promise<T>,
    operationName: string,
    quotaInfo?: { used: number; limit: number; resetTime?: Date }
  ): Promise<T> {
    // If quota information is available, check usage
    if (quotaInfo) {
      const usagePercentage = quotaInfo.used / quotaInfo.limit;

      // If usage is above 90%, add delay to throttle requests
      if (usagePercentage > 0.9) {
        const delay = Math.min(5000, (usagePercentage - 0.9) * 50000); // Up to 5 seconds delay
        console.log(`High quota usage detected (${Math.round(usagePercentage * 100)}%), adding ${delay}ms delay`);
        await this.delay(delay);
      }

      // If quota is exhausted, wait until reset time or throw error
      if (usagePercentage >= 1.0) {
        if (quotaInfo.resetTime && quotaInfo.resetTime > new Date()) {
          const waitTime = quotaInfo.resetTime.getTime() - Date.now();
          if (waitTime < 300000) { // Only wait up to 5 minutes
            console.log(`Quota exhausted, waiting ${waitTime}ms until reset`);
            await this.delay(waitTime);
          } else {
            throw new Error('API quota exhausted. Please try again later.');
          }
        } else {
          throw new Error('API quota exhausted. Please try again later.');
        }
      }
    }

    return this.executeWithRetry(operation, operationName);
  }

  /**
   * Generate appropriate fallback response based on error type
   */
  generateContextualFallback(errorType: AIErrorType, context: string = 'general'): string {
    switch (errorType) {
      case AIErrorType.CONTENT_FILTER_ERROR:
        return this.getContentFilterFallback();

      case AIErrorType.GENERATION_STOPPED:
        return this.getGenerationStoppedFallback();

      case AIErrorType.MODEL_UNAVAILABLE:
        return this.getModelUnavailableFallback();

      case AIErrorType.API_RATE_LIMIT:
        return "I'm experiencing high demand right now. Please try again in a moment.";

      case AIErrorType.TOKEN_LIMIT_EXCEEDED:
        return "Your request is too long. Could you try breaking it into smaller parts?";

      case AIErrorType.AUTHENTICATION_ERROR:
        return "There's an authentication issue. Please contact support if this persists.";

      case AIErrorType.SERVICE_UNAVAILABLE:
        return "The AI service is temporarily unavailable. Please try again shortly.";

      default:
        return this.getFallbackResponse(context);
    }
  }

  /**
   * Enhanced fallback for meeting intent extraction with Gemini error handling
   */
  getFallbackIntentExtractionWithContext(errorType: AIErrorType): any {
    const baseFallback = this.getFallbackIntentExtraction();

    // Adjust confidence based on error type
    switch (errorType) {
      case AIErrorType.CONTENT_FILTER_ERROR:
        return {
          ...baseFallback,
          intent: 'other',
          confidence: 0,
          contextualConfidence: 0,
          error: 'Content filtered by safety guidelines'
        };

      case AIErrorType.MODEL_UNAVAILABLE:
      case AIErrorType.SERVICE_UNAVAILABLE:
        return {
          ...baseFallback,
          intent: 'schedule_meeting',
          confidence: 0.3, // Slightly higher confidence for service issues
          contextualConfidence: 0.3,
          error: 'Service temporarily unavailable'
        };

      default:
        return baseFallback;
    }
  }

  /**
   * Enhanced fallback for title suggestions with error context
   */
  getFallbackTitleSuggestionsWithContext(errorType: AIErrorType, purpose?: string): any {
    const baseFallback = this.getFallbackTitleSuggestions();

    // Customize suggestions based on error type and available context
    switch (errorType) {
      case AIErrorType.CONTENT_FILTER_ERROR:
        return {
          suggestions: ["Team Discussion", "Project Meeting", "Work Session"],
          context: "Content-safe meeting titles"
        };

      case AIErrorType.TOKEN_LIMIT_EXCEEDED:
        // Provide simpler suggestions for token limit issues
        return {
          suggestions: ["Meeting", "Discussion", "Sync"],
          context: "Simplified titles due to length constraints"
        };

      default:
        // If we have purpose context, try to create better fallbacks
        if (purpose) {
          const purposeWords = purpose.toLowerCase().split(' ');
          const relevantSuggestions = [];

          if (purposeWords.some(word => ['project', 'work', 'task'].includes(word))) {
            relevantSuggestions.push("Project Sync", "Work Session", "Task Review");
          } else if (purposeWords.some(word => ['team', 'group', 'staff'].includes(word))) {
            relevantSuggestions.push("Team Meeting", "Group Discussion", "Staff Sync");
          } else {
            relevantSuggestions.push(...baseFallback.suggestions);
          }

          return {
            suggestions: relevantSuggestions.slice(0, 3),
            context: `Generated from purpose: ${purpose.substring(0, 50)}`
          };
        }

        return baseFallback;
    }
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const aiServiceErrorHandler = new AIServiceErrorHandler();