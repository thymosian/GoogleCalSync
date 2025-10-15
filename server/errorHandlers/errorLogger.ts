/**
 * Comprehensive Error Logger with structured logging, categorization, and analytics
 * Requirements: 7.3 - Implement structured error logging for debugging and monitoring
 */

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info'
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  NETWORK = 'network',
  API = 'api',
  DATABASE = 'database',
  VALIDATION = 'validation',
  BUSINESS_LOGIC = 'business_logic',
  WORKFLOW = 'workflow',
  CALENDAR = 'calendar',
  EMAIL = 'email',
  AI_SERVICE = 'ai_service',
  SYSTEM = 'system',
  USER_INPUT = 'user_input',
  UNKNOWN = 'unknown'
}

/**
 * Error context information
 */
export interface ErrorContext {
  userId?: string;
  conversationId?: string;
  workflowStep?: string;
  operationName?: string;
  requestId?: string;
  sessionId?: string;
  userAgent?: string;
  ipAddress?: string;
  timestamp: Date;
  environment: string;
  version?: string;
}

/**
 * Structured error log entry
 */
export interface ErrorLogEntry {
  id: string;
  timestamp: Date;
  severity: ErrorSeverity;
  category: ErrorCategory;
  errorType: string;
  message: string;
  stack?: string;
  context: ErrorContext;
  metadata: Record<string, any>;
  tags: string[];
  fingerprint: string; // For error grouping
  resolved: boolean;
  occurrenceCount: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
}

/**
 * Error analytics data
 */
export interface ErrorAnalytics {
  totalErrors: number;
  errorsBySeverity: Record<ErrorSeverity, number>;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsByType: Record<string, number>;
  topErrors: Array<{
    fingerprint: string;
    message: string;
    count: number;
    lastOccurrence: Date;
  }>;
  errorTrends: Array<{
    date: string;
    count: number;
    severity: ErrorSeverity;
  }>;
}

/**
 * Error reporting configuration
 */
export interface ErrorReportingConfig {
  enableConsoleLogging: boolean;
  enableFileLogging: boolean;
  enableRemoteLogging: boolean;
  logLevel: ErrorSeverity;
  maxLogFileSize: number;
  maxLogFiles: number;
  remoteEndpoint?: string;
  apiKey?: string;
  batchSize: number;
  flushInterval: number;
}

/**
 * Comprehensive Error Logger
 */
export class ErrorLogger {
  private config: ErrorReportingConfig = {
    enableConsoleLogging: true,
    enableFileLogging: true,
    enableRemoteLogging: false,
    logLevel: ErrorSeverity.INFO,
    maxLogFileSize: 10 * 1024 * 1024, // 10MB
    maxLogFiles: 5,
    batchSize: 100,
    flushInterval: 30000 // 30 seconds
  };

  // In-memory storage (in production, use database or external service)
  private errorLogs = new Map<string, ErrorLogEntry>();
  private errorCounts = new Map<string, number>();
  private logBatch: ErrorLogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(config?: Partial<ErrorReportingConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.startBatchFlushing();
  }

