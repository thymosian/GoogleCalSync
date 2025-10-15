/**
 * Network Error Handler with retry mechanisms, offline detection, and state preservation
 * Requirements: 7.2, 7.5 - Handle network failures with state preservation and user feedback
 */

import { logError, ErrorCategory, ErrorSeverity, createErrorContext } from './errorLogger.js';

/**
 * Network error types
 */
export enum NetworkErrorType {
  CONNECTION_TIMEOUT = 'connection_timeout',
  CONNECTION_REFUSED = 'connection_refused',
  DNS_RESOLUTION_FAILED = 'dns_resolution_failed',
  NETWORK_UNREACHABLE = 'network_unreachable',
  SSL_ERROR = 'ssl_error',
  REQUEST_TIMEOUT = 'request_timeout',
  CONNECTION_RESET = 'connection_reset',
  OFFLINE = 'offline',
  SLOW_NETWORK = 'slow_network',
  UNKNOWN = 'unknown'
}

/**
 * Network error with recovery information
 */
export interface NetworkError {
  type: NetworkErrorType;
  message: string;
  originalError?: any;
  retryable: boolean;
  retryAfter?: number;
  preserveState: boolean;
  userFeedback: string;
  recoveryOptions: string[];
}

/**
 * Retry configuration for network operations
 */
export interface NetworkRetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  timeoutMs: number;
  retryableErrors: NetworkErrorType[];
}

/**
 * Offline queue item
 */
export interface QueuedOperation {
  id: string;
  operation: () => Promise<any>;
  operationName: string;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
  priority: 'high' | 'medium' | 'low';
  preserveState: boolean;
  stateData?: any;
}

/**
 * Network status information
 */
export interface NetworkStatus {
  isOnline: boolean;
  connectionType: 'fast' | 'slow' | 'offline';
  latency?: number;
  lastCheck: Date;
}

/**
 * State preservation for network failures
 */
export interface NetworkStatePreservation {
  operationId: string;
  operationName: string;
  operationData: any;
  timestamp: Date;
  userId?: string;
  conversationId?: string;
  retryCount: number;
}

/**
 * Network Error Handler with offline support and state preservation
 */
export class NetworkErrorHandler {
  private retryConfig: NetworkRetryConfig = {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    timeoutMs: 30000,
    retryableErrors: [
      NetworkErrorType.CONNECTION_TIMEOUT,
      NetworkErrorType.CONNECTION_REFUSED,
      NetworkErrorType.DNS_RESOLUTION_FAILED,
      NetworkErrorType.NETWORK_UNREACHABLE,
      NetworkErrorType.REQUEST_TIMEOUT,
      NetworkErrorType.CONNECTION_RESET,
      NetworkErrorType.SLOW_NETWORK
    ]
  };

  private networkStatus: NetworkStatus = {
    isOnline: true,
    connectionType: 'fast',
    lastCheck: new Date()
  };

  // In-memory queues (in production, use Redis or persistent storage)
  private offlineQueue = new Map<string, QueuedOperation>();
  private preservedStates = new Map<string, NetworkStatePreservation>();
  
  // Network monitoring
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor() {
    this.startNetworkMonitoring();
  }

