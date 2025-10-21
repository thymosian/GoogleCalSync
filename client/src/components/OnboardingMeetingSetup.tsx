import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Video, Users, Calendar, MessageCircle, Edit, CheckCircle, AlertCircle, Sparkles, ArrowRight, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { apiRequest } from '@/lib/queryClient';
import { AttendeeData } from '../../../shared/schema';
import { EnhancedAgendaEditor } from '@/components/EnhancedAgendaEditor';

export type OnboardingStep =
  | 'welcome'
  | 'meeting_type'
  | 'attendees'
  | 'purpose'
  | 'time'
  | 'review'
  | 'meeting_created'
  | 'agenda'
  | 'completed';

export interface OnboardingMeetingData {
  id: string;
  type?: 'online' | 'physical';
  attendees: AttendeeData[];
  purpose?: string;
  enhancedPurpose?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  meetingLink?: string;
}

interface OnboardingMeetingSetupProps {
  onComplete?: (meetingData: OnboardingMeetingData) => void;
  onSidebarUpdate?: (meetingData: OnboardingMeetingData) => void;
}

export function OnboardingMeetingSetup({ onComplete, onSidebarUpdate }: OnboardingMeetingSetupProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [meetingData, setMeetingData] = useState<OnboardingMeetingData>({
    id: `meeting-${Date.now()}`,
    attendees: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');

  // Email validation regex for name@gmail.com format
  const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;

  const validateEmail = (email: string): boolean => {
    return emailRegex.test(email);
  };

  const getStepProgress = () => {
    const steps = ['welcome', 'meeting_type', 'attendees', 'purpose', 'time', 'review', 'meeting_created', 'agenda'];
    return ((steps.indexOf(currentStep) + 1) / steps.length) * 100;
  };

  const advanceToNextStep = () => {
    setDirection('forward');
    const steps: OnboardingStep[] = ['welcome', 'meeting_type', 'attendees', 'purpose', 'time', 'review', 'meeting_created', 'agenda'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const goToPreviousStep = () => {
    setDirection('backward');
    const steps: OnboardingStep[] = ['welcome', 'meeting_type', 'attendees', 'purpose', 'time', 'review', 'meeting_created', 'agenda'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const handleMeetingTypeSelect = (type: 'online' | 'physical') => {
    setMeetingData(prev => ({ ...prev, type }));
    setTimeout(() => advanceToNextStep(), 800);
  };

  const handleAttendeesUpdate = (attendees: AttendeeData[]) => {
    setMeetingData(prev => ({ ...prev, attendees }));
  };

  const handleAttendeeSubmit = () => {
    if (meetingData.attendees.length > 0) {
      advanceToNextStep();
    }
  };

  const handlePurposeSubmit = async (purpose: string) => {
    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/ai/generate-titles', {
        purpose,
        participants: meetingData.attendees.map(a => a.email),
        context: `Meeting with ${meetingData.attendees.length} attendees about ${purpose}`
      });

      const titleData = await response.json();
      const generatedTitle = titleData.titleSuggestions?.[0] || `${purpose} Meeting`;
      const enhancedPurpose = titleData.enhancedPurpose || purpose;

      setMeetingData(prev => ({
        ...prev,
        purpose,
        enhancedPurpose, // Store the enhanced purpose
        title: generatedTitle
      }));
      setTimeout(() => advanceToNextStep(), 800);
    } catch (error) {
      console.error('Error generating title:', error);
      setMeetingData(prev => ({ ...prev, purpose, title: `${purpose} Meeting` }));
      setTimeout(() => advanceToNextStep(), 800);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTimeSubmit = async (timeDescription: string) => {
    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/ai/extract-time', {
        message: timeDescription,
        context: 'meeting_scheduling'
      });

      const timeData = await response.json();

      if (timeData.startTime && timeData.endTime) {
        setMeetingData(prev => ({
          ...prev,
          startTime: timeData.startTime,
          endTime: timeData.endTime
        }));
        setTimeout(() => advanceToNextStep(), 800);
      } else {
        // Keep user on time step if extraction failed
        alert('I need a bit more clarification on the time. Please try again.');
      }
    } catch (error) {
      console.error('Error processing time:', error);
      alert('I had trouble understanding that time. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateMeeting = async () => {
    setIsLoading(true);
    try {
      // Use enhanced purpose if available, otherwise fall back to original purpose
      const description = meetingData.enhancedPurpose && meetingData.enhancedPurpose.trim() !== ''
        ? meetingData.enhancedPurpose
        : meetingData.purpose || 'No description provided';

      const response = await apiRequest('POST', '/api/calendar/events', {
        title: meetingData.title,
        startTime: meetingData.startTime,
        endTime: meetingData.endTime,
        attendees: meetingData.attendees,
        createMeetLink: true,
        description: description,
        enhancedPurpose: meetingData.enhancedPurpose, // Explicitly pass enhanced purpose
        type: meetingData.type
      });

      const eventData = await response.json();

      if (eventData.success) {
        const updatedMeetingData = {
          ...meetingData,
          meetingLink: eventData.event?.meetingLink
        };

        setMeetingData(updatedMeetingData);

        if (onSidebarUpdate) {
          onSidebarUpdate(updatedMeetingData);
        }

        // Move to agenda step instead of completing immediately
        setTimeout(() => {
          advanceToNextStep();
        }, 800);
      } else {
        throw new Error(eventData.error || 'Failed to create meeting');
      }
    } catch (error) {
      console.error('Error creating meeting:', error);
      alert('I had trouble creating the meeting. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAgendaSave = async (agendaHtml: string) => {
    setIsLoading(true);
    try {
      // Validate required data before sending
      if (!meetingData.id) {
        console.error('Missing meeting ID:', meetingData.id);
        alert('Error: Meeting ID is missing. Please refresh and try again.');
        return;
      }
      
      if (!agendaHtml || agendaHtml.trim() === '') {
        console.error('Missing agenda HTML content');
        alert('Error: Agenda content is empty. Please generate an agenda first.');
        return;
      }
      
      if (meetingData.attendees.length === 0) {
        console.error('No attendees specified');
        alert('Error: No attendees specified for this meeting.');
        return;
      }

      console.log('Sending agenda with data:', {
        meetingId: meetingData.id,
        agendaHtmlLength: agendaHtml.length,
        attendeeCount: meetingData.attendees.length
      });

      // Send the agenda to all attendees
      const response = await apiRequest('POST', '/api/meetings/send-agenda', {
        meetingId: meetingData.id,
        formattedAgenda: agendaHtml,
        attendees: meetingData.attendees.map(a => a.email),
        meetingLink: meetingData.meetingLink,
        title: meetingData.title,
        startTime: meetingData.startTime,
        endTime: meetingData.endTime
      });

      if (response.ok) {
        // Complete the workflow
        setTimeout(() => {
          setCurrentStep('completed');
          if (onComplete) {
            onComplete(meetingData);
          }
        }, 800);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Server error response:', errorData);
        throw new Error(errorData.error || 'Failed to send agenda');
      }
    } catch (error) {
      console.error('Error sending agenda:', error);
      alert('I had trouble sending the agenda. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAgendaCancel = () => {
    // Go back to review step
    goToPreviousStep();
  };

  return (
    <div className="w-full flex flex-col">
      <div className="w-full max-w-5xl mx-auto flex flex-col">
        {/* Enhanced Progress Bar with better theming */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground">
              Step {['welcome', 'meeting_type', 'attendees', 'purpose', 'time', 'review', 'meeting_created', 'agenda'].indexOf(currentStep) + 1} of 8
            </span>
            <span className="text-sm font-medium text-primary">
              {Math.round(getStepProgress())}% complete
            </span>
          </div>
          <Progress value={getStepProgress()} className="h-3 rounded-full shadow-md bg-muted/50" />
        </div>

        {/* Main Content Card with better spacing and theming */}
        <Card className="shadow-2xl border-2 border-primary/10 bg-background/80 backdrop-blur-lg rounded-3xl overflow-visible">
          <CardContent className="p-6 md:p-8 flex flex-col w-full">
            {/* Welcome Step */}
            <div className={`transition-all duration-700 ${currentStep === 'welcome' ? 'opacity-100 translate-y-0 relative' : 'opacity-0 translate-y-4 absolute pointer-events-none'}`}>
              {currentStep === 'welcome' && (
                <WelcomeStep onContinue={advanceToNextStep} />
              )}
            </div>

            {/* Meeting Type Step */}
            <div className={`transition-all duration-700 ${currentStep === 'meeting_type' ? 'opacity-100 translate-y-0 relative' : direction === 'forward' && currentStep !== 'welcome' ? 'opacity-0 -translate-y-4 absolute pointer-events-none' : 'opacity-0 translate-y-4 absolute pointer-events-none'}`}>
              {currentStep === 'meeting_type' && (
                <MeetingTypeStep
                  selectedType={meetingData.type}
                  onSelect={handleMeetingTypeSelect}
                />
              )}
            </div>

            {/* Attendees Step */}
            <div className={`transition-all duration-700 ${currentStep === 'attendees' ? 'opacity-100 translate-y-0 relative' : 'opacity-0 translate-y-4 absolute pointer-events-none'}`}>
              {currentStep === 'attendees' && (
                <AttendeesStep
                  attendees={meetingData.attendees}
                  onAttendeesUpdate={handleAttendeesUpdate}
                  onSubmit={handleAttendeeSubmit}
                />
              )}
            </div>

            {/* Purpose Step */}
            <div className={`transition-all duration-700 ${currentStep === 'purpose' ? 'opacity-100 translate-y-0 relative' : 'opacity-0 translate-y-4 absolute pointer-events-none'}`}>
              {currentStep === 'purpose' && (
                <PurposeStep
                  purpose={meetingData.purpose}
                  onSubmit={handlePurposeSubmit}
                  isLoading={isLoading}
                />
              )}
            </div>

            {/* Time Step */}
            <div className={`transition-all duration-700 ${currentStep === 'time' ? 'opacity-100 translate-y-0 relative' : 'opacity-0 translate-y-4 absolute pointer-events-none'}`}>
              {currentStep === 'time' && (
                <TimeStep
                  onSubmit={handleTimeSubmit}
                  isLoading={isLoading}
                />
              )}
            </div>

            {/* Review Step */}
            <div className={`transition-all duration-700 ${currentStep === 'review' ? 'opacity-100 translate-y-0 relative' : 'opacity-0 translate-y-4 absolute pointer-events-none'}`}>
              {currentStep === 'review' && (
                <ReviewStep
                  meetingData={meetingData}
                  onCreateMeeting={handleCreateMeeting}
                  onGoBack={goToPreviousStep}
                  isLoading={isLoading}
                />
              )}
            </div>

            {/* Meeting Created Step */}
            <div className={`transition-all duration-700 ${currentStep === 'meeting_created' ? 'opacity-100 translate-y-0 relative' : 'opacity-0 translate-y-4 absolute pointer-events-none'}`}>
              {currentStep === 'meeting_created' && (
                <MeetingCreatedStep
                  meetingData={meetingData}
                  onContinueToAgenda={advanceToNextStep}
                />
              )}
            </div>

            {/* Agenda Step */}
            <div className={`transition-all duration-700 ${currentStep === 'agenda' ? 'opacity-100 translate-y-0 relative' : 'opacity-0 translate-y-4 absolute pointer-events-none'}`}>
              {currentStep === 'agenda' && (
                <AgendaStep
                  meetingData={meetingData}
                  onSave={handleAgendaSave}
                  onCancel={handleAgendaCancel}
                  isSending={isLoading}
                />
              )}
            </div>

            {/* Completed Step */}
            <div className={`transition-all duration-700 ${currentStep === 'completed' ? 'opacity-100 translate-y-0 relative' : 'opacity-0 translate-y-4 absolute pointer-events-none'}`}>
              {currentStep === 'completed' && (
                <CompletedStep meetingData={meetingData} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Enhanced Navigation */}
        {currentStep !== 'welcome' && currentStep !== 'completed' && (
          <div className="flex justify-between items-center mt-8 p-6 bg-muted/20 rounded-2xl border border-border/30">
            <Button
              variant="outline"
              onClick={goToPreviousStep}
              className="flex items-center gap-2 border-2 hover:border-primary/40 transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="text-sm text-muted-foreground font-medium">
              Press Enter or click continue to proceed
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Welcome Step Component
function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="text-center py-6 h-full flex flex-col justify-center">
      <div className="mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary/70 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl">
          <Sparkles className="h-10 w-10 text-primary-foreground" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
          Welcome to CalAI
        </h1>
        <p className="text-muted-foreground text-lg md:text-xl max-w-3xl mx-auto">
          Let's create your meeting in just a few simple steps with AI-powered assistance
        </p>
      </div>

      <div className="space-y-6 mb-8 max-w-xl mx-auto">
        <div className="flex items-start gap-4 text-left p-4 bg-primary/5 rounded-3xl border border-primary/20">
          <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center flex-shrink-0">
            <span className="text-primary font-bold">1</span>
          </div>
          <div>
            <p className="font-semibold text-foreground">Choose meeting type</p>
            <p className="text-sm text-muted-foreground">Online or physical meeting</p>
          </div>
        </div>

        <div className="flex items-start gap-4 text-left p-4 bg-primary/5 rounded-3xl border border-primary/20">
          <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center flex-shrink-0">
            <span className="text-primary font-bold">2</span>
          </div>
          <div>
            <p className="font-semibold text-foreground">Add attendees</p>
            <p className="text-sm text-muted-foreground">Invite people to your meeting</p>
          </div>
        </div>

        <div className="flex items-start gap-4 text-left p-4 bg-primary/5 rounded-3xl border border-primary/20">
          <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center flex-shrink-0">
            <span className="text-primary font-bold">3</span>
          </div>
          <div>
            <p className="font-semibold text-foreground">Set details & time</p>
            <p className="text-sm text-muted-foreground">Purpose and schedule</p>
          </div>
        </div>
      </div>

      <Button onClick={onContinue} size="lg" className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground px-10 py-4 text-xl font-semibold shadow-2xl hover:shadow-3xl transition-all duration-300 rounded-2xl">
        Let's Get Started
        <ArrowRight className="h-6 w-6 ml-3" />
      </Button>
    </div>
  );
}

// Meeting Type Step Component
function MeetingTypeStep({ selectedType, onSelect }: { selectedType?: 'online' | 'physical'; onSelect: (type: 'online' | 'physical') => void }) {
  return (
    <div className="py-4">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">What type of meeting?</h2>
        <p className="text-muted-foreground">This will determine how we set up your meeting</p>
      </div>

      <div className="grid gap-4">
        <Card
          className={`cursor-pointer transition-all duration-300 hover:shadow-lg border-2 ${
            selectedType === 'online' ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:border-blue-200'
          }`}
          onClick={() => onSelect('online')}
        >
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${selectedType === 'online' ? 'bg-blue-500' : 'bg-blue-100'}`}>
                <Video className={`h-6 w-6 ${selectedType === 'online' ? 'text-white' : 'text-blue-500'}`} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Online Meeting</h3>
                <p className="text-muted-foreground">Virtual meeting with Google Meet link</p>
              </div>
              {selectedType === 'online' && (
                <CheckCircle className="h-6 w-6 text-blue-500" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all duration-300 hover:shadow-lg border-2 ${
            selectedType === 'physical' ? 'border-green-500 bg-green-50' : 'border-transparent hover:border-green-200'
          }`}
          onClick={() => onSelect('physical')}
        >
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${selectedType === 'physical' ? 'bg-green-500' : 'bg-green-100'}`}>
                <Users className={`h-6 w-6 ${selectedType === 'physical' ? 'text-white' : 'text-green-500'}`} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Physical Meeting</h3>
                <p className="text-muted-foreground">In-person meeting at a specific location</p>
              </div>
              {selectedType === 'physical' && (
                <CheckCircle className="h-6 w-6 text-green-500" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Attendees Step Component
function AttendeesStep({ attendees, onAttendeesUpdate, onSubmit }: {
  attendees: AttendeeData[];
  onAttendeesUpdate: (attendees: AttendeeData[]) => void;
  onSubmit: () => void;
}) {
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');

  // Email validation regex for name@gmail.com format
  const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;

  const validateEmail = (email: string): boolean => {
    return emailRegex.test(email);
  };

  const handleAddAttendee = () => {
    if (!newEmail.trim()) return;

    if (!validateEmail(newEmail)) {
      setError('Please enter a valid Gmail address (name@gmail.com)');
      return;
    }

    if (attendees.some(a => a.email === newEmail)) {
      setError('This email is already added');
      return;
    }

    const newAttendee: AttendeeData = {
      email: newEmail,
      firstName: newEmail.split('@')[0],
      isValidated: true,
      isRequired: true
    };

    onAttendeesUpdate([...attendees, newAttendee]);
    setNewEmail('');
    setError('');
  };

  return (
    <div className="py-4">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Who will be attending?</h2>
        <p className="text-muted-foreground">Add the email addresses of meeting participants</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          {attendees.map((attendee, index) => (
            <div key={index} className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Badge variant="default" className="text-xs">
                {attendee.firstName}
              </Badge>
              <span className="text-sm flex-1">{attendee.email}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAttendeesUpdate(attendees.filter(a => a.email !== attendee.email))}
                className="h-6 w-6 p-0"
              >
                ×
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="attendee-email">Email Address</Label>
          <div className="flex gap-2">
            <Input
              id="attendee-email"
              type="email"
              placeholder="name@gmail.com"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddAttendee();
                }
              }}
            />
            <Button onClick={handleAddAttendee} disabled={!newEmail.trim()}>
              Add
            </Button>
          </div>
          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {error}
            </p>
          )}
        </div>

        {attendees.length > 0 && (
          <Button onClick={onSubmit} className="w-full" size="lg">
            Continue with {attendees.length} attendee{attendees.length !== 1 ? 's' : ''}
          </Button>
        )}
      </div>
    </div>
  );
}

// Purpose Step Component
function PurposeStep({ purpose, onSubmit, isLoading }: {
  purpose?: string;
  onSubmit: (purpose: string) => void;
  isLoading: boolean;
}) {
  const [input, setInput] = useState(purpose || '');

  const handleSubmit = () => {
    if (input.trim()) {
      onSubmit(input.trim());
    }
  };

  return (
    <div className="py-4">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">What's this meeting about?</h2>
        <p className="text-muted-foreground">Describe the purpose and I'll create a great title</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="meeting-purpose">Meeting Purpose</Label>
          <Textarea
            id="meeting-purpose"
            placeholder="e.g., Team standup to discuss project progress, or Client presentation for Q4 planning"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="w-full"
          size="lg"
        >
          {isLoading ? 'Creating Title...' : 'Create Title & Continue'}
        </Button>
      </div>
    </div>
  );
}

// Time Step Component
function TimeStep({ onSubmit, isLoading }: {
  onSubmit: (timeDescription: string) => void;
  isLoading: boolean;
}) {
  const [input, setInput] = useState('');

  const handleSubmit = () => {
    if (input.trim()) {
      onSubmit(input.trim());
    }
  };

  return (
    <div className="py-4">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">When should we meet?</h2>
        <p className="text-muted-foreground">Use natural language like "tomorrow at 2pm" or "next Friday morning"</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="meeting-time">Date & Time</Label>
          <Input
            id="meeting-time"
            placeholder="e.g., tomorrow at 2pm, October 16 at 3:30pm, next Monday morning"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSubmit();
              }
            }}
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="w-full"
          size="lg"
        >
          {isLoading ? 'Setting Time...' : 'Set Meeting Time'}
        </Button>
      </div>
    </div>
  );
}

// Review Step Component
function ReviewStep({ meetingData, onCreateMeeting, onGoBack, isLoading }: {
  meetingData: OnboardingMeetingData;
  onCreateMeeting: () => void;
  onGoBack: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="py-4">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Ready to create your meeting?</h2>
        <p className="text-muted-foreground">Review your meeting details below</p>
      </div>

      <div className="space-y-4 mb-8">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Calendar className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-semibold">{meetingData.title}</p>
                <p className="text-sm text-muted-foreground">Meeting Title</p>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-3">
              {meetingData.type === 'online' ? (
                <Video className="h-5 w-5 text-blue-500" />
              ) : (
                <Users className="h-5 w-5 text-green-500" />
              )}
              <div>
                <p className="font-semibold capitalize">{meetingData.type} Meeting</p>
                <p className="text-sm text-muted-foreground">
                  {meetingData.type === 'online' ? 'Virtual meeting' : 'In-person meeting'}
                </p>
              </div>
            </div>

            {meetingData.startTime && (
              <div className="flex items-center gap-3 mb-3">
                <Calendar className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="font-semibold">
                    {new Date(meetingData.startTime).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(meetingData.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                    {meetingData.endTime && new Date(meetingData.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )}

            {meetingData.attendees.length > 0 && (
              <div className="mb-3">
                <p className="font-semibold mb-2">Attendees ({meetingData.attendees.length})</p>
                <div className="flex flex-wrap gap-1">
                  {meetingData.attendees.map((attendee, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {attendee.firstName}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {meetingData.purpose && (
              <div>
                <p className="font-semibold mb-2">Purpose</p>
                <p className="text-sm text-muted-foreground">
                  {meetingData.enhancedPurpose || meetingData.purpose}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Button
        onClick={onCreateMeeting}
        disabled={isLoading}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 border-0"
        size="lg"
      >
        {isLoading ? 'Creating Meeting...' : 'Create Meeting & Send Invites'}
      </Button>
    </div>
  );
}

// Meeting Created Step Component
function MeetingCreatedStep({ meetingData, onContinueToAgenda }: {
  meetingData: OnboardingMeetingData;
  onContinueToAgenda: () => void;
}) {
  return (
    <div className="text-center py-8">
      <div className="mb-8">
        <div className="w-28 h-28 bg-gradient-to-br from-emerald-500 to-green-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl ring-4 ring-emerald-100 dark:ring-emerald-900/30">
          <CheckCircle className="h-14 w-14 text-white" />
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold mb-6 text-foreground">
          🎉 Meeting Created Successfully!
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-6 leading-relaxed">
          Your meeting has been created and calendar invites have been sent to all attendees.
        </p>
      </div>

      <Card className="max-w-2xl mx-auto mb-8 shadow-xl border-0 bg-gradient-to-br from-emerald-50/80 to-green-50/80 dark:from-emerald-900/20 dark:to-green-900/20 backdrop-blur-sm rounded-2xl overflow-hidden">
        <CardHeader className="pb-6">
          <CardTitle className="text-emerald-800 dark:text-emerald-200 flex items-center justify-center gap-3 text-xl">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Calendar className="h-4 w-4 text-white" />
            </div>
            Meeting Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-left">
          <div className="space-y-2">
            <strong className="text-emerald-800 dark:text-emerald-200 text-sm font-semibold uppercase tracking-wide">Title:</strong>
            <p className="text-emerald-700 dark:text-emerald-300 font-medium bg-white/60 dark:bg-white/5 p-3 rounded-xl">{meetingData.title}</p>
          </div>
          <div className="space-y-2">
            <strong className="text-emerald-800 dark:text-emerald-200 text-sm font-semibold uppercase tracking-wide">Time:</strong>
            <p className="text-emerald-700 dark:text-emerald-300 font-medium bg-white/60 dark:bg-white/5 p-3 rounded-xl">
              {meetingData.startTime && meetingData.endTime 
                ? `${new Date(meetingData.startTime).toLocaleString()} - ${new Date(meetingData.endTime).toLocaleTimeString()}`
                : 'Time not specified'
              }
            </p>
          </div>
          <div className="space-y-2">
            <strong className="text-emerald-800 dark:text-emerald-200 text-sm font-semibold uppercase tracking-wide">Attendees:</strong>
            <p className="text-emerald-700 dark:text-emerald-300 font-medium bg-white/60 dark:bg-white/5 p-3 rounded-xl">{meetingData.attendees.length} invited</p>
          </div>
          {meetingData.meetingLink && (
            <div className="space-y-2">
              <strong className="text-emerald-800 dark:text-emerald-200 text-sm font-semibold uppercase tracking-wide">Meeting Link:</strong>
              <p className="text-emerald-700 dark:text-emerald-300 font-medium bg-white/60 dark:bg-white/5 p-3 rounded-xl break-all text-sm">{meetingData.meetingLink}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <p className="text-muted-foreground text-lg leading-relaxed">
          Next, let's create and send a detailed agenda to all attendees.
        </p>
        <Button
          onClick={onContinueToAgenda}
          size="lg"
          className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white px-10 py-5 text-lg font-semibold shadow-2xl hover:shadow-emerald-500/25 transition-all duration-300 rounded-2xl ring-2 ring-emerald-500/20 hover:ring-emerald-500/40"
        >
          Continue to Create Agenda
          <ArrowRight className="h-5 w-5 ml-3" />
        </Button>
      </div>
    </div>
  );
}

// Agenda Step Component
function AgendaStep({ meetingData, onSave, onCancel, isSending }: {
  meetingData: OnboardingMeetingData;
  onSave: (agendaHtml: string) => void;
  onCancel: () => void;
  isSending: boolean;
}) {
  return (
    <div className="py-4">
      <EnhancedAgendaEditor
        meetingData={meetingData}
        onSave={onSave}
        onCancel={onCancel}
        isSending={isSending}
      />
    </div>
  );
}

// Completed Step Component
function CompletedStep({ meetingData }: { meetingData: OnboardingMeetingData }) {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle className="h-8 w-8 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Meeting Created!</h2>
      <p className="text-muted-foreground mb-6">
        Your meeting "{meetingData.title}" has been scheduled successfully
      </p>

      {meetingData.meetingLink && (
        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
          <CardContent className="p-4">
            <p className="font-semibold text-blue-800 mb-2">Google Meet Link</p>
            <a
              href={meetingData.meetingLink}
              className="text-blue-600 hover:text-blue-800 underline break-all"
              target="_blank"
              rel="noopener noreferrer"
            >
              {meetingData.meetingLink}
            </a>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 text-sm text-muted-foreground">
        Invitations have been sent to all attendees
      </div>
    </div>
  );
}