import { useState, useCallback } from 'react';
import { MeetingWorkflowData, WorkflowStep } from '../components/StreamlinedMeetingWorkflow';

export interface UseStreamlinedMeetingWorkflowReturn {
  currentStep: WorkflowStep;
  meetingData: MeetingWorkflowData;
  isActive: boolean;
  startWorkflow: () => void;
  resetWorkflow: () => void;
  updateMeetingData: (updates: Partial<MeetingWorkflowData>) => void;
  advanceToStep: (step: WorkflowStep) => void;
  onComplete: (meetingData: MeetingWorkflowData) => void;
  onSidebarUpdate: (meetingData: MeetingWorkflowData) => void;
}

export function useStreamlinedMeetingWorkflow(): UseStreamlinedMeetingWorkflowReturn {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('meeting_type_selection');
  const [meetingData, setMeetingData] = useState<MeetingWorkflowData>({
    id: '',
    attendees: []
  });

  const startWorkflow = useCallback(() => {
    const newMeetingId = `meeting-${Date.now()}`;
    setMeetingData({
      id: newMeetingId,
      attendees: []
    });
    setCurrentStep('meeting_type_selection');
    setIsActive(true);
  }, []);

  const resetWorkflow = useCallback(() => {
    setIsActive(false);
    setCurrentStep('meeting_type_selection');
    setMeetingData({
      id: '',
      attendees: []
    });
  }, []);

  const updateMeetingData = useCallback((updates: Partial<MeetingWorkflowData>) => {
    setMeetingData(prev => ({ ...prev, ...updates }));
  }, []);

  const advanceToStep = useCallback((step: WorkflowStep) => {
    setCurrentStep(step);
  }, []);

  const onComplete = useCallback((completedMeetingData: MeetingWorkflowData) => {
    console.log('Meeting workflow completed:', completedMeetingData);
    // Here you could trigger additional actions like:
    // - Refreshing the calendar events
    // - Sending notifications
    // - Updating the UI state
    setIsActive(false);
  }, []);

  const onSidebarUpdate = useCallback((updatedMeetingData: MeetingWorkflowData) => {
    console.log('Sidebar should be updated with:', updatedMeetingData);
    // This will be handled by the parent component that manages the sidebar state
    // The parent component should listen to this and update the sidebar accordingly
  }, []);

  return {
    currentStep,
    meetingData,
    isActive,
    startWorkflow,
    resetWorkflow,
    updateMeetingData,
    advanceToStep,
    onComplete,
    onSidebarUpdate
  };
}