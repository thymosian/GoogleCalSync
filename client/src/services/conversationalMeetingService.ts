import { AttendeeData } from '../../../shared/schema';

// Define ConversationalUIBlock type locally
export interface ConversationalUIBlock {
  type: 'meeting_type_selection' | 'attendee_management' | 'meeting_approval' | 'agenda_editor';
  data: any;
}

// Service for managing conversational meeting creation workflow
export class ConversationalMeetingService {
  private static instance: ConversationalMeetingService;
  private meetingData: Map<string, ConversationalMeetingData> = new Map();

  private constructor() {}

  static getInstance(): ConversationalMeetingService {
    if (!ConversationalMeetingService.instance) {
      ConversationalMeetingService.instance = new ConversationalMeetingService();
    }
    return ConversationalMeetingService.instance;
  }

  // Create a new meeting workflow
  createMeetingWorkflow(meetingId: string, initialData?: Partial<ConversationalMeetingData>): ConversationalMeetingData {
    const meetingData: ConversationalMeetingData = {
      id: meetingId,
      title: initialData?.title,
      type: initialData?.type,
      startTime: initialData?.startTime,
      endTime: initialData?.endTime,
      location: initialData?.location,
      attendees: initialData?.attendees || [],
      agenda: initialData?.agenda,
      status: 'draft',
      currentStep: 'type_selection',
      ...initialData
    };

    this.meetingData.set(meetingId, meetingData);
    return meetingData;
  }

  // Get meeting data
  getMeetingData(meetingId: string): ConversationalMeetingData | undefined {
    return this.meetingData.get(meetingId);
  }

  // Update meeting data
  updateMeetingData(meetingId: string, updates: Partial<ConversationalMeetingData>): ConversationalMeetingData | undefined {
    const existing = this.meetingData.get(meetingId);
    if (!existing) return undefined;

    const updated = { ...existing, ...updates };
    this.meetingData.set(meetingId, updated);
    return updated;
  }

  // Delete meeting data
  deleteMeetingData(meetingId: string): void {
    this.meetingData.delete(meetingId);
  }

  // Determine if attendees are required based on meeting type
  areAttendeesRequired(meetingType: 'physical' | 'online'): boolean {
    // Business rule: Online meetings always require attendees
    return meetingType === 'online';
  }

  // Generate the appropriate UI block based on current step
  generateUIBlock(meetingId: string): ConversationalUIBlock | null {
    const meeting = this.getMeetingData(meetingId);
    if (!meeting) return null;

    switch (meeting.currentStep) {
      case 'type_selection':
        return {
          type: 'meeting_type_selection',
          data: {
            question: 'Is this a physical or online meeting?',
            meetingId,
            currentType: meeting.type,
            currentLocation: meeting.location
          }
        };

      case 'attendee_management':
        if (!meeting.type) return null;
        return {
          type: 'attendee_management',
          data: {
            meetingId,
            attendees: meeting.attendees,
            meetingType: meeting.type,
            isRequired: this.areAttendeesRequired(meeting.type)
          }
        };

      case 'agenda_approval':
        if (!meeting.agenda) return null;
        const duration = meeting.startTime && meeting.endTime 
          ? Math.round((new Date(meeting.endTime).getTime() - new Date(meeting.startTime).getTime()) / (1000 * 60))
          : 60;
        
        return {
          type: 'agenda_editor',
          data: {
            meetingId,
            initialAgenda: meeting.agenda,
            meetingTitle: meeting.title || 'Meeting',
            duration,
            isApprovalMode: true
          }
        };

      case 'approval':
        if (!meeting.title || !meeting.type || !meeting.startTime || !meeting.endTime) {
          return null;
        }
        
        // Get validation results for the meeting
        const validation = this.validateMeetingData(meetingId);
        
        return {
          type: 'meeting_approval',
          data: {
            meetingId,
            title: meeting.title,
            type: meeting.type,
            startTime: meeting.startTime,
            endTime: meeting.endTime,
            location: meeting.location,
            attendees: meeting.attendees,
            agenda: meeting.agenda,
            validation
          }
        };

      default:
        return null;
    }
  }

  // Handle meeting type selection
  handleTypeSelection(meetingId: string, type: 'physical' | 'online', location?: string): ConversationalMeetingData | undefined {
    const updates: Partial<ConversationalMeetingData> = {
      type,
      currentStep: 'attendee_management'
    };

    // Add location for physical meetings
    if (type === 'physical' && location) {
      updates.location = location;
    }

    const updated = this.updateMeetingData(meetingId, updates);
    return updated;
  }

  // Handle attendee updates
  handleAttendeesUpdate(meetingId: string, attendees: AttendeeData[]): ConversationalMeetingData | undefined {
    const updated = this.updateMeetingData(meetingId, {
      attendees
    });

    return updated;
  }

  // Handle continue from attendee management
  handleContinueFromAttendees(meetingId: string): ConversationalMeetingData | undefined {
    const meeting = this.getMeetingData(meetingId);
    if (!meeting) return undefined;

    // Validate business rules
    if (meeting.type === 'online' && meeting.attendees.length === 0) {
      throw new Error('Online meetings require at least one attendee');
    }

    const updated = this.updateMeetingData(meetingId, {
      currentStep: 'approval'
    });

    return updated;
  }

  // Handle agenda update during approval workflow
  handleAgendaUpdate(meetingId: string, agenda: string): ConversationalMeetingData | undefined {
    const updated = this.updateMeetingData(meetingId, {
      agenda
    });

    return updated;
  }