  /**
   * Classify network error
   */
  classifyNetworkError(error: any): NetworkError {
    const errorCode = error.code || error.errno;
    const errorMessage = error.message || '';

    // Connection timeout
    if (errorCode === 'ETIMEDOUT' || errorCode === 'ECONNABORTED' || 
        errorMessage.includes('timeout')) {
      return {
        type: NetworkErrorType.CONNECTION_TIMEOUT,
        message: 'Connection timed out',
        originalError: error,
        retryable: true,
        retryAfter: 3000,
        preserveState: true,
        userFeedback: 'Connection is slow. Retrying automatically...',
        recoveryOptions: ['Retry automatically', 'Check internet connection', 'Try again later']
      };
    }

    // Connection refused
    if (errorCode === 'ECONNREFUSED') {
      return {
        type: NetworkErrorType.CONNECTION_REFUSED,
        message: 'Connection refused by server',
        originalError: error,
        retryable: true,
        retryAfter: 5000,
        preserveState: true,
        userFeedback: 'Server is temporarily unavailable. Retrying...',
        recoveryOptions: ['Retry automatically', 'Check service status', 'Try again later']
      };
    }

    // DNS resolution failed
    if (errorCode === 'ENOTFOUND' || errorCode === 'EAI_NONAME') {
      return {
        type: NetworkErrorType.DNS_RESOLUTION_FAILED,
        message: 'DNS resolution failed',
        originalError: error,
        retryable: true,
        retryAfter: 5000,
        preserveState: true,
        userFeedback: 'Network connection issue. Checking connectivity...',
        recoveryOptions: ['Check internet connection', 'Retry automatically', 'Check DNS settings']
      };
    }

    // Network unreachable
    if (errorCode === 'ENETUNREACH' || errorCode === 'EHOSTUNREACH') {
      return {
        type: NetworkErrorType.NETWORK_UNREACHABLE,
        message: 'Network unreachable',
        originalError: error,
        retryable: true,
        retryAfter: 10000,
        preserveState: true,
        userFeedback: 'Network is unreachable. Will retry when connection is restored.',
        recoveryOptions: ['Check internet connection', 'Retry when online', 'Check network settings']
      };
    }

    // SSL/TLS errors
    if (errorCode === 'CERT_HAS_EXPIRED' || errorCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
        errorMessage.includes('SSL') || errorMessage.includes('certificate')) {
      return {
        type: NetworkErrorType.SSL_ERROR,
        message: 'SSL/TLS certificate error',
        originalError: error,
        retryable: false,
        preserveState: true,
        userFeedback: 'Security certificate issue. Please contact support.',
        recoveryOptions: ['Contact support', 'Check system time', 'Try again later']
      };
    }

    // Connection reset
    if (errorCode === 'ECONNRESET' || errorMessage.includes('connection reset')) {
      return {
        type: NetworkErrorType.CONNECTION_RESET,
        message: 'Connection reset by server',
        originalError: error,
        retryable: true,
        retryAfter: 2000,
        preserveState: true,
        userFeedback: 'Connection was interrupted. Retrying...',
        recoveryOptions: ['Retry automatically', 'Check connection stability']
      };
    }

    // Request timeout (different from connection timeout)
    if (errorMessage.includes('request timeout') || errorMessage.includes('response timeout')) {
      return {
        type: NetworkErrorType.REQUEST_TIMEOUT,
        message: 'Request timed out',
        originalError: error,
        retryable: true,
        retryAfter: 5000,
        preserveState: true,
        userFeedback: 'Request is taking longer than expected. Retrying...',
        recoveryOptions: ['Retry with longer timeout', 'Check connection speed']
      };
    }

    // Check if we're offline
    if (!this.networkStatus.isOnline) {
      return {
        type: NetworkErrorType.OFFLINE,
        message: 'Device is offline',
        originalError: error,
        retryable: true,
        retryAfter: 10000,
        preserveState: true,
        userFeedback: 'You appear to be offline. Operations will resume when connection is restored.',
        recoveryOptions: ['Check internet connection', 'Retry when online']
      };
    }

    // Default unknown network error
    return {
      type: NetworkErrorType.UNKNOWN,
      message: errorMessage || 'Unknown network error',
      originalError: error,
      retryable: true,
      retryAfter: 5000,
      preserveState: true,
      userFeedback: 'Network error occurred. Retrying...',
      recoveryOptions: ['Retry automatically', 'Check internet connection']
    };
  }

