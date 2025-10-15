/**
 * Test suite for calendar error handling and user feedback
 * Requirements: 5.1, 5.2 - Test error handling and user feedback functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calendarErrorHandler, withCalendarErrorHandling } from '../errorHandlers/calendarErrorHandler.js';
import { userFeedbackService, FeedbackUtils } from '../userFeedbackService.js';
import type { User } from '../../shared/schema.js';

describe('Calendar Error Handling', () => {
  let mockUser: User;

  beforeEach(() => {
    mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token'
    } as User;
  });

  describe('CalendarErrorHandler', () => {
    it('should handle 401 authentication errors correctly', () => {
      const error = { code: 401, message: 'Unauthorized' };
      const result = calendarErrorHandler.handleError(error, 'testOperation', mockUser);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('401');
      expect(result.error?.retryable).toBe(false);
      expect(result.error?.suggestedAction).toContain('Re-authenticate');
    });

    it('should handle 429 rate limiting errors with retry', () => {
      const error = { code: 429, message: 'Too Many Requests' };
      const result = calendarErrorHandler.handleError(error, 'testOperation', mockUser);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('429');
      expect(result.error?.retryable).toBe(true);
      expect(result.shouldRetry).toBe(true);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should handle network errors with retry', () => {
      const error = { message: 'connection timeout', code: 'ETIMEDOUT' };
      const result = calendarErrorHandler.handleError(error, 'testOperation', mockUser);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
      expect(result.error?.retryable).toBe(true);
    });

    it('should provide fallback behavior for availability check', () => {
      const error = { code: 500, message: 'Internal Server Error' };
      const fallback = calendarErrorHandler.getFallbackBehavior('checkAvailability', error);

      expect(fallback.isAvailable).toBe(true);
      expect(fallback.conflicts).toEqual([]);
      expect(fallback.fallbackMode).toBe(true);
      expect(fallback.message).toContain('Calendar availability check unavailable');
    });

    it('should execute operations with retry logic', async () => {
      let attempts = 0;
      const mockOperation = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw { code: 500, message: 'Server Error' };
        }
        return 'success';
      });

      // Use a custom error handler with faster retry for testing
      const testErrorHandler = new (calendarErrorHandler.constructor as any)({
        maxRetries: 2,
        baseDelay: 10, // Much faster for testing
        maxDelay: 100,
        backoffMultiplier: 1.5
      });

      const result = await testErrorHandler.executeWithRetry(
        mockOperation,
        'testOperation',
        mockUser
      );

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    }, 10000);

    it('should fail after max retries', async () => {
      const mockOperation = vi.fn().mockImplementation(() => {
        throw { code: 500, message: 'Persistent Server Error' };
      });

      // Use a custom error handler with faster retry for testing
      const testErrorHandler = new (calendarErrorHandler.constructor as any)({
        maxRetries: 2,
        baseDelay: 10, // Much faster for testing
        maxDelay: 100,
        backoffMultiplier: 1.5
      });

      await expect(
        testErrorHandler.executeWithRetry(mockOperation, 'testOperation', mockUser)
      ).rejects.toThrow('Persistent Server Error');

      expect(mockOperation).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    }, 10000);
  });

  describe('withCalendarErrorHandling wrapper', () => {
    it('should handle successful operations', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');
      
      const result = await withCalendarErrorHandling(
        mockOperation,
        'testOperation',
        mockUser,
        false
      );

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledOnce();
    });

    it('should provide fallback for failed operations when enabled', async () => {
      const mockOperation = vi.fn().mockRejectedValue({ code: 401, message: 'Unauthorized' });
      
      const result = await withCalendarErrorHandling(
        mockOperation,
        'checkAvailability',
        mockUser,
        true
      );

      expect(result.fallbackMode).toBe(true);
      expect(result.isAvailable).toBe(true);
    }, 10000);

    it('should throw error when fallback is disabled', async () => {
      const mockOperation = vi.fn().mockRejectedValue({ code: 401, message: 'Unauthorized' });
      
      await expect(
        withCalendarErrorHandling(mockOperation, 'testOperation', mockUser, false)
      ).rejects.toThrow('Unauthorized');
    });
  });
});

describe('User Feedback Service', () => {
  describe('Progress Indicators', () => {
    it('should create progress indicator for workflow steps', () => {
      const progress = userFeedbackService.createProgressIndicator('time_date_collection');

      expect(progress.currentStep).toBe('time_date_collection');
      expect(progress.stepName).toBe('Time & Date');
      expect(progress.stepDescription).toBe('Collecting meeting schedule');
      expect(progress.progress).toBeGreaterThan(0);
      expect(progress.progress).toBeLessThanOrEqual(100);
    });

    it('should calculate correct progress percentage', () => {
      const earlyStep = userFeedbackService.createProgressIndicator('intent_detection');
      const lateStep = userFeedbackService.createProgressIndicator('creation');

      expect(earlyStep.progress).toBeLessThan(lateStep.progress);
    });
  });

  describe('Step Transition Messages', () => {
    it('should create appropriate transition messages', () => {
      const message = userFeedbackService.createStepTransitionMessage(
        'intent_detection',
        'calendar_access_verification'
      );

      expect(message.type).toBe('progress');
      expect(message.title).toContain('Calendar Access');
      expect(message.message).toContain('Checking your calendar access');
      expect(message.progressIndicator).toBeDefined();
    });

    it('should provide context-specific messages for different steps', () => {
      const timeMessage = userFeedbackService.createStepTransitionMessage(
        'meeting_type_selection',
        'time_date_collection'
      );

      expect(timeMessage.message).toContain('establish when you\'d like to meet');
      expect(timeMessage.details).toContain('We\'ll collect the date and time first');
    });
  });

  describe('Calendar Access Feedback', () => {
    it('should create success feedback for valid access', () => {
      const accessStatus = {
        hasAccess: true,
        tokenValid: true,
        needsRefresh: false,
        scopes: ['calendar']
      };

      const feedback = userFeedbackService.createCalendarAccessFeedback(accessStatus);

      expect(feedback.type).toBe('success');
      expect(feedback.title).toBe('Calendar Access Verified');
      expect(feedback.message).toContain('connected and ready');
    });

    it('should create warning feedback for refresh needed', () => {
      const accessStatus = {
        hasAccess: false,
        tokenValid: false,
        needsRefresh: true,
        scopes: []
      };

      const feedback = userFeedbackService.createCalendarAccessFeedback(accessStatus);

      expect(feedback.type).toBe('warning');
      expect(feedback.title).toBe('Calendar Access Needs Refresh');
      expect(feedback.actionRequired).toBe(true);
    });

    it('should create error feedback for missing access', () => {
      const accessStatus = {
        hasAccess: false,
        tokenValid: false,
        needsRefresh: false,
        scopes: [],
        error: 'No access token found'
      };

      const feedback = userFeedbackService.createCalendarAccessFeedback(accessStatus);

      expect(feedback.type).toBe('error');
      expect(feedback.title).toBe('Calendar Access Required');
      expect(feedback.actionRequired).toBe(true);
      expect(feedback.details).toContain('No access token found');
    });
  });

  describe('Availability Feedback', () => {
    it('should create success feedback for available time slots', () => {
      const availabilityResult = {
        isAvailable: true,
        conflicts: [],
        suggestedAlternatives: []
      };

      const requestedTime = {
        start: new Date('2024-01-15T10:00:00Z'),
        end: new Date('2024-01-15T11:00:00Z')
      };

      const feedback = userFeedbackService.createAvailabilityFeedback(
        availabilityResult,
        requestedTime
      );

      expect(feedback.type).toBe('success');
      expect(feedback.title).toBe('Time Slot Available');
      expect(feedback.message).toContain('available');
    });

    it('should create warning feedback for conflicts', () => {
      const availabilityResult = {
        isAvailable: false,
        conflicts: [
          {
            id: '1',
            title: 'Existing Meeting',
            startTime: new Date('2024-01-15T10:30:00Z'),
            endTime: new Date('2024-01-15T11:30:00Z'),
            status: 'confirmed'
          }
        ],
        suggestedAlternatives: []
      };

      const requestedTime = {
        start: new Date('2024-01-15T10:00:00Z'),
        end: new Date('2024-01-15T11:00:00Z')
      };

      const feedback = userFeedbackService.createAvailabilityFeedback(
        availabilityResult,
        requestedTime
      );

      expect(feedback.type).toBe('warning');
      expect(feedback.title).toBe('Scheduling Conflicts Found');
      expect(feedback.message).toContain('1 conflict');
      expect(feedback.actionRequired).toBe(true);
    });
  });

  describe('FeedbackUtils', () => {
    it('should provide convenient utility functions', () => {
      const errorFeedback = FeedbackUtils.error(
        new Error('Test error'),
        'calendar_access_verification'
      );

      expect(errorFeedback.type).toBe('error');
      expect(errorFeedback.actionRequired).toBe(true);

      const successFeedback = FeedbackUtils.success('Operation completed');
      expect(successFeedback.type).toBe('success');

      const warningFeedback = FeedbackUtils.warning('Warning message');
      expect(warningFeedback.type).toBe('warning');
    });

    it('should handle missing info feedback', () => {
      const feedback = FeedbackUtils.missingInfo(
        ['title', 'startTime'],
        'meeting_details_collection'
      );

      expect(feedback.type).toBe('info');
      expect(feedback.title).toBe('Additional Information Needed');
      expect(feedback.actionRequired).toBe(true);
      expect(feedback.details).toHaveLength(2);
    });
  });
});