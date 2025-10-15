import { useState, useCallback } from 'react';
import { 
  conversationalMeetingService, 
  ConversationalMeetingData, 
  ValidationResult 
} from '../services/conversationalMeetingService';
import { AttendeeData } from '../../../shared/schema';
import { ConversationalUIBlock } from '../services/conversationalMeetingService';

export function useConversationalMeeting() {
  const [activeMeetings, setActiveMeetings] = useState<Map<string, ConversationalMeetingData>>(new Map());

  // Create a new meeting workflow
  const createMeetingWorkflow = useCallback((meetingId: string, initialData?: Partial<ConversationalMeetingData>) => {
    const meetingData = conversationalMeetingService.createMeetingWorkflow(meetingId, initialData);
    setActiveMeetings(prev => new Map(prev.set(meetingId, meetingData)));
    return meetingData;
  }, []);

  // Get meeting data
  const getMeetingData = useCallback((meetingId: string) => {
    return conversationalMeetingService.getMeetingData(meetingId);
  }, []);

  // Update meeting data
  const updateMeetingData = useCallback((meetingId: string, updates: Partial<ConversationalMeetingData>) => {
    const updated = conversationalMeetingService.updateMeetingData(meetingId, updates);
    if (updated) {
      setActiveMeetings(prev => new Map(prev.set(meetingId, updated)));
    }
    return updated;
  }, []);

  // Delete meeting data
  const deleteMeetingData = useCallback((meetingId: string) => {
    conversationalMeetingService.deleteMeetingData(meetingId);
    setActiveMeetings(prev => {
      const newMap = new Map(prev);
      newMap.delete(meetingId);
      return newMap;
    });
  }, []);

  // Generate UI block for current step
  const generateUIBlock = useCallback((meetingId: string): ConversationalUIBlock | null => {
    return conversationalMeetingService.generateUIBlock(meetingId);
  }, []);

  // Handle meeting type selection
  const handleTypeSelection = useCallback((meetingId: string, type: 'physical' | 'online') => {
    const updated = conversationalMeetingService.handleTypeSelection(meetingId, type);
    if (updated) {
      setActiveMeetings(prev => new Map(prev.set(meetingId, updated)));
    }
    return updated;
  }, []);

  // Handle attendee updates
  const handleAttendeesUpdate = useCallback((meetingId: string, attendees: AttendeeData[]) => {
    const updated = conversationalMeetingService.handleAttendeesUpdate(meetingId, attendees);
    if (updated) {
      setActiveMeetings(prev => new Map(prev.set(meetingId, updated)));
    }
    return updated;
  }, []);

  // Handle continue from attendee management
  const handleContinueFromAttendees = useCallback((meetingId: string) => {
    try {
      const updated = conversationalMeetingService.handleContinueFromAttendees(meetingId);
      if (updated) {
        setActiveMeetings(prev => new Map(prev.set(meetingId, updated)));
      }
      return { success: true, data: updated };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }, []);

  // Handle agenda update
  const handleAgendaUpdate = useCallback((meetingId: string, agenda: string) => {
    const updated = conversationalMeetingService.handleAgendaUpdate(meetingId, agenda);
    if (updated) {
      setActiveMeetings(prev => new Map(prev.set(meetingId, updated)));
    }
    return updated;
  }, []);

  // Handle agenda approval
  const handleAgendaApproval = useCallback((meetingId: string, finalAgenda: string) => {
    const updated = conversationalMeetingService.handleAgendaApproval(meetingId, finalAgenda);
    if (updated) {
      setActiveMeetings(prev => new Map(prev.set(meetingId, updated)));
    }
    return updated;
  }, []);

  // Handle agenda regeneration
  const handleAgendaRegeneration = useCallback((meetingId: string) => {
    const updated = conversationalMeetingService.handleAgendaRegeneration(meetingId);
    if (updated) {
      setActiveMeetings(prev => new Map(prev.set(meetingId, updated)));
    }
    return updated;
  }, []);

  // Handle meeting approval
  const handleMeetingApproval = useCallback((meetingId: string) => {
    const updated = conversationalMeetingService.handleMeetingApproval(meetingId);
    if (updated) {
      setActiveMeetings(prev => new Map(prev.set(meetingId, updated)));
    }
    return updated;
  }, []);

  // Validate meeting data
  const validateMeetingData = useCallback((meetingId: string): ValidationResult => {
    return conversationalMeetingService.validateMeetingData(meetingId);
  }, []);

  // Check if attendee editor should be triggered
  const shouldTriggerAttendeeEditor = useCallback((meetingType?: 'physical' | 'online'): boolean => {
    return conversationalMeetingService.shouldTriggerAttendeeEditor(meetingType);
  }, []);

  // Check if attendees are required
  const areAttendeesRequired = useCallback((meetingType: 'physical' | 'online'): boolean => {
    return conversationalMeetingService.areAttendeesRequired(meetingType);
  }, []);

  return {
    // State
    activeMeetings,
    
    // Actions
    createMeetingWorkflow,
    getMeetingData,
    updateMeetingData,
    deleteMeetingData,
    generateUIBlock,
    
    // Event handlers
    handleTypeSelection,
    handleAttendeesUpdate,
    handleContinueFromAttendees,
    handleAgendaUpdate,
    handleAgendaApproval,
    handleAgendaRegeneration,
    handleMeetingApproval,
    
    // Utilities
    validateMeetingData,
    shouldTriggerAttendeeEditor,
    areAttendeesRequired,
  };
}