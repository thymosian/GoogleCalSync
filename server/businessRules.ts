import { MeetingData, AttendeeData } from '../shared/schema.js';

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Validation rule constants
export const VALIDATION_RULES = {
  // Meeting type rules
  ONLINE_MEETING_REQUIRES_ATTENDEES: true,
  PHYSICAL_MEETING_REQUIRES_LOCATION: true,
  
  // Email validation patterns
  EMAIL_REGEX: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  GMAIL_REGEX: /^[a-zA-Z0-9._%+-]+@gmail\.com$/,
  
  // Time constraints
  MIN_MEETING_DURATION_MINUTES: 15,
  MAX_MEETING_DURATION_HOURS: 8,
  MAX_ADVANCE_BOOKING_DAYS: 365,
  MIN_ADVANCE_BOOKING_MINUTES: 5,
  
  // Attendee constraints
  MAX_ATTENDEES: 100,
  MIN_ATTENDEES_FOR_ONLINE: 1,
  
  // Business hours (24-hour format)
  BUSINESS_HOURS_START: 8,
  BUSINESS_HOURS_END: 18,
} as const;

// Error messages
export const ERROR_MESSAGES = {
  ONLINE_MEETING_NO_ATTENDEES: 'Online meetings must have at least one attendee',
  PHYSICAL_MEETING_NO_LOCATION: 'Physical meetings must have a location specified',
  INVALID_EMAIL_FORMAT: 'Invalid email format',
  INVALID_GMAIL_FORMAT: 'Email must be a valid Gmail address',
  MEETING_TOO_SHORT: `Meeting duration must be at least ${VALIDATION_RULES.MIN_MEETING_DURATION_MINUTES} minutes`,
  MEETING_TOO_LONG: `Meeting duration cannot exceed ${VALIDATION_RULES.MAX_MEETING_DURATION_HOURS} hours`,
  INVALID_TIME_RANGE: 'End time must be after start time',
  BOOKING_TOO_FAR_AHEAD: `Cannot book meetings more than ${VALIDATION_RULES.MAX_ADVANCE_BOOKING_DAYS} days in advance`,
  BOOKING_TOO_SOON: `Meeting must be scheduled at least ${VALIDATION_RULES.MIN_ADVANCE_BOOKING_MINUTES} minutes in advance`,
  TOO_MANY_ATTENDEES: `Cannot have more than ${VALIDATION_RULES.MAX_ATTENDEES} attendees`,
  DUPLICATE_ATTENDEES: 'Duplicate attendee emails are not allowed',
  MISSING_REQUIRED_FIELD: 'Required field is missing',
} as const;

// Warning messages
export const WARNING_MESSAGES = {
  OUTSIDE_BUSINESS_HOURS: 'Meeting is scheduled outside typical business hours (8 AM - 6 PM)',
  WEEKEND_MEETING: 'Meeting is scheduled on a weekend',
  LONG_MEETING: 'Meeting duration is longer than 2 hours',
  MANY_ATTENDEES: 'Meeting has a large number of attendees (10+)',
} as const;

/**
 * Business Rules Engine with hardcoded validation logic
 * Enforces consistent business rules without AI involvement
 */
export class BusinessRulesEngine {
  /**
   * Validates meeting type and associated requirements
   */
  validateMeetingType(type: 'physical' | 'online', data: Partial<MeetingData>): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (type === 'online') {
      // Online meetings must have attendees
      if (!data.attendees || data.attendees.length === 0) {
        result.isValid = false;
        result.errors.push(ERROR_MESSAGES.ONLINE_MEETING_NO_ATTENDEES);
      }
    } else if (type === 'physical') {
      // Physical meetings must have a location
      if (!data.location || data.location.trim() === '') {
        result.isValid = false;
        result.errors.push(ERROR_MESSAGES.PHYSICAL_MEETING_NO_LOCATION);
      }
    }

