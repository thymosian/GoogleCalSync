import { describe, it, expect, beforeEach } from 'vitest';
import { BusinessRulesEngine, VALIDATION_RULES, ERROR_MESSAGES, WARNING_MESSAGES } from '../businessRules.js';
import { MeetingData, AttendeeData } from '../../shared/schema.js';

describe('BusinessRulesEngine', () => {
  let rulesEngine: BusinessRulesEngine;

  beforeEach(() => {
    rulesEngine = new BusinessRulesEngine();
  });

  describe('validateMeetingType', () => {
    it('should require attendees for online meetings', () => {
      const result = rulesEngine.validateMeetingType('online', { attendees: [] });
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.ONLINE_MEETING_NO_ATTENDEES);
    });

    it('should pass validation for online meetings with attendees', () => {
      const attendees: AttendeeData[] = [
        { email: 'test@gmail.com', isValidated: true, isRequired: true }
      ];
      const result = rulesEngine.validateMeetingType('online', { attendees });
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require location for physical meetings', () => {
      const result = rulesEngine.validateMeetingType('physical', { location: '' });
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.PHYSICAL_MEETING_NO_LOCATION);
    });

    it('should pass validation for physical meetings with location', () => {
      const result = rulesEngine.validateMeetingType('physical', { location: 'Conference Room A' });
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('enforceAttendeeRequirement', () => {
    it('should require at least one attendee for online meetings', () => {
      const result = rulesEngine.enforceAttendeeRequirement('online', []);
      expect(result).toBe(false);
    });

    it('should allow online meetings with attendees', () => {
      const result = rulesEngine.enforceAttendeeRequirement('online', ['test@gmail.com']);
      expect(result).toBe(true);
    });

    it('should not require attendees for physical meetings', () => {
      const result = rulesEngine.enforceAttendeeRequirement('physical', []);
      expect(result).toBe(true);
    });
  });

  describe('validateTimeConstraints', () => {
    it('should reject meetings where end time is before start time', () => {
      const startTime = new Date('2024-12-01T10:00:00Z');
      const endTime = new Date('2024-12-01T09:00:00Z');
      
      const result = rulesEngine.validateTimeConstraints(startTime, endTime);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_TIME_RANGE);
    });

    it('should reject meetings that are too short', () => {
      const startTime = new Date('2024-12-01T10:00:00Z');
      const endTime = new Date('2024-12-01T10:10:00Z'); // 10 minutes
      
      const result = rulesEngine.validateTimeConstraints(startTime, endTime);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.MEETING_TOO_SHORT);
    });

    it('should reject meetings that are too long', () => {
      const startTime = new Date('2024-12-01T10:00:00Z');
      const endTime = new Date('2024-12-01T19:00:00Z'); // 9 hours
      
      const result = rulesEngine.validateTimeConstraints(startTime, endTime);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.MEETING_TOO_LONG);
    });

    it('should accept valid meeting duration', () => {
      const startTime = new Date('2025-12-01T10:00:00Z'); // Future date
      const endTime = new Date('2025-12-01T11:00:00Z'); // 1 hour
      
      const result = rulesEngine.validateTimeConstraints(startTime, endTime);
      
      expect(result.isValid).toBe(true);
    });

    it('should warn about meetings outside business hours', () => {
      const startTime = new Date('2025-12-01T06:00:00Z'); // 6 AM
      const endTime = new Date('2025-12-01T07:00:00Z'); // 7 AM
      
      const result = rulesEngine.validateTimeConstraints(startTime, endTime);
      
      expect(result.warnings).toContain(WARNING_MESSAGES.OUTSIDE_BUSINESS_HOURS);
    });

    it('should warn about weekend meetings', () => {
      const startTime = new Date('2025-12-06T10:00:00Z'); // Saturday
      const endTime = new Date('2025-12-06T11:00:00Z');
      
      const result = rulesEngine.validateTimeConstraints(startTime, endTime);
      
      expect(result.warnings).toContain(WARNING_MESSAGES.WEEKEND_MEETING);
    });
  });

  describe('validateEmailFormat', () => {
    it('should accept valid email formats', () => {
      expect(rulesEngine.validateEmailFormat('test@gmail.com')).toBe(true);
      expect(rulesEngine.validateEmailFormat('user.name@company.co.uk')).toBe(true);
      expect(rulesEngine.validateEmailFormat('test+tag@domain.org')).toBe(true);
    });

    it('should reject invalid email formats', () => {
      expect(rulesEngine.validateEmailFormat('invalid-email')).toBe(false);
      expect(rulesEngine.validateEmailFormat('test@')).toBe(false);
      expect(rulesEngine.validateEmailFormat('@domain.com')).toBe(false);
      expect(rulesEngine.validateEmailFormat('')).toBe(false);
    });
  });

  describe('validateGmailFormat', () => {
    it('should accept valid Gmail addresses', () => {
      expect(rulesEngine.validateGmailFormat('test@gmail.com')).toBe(true);
      expect(rulesEngine.validateGmailFormat('user.name@gmail.com')).toBe(true);
    });

    it('should reject non-Gmail addresses', () => {
      expect(rulesEngine.validateGmailFormat('test@yahoo.com')).toBe(false);
      expect(rulesEngine.validateGmailFormat('user@company.com')).toBe(false);
    });
  });

  describe('validateAttendees', () => {
    it('should reject duplicate attendees', () => {
      const attendees: AttendeeData[] = [
        { email: 'test@gmail.com', isValidated: true, isRequired: true },
        { email: 'test@gmail.com', isValidated: true, isRequired: true }
      ];
      
      const result = rulesEngine.validateAttendees(attendees);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes(ERROR_MESSAGES.DUPLICATE_ATTENDEES))).toBe(true);
    });

    it('should reject invalid email formats', () => {
      const attendees: AttendeeData[] = [
        { email: 'invalid-email', isValidated: false, isRequired: true }
      ];
      
      const result = rulesEngine.validateAttendees(attendees);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes(ERROR_MESSAGES.INVALID_EMAIL_FORMAT))).toBe(true);
    });

    it('should warn about many attendees', () => {
      const attendees: AttendeeData[] = Array.from({ length: 15 }, (_, i) => ({
        email: `user${i}@gmail.com`,
        isValidated: true,
        isRequired: true
      }));
      
      const result = rulesEngine.validateAttendees(attendees);
      
      expect(result.warnings).toContain(WARNING_MESSAGES.MANY_ATTENDEES);
    });
  });

  describe('validateMeeting', () => {
    it('should validate a complete meeting successfully', () => {
      const meetingData: Partial<MeetingData> = {
        type: 'online',
        startTime: new Date('2025-12-01T10:00:00Z'),
        endTime: new Date('2025-12-01T11:00:00Z'),
        attendees: [
          { email: 'test@gmail.com', isValidated: true, isRequired: true }
        ]
      };
      
      const result = rulesEngine.validateMeeting(meetingData);
      
      expect(result.isValid).toBe(true);
    });

    it('should fail validation for invalid meeting data', () => {
      const meetingData: Partial<MeetingData> = {
        type: 'online',
        startTime: new Date('2025-12-01T10:00:00Z'),
        endTime: new Date('2025-12-01T11:00:00Z'),
        attendees: [] // No attendees for online meeting
      };
      
      const result = rulesEngine.validateMeeting(meetingData);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.ONLINE_MEETING_NO_ATTENDEES);
    });
  });

  describe('getValidationRules', () => {
    it('should return validation rules', () => {
      const rules = rulesEngine.getValidationRules();
      
      expect(rules.ONLINE_MEETING_REQUIRES_ATTENDEES).toBe(true);
      expect(rules.MIN_MEETING_DURATION_MINUTES).toBe(15);
      expect(rules.MAX_ATTENDEES).toBe(100);
    });
  });

  describe('getErrorMessages', () => {
    it('should return error messages', () => {
      const messages = rulesEngine.getErrorMessages();
      
      expect(messages.ONLINE_MEETING_NO_ATTENDEES).toBe('Online meetings must have at least one attendee');
      expect(messages.INVALID_EMAIL_FORMAT).toBe('Invalid email format');
    });
  });

  describe('getWarningMessages', () => {
    it('should return warning messages', () => {
      const messages = rulesEngine.getWarningMessages();
      
      expect(messages.OUTSIDE_BUSINESS_HOURS).toBe('Meeting is scheduled outside typical business hours (8 AM - 6 PM)');
      expect(messages.MANY_ATTENDEES).toBe('Meeting has a large number of attendees (10+)');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle null or undefined meeting data', () => {
      const result1 = rulesEngine.validateMeetingType('online', {});
      expect(result1.isValid).toBe(false);

      const result2 = rulesEngine.validateMeeting({});
      expect(result2.isValid).toBe(false);
    });

    it('should handle invalid date ranges', () => {
      const invalidDate = new Date('invalid');
      const validDate = new Date();

      const result = rulesEngine.validateTimeConstraints(invalidDate, validDate);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate meeting duration boundaries', () => {
      const startTime = new Date('2025-12-01T10:00:00Z');
      
      // Exactly minimum duration (15 minutes)
      const minEndTime = new Date('2025-12-01T10:15:00Z');
      const minResult = rulesEngine.validateTimeConstraints(startTime, minEndTime);
      expect(minResult.isValid).toBe(true);

      // Exactly maximum duration (8 hours)
      const maxEndTime = new Date('2025-12-01T18:00:00Z');
      const maxResult = rulesEngine.validateTimeConstraints(startTime, maxEndTime);
      expect(maxResult.isValid).toBe(true);
    });

    it('should handle empty attendee arrays correctly', () => {
      const result = rulesEngine.validateAttendees([]);
      expect(result.isValid).toBe(true); // Empty array is valid
      expect(result.errors).toHaveLength(0);
    });

    it('should validate complex email formats', () => {
      const complexEmails = [
        'user+tag+more@domain.co.uk',
        'user.name.with.dots@subdomain.domain.com',
        'user123@domain-with-dash.org',
        'a@b.co', // Short but valid
        'very.long.email.address.with.many.dots@very.long.domain.name.com'
      ];

      complexEmails.forEach(email => {
        expect(rulesEngine.validateEmailFormat(email)).toBe(true);
      });
    });

    it('should handle attendee validation with mixed valid/invalid emails', () => {
      const mixedAttendees: AttendeeData[] = [
        { email: 'valid@gmail.com', isValidated: true, isRequired: true },
        { email: 'invalid-email', isValidated: false, isRequired: true },
        { email: 'another.valid@domain.com', isValidated: true, isRequired: false }
      ];

      const result = rulesEngine.validateAttendees(mixedAttendees);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('invalid-email'))).toBe(true);
    });

    it('should validate business hours correctly across different days', () => {
      // Test different days of the week
      const businessHourTests = [
        { day: 1, hour: 9, expected: true }, // Monday 9 AM
        { day: 2, hour: 14, expected: true }, // Tuesday 2 PM
        { day: 3, hour: 7, expected: false }, // Wednesday 7 AM (too early)
        { day: 4, hour: 19, expected: false }, // Thursday 7 PM (too late)
        { day: 5, hour: 12, expected: true }, // Friday noon
        { day: 6, hour: 10, expected: false }, // Saturday (weekend)
        { day: 0, hour: 14, expected: false } // Sunday (weekend)
      ];

      businessHourTests.forEach(({ day, hour, expected }) => {
        const testDate = new Date('2025-12-01T00:00:00Z'); // Start with Monday
        testDate.setDate(testDate.getDate() + day);
        testDate.setHours(hour, 0, 0, 0);
        
        const endTime = new Date(testDate.getTime() + 60 * 60 * 1000); // 1 hour later
        
        const result = rulesEngine.validateTimeConstraints(testDate, endTime);
        
        if (expected) {
          expect(result.warnings).not.toContain('Meeting is scheduled outside typical business hours (8 AM - 6 PM)');
          expect(result.warnings).not.toContain('Meeting is scheduled on a weekend');
        } else {
          expect(
            result.warnings.includes('Meeting is scheduled outside typical business hours (8 AM - 6 PM)') ||
            result.warnings.includes('Meeting is scheduled on a weekend')
          ).toBe(true);
        }
      });
    });
  });
});