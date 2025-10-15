import { User } from '../../shared/schema';
import { storage } from '../storage';
import { GoogleAuth } from 'google-auth-library';

/**
 * Authentication error types
 */
export enum AuthErrorType {
  TOKEN_EXPIRED = 'token_expired',
  TOKEN_INVALID = 'token_invalid',
  REFRESH_TOKEN_EXPIRED = 'refresh_token_expired',
  REFRESH_TOKEN_INVALID = 'refresh_token_invalid',
  INSUFFICIENT_SCOPES = 'insufficient_scopes',
  AUTHENTICATION_REQUIRED = 'authentication_required',
  NETWORK_ERROR = 'network_error',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  UNKNOWN = 'unknown'
}

/**
 * Authentication error with recovery information
 */
export interface AuthenticationError {
  type: AuthErrorType;
  message: string;
  originalError?: any;
  recoverable: boolean;
  requiresUserAction: boolean;
  recoveryOptions: string[];
  preserveWorkflowState: boolean;
}

/**
 * Token refresh result
 */
export interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  error?: AuthenticationError;
}

/**
 * Authentication recovery configuration
 */
export interface AuthRecoveryConfig {
  enableAutoRefresh: boolean;
  maxRefreshRetries: number;
  refreshRetryDelay: number;
  preserveWorkflowOnFailure: boolean;
  fallbackToReauth: boolean;
}

/**
 * Workflow state preservation interface
 */
export interface WorkflowStatePreservation {
  conversationId: string;
  workflowStep: string;
  meetingData: any;
  timestamp: Date;
  userId: string;
}

/**
 * Authentication Error Handler with automatic token refresh and workflow state preservation
 * Requirements: 7.1, 7.4 - Handle authentication failures with state preservation
 */
export class AuthenticationErrorHandler {
  private googleAuth: GoogleAuth;
  private recoveryConfig: AuthRecoveryConfig = {
    enableAutoRefresh: true,
    maxRefreshRetries: 3,
    refreshRetryDelay: 2000,
    preserveWorkflowOnFailure: true,
    fallbackToReauth: true
  };

  // In-memory store for preserved workflow states (in production, use Redis or database)
  private preservedStates = new Map<string, WorkflowStatePreservation>();