    return result;
  }

  /**
   * Enforces attendee requirements based on meeting type
   * This is hardcoded logic with no AI involvement
   */
  enforceAttendeeRequirement(meetingType: string, attendees: string[]): boolean {
    if (meetingType === 'online') {
      return attendees.length >= VALIDATION_RULES.MIN_ATTENDEES_FOR_ONLINE;
    }
    // Physical meetings don't require attendees
    return true;
  }

  /**
   * Validates time constraints for meetings
   */
  validateTimeConstraints(startTime: Date, endTime: Date): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    const now = new Date();
    const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
    const durationHours = durationMinutes / 60;
    const daysInAdvance = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    const minutesInAdvance = (startTime.getTime() - now.getTime()) / (1000 * 60);

    // Basic time validation
    if (endTime <= startTime) {
      result.isValid = false;
      result.errors.push(ERROR_MESSAGES.INVALID_TIME_RANGE);
    }

    // Duration validation
    if (durationMinutes < VALIDATION_RULES.MIN_MEETING_DURATION_MINUTES) {
      result.isValid = false;
      result.errors.push(ERROR_MESSAGES.MEETING_TOO_SHORT);
    }

    if (durationHours > VALIDATION_RULES.MAX_MEETING_DURATION_HOURS) {
      result.isValid = false;
      result.errors.push(ERROR_MESSAGES.MEETING_TOO_LONG);
    }

    // Advance booking validation
    if (daysInAdvance > VALIDATION_RULES.MAX_ADVANCE_BOOKING_DAYS) {
      result.isValid = false;
      result.errors.push(ERROR_MESSAGES.BOOKING_TOO_FAR_AHEAD);
    }

    if (minutesInAdvance < VALIDATION_RULES.MIN_ADVANCE_BOOKING_MINUTES) {
      result.isValid = false;
      result.errors.push(ERROR_MESSAGES.BOOKING_TOO_SOON);
    }

    // Business hours warning
    const startHour = startTime.getHours();
    const endHour = endTime.getHours();
    if (startHour < VALIDATION_RULES.BUSINESS_HOURS_START || 
        endHour > VALIDATION_RULES.BUSINESS_HOURS_END) {
      result.warnings.push(WARNING_MESSAGES.OUTSIDE_BUSINESS_HOURS);
    }

    // Weekend warning
    const dayOfWeek = startTime.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      result.warnings.push(WARNING_MESSAGES.WEEKEND_MEETING);
    }

    // Long meeting warning
    if (durationHours > 2) {
      result.warnings.push(WARNING_MESSAGES.LONG_MEETING);
    }

    return result;
  }

  /**
   * Validates email format using hardcoded regex patterns
   */
  validateEmailFormat(email: string): boolean {
    if (!email || typeof email !== 'string') {
      return false;
    }
    
    return VALIDATION_RULES.EMAIL_REGEX.test(email.trim().toLowerCase());
  }

  /**
   * Validates Gmail format specifically
   */
  validateGmailFormat(email: string): boolean {
    if (!email || typeof email !== 'string') {
      return false;
    }
    
    return VALIDATION_RULES.GMAIL_REGEX.test(email.trim().toLowerCase());
  }

  /**
   * Validates attendee list
   */
  validateAttendees(attendees: AttendeeData[]): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Check maximum attendees
    if (attendees.length > VALIDATION_RULES.MAX_ATTENDEES) {
      result.isValid = false;
      result.errors.push(ERROR_MESSAGES.TOO_MANY_ATTENDEES);
    }

    // Check for duplicates
    const emailSet = new Set();
    const duplicates: string[] = [];
    
    for (const attendee of attendees) {
      const email = attendee.email.toLowerCase().trim();
      
      // Validate email format
      if (!this.validateEmailFormat(email)) {
        result.isValid = false;
        result.errors.push(`${ERROR_MESSAGES.INVALID_EMAIL_FORMAT}: ${attendee.email}`);
      }
      
      // Check for duplicates
      if (emailSet.has(email)) {
        duplicates.push(email);
      } else {
        emailSet.add(email);
      }
    }

    if (duplicates.length > 0) {
      result.isValid = false;
      result.errors.push(`${ERROR_MESSAGES.DUPLICATE_ATTENDEES}: ${duplicates.join(', ')}`);
    }

    // Warning for many attendees
    if (attendees.length >= 10) {
      result.warnings.push(WARNING_MESSAGES.MANY_ATTENDEES);
    }

    return result;
  }

  /**
   * Comprehensive meeting validation
   */
  validateMeeting(meetingData: Partial<MeetingData>): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Validate meeting type requirements
    if (meetingData.type) {
      const typeValidation = this.validateMeetingType(meetingData.type, meetingData);
      result.errors.push(...typeValidation.errors);
      result.warnings.push(...typeValidation.warnings);
      if (!typeValidation.isValid) {
        result.isValid = false;
      }
    }

    // Validate time constraints
    if (meetingData.startTime && meetingData.endTime) {
      // Convert to Date objects if they're strings
      const startDate = meetingData.startTime instanceof Date 
        ? meetingData.startTime 
        : new Date(meetingData.startTime);
      const endDate = meetingData.endTime instanceof Date 
        ? meetingData.endTime 
        : new Date(meetingData.endTime);
      
      // Skip validation if dates are invalid
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        result.isValid = false;
        result.errors.push('Invalid date format for meeting times');
      } else {
        const timeValidation = this.validateTimeConstraints(startDate, endDate);
        result.errors.push(...timeValidation.errors);
        result.warnings.push(...timeValidation.warnings);
        if (!timeValidation.isValid) {
          result.isValid = false;
        }
      }
    }

    // Validate attendees
    if (meetingData.attendees && meetingData.attendees.length > 0) {
      const attendeeValidation = this.validateAttendees(meetingData.attendees);
      result.errors.push(...attendeeValidation.errors);
      result.warnings.push(...attendeeValidation.warnings);
      if (!attendeeValidation.isValid) {
        result.isValid = false;
      }
    }

    return result;
  }

  /**
   * Get validation rules for external reference
   */
  getValidationRules() {
    return { ...VALIDATION_RULES };
  }

  /**
   * Get error messages for external reference
   */
  getErrorMessages() {
    return { ...ERROR_MESSAGES };
  }

  /**
   * Get warning messages for external reference
   */
  getWarningMessages() {
    return { ...WARNING_MESSAGES };
  }

  /**
   * Validates workflow sequence completion for meeting creation
   * Requirements: 5.3 - Ensure all workflow steps completed in correct sequence
   */
  validateWorkflowSequence(
    calendarAccessVerified: boolean,
    timeCollectionComplete: boolean,
    availabilityChecked: boolean,
    meetingType?: 'online' | 'physical',
    attendeeCollectionComplete?: boolean
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Calendar access must be verified first
    if (!calendarAccessVerified) {
      result.isValid = false;
      result.errors.push('Calendar access must be verified before meeting creation');
    }

    // Time collection must be complete
    if (!timeCollectionComplete) {
      result.isValid = false;
      result.errors.push('Meeting time and date must be collected before creation');
    }

    // Availability should be checked for better user experience
    if (!availabilityChecked) {
      result.warnings.push('Calendar availability was not checked - conflicts may exist');
    }

    // Online meetings require attendee collection
    if (meetingType === 'online' && !attendeeCollectionComplete) {
      result.isValid = false;
      result.errors.push('Attendee collection must be completed for online meetings');
    }

    return result;
  }

  /**
   * Validates calendar access status for meeting creation
   * Requirements: 1.4 - Add validation to ensure calendar access before creation
   */
  validateCalendarAccess(hasAccess: boolean, needsRefresh: boolean, tokenValid: boolean): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!hasAccess) {
      result.isValid = false;
      result.errors.push('Calendar access is required for meeting creation');
    }

    if (needsRefresh) {
      result.isValid = false;
      result.errors.push('Calendar access token needs to be refreshed');
    }

    if (!tokenValid) {
      result.isValid = false;
      result.errors.push('Calendar access token is invalid');
    }

    return result;
  }

  /**
   * Validates availability checking results
   * Requirements: 4.4 - Verify availability checking was performed before final creation
   */
  validateAvailabilityCheck(
    availabilityChecked: boolean,
    hasConflicts?: boolean,
    conflictsResolved?: boolean
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!availabilityChecked) {
      result.warnings.push('Calendar availability was not checked - scheduling conflicts may exist');
    }

    if (hasConflicts && !conflictsResolved) {
      result.warnings.push('Calendar conflicts detected but not resolved - meeting may overlap with existing events');
    }

    return result;
  }
}