  /**
   * Log an error with full context and categorization
   */
  async logError(
    error: Error | any,
    context: Partial<ErrorContext>,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      const errorEntry = this.createErrorLogEntry(error, context, category, severity, metadata);
      
      // Store in memory (in production, use database)
      this.errorLogs.set(errorEntry.id, errorEntry);
      
      // Update occurrence count
      const existingCount = this.errorCounts.get(errorEntry.fingerprint) || 0;
      this.errorCounts.set(errorEntry.fingerprint, existingCount + 1);
      
      // Add to batch for remote logging
      this.logBatch.push(errorEntry);
      
      // Console logging if enabled
      if (this.config.enableConsoleLogging && this.shouldLog(severity)) {
        this.logToConsole(errorEntry);
      }
      
      // File logging if enabled
      if (this.config.enableFileLogging && this.shouldLog(severity)) {
        await this.logToFile(errorEntry);
      }
      
      // Trigger immediate flush for critical errors
      if (severity === ErrorSeverity.CRITICAL) {
        await this.flushBatch();
      }
      
    } catch (logError) {
      // Fallback logging to prevent infinite loops
      console.error('Error in error logging system:', logError);
      console.error('Original error:', error);
    }
  }

  /**
   * Create structured error log entry
   */
  private createErrorLogEntry(
    error: Error | any,
    context: Partial<ErrorContext>,
    category: ErrorCategory,
    severity: ErrorSeverity,
    metadata: Record<string, any>
  ): ErrorLogEntry {
    const timestamp = new Date();
    const errorType = error.constructor?.name || 'UnknownError';
    const message = error.message || String(error);
    const stack = error.stack;
    
    // Generate fingerprint for error grouping
    const fingerprint = this.generateFingerprint(errorType, message, stack);
    
    // Check if this is a recurring error
    const existingEntry = Array.from(this.errorLogs.values())
      .find(entry => entry.fingerprint === fingerprint);
    
    const isRecurring = !!existingEntry;
    const firstOccurrence = existingEntry?.firstOccurrence || timestamp;
    const occurrenceCount = (this.errorCounts.get(fingerprint) || 0) + 1;
    
    // Complete context with defaults
    const fullContext: ErrorContext = {
      timestamp,
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      ...context
    };
    
    // Generate tags for categorization
    const tags = this.generateTags(error, category, severity, fullContext);
    
    return {
      id: this.generateId(),
      timestamp,
      severity,
      category,
      errorType,
      message,
      stack,
      context: fullContext,
      metadata: {
        ...metadata,
        isRecurring,
        userAgent: fullContext.userAgent,
        ipAddress: fullContext.ipAddress
      },
      tags,
      fingerprint,
      resolved: false,
      occurrenceCount,
      firstOccurrence,
      lastOccurrence: timestamp
    };
  }

  /**
   * Generate error fingerprint for grouping similar errors
   */
  private generateFingerprint(errorType: string, message: string, stack?: string): string {
    // Use error type, message pattern, and stack trace location
    const messagePattern = message.replace(/\d+/g, 'N').replace(/['"]/g, '');
    const stackLocation = stack ? this.extractStackLocation(stack) : '';
    
    const fingerprint = `${errorType}:${messagePattern}:${stackLocation}`;
    return this.hashString(fingerprint);
  }

  /**
   * Extract relevant stack location for fingerprinting
   */
  private extractStackLocation(stack: string): string {
    const lines = stack.split('\n');
    // Find first non-node_modules line
    const relevantLine = lines.find(line => 
      line.includes('.ts') || line.includes('.js') && !line.includes('node_modules')
    );
    
    if (relevantLine) {
      // Extract file and line number
      const match = relevantLine.match(/([^/\\]+\.(ts|js)):(\d+)/);
      return match ? `${match[1]}:${match[3]}` : '';
    }
    
    return '';
  }

  /**
   * Generate hash for fingerprint
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Generate tags for error categorization
   */
  private generateTags(
    error: any,
    category: ErrorCategory,
    severity: ErrorSeverity,
    context: ErrorContext
  ): string[] {
    const tags: string[] = [
      `category:${category}`,
      `severity:${severity}`,
      `environment:${context.environment}`
    ];
    
    // Add context-based tags
    if (context.userId) tags.push(`user:${context.userId}`);
    if (context.workflowStep) tags.push(`workflow:${context.workflowStep}`);
    if (context.operationName) tags.push(`operation:${context.operationName}`);
    
    // Add error-type specific tags
    if (error.code) tags.push(`code:${error.code}`);
    if (error.status) tags.push(`status:${error.status}`);
    
    // Add network-related tags
    if (category === ErrorCategory.NETWORK) {
      if (error.code === 'ETIMEDOUT') tags.push('timeout');
      if (error.code === 'ECONNREFUSED') tags.push('connection-refused');
      if (error.code === 'ENOTFOUND') tags.push('dns-error');
    }
    
    // Add API-related tags
    if (category === ErrorCategory.API) {
      if (error.response?.status) {
        const status = error.response.status;
        if (status >= 400 && status < 500) tags.push('client-error');
        if (status >= 500) tags.push('server-error');
      }
    }
    
    return tags;
  }

  /**
   * Check if error should be logged based on severity level
   */
  private shouldLog(severity: ErrorSeverity): boolean {
    const severityLevels = {
      [ErrorSeverity.CRITICAL]: 5,
      [ErrorSeverity.HIGH]: 4,
      [ErrorSeverity.MEDIUM]: 3,
      [ErrorSeverity.LOW]: 2,
      [ErrorSeverity.INFO]: 1
    };
    
    return severityLevels[severity] >= severityLevels[this.config.logLevel];
  }

  /**
   * Log to console with formatting
   */
  private logToConsole(entry: ErrorLogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const prefix = `[${timestamp}] [${entry.severity.toUpperCase()}] [${entry.category}]`;
    
    switch (entry.severity) {
      case ErrorSeverity.CRITICAL:
        console.error(`🚨 ${prefix} ${entry.message}`, {
          id: entry.id,
          context: entry.context,
          metadata: entry.metadata,
          stack: entry.stack
        });
        break;
        
      case ErrorSeverity.HIGH:
        console.error(`❌ ${prefix} ${entry.message}`, {
          id: entry.id,
          context: entry.context,
          metadata: entry.metadata
        });
        break;
        
      case ErrorSeverity.MEDIUM:
        console.warn(`⚠️ ${prefix} ${entry.message}`, {
          id: entry.id,
          context: entry.context
        });
        break;
        
      case ErrorSeverity.LOW:
        console.log(`ℹ️ ${prefix} ${entry.message}`, {
          id: entry.id
        });
        break;
        
      case ErrorSeverity.INFO:
        console.info(`📝 ${prefix} ${entry.message}`);
        break;
    }
  }

  /**
   * Log to file (simplified implementation)
   */
  private async logToFile(entry: ErrorLogEntry): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const logDir = path.join(process.cwd(), 'logs');
      const logFile = path.join(logDir, `error-${new Date().toISOString().split('T')[0]}.log`);
      
      // Ensure log directory exists
      try {
        await fs.mkdir(logDir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }
      
      const logLine = JSON.stringify({
        timestamp: entry.timestamp.toISOString(),
        id: entry.id,
        severity: entry.severity,
        category: entry.category,
        errorType: entry.errorType,
        message: entry.message,
        context: entry.context,
        metadata: entry.metadata,
        tags: entry.tags,
        fingerprint: entry.fingerprint
      }) + '\n';
      
      await fs.appendFile(logFile, logLine);
      
    } catch (fileError) {
      console.error('Failed to write to log file:', fileError);
    }
  }

  /**
   * Start batch flushing for remote logging
   */
  private startBatchFlushing(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    this.flushTimer = setInterval(() => {
      if (this.logBatch.length > 0) {
        this.flushBatch().catch(error => {
          console.error('Error flushing log batch:', error);
        });
      }
    }, this.config.flushInterval);
  }

  /**
   * Flush batch to remote logging service
   */
  private async flushBatch(): Promise<void> {
    if (this.logBatch.length === 0 || !this.config.enableRemoteLogging) {
      return;
    }
    
    const batch = [...this.logBatch];
    this.logBatch = [];
    
    try {
      if (this.config.remoteEndpoint && this.config.apiKey) {
        const response = await fetch(this.config.remoteEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify({
            logs: batch,
            source: 'conversational-meeting-scheduler',
            environment: process.env.NODE_ENV || 'development'
          })
        });
        
        if (!response.ok) {
          throw new Error(`Remote logging failed: ${response.status} ${response.statusText}`);
        }
        
        console.log(`Flushed ${batch.length} error logs to remote service`);
      }
    } catch (error) {
      console.error('Failed to flush logs to remote service:', error);
      // Re-add to batch for retry
      this.logBatch.unshift(...batch);
    }
  }

  /**
   * Generate unique ID for error entries
   */
  private generateId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get error analytics and statistics
   */
  getAnalytics(timeRange?: { start: Date; end: Date }): ErrorAnalytics {
    const logs = Array.from(this.errorLogs.values());
    const filteredLogs = timeRange 
      ? logs.filter(log => log.timestamp >= timeRange.start && log.timestamp <= timeRange.end)
      : logs;
    
    // Calculate statistics
    const totalErrors = filteredLogs.length;
    
    const errorsBySeverity = filteredLogs.reduce((acc, log) => {
      acc[log.severity] = (acc[log.severity] || 0) + 1;
      return acc;
    }, {} as Record<ErrorSeverity, number>);
    
    const errorsByCategory = filteredLogs.reduce((acc, log) => {
      acc[log.category] = (acc[log.category] || 0) + 1;
      return acc;
    }, {} as Record<ErrorCategory, number>);
    
    const errorsByType = filteredLogs.reduce((acc, log) => {
      acc[log.errorType] = (acc[log.errorType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Get top errors by occurrence count
    const errorGroups = new Map<string, { message: string; count: number; lastOccurrence: Date }>();
    filteredLogs.forEach(log => {
      const existing = errorGroups.get(log.fingerprint);
      if (existing) {
        existing.count += 1;
        if (log.timestamp > existing.lastOccurrence) {
          existing.lastOccurrence = log.timestamp;
        }
      } else {
        errorGroups.set(log.fingerprint, {
          message: log.message,
          count: 1,
          lastOccurrence: log.timestamp
        });
      }
    });
    
    const topErrors = Array.from(errorGroups.entries())
      .map(([fingerprint, data]) => ({
        fingerprint,
        message: data.message,
        count: data.count,
        lastOccurrence: data.lastOccurrence
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Generate error trends (daily counts)
    const trends = this.generateErrorTrends(filteredLogs);
    
    return {
      totalErrors,
      errorsBySeverity,
      errorsByCategory,
      errorsByType,
      topErrors,
      errorTrends: trends
    };
  }

  /**
   * Generate error trends over time
   */
  private generateErrorTrends(logs: ErrorLogEntry[]): Array<{
    date: string;
    count: number;
    severity: ErrorSeverity;
  }> {
    const trends = new Map<string, Map<ErrorSeverity, number>>();
    
    logs.forEach(log => {
      const date = log.timestamp.toISOString().split('T')[0];
      
      if (!trends.has(date)) {
        trends.set(date, new Map());
      }
      
      const dayTrends = trends.get(date)!;
      dayTrends.set(log.severity, (dayTrends.get(log.severity) || 0) + 1);
    });
    
    const result: Array<{ date: string; count: number; severity: ErrorSeverity }> = [];
    
    trends.forEach((severityMap, date) => {
      severityMap.forEach((count, severity) => {
        result.push({ date, count, severity });
      });
    });
    
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Search errors by criteria
   */
  searchErrors(criteria: {
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    userId?: string;
    timeRange?: { start: Date; end: Date };
    message?: string;
    tags?: string[];
  }): ErrorLogEntry[] {
    const logs = Array.from(this.errorLogs.values());
    
    return logs.filter(log => {
      if (criteria.severity && log.severity !== criteria.severity) return false;
      if (criteria.category && log.category !== criteria.category) return false;
      if (criteria.userId && log.context.userId !== criteria.userId) return false;
      if (criteria.timeRange) {
        if (log.timestamp < criteria.timeRange.start || log.timestamp > criteria.timeRange.end) {
          return false;
        }
      }
      if (criteria.message && !log.message.toLowerCase().includes(criteria.message.toLowerCase())) {
        return false;
      }
      if (criteria.tags && !criteria.tags.every(tag => log.tags.includes(tag))) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * Mark error as resolved
   */
  markErrorResolved(errorId: string, resolvedBy?: string): boolean {
    const error = this.errorLogs.get(errorId);
    if (error) {
      error.resolved = true;
      error.metadata.resolvedBy = resolvedBy;
      error.metadata.resolvedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  /**
   * Get error by ID
   */
  getError(errorId: string): ErrorLogEntry | null {
    return this.errorLogs.get(errorId) || null;
  }

  /**
   * Clear old logs (cleanup)
   */
  clearOldLogs(olderThan: Date): number {
    let cleared = 0;
    
    for (const [id, log] of this.errorLogs.entries()) {
      if (log.timestamp < olderThan) {
        this.errorLogs.delete(id);
        cleared++;
      }
    }
    
    return cleared;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ErrorReportingConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart batch flushing if interval changed
    if (config.flushInterval) {
      this.startBatchFlushing();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ErrorReportingConfig {
    return { ...this.config };
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async cleanup(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    // Flush remaining logs
    await this.flushBatch();
    
    // Clear in-memory storage
    this.errorLogs.clear();
    this.errorCounts.clear();
    this.logBatch = [];
  }
}

// Export singleton instance
export const errorLogger = new ErrorLogger();

// Export convenience functions for common error logging patterns
export async function logError(
  error: Error | any,
  context: Partial<ErrorContext> = {},
  category: ErrorCategory = ErrorCategory.UNKNOWN,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
  metadata: Record<string, any> = {}
): Promise<void> {
  return errorLogger.logError(error, context, category, severity, metadata);
}

export async function logCriticalError(
  error: Error | any,
  context: Partial<ErrorContext> = {},
  category: ErrorCategory = ErrorCategory.UNKNOWN,
  metadata: Record<string, any> = {}
): Promise<void> {
  return errorLogger.logError(error, context, category, ErrorSeverity.CRITICAL, metadata);
}

export async function logNetworkError(
  error: Error | any,
  context: Partial<ErrorContext> = {},
  metadata: Record<string, any> = {}
): Promise<void> {
  return errorLogger.logError(error, context, ErrorCategory.NETWORK, ErrorSeverity.HIGH, metadata);
}

export async function logAPIError(
  error: Error | any,
  context: Partial<ErrorContext> = {},
  metadata: Record<string, any> = {}
): Promise<void> {
  return errorLogger.logError(error, context, ErrorCategory.API, ErrorSeverity.HIGH, metadata);
}

export async function logWorkflowError(
  error: Error | any,
  context: Partial<ErrorContext> = {},
  metadata: Record<string, any> = {}
): Promise<void> {
  return errorLogger.logError(error, context, ErrorCategory.WORKFLOW, ErrorSeverity.MEDIUM, metadata);
}

export async function logAuthenticationError(
  error: Error | any,
  context: Partial<ErrorContext> = {},
  metadata: Record<string, any> = {}
): Promise<void> {
  return errorLogger.logError(error, context, ErrorCategory.AUTHENTICATION, ErrorSeverity.HIGH, metadata);
}

export async function logValidationError(
  error: Error | any,
  context: Partial<ErrorContext> = {},
  metadata: Record<string, any> = {}
): Promise<void> {
  return errorLogger.logError(error, context, ErrorCategory.VALIDATION, ErrorSeverity.LOW, metadata);
}

export async function logBusinessLogicError(
  error: Error | any,
  context: Partial<ErrorContext> = {},
  metadata: Record<string, any> = {}
): Promise<void> {
  return errorLogger.logError(error, context, ErrorCategory.BUSINESS_LOGIC, ErrorSeverity.MEDIUM, metadata);
}

// Export utility functions for error analytics
export function getErrorAnalytics(timeRange?: { start: Date; end: Date }): ErrorAnalytics {
  return errorLogger.getAnalytics(timeRange);
}

export function searchErrors(criteria: {
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  userId?: string;
  timeRange?: { start: Date; end: Date };
  message?: string;
  tags?: string[];
}): ErrorLogEntry[] {
  return errorLogger.searchErrors(criteria);
}

export function markErrorResolved(errorId: string, resolvedBy?: string): boolean {
  return errorLogger.markErrorResolved(errorId, resolvedBy);
}

// Export error context helper
export function createErrorContext(
  userId?: string,
  conversationId?: string,
  workflowStep?: string,
  operationName?: string,
  requestId?: string,
  sessionId?: string,
  userAgent?: string,
  ipAddress?: string
): Partial<ErrorContext> {
  return {
    userId,
    conversationId,
    workflowStep,
    operationName,
    requestId,
    sessionId,
    userAgent,
    ipAddress,
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  };
}

// Export error categorization helper
export function categorizeError(error: any): ErrorCategory {
  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code?.toLowerCase() || '';
  
  // Network errors (check before other categories)
  if (errorCode.includes('enotfound') || errorCode.includes('econnrefused') || 
      errorCode.includes('etimedout') || errorMessage.includes('network') ||
      errorMessage.includes('dns resolution')) {
    return ErrorCategory.NETWORK;
  }
  
  // Calendar errors (check before API errors)
  if (errorMessage.includes('calendar') || errorMessage.includes('google calendar')) {
    return ErrorCategory.CALENDAR;
  }
  
  // Workflow errors (check before AI service errors)
  if (errorMessage.includes('workflow') || errorMessage.includes('orchestrator')) {
    return ErrorCategory.WORKFLOW;
  }
  
  // Authentication errors
  if (error.status === 401 || errorMessage.includes('unauthorized') || 
      errorMessage.includes('authentication') || errorMessage.includes('token')) {
    return ErrorCategory.AUTHENTICATION;
  }
  
  // Database errors
  if (errorMessage.includes('database') || errorMessage.includes('sql') || 
      errorMessage.includes('connection') && errorMessage.includes('db')) {
    return ErrorCategory.DATABASE;
  }
  
  // Validation errors
  if (errorMessage.includes('validation') || errorMessage.includes('invalid') || 
      errorMessage.includes('required') || error.name === 'ValidationError') {
    return ErrorCategory.VALIDATION;
  }
  
  // Email errors
  if (errorMessage.includes('email') || errorMessage.includes('smtp') || 
      errorMessage.includes('mail')) {
    return ErrorCategory.EMAIL;
  }
  
  // AI service errors
  if (errorMessage.includes('gemini') || errorMessage.includes('ai model') || 
      errorMessage.includes('ai service') || errorMessage.includes('generation') ||
      (errorMessage.includes('model') && errorMessage.includes('unavailable'))) {
    return ErrorCategory.AI_SERVICE;
  }
  
  // API errors (check after more specific categories)
  if (error.response || error.status || errorMessage.includes('api')) {
    return ErrorCategory.API;
  }
  
  // Business logic errors
  if (errorMessage.includes('business') || errorMessage.includes('rule') || 
      errorMessage.includes('policy')) {
    return ErrorCategory.BUSINESS_LOGIC;
  }
  
  // User input errors
  if (errorMessage.includes('user') && (errorMessage.includes('input') || 
      errorMessage.includes('data'))) {
    return ErrorCategory.USER_INPUT;
  }
  
  return ErrorCategory.UNKNOWN;
}

// Export severity determination helper
export function determineSeverity(error: any): ErrorSeverity {
  const errorMessage = error.message?.toLowerCase() || '';
  
  // Critical errors
  if (errorMessage.includes('critical') || errorMessage.includes('fatal') || 
      errorMessage.includes('crash') || error.name === 'FatalError') {
    return ErrorSeverity.CRITICAL;
  }
  
  // High severity errors
  if (error.status === 500 || error.status === 503 || 
      errorMessage.includes('service unavailable') || 
      errorMessage.includes('authentication failed') ||
      errorMessage.includes('database connection')) {
    return ErrorSeverity.HIGH;
  }
  
  // Low severity errors
  if (error.status === 400 || error.status === 404 || 
      errorMessage.includes('validation') || 
      errorMessage.includes('not found') ||
      error.name === 'ValidationError') {
    return ErrorSeverity.LOW;
  }
  
  // Info level
  if (errorMessage.includes('info') || errorMessage.includes('notice')) {
    return ErrorSeverity.INFO;
  }
  
  // Default to medium
  return ErrorSeverity.MEDIUM;
}