  /**
   * Execute operation with network error handling and retry logic
   */
  async executeWithNetworkRecovery<T>(
    operation: () => Promise<T>,
    operationName: string,
    options: {
      priority?: 'high' | 'medium' | 'low';
      preserveState?: boolean;
      stateData?: any;
      userId?: string;
      conversationId?: string;
      customRetryConfig?: Partial<NetworkRetryConfig>;
    } = {}
  ): Promise<T> {
    const config = { ...this.retryConfig, ...options.customRetryConfig };
    const operationId = this.generateOperationId();
    let lastError: NetworkError | null = null;

    // Preserve state if requested
    if (options.preserveState && options.stateData) {
      await this.preserveOperationState(operationId, operationName, options.stateData, {
        userId: options.userId,
        conversationId: options.conversationId
      });
    }

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        // Check if we're offline before attempting
        if (!this.networkStatus.isOnline && attempt === 0) {
          throw new Error('Device is offline');
        }

        const result = await this.executeWithTimeout(operation, config.timeoutMs);
        
        // Clear preserved state on success
        if (options.preserveState) {
          await this.clearPreservedState(operationId);
        }

        return result;

      } catch (error) {
        const networkError = this.classifyNetworkError(error);
        lastError = networkError;

        console.error(`Network error in ${operationName} (attempt ${attempt + 1}/${config.maxRetries + 1}):`, {
          type: networkError.type,
          message: networkError.message,
          retryable: networkError.retryable
        });

        // Log to comprehensive error logging system
        await logError(error, createErrorContext(
          options.userId,
          options.conversationId,
          undefined,
          operationName
        ), ErrorCategory.NETWORK, ErrorSeverity.HIGH, {
          networkErrorType: networkError.type,
          attempt: attempt + 1,
          maxRetries: config.maxRetries + 1,
          retryable: networkError.retryable,
          preserveState: options.preserveState
        }).catch(logErr => {
          console.error('Failed to log network error:', logErr);
        });

        // Don't retry if error is not retryable or we've exhausted retries
        if (!networkError.retryable || attempt === config.maxRetries) {
          break;
        }

        // Don't retry if error type is not in retryable list
        if (!config.retryableErrors.includes(networkError.type)) {
          break;
        }

        // If offline, queue the operation instead of retrying immediately
        if (networkError.type === NetworkErrorType.OFFLINE || 
            networkError.type === NetworkErrorType.NETWORK_UNREACHABLE) {
          
          if (options.preserveState) {
            await this.queueOfflineOperation(operationId, operation, operationName, {
              priority: options.priority || 'medium',
              preserveState: true,
              stateData: options.stateData,
              maxRetries: config.maxRetries - attempt
            });
            
            throw new Error(`Operation queued for retry when online. ${networkError.userFeedback}`);
          }
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelay
        );

        // Use retry-after from error if available
        const actualDelay = networkError.retryAfter || delay;

        console.log(`Retrying ${operationName} in ${actualDelay}ms...`);
        await this.delay(actualDelay);
      }
    }

    // All retries exhausted
    if (lastError && options.preserveState) {
      // Keep state preserved for manual retry
      console.log(`Preserving state for failed operation ${operationName}`);
    }

    throw lastError;
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Queue operation for retry when online
   */
  async queueOfflineOperation(
    operationId: string,
    operation: () => Promise<any>,
    operationName: string,
    options: {
      priority: 'high' | 'medium' | 'low';
      preserveState: boolean;
      stateData?: any;
      maxRetries: number;
    }
  ): Promise<void> {
    const queuedOperation: QueuedOperation = {
      id: operationId,
      operation,
      operationName,
      timestamp: new Date(),
      retryCount: 0,
      maxRetries: options.maxRetries,
      priority: options.priority,
      preserveState: options.preserveState,
      stateData: options.stateData
    };

    this.offlineQueue.set(operationId, queuedOperation);
    
    console.log(`Queued operation ${operationName} for retry when online (priority: ${options.priority})`);
  }

  /**
   * Process offline queue when connection is restored
   */
  async processOfflineQueue(): Promise<void> {
    if (this.offlineQueue.size === 0) {
      return;
    }

    console.log(`Processing ${this.offlineQueue.size} queued operations...`);

    // Sort by priority and timestamp
    const operations = Array.from(this.offlineQueue.values()).sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.timestamp.getTime() - b.timestamp.getTime();
    });

    for (const queuedOp of operations) {
      try {
        console.log(`Retrying queued operation: ${queuedOp.operationName}`);
        
        await queuedOp.operation();
        
        // Remove from queue on success
        this.offlineQueue.delete(queuedOp.id);
        
        // Clear preserved state
        if (queuedOp.preserveState) {
          await this.clearPreservedState(queuedOp.id);
        }
        
        console.log(`Successfully completed queued operation: ${queuedOp.operationName}`);
        
      } catch (error) {
        queuedOp.retryCount++;
        
        if (queuedOp.retryCount >= queuedOp.maxRetries) {
          console.error(`Queued operation ${queuedOp.operationName} failed after ${queuedOp.retryCount} retries`);
          this.offlineQueue.delete(queuedOp.id);
          
          // Keep state preserved for manual intervention
          if (queuedOp.preserveState) {
            console.log(`State preserved for failed queued operation: ${queuedOp.operationName}`);
          }
        } else {
          console.log(`Queued operation ${queuedOp.operationName} failed, will retry (${queuedOp.retryCount}/${queuedOp.maxRetries})`);
        }
      }
    }
  }

  /**
   * Preserve operation state for recovery
   */
  async preserveOperationState(
    operationId: string,
    operationName: string,
    operationData: any,
    context: {
      userId?: string;
      conversationId?: string;
    }
  ): Promise<void> {
    const preservation: NetworkStatePreservation = {
      operationId,
      operationName,
      operationData,
      timestamp: new Date(),
      userId: context.userId,
      conversationId: context.conversationId,
      retryCount: 0
    };

    this.preservedStates.set(operationId, preservation);
    
    console.log(`Preserved state for operation ${operationName} (ID: ${operationId})`);

    // Set expiration (clean up after 2 hours)
    setTimeout(() => {
      this.preservedStates.delete(operationId);
      console.log(`Expired preserved state for operation ${operationId}`);
    }, 2 * 60 * 60 * 1000);
  }

  /**
   * Retrieve preserved operation state
   */
  async getPreservedState(operationId: string): Promise<NetworkStatePreservation | null> {
    return this.preservedStates.get(operationId) || null;
  }

  /**
   * Clear preserved operation state
   */
  async clearPreservedState(operationId: string): Promise<void> {
    this.preservedStates.delete(operationId);
    console.log(`Cleared preserved state for operation ${operationId}`);
  }

  /**
   * Get all preserved states for a user
   */
  async getUserPreservedStates(userId: string): Promise<NetworkStatePreservation[]> {
    return Array.from(this.preservedStates.values())
      .filter(state => state.userId === userId);
  }

  /**
   * Start network monitoring
   */
  startNetworkMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    
    // Initial check
    this.checkNetworkStatus();
    
    // Periodic checks every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.checkNetworkStatus();
    }, 30000);

    console.log('Network monitoring started');
  }

  /**
   * Stop network monitoring
   */
  stopNetworkMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    this.isMonitoring = false;
    console.log('Network monitoring stopped');
  }

  /**
   * Check network status
   */
  async checkNetworkStatus(): Promise<NetworkStatus> {
    try {
      const startTime = Date.now();
      
      // Simple connectivity check (in production, use multiple endpoints)
      const response = await fetch('https://www.google.com/generate_204', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000)
      });
      
      const latency = Date.now() - startTime;
      const wasOffline = !this.networkStatus.isOnline;
      
      this.networkStatus = {
        isOnline: response.ok,
        connectionType: latency < 1000 ? 'fast' : 'slow',
        latency,
        lastCheck: new Date()
      };

      // If we just came back online, process queued operations
      if (wasOffline && this.networkStatus.isOnline) {
        console.log('Network connection restored, processing queued operations...');
        setTimeout(() => this.processOfflineQueue(), 1000);
      }

    } catch (error) {
      const wasOnline = this.networkStatus.isOnline;
      
      this.networkStatus = {
        isOnline: false,
        connectionType: 'offline',
        lastCheck: new Date()
      };

      if (wasOnline) {
        console.log('Network connection lost');
      }
    }

    return this.networkStatus;
  }

  /**
   * Get current network status
   */
  getNetworkStatus(): NetworkStatus {
    return { ...this.networkStatus };
  }

  /**
   * Get offline queue status
   */
  getOfflineQueueStatus(): {
    queueSize: number;
    operations: Array<{
      id: string;
      operationName: string;
      priority: string;
      timestamp: Date;
      retryCount: number;
    }>;
  } {
    const operations = Array.from(this.offlineQueue.values()).map(op => ({
      id: op.id,
      operationName: op.operationName,
      priority: op.priority,
      timestamp: op.timestamp,
      retryCount: op.retryCount
    }));

    return {
      queueSize: this.offlineQueue.size,
      operations
    };
  }

  /**
   * Get user-friendly network error message
   */
  getUserFriendlyMessage(error: NetworkError): string {
    return error.userFeedback;
  }

  /**
   * Get recovery options for user
   */
  getRecoveryOptions(error: NetworkError): string[] {
    return error.recoveryOptions;
  }

  /**
   * Update retry configuration
   */
  updateRetryConfig(config: Partial<NetworkRetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  /**
   * Get current configuration
   */
  getConfiguration(): {
    retry: NetworkRetryConfig;
    networkStatus: NetworkStatus;
    queueStatus: any;
  } {
    return {
      retry: { ...this.retryConfig },
      networkStatus: this.getNetworkStatus(),
      queueStatus: this.getOfflineQueueStatus()
    };
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup method for graceful shutdown
   */
  cleanup(): void {
    this.stopNetworkMonitoring();
    this.offlineQueue.clear();
    this.preservedStates.clear();
  }
}

// Export singleton instance
export const networkErrorHandler = new NetworkErrorHandler();