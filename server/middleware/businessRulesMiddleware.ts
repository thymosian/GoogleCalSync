import { Request, Response, NextFunction } from 'express';
import { BusinessRulesEngine, ValidationResult } from '../businessRules.js';
import { MeetingData } from '../../shared/schema.js';

/**
 * Middleware for enforcing business rules in meeting creation workflow
 */
export class BusinessRulesMiddleware {
  private rulesEngine: BusinessRulesEngine;

  constructor() {
    this.rulesEngine = new BusinessRulesEngine();
  }

  /**
   * Middleware to validate meeting data before creation
   */
  validateMeetingCreation = (req: Request, res: Response, next: NextFunction) => {
    try {
      const meetingData = req.body as Partial<MeetingData>;
      
      // Perform comprehensive validation
      const validationResult = this.rulesEngine.validateMeeting(meetingData);
      
      if (!validationResult.isValid) {
        return res.status(400).json({
          error: 'Meeting validation failed',
          details: {
            errors: validationResult.errors,
            warnings: validationResult.warnings,
          },
          code: 'VALIDATION_FAILED'
        });
      }

      // Add warnings to response headers if any exist
      if (validationResult.warnings.length > 0) {
        res.setHeader('X-Validation-Warnings', JSON.stringify(validationResult.warnings));
      }

      // Store validation result in request for later use
      req.validationResult = validationResult;
      
      next();
    } catch (error) {
      console.error('Error in business rules validation middleware:', error);
      res.status(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR'
      });
    }
  };

  /**
   * Middleware to validate meeting type requirements
   */
  validateMeetingType = (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, attendees, location } = req.body;
      
      if (!type) {
        return res.status(400).json({
          error: 'Meeting type is required',
          code: 'MISSING_MEETING_TYPE'
        });
      }

      const validationResult = this.rulesEngine.validateMeetingType(type, { attendees, location });
      
      if (!validationResult.isValid) {
        return res.status(400).json({
          error: 'Meeting type validation failed',
          details: {
            errors: validationResult.errors,
            warnings: validationResult.warnings,
          },
          code: 'MEETING_TYPE_VALIDATION_FAILED'
        });
      }

      next();
    } catch (error) {
      console.error('Error in meeting type validation middleware:', error);
      res.status(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR'
      });
    }
  };

  /**
   * Middleware to validate attendee requirements
   */
  validateAttendeeRequirements = (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, attendees } = req.body;
      
      if (type === 'online') {
        const attendeeEmails = attendees?.map((a: any) => a.email || a) || [];
        
        if (!this.rulesEngine.enforceAttendeeRequirement(type, attendeeEmails)) {
          return res.status(400).json({
            error: 'Online meetings require at least one attendee',
            code: 'ATTENDEE_REQUIREMENT_FAILED'
          });
        }
      }

      next();
    } catch (error) {
      console.error('Error in attendee requirements validation middleware:', error);
      res.status(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR'
      });
    }
  };

  /**
   * Middleware to validate time constraints
   */
  validateTimeConstraints = (req: Request, res: Response, next: NextFunction) => {
    try {
      const { startTime, endTime } = req.body;
      
      if (!startTime || !endTime) {
        return res.status(400).json({
          error: 'Start time and end time are required',
          code: 'MISSING_TIME_FIELDS'
        });
      }

      const start = new Date(startTime);
      const end = new Date(endTime);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          error: 'Invalid date format',
          code: 'INVALID_DATE_FORMAT'
        });
      }

      const validationResult = this.rulesEngine.validateTimeConstraints(start, end);
      
      if (!validationResult.isValid) {
        return res.status(400).json({
          error: 'Time constraints validation failed',
          details: {
            errors: validationResult.errors,
            warnings: validationResult.warnings,
          },
          code: 'TIME_VALIDATION_FAILED'
        });
      }

      // Add warnings to response headers if any exist
      if (validationResult.warnings.length > 0) {
        res.setHeader('X-Time-Warnings', JSON.stringify(validationResult.warnings));
      }

      next();
    } catch (error) {
      console.error('Error in time constraints validation middleware:', error);
      res.status(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR'
      });
    }
  };

  /**
   * Middleware to validate email formats
   */
  validateEmailFormats = (req: Request, res: Response, next: NextFunction) => {
    try {
      const { attendees } = req.body;
      
      if (attendees && Array.isArray(attendees)) {
        const invalidEmails: string[] = [];
        
        for (const attendee of attendees) {
          const email = attendee.email || attendee;
          if (typeof email === 'string' && !this.rulesEngine.validateEmailFormat(email)) {
            invalidEmails.push(email);
          }
        }
        
        if (invalidEmails.length > 0) {
          return res.status(400).json({
            error: 'Invalid email formats detected',
            details: {
              invalidEmails,
            },
            code: 'INVALID_EMAIL_FORMATS'
          });
        }
      }

      next();
    } catch (error) {
      console.error('Error in email format validation middleware:', error);
      res.status(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR'
      });
    }
  };

  /**
   * Enhanced validation middleware for meeting creation with workflow sequence validation
   * Requirements: 1.4, 4.4, 5.3 - Validate calendar access, availability checking, and workflow sequence
   */
  validateEnhancedMeetingCreation = (req: Request, res: Response, next: NextFunction) => {
    try {
      const { meetingData, workflowState } = req.body;
      
      if (!meetingData) {
        return res.status(400).json({
          error: 'Meeting data is required',
          code: 'MISSING_MEETING_DATA'
        });
      }

      // Basic meeting validation
      const basicValidation = this.rulesEngine.validateMeeting(meetingData);
      
      // Workflow sequence validation if workflow state is provided
      let workflowValidation: ValidationResult = { isValid: true, errors: [], warnings: [] };
      let calendarValidation: ValidationResult = { isValid: true, errors: [], warnings: [] };
      let availabilityValidation: ValidationResult = { isValid: true, errors: [], warnings: [] };

      if (workflowState) {
        workflowValidation = this.rulesEngine.validateWorkflowSequence(
          workflowState.calendarAccessStatus?.hasAccess || false,
          workflowState.timeCollectionComplete || false,
          !!workflowState.availabilityResult,
          meetingData.type,
          workflowState.attendeeCollectionComplete || false
        );

        calendarValidation = this.rulesEngine.validateCalendarAccess(
          workflowState.calendarAccessStatus?.hasAccess || false,
          workflowState.calendarAccessStatus?.needsRefresh || false,
          workflowState.calendarAccessStatus?.tokenValid !== false
        );

        availabilityValidation = this.rulesEngine.validateAvailabilityCheck(
          !!workflowState.availabilityResult,
          workflowState.availabilityResult?.conflicts?.length > 0,
          workflowState.availabilityResult?.isAvailable
        );
      }

      // Combine all validation results
      const allErrors = [
        ...basicValidation.errors,
        ...workflowValidation.errors,
        ...calendarValidation.errors
      ];

      const allWarnings = [
        ...basicValidation.warnings,
        ...workflowValidation.warnings,
        ...calendarValidation.warnings,
        ...availabilityValidation.warnings
      ];

      if (allErrors.length > 0) {
        return res.status(400).json({
          error: 'Enhanced meeting validation failed',
          details: {
            errors: allErrors,
            warnings: allWarnings,
            validationBreakdown: {
              basicValidation,
              workflowValidation,
              calendarValidation,
              availabilityValidation
            }
          },
          code: 'ENHANCED_VALIDATION_FAILED'
        });
      }

      // Add all warnings to response headers
      if (allWarnings.length > 0) {
        res.setHeader('X-Enhanced-Validation-Warnings', JSON.stringify(allWarnings));
      }

      // Store enhanced validation result in request
      req.enhancedValidationResult = {
        isValid: true,
        errors: allErrors,
        warnings: allWarnings,
        validationBreakdown: {
          basicValidation,
          workflowValidation,
          calendarValidation,
          availabilityValidation
        }
      };

      next();
    } catch (error) {
      console.error('Error in enhanced meeting validation middleware:', error);
      res.status(500).json({
        error: 'Internal enhanced validation error',
        code: 'ENHANCED_VALIDATION_ERROR'
      });
    }
  };

  /**
   * Get the rules engine instance for direct access
   */
  getRulesEngine(): BusinessRulesEngine {
    return this.rulesEngine;
  }
}

// Create a singleton instance for use across the application
export const businessRulesMiddleware = new BusinessRulesMiddleware();

// Export individual middleware functions for easier use
export const {
  validateMeetingCreation,
  validateMeetingType,
  validateAttendeeRequirements,
  validateTimeConstraints,
  validateEmailFormats,
  validateEnhancedMeetingCreation,
} = businessRulesMiddleware;

// Enhanced validation result interface
interface EnhancedValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  validationBreakdown: {
    basicValidation: ValidationResult;
    workflowValidation: ValidationResult;
    calendarValidation: ValidationResult;
    availabilityValidation: ValidationResult;
  };
}

// Extend Express Request interface to include validation results
declare global {
  namespace Express {
    interface Request {
      validationResult?: ValidationResult;
      enhancedValidationResult?: EnhancedValidationResult;
    }
  }
}