  // Handle agenda approval and advance to final meeting approval
  handleAgendaApproval(meetingId: string, finalAgenda: string): ConversationalMeetingData | undefined {
    const updated = this.updateMeetingData(meetingId, {
      agenda: finalAgenda,
      currentStep: 'approval'
    });

    return updated;
  }

  // Handle agenda regeneration request
  handleAgendaRegeneration(meetingId: string): ConversationalMeetingData | undefined {
    const meeting = this.getMeetingData(meetingId);
    if (!meeting) return undefined;

    // Keep the meeting in agenda approval step for regeneration
    return meeting;
  }

  // Handle meeting approval
  handleMeetingApproval(meetingId: string): ConversationalMeetingData | undefined {
    const updated = this.updateMeetingData(meetingId, {
      status: 'approved'
    });

    return updated;
  }

  // Validate meeting data before creation
  validateMeetingData(meetingId: string): ValidationResult {
    const meeting = this.getMeetingData(meetingId);
    if (!meeting) {
      return { isValid: false, errors: ['Meeting data not found'], warnings: [] };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field validation
    if (!meeting.title) errors.push('Meeting title is required');
    if (!meeting.type) errors.push('Meeting type is required');
    if (!meeting.startTime) errors.push('Start time is required');
    if (!meeting.endTime) errors.push('End time is required');

    // Business rule validation
    if (meeting.type === 'online' && meeting.attendees.length === 0) {
      errors.push('Online meetings require at least one attendee');
    }

    if (meeting.type === 'physical' && !meeting.location) {
      errors.push('Physical meetings require a location');
    }

    // Time validation
    if (meeting.startTime && meeting.endTime) {
      const start = new Date(meeting.startTime);
      const end = new Date(meeting.endTime);
      
      if (start >= end) {
        errors.push('End time must be after start time');
      }
      
      if (start < new Date()) {
        warnings.push('Meeting is scheduled in the past');
      }
      
      const duration = (end.getTime() - start.getTime()) / (1000 * 60);
      if (duration > 480) { // 8 hours
        warnings.push('Meeting duration is longer than 8 hours');
      }
    }

    // Attendee validation warnings
    if (meeting.attendees.length > 0) {
      const unvalidatedAttendees = meeting.attendees.filter(a => !a.isValidated);
      if (unvalidatedAttendees.length > 0) {
        warnings.push(`${unvalidatedAttendees.length} attendee(s) have not been validated`);
      }
    }

    // Agenda warnings
    if (!meeting.agenda) {
      warnings.push('No agenda has been created for this meeting');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Check if online meeting is being created to trigger attendee editor
  shouldTriggerAttendeeEditor(meetingType?: 'physical' | 'online'): boolean {
    return meetingType === 'online';
  }

  // Get all active meetings
  getAllMeetings(): ConversationalMeetingData[] {
    return Array.from(this.meetingData.values());
  }

  // Clear all meeting data (for cleanup)
  clearAllMeetings(): void {
    this.meetingData.clear();
  }

  // Send message method for chat integration
  async sendMessage(message: string, meetingId?: string): Promise<string> {
    // This would integrate with the chat system
    // For now, return a simple response
    return `Received: ${message}`;
  }

  // Validate attendee email
  async validateAttendeeEmail(email: string): Promise<{ isValid: boolean; message?: string }> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(email);
    
    return {
      isValid,
      message: isValid ? undefined : 'Please enter a valid email address'
    };
  }

  // Validate attendee batch
  async validateAttendeeBatch(emails: string[]): Promise<Array<{ email: string; isValid: boolean; message?: string }>> {
    return Promise.all(emails.map(async (email) => {
      const validation = await this.validateAttendeeEmail(email);
      return {
        email,
        isValid: validation.isValid,
        message: validation.message
      };
    }));
  }

  // Process workflow step
  async processWorkflowStep(step: string, data: any): Promise<any> {
    // Process different workflow steps
    switch (step) {
      case 'type_selection':
        return this.handleTypeSelection(data.meetingId, data.type, data.location);
      case 'attendee_management':
        return this.handleAttendeesUpdate(data.meetingId, data.attendees);
      case 'agenda_approval':
        return this.handleAgendaApproval(data.meetingId, data.agenda);
      default:
        return null;
    }
  }

  // Approve agenda
  async approveAgenda(meetingId: string, agenda?: string): Promise<ConversationalMeetingData | undefined> {
    const updates: Partial<ConversationalMeetingData> = {
      currentStep: 'approval'
    };
    
    if (agenda) {
      updates.agenda = agenda;
    }
    
    return this.updateMeetingData(meetingId, updates);
  }

  // Create meeting
  async createMeeting(meetingId: string): Promise<ConversationalMeetingData | undefined> {
    const updated = this.updateMeetingData(meetingId, {
      status: 'created'
    });
    
    return updated;
  }
}

// Types for conversational meeting data
export interface ConversationalMeetingData {
  id: string;
  title?: string;
  type?: 'physical' | 'online';
  startTime?: string;
  endTime?: string;
  location?: string;
  attendees: AttendeeData[];
  agenda?: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'created';
  currentStep: 'type_selection' | 'attendee_management' | 'agenda_approval' | 'approval';
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Export singleton instance
export const conversationalMeetingService = ConversationalMeetingService.getInstance();