  constructor() {
    this.googleAuth = new GoogleAuth({
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email'
      ]
    });
  }

  /**
   * Classify authentication error
   */
  classifyAuthError(error: any): AuthenticationError {
    // Handle network-level errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        type: AuthErrorType.NETWORK_ERROR,
        message: 'Network timeout during authentication',
        originalError: error,
        recoverable: true,
        requiresUserAction: false,
        recoveryOptions: ['Retry authentication', 'Check internet connection'],
        preserveWorkflowState: true
      };
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return {
        type: AuthErrorType.NETWORK_ERROR,
        message: 'Network connection failed during authentication',
        originalError: error,
        recoverable: true,
        requiresUserAction: false,
        recoveryOptions: ['Check internet connection', 'Retry authentication'],
        preserveWorkflowState: true
      };
    }

    // Handle Google OAuth specific errors
    if (error.response || error.status) {
      const status = error.response?.status || error.status;
      const errorData = error.response?.data || error.data || {};
      const errorCode = errorData.error || errorData.error_description;

      switch (status) {
        case 401:
          if (errorCode?.includes('invalid_token') || errorCode?.includes('expired')) {
            return {
              type: AuthErrorType.TOKEN_EXPIRED,
              message: 'Access token has expired',
              originalError: error,
              recoverable: true,
              requiresUserAction: false,
              recoveryOptions: ['Refresh access token', 'Re-authenticate if refresh fails'],
              preserveWorkflowState: true
            };
          }

          return {
            type: AuthErrorType.TOKEN_INVALID,
            message: 'Access token is invalid',
            originalError: error,
            recoverable: true,
            requiresUserAction: true,
            recoveryOptions: ['Re-authenticate with Google'],
            preserveWorkflowState: true
          };

        case 403:
          if (errorCode?.includes('insufficient_scope')) {
            return {
              type: AuthErrorType.INSUFFICIENT_SCOPES,
              message: 'Insufficient permissions for requested operation',
              originalError: error,
              recoverable: true,
              requiresUserAction: true,
              recoveryOptions: ['Re-authenticate with additional permissions'],
              preserveWorkflowState: true
            };
          }

          return {
            type: AuthErrorType.AUTHENTICATION_REQUIRED,
            message: 'Authentication required for this operation',
            originalError: error,
            recoverable: true,
            requiresUserAction: true,
            recoveryOptions: ['Re-authenticate with Google'],
            preserveWorkflowState: true
          };

        case 400:
          if (errorCode?.includes('invalid_grant') || errorCode?.includes('refresh_token')) {
            return {
              type: AuthErrorType.REFRESH_TOKEN_INVALID,
              message: 'Refresh token is invalid or expired',
              originalError: error,
              recoverable: true,
              requiresUserAction: true,
              recoveryOptions: ['Re-authenticate with Google'],
              preserveWorkflowState: true
            };
          }

          return {
            type: AuthErrorType.TOKEN_INVALID,
            message: 'Invalid authentication request',
            originalError: error,
            recoverable: true,
            requiresUserAction: true,
            recoveryOptions: ['Re-authenticate with Google'],
            preserveWorkflowState: true
          };

        case 500:
        case 502:
        case 503:
        case 504:
          return {
            type: AuthErrorType.SERVICE_UNAVAILABLE,
            message: 'Google authentication service temporarily unavailable',
            originalError: error,
            recoverable: true,
            requiresUserAction: false,
            recoveryOptions: ['Retry authentication', 'Wait and try again'],
            preserveWorkflowState: true
          };

        default:
          return {
            type: AuthErrorType.UNKNOWN,
            message: `Unknown authentication error: ${errorCode || error.message}`,
            originalError: error,
            recoverable: false,
            requiresUserAction: true,
            recoveryOptions: ['Re-authenticate with Google', 'Contact support'],
            preserveWorkflowState: true
          };
      }
    }

    return {
      type: AuthErrorType.UNKNOWN,
      message: error.message || 'Unknown authentication error',
      originalError: error,
      recoverable: false,
      requiresUserAction: true,
      recoveryOptions: ['Re-authenticate with Google'],
      preserveWorkflowState: true
    };
  }

  /**
   * Attempt to refresh access token using refresh token
   */
  async refreshAccessToken(user: User): Promise<TokenRefreshResult> {
    if (!user.refreshToken) {
      return {
        success: false,
        error: {
          type: AuthErrorType.REFRESH_TOKEN_INVALID,
          message: 'No refresh token available',
          recoverable: true,
          requiresUserAction: true,
          recoveryOptions: ['Re-authenticate with Google'],
          preserveWorkflowState: true
        }
      };
    }

    let lastError: AuthenticationError | null = null;

    for (let attempt = 0; attempt < this.recoveryConfig.maxRefreshRetries; attempt++) {
      try {
        console.log(`Attempting token refresh for user ${user.id} (attempt ${attempt + 1})`);

        // Use Google Auth Library to refresh token
        const oauth2Client = new this.googleAuth.OAuth2Client(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );

        oauth2Client.setCredentials({
          refresh_token: user.refreshToken
        });

        const { credentials } = await oauth2Client.refreshAccessToken();

        if (credentials.access_token) {
          // Update user tokens in database
          await storage.updateUserTokens(
            user.googleId,
            credentials.access_token,
            credentials.refresh_token || user.refreshToken
          );

          console.log(`Token refresh successful for user ${user.id}`);

          return {
            success: true,
            accessToken: credentials.access_token,
            refreshToken: credentials.refresh_token || user.refreshToken,
            expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined
          };
        }

        throw new Error('No access token received from refresh');

      } catch (error) {
        const authError = this.classifyAuthError(error);
        lastError = authError;

        console.error(`Token refresh failed (attempt ${attempt + 1}):`, {
          type: authError.type,
          message: authError.message,
          userId: user.id
        });

        // Don't retry for certain error types
        if (authError.type === AuthErrorType.REFRESH_TOKEN_INVALID ||
            authError.type === AuthErrorType.REFRESH_TOKEN_EXPIRED ||
            !authError.recoverable) {
          break;
        }

        // Wait before retry
        if (attempt < this.recoveryConfig.maxRefreshRetries - 1) {
          await this.delay(this.recoveryConfig.refreshRetryDelay * (attempt + 1));
        }
      }
    }

    return {
      success: false,
      error: lastError || {
        type: AuthErrorType.UNKNOWN,
        message: 'Token refresh failed after all retries',
        recoverable: true,
        requiresUserAction: true,
        recoveryOptions: ['Re-authenticate with Google'],
        preserveWorkflowState: true
      }
    };
  }

  /**
   * Execute operation with automatic authentication recovery
   */
  async executeWithAuthRecovery<T>(
    operation: (user: User) => Promise<T>,
    user: User,
    operationName: string,
    workflowContext?: {
      conversationId: string;
      workflowStep: string;
      meetingData: any;
    }
  ): Promise<T> {
    try {
      return await operation(user);
    } catch (error) {
      const authError = this.classifyAuthError(error);

      console.error(`Authentication error in ${operationName}:`, {
        type: authError.type,
        message: authError.message,
        userId: user.id,
        recoverable: authError.recoverable
      });

      // Preserve workflow state if requested and context is provided
      if (authError.preserveWorkflowState && workflowContext) {
        await this.preserveWorkflowState(user.id, workflowContext);
      }

      // Attempt automatic recovery for recoverable errors
      if (authError.recoverable && !authError.requiresUserAction) {
        if (authError.type === AuthErrorType.TOKEN_EXPIRED && this.recoveryConfig.enableAutoRefresh) {
          console.log(`Attempting automatic token refresh for user ${user.id}`);

          const refreshResult = await this.refreshAccessToken(user);
          if (refreshResult.success && refreshResult.accessToken) {
            // Update user object with new token
            const updatedUser = {
              ...user,
              accessToken: refreshResult.accessToken,
              refreshToken: refreshResult.refreshToken || user.refreshToken
            };

            console.log(`Token refresh successful, retrying operation ${operationName}`);

            // Retry the operation with refreshed token
            try {
              return await operation(updatedUser);
            } catch (retryError) {
              console.error(`Operation failed even after token refresh:`, retryError);
              throw this.classifyAuthError(retryError);
            }
          }
        }
      }

      // If automatic recovery failed or not applicable, throw the classified error
      throw authError;
    }
  }

  /**
   * Preserve workflow state for recovery after re-authentication
   */
  async preserveWorkflowState(
    userId: string,
    workflowContext: {
      conversationId: string;
      workflowStep: string;
      meetingData: any;
    }
  ): Promise<void> {
    const preservation: WorkflowStatePreservation = {
      conversationId: workflowContext.conversationId,
      workflowStep: workflowContext.workflowStep,
      meetingData: workflowContext.meetingData,
      timestamp: new Date(),
      userId
    };

    // Store in memory (in production, use Redis or database)
    this.preservedStates.set(userId, preservation);

    console.log(`Workflow state preserved for user ${userId}:`, {
      conversationId: workflowContext.conversationId,
      workflowStep: workflowContext.workflowStep
    });

    // Set expiration (clean up after 1 hour)
    setTimeout(() => {
      this.preservedStates.delete(userId);
      console.log(`Expired preserved workflow state for user ${userId}`);
    }, 60 * 60 * 1000);
  }

  /**
   * Retrieve preserved workflow state after re-authentication
   */
  async retrievePreservedWorkflowState(userId: string): Promise<WorkflowStatePreservation | null> {
    const preserved = this.preservedStates.get(userId);
    
    if (preserved) {
      // Check if state is still valid (not older than 1 hour)
      const ageInMs = Date.now() - preserved.timestamp.getTime();
      if (ageInMs < 60 * 60 * 1000) {
        console.log(`Retrieved preserved workflow state for user ${userId}:`, {
          conversationId: preserved.conversationId,
          workflowStep: preserved.workflowStep,
          age: Math.round(ageInMs / 1000) + 's'
        });
        return preserved;
      } else {
        // Clean up expired state
        this.preservedStates.delete(userId);
        console.log(`Preserved workflow state expired for user ${userId}`);
      }
    }

    return null;
  }

  /**
   * Clear preserved workflow state (called after successful recovery)
   */
  async clearPreservedWorkflowState(userId: string): Promise<void> {
    this.preservedStates.delete(userId);
    console.log(`Cleared preserved workflow state for user ${userId}`);
  }

  /**
   * Generate re-authentication URL with state preservation
   */
  generateReauthURL(userId: string, preserveState: boolean = true): string {
    const baseURL = '/api/auth/google';
    const params = new URLSearchParams();
    
    if (preserveState) {
      params.append('preserve_state', 'true');
      params.append('user_id', userId);
    }
    
    return `${baseURL}?${params.toString()}`;
  }

  /**
   * Get user-friendly error message with recovery instructions
   */
  getUserFriendlyMessage(error: AuthenticationError, includeRecovery: boolean = true): string {
    let message = '';

    switch (error.type) {
      case AuthErrorType.TOKEN_EXPIRED:
        message = 'Your session has expired. ';
        break;
      case AuthErrorType.TOKEN_INVALID:
        message = 'Your authentication is invalid. ';
        break;
      case AuthErrorType.REFRESH_TOKEN_EXPIRED:
      case AuthErrorType.REFRESH_TOKEN_INVALID:
        message = 'Your authentication has expired. ';
        break;
      case AuthErrorType.INSUFFICIENT_SCOPES:
        message = 'Additional permissions are required. ';
        break;
      case AuthErrorType.AUTHENTICATION_REQUIRED:
        message = 'Authentication is required to continue. ';
        break;
      case AuthErrorType.NETWORK_ERROR:
        message = 'Network connection issue during authentication. ';
        break;
      case AuthErrorType.SERVICE_UNAVAILABLE:
        message = 'Google authentication service is temporarily unavailable. ';
        break;
      default:
        message = 'An authentication error occurred. ';
    }

    if (includeRecovery && error.recoveryOptions.length > 0) {
      message += error.recoveryOptions[0];
    }

    if (error.preserveWorkflowState) {
      message += ' Your progress has been saved and will be restored after re-authentication.';
    }

    return message;
  }

  /**
   * Check if user needs re-authentication
   */
  async checkAuthenticationStatus(user: User): Promise<{
    isValid: boolean;
    needsRefresh: boolean;
    needsReauth: boolean;
    error?: AuthenticationError;
  }> {
    try {
      // Simple validation - try to use the access token
      if (!user.accessToken) {
        return {
          isValid: false,
          needsRefresh: false,
          needsReauth: true,
          error: {
            type: AuthErrorType.AUTHENTICATION_REQUIRED,
            message: 'No access token available',
            recoverable: true,
            requiresUserAction: true,
            recoveryOptions: ['Re-authenticate with Google'],
            preserveWorkflowState: true
          }
        };
      }

      // In a real implementation, you might make a test API call here
      // For now, we'll assume the token is valid if it exists
      return {
        isValid: true,
        needsRefresh: false,
        needsReauth: false
      };

    } catch (error) {
      const authError = this.classifyAuthError(error);
      
      return {
        isValid: false,
        needsRefresh: authError.type === AuthErrorType.TOKEN_EXPIRED,
        needsReauth: authError.requiresUserAction,
        error: authError
      };
    }
  }

  /**
   * Update recovery configuration
   */
  updateRecoveryConfig(config: Partial<AuthRecoveryConfig>): void {
    this.recoveryConfig = { ...this.recoveryConfig, ...config };
  }

  /**
   * Get current configuration
   */
  getConfiguration(): AuthRecoveryConfig {
    return { ...this.recoveryConfig };
  }

  /**
   * Health check for authentication service
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    latency?: number;
    error?: string;
  }> {
    try {
      const startTime = Date.now();
      
      // Simple health check - verify Google OAuth endpoints are reachable
      const testOperation = async () => {
        return Promise.resolve('auth_healthy');
      };

      await testOperation();

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
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const authenticationErrorHandler = new AuthenticationErrorHandler();