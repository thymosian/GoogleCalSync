/**
 * Test suite for comprehensive error logging system
 * Requirements: 7.3 - Implement structured error logging for debugging and monitoring
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  errorLogger, 
  ErrorSeverity, 
  ErrorCategory, 
  logError, 
  logCriticalError,
  getErrorAnalytics,
  searchErrors,
  createErrorContext
} from '../errorLogger.js';
import { errorAnalyticsService } from '../errorAnalyticsService.js';
import { ErrorLoggingIntegration } from '../errorLoggingIntegration.js';

describe('Error Logging System', () => {
  beforeEach(() => {
    // Clear any existing logs before each test
    errorLogger.clearOldLogs(new Date());
  });

  afterEach(() => {
    // Clean up after each test
    errorLogger.clearOldLogs(new Date());
  });

  describe('Basic Error Logging', () => {
    it('should log a basic error with context', async () => {
      const testError = new Error('Test error message');
      const context = createErrorContext(
        'user123',
        'conv456',
        'test_step',
        'test_operation'
      );

      await logError(testError, context, ErrorCategory.WORKFLOW, ErrorSeverity.MEDIUM);

      const analytics = getErrorAnalytics();
      expect(analytics.totalErrors).toBe(1);
      expect(analytics.errorsByCategory[ErrorCategory.WORKFLOW]).toBe(1);
      expect(analytics.errorsBySeverity[ErrorSeverity.MEDIUM]).toBe(1);
    });

    it('should log critical errors with high priority', async () => {
      const criticalError = new Error('Critical system failure');
      const context = createErrorContext('user123', undefined, undefined, 'critical_operation');

      await logCriticalError(criticalError, context, ErrorCategory.SYSTEM);

      const analytics = getErrorAnalytics();
      expect(analytics.totalErrors).toBe(1);
      expect(analytics.errorsBySeverity[ErrorSeverity.CRITICAL]).toBe(1);
    });

    it('should generate unique fingerprints for similar errors', async () => {
      const error1 = new Error('Database connection failed');
      const error2 = new Error('Database connection failed');
      const context = createErrorContext('user123');

      await logError(error1, context, ErrorCategory.DATABASE, ErrorSeverity.HIGH);
      await logError(error2, context, ErrorCategory.DATABASE, ErrorSeverity.HIGH);

      const analytics = getErrorAnalytics();
      expect(analytics.totalErrors).toBe(2);
      
      // Should group similar errors
      const topErrors = analytics.topErrors;
      expect(topErrors.length).toBe(1);
      expect(topErrors[0].count).toBe(2);
    });
  });

  describe('Error Search and Filtering', () => {
    beforeEach(async () => {
      // Set up test data
      await logError(new Error('Network timeout'), createErrorContext('user1'), ErrorCategory.NETWORK, ErrorSeverity.HIGH);
      await logError(new Error('Validation failed'), createErrorContext('user2'), ErrorCategory.VALIDATION, ErrorSeverity.LOW);
      await logError(new Error('API rate limit'), createErrorContext('user1'), ErrorCategory.API, ErrorSeverity.MEDIUM);
    });

    it('should search errors by severity', () => {
      const highSeverityErrors = searchErrors({ severity: ErrorSeverity.HIGH });
      expect(highSeverityErrors.length).toBe(1);
      expect(highSeverityErrors[0].message).toBe('Network timeout');
    });

    it('should search errors by category', () => {
      const networkErrors = searchErrors({ category: ErrorCategory.NETWORK });
      expect(networkErrors.length).toBe(1);
      expect(networkErrors[0].category).toBe(ErrorCategory.NETWORK);
    });

    it('should search errors by user ID', () => {
      const user1Errors = searchErrors({ userId: 'user1' });
      expect(user1Errors.length).toBe(2);
      
      const user2Errors = searchErrors({ userId: 'user2' });
      expect(user2Errors.length).toBe(1);
    });

    it('should search errors by time range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      const recentErrors = searchErrors({
        timeRange: { start: oneHourAgo, end: now }
      });
      
      expect(recentErrors.length).toBe(3); // All test errors should be recent
    });
  });

  describe('Error Analytics', () => {
    beforeEach(async () => {
      // Set up test data with various error types
      await logError(new Error('Critical failure'), createErrorContext('user1'), ErrorCategory.SYSTEM, ErrorSeverity.CRITICAL);
      await logError(new Error('Network issue'), createErrorContext('user1'), ErrorCategory.NETWORK, ErrorSeverity.HIGH);
      await logError(new Error('Network issue'), createErrorContext('user2'), ErrorCategory.NETWORK, ErrorSeverity.HIGH);
      await logError(new Error('Validation error'), createErrorContext('user1'), ErrorCategory.VALIDATION, ErrorSeverity.LOW);
    });

    it('should generate comprehensive analytics', () => {
      const analytics = getErrorAnalytics();
      
      expect(analytics.totalErrors).toBe(4);
      expect(analytics.errorsBySeverity[ErrorSeverity.CRITICAL]).toBe(1);
      expect(analytics.errorsBySeverity[ErrorSeverity.HIGH]).toBe(2);
      expect(analytics.errorsBySeverity[ErrorSeverity.LOW]).toBe(1);
      expect(analytics.errorsByCategory[ErrorCategory.NETWORK]).toBe(2);
      expect(analytics.errorsByCategory[ErrorCategory.SYSTEM]).toBe(1);
      expect(analytics.errorsByCategory[ErrorCategory.VALIDATION]).toBe(1);
    });

    it('should identify top errors by occurrence', () => {
      const analytics = getErrorAnalytics();
      const topErrors = analytics.topErrors;
      
      expect(topErrors.length).toBeGreaterThan(0);
      expect(topErrors[0].count).toBe(2); // Network issue appears twice
      expect(topErrors[0].message).toBe('Network issue');
    });
  });

  describe('Error Analytics Service', () => {
    it('should calculate system health metrics', async () => {
      // Add some test errors
      await logError(new Error('Critical error'), createErrorContext(), ErrorCategory.SYSTEM, ErrorSeverity.CRITICAL);
      await logError(new Error('High error'), createErrorContext(), ErrorCategory.API, ErrorSeverity.HIGH);
      
      const metrics = await errorAnalyticsService.getErrorMetrics(1);
      
      expect(metrics.systemHealth).toBeDefined();
      expect(['healthy', 'degraded', 'critical']).toContain(metrics.systemHealth.status);
      expect(metrics.systemHealth.score).toBeGreaterThanOrEqual(0);
      expect(metrics.systemHealth.score).toBeLessThanOrEqual(100);
      expect(metrics.systemHealth.issues).toBeInstanceOf(Array);
    });

    it('should generate dashboard statistics', async () => {
      const dashboardStats = await errorAnalyticsService.getDashboardStats();
      
      expect(dashboardStats.last24Hours).toBeDefined();
      expect(dashboardStats.last7Days).toBeDefined();
      expect(dashboardStats.currentMetrics).toBeDefined();
      expect(dashboardStats.alerts).toBeInstanceOf(Array);
    });
  });

  describe('Error Logging Integration', () => {
    it('should automatically categorize errors', async () => {
      const networkError = new Error('ENOTFOUND: DNS resolution failed');
      const authError = new Error('Unauthorized access');
      const validationError = new Error('Validation failed: required field missing');

      await ErrorLoggingIntegration.logErrorWithContext(networkError, { userId: 'user1' });
      await ErrorLoggingIntegration.logErrorWithContext(authError, { userId: 'user1' });
      await ErrorLoggingIntegration.logErrorWithContext(validationError, { userId: 'user1' });

      const analytics = getErrorAnalytics();
      expect(analytics.errorsByCategory[ErrorCategory.NETWORK]).toBe(1);
      expect(analytics.errorsByCategory[ErrorCategory.AUTHENTICATION]).toBe(1);
      expect(analytics.errorsByCategory[ErrorCategory.VALIDATION]).toBe(1);
    });

    it('should log API errors with enhanced context', async () => {
      const apiError = new Error('API request failed') as any;
      apiError.status = 500;

      await ErrorLoggingIntegration.logAPIError(apiError, {
        endpoint: '/api/test',
        method: 'POST',
        statusCode: 500,
        responseTime: 1500,
        userId: 'user1'
      });

      const errors = searchErrors({ category: ErrorCategory.API });
      expect(errors.length).toBe(1);
      expect(errors[0].metadata.endpoint).toBe('/api/test');
      expect(errors[0].metadata.method).toBe('POST');
      expect(errors[0].metadata.statusCode).toBe(500);
      expect(errors[0].metadata.isServerError).toBe(true);
    });

    it('should log workflow errors with workflow context', async () => {
      const workflowError = new Error('Workflow step failed');
      const workflowState = { currentStep: 'attendee_collection', progress: 0.5 };

      await ErrorLoggingIntegration.logWorkflowError(workflowError, {
        workflowStep: 'attendee_collection',
        workflowState,
        userId: 'user1',
        conversationId: 'conv123',
        meetingId: 'meeting456'
      });

      const errors = searchErrors({ category: ErrorCategory.WORKFLOW });
      expect(errors.length).toBe(1);
      expect(errors[0].context.workflowStep).toBe('attendee_collection');
      expect(errors[0].metadata.meetingId).toBe('meeting456');
      expect(errors[0].metadata.hasWorkflowState).toBe(true);
    });
  });

  describe('Error Resolution', () => {
    it('should mark errors as resolved', async () => {
      const testError = new Error('Test error for resolution');
      await logError(testError, createErrorContext('user1'), ErrorCategory.SYSTEM, ErrorSeverity.MEDIUM);

      const errors = searchErrors({});
      expect(errors.length).toBe(1);
      
      const errorId = errors[0].id;
      const resolved = errorLogger.markErrorResolved(errorId, 'admin@example.com');
      
      expect(resolved).toBe(true);
      
      const resolvedError = errorLogger.getError(errorId);
      expect(resolvedError?.resolved).toBe(true);
      expect(resolvedError?.metadata.resolvedBy).toBe('admin@example.com');
    });
  });

  describe('Error Cleanup', () => {
    it('should clear old logs', async () => {
      // Add some test errors
      await logError(new Error('Old error'), createErrorContext(), ErrorCategory.SYSTEM, ErrorSeverity.LOW);
      
      const analytics = getErrorAnalytics();
      expect(analytics.totalErrors).toBe(1);
      
      // Clear all logs (using current time as cutoff)
      const clearedCount = errorLogger.clearOldLogs(new Date());
      expect(clearedCount).toBe(1);
      
      const analyticsAfterClear = getErrorAnalytics();
      expect(analyticsAfterClear.totalErrors).toBe(0);
    });
  });
});