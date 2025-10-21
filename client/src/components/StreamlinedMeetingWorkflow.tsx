import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Video, Users, Calendar, MessageCircle, Edit, CheckCircle, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiRequest } from '@/lib/queryClient';
import { AttendeeData } from '../../../shared/schema';
import AgendaReviewEditor from './AgendaReviewEditor';
import { EnhancedAgendaEditor } from './EnhancedAgendaEditor';

export type WorkflowStep =
  | 'meeting_type_selection'
  | 'attendee_management'
  | 'information_collection'
  | 'time_selection'
  | 'event_summary'
  | 'agenda_review'
  | 'completed';

export interface MeetingWorkflowData {
  id: string;
  type?: 'online' | 'physical';
  attendees: AttendeeData[];
  purpose?: string;
  enhancedPurpose?: string;
  title?: string;
  titleSuggestions?: string[];
  startTime?: string;
  endTime?: string;
  meetingLink?: string;
  keyPoints?: string[];
}

interface StreamlinedMeetingWorkflowProps {
  onComplete?: (meetingData: MeetingWorkflowData) => void;
  onSidebarUpdate?: (meetingData: MeetingWorkflowData) => void;
}

export function StreamlinedMeetingWorkflow({ onComplete, onSidebarUpdate }: StreamlinedMeetingWorkflowProps) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('meeting_type_selection');
  const [meetingData, setMeetingData] = useState<MeetingWorkflowData>({
    id: `meeting-${Date.now()}`,
    attendees: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string, timestamp: Date}>>([]);

  // Agenda review state
  const [showAgendaReview, setShowAgendaReview] = useState(false);
  const [generatedAgenda, setGeneratedAgenda] = useState('');
  const [formattedAgenda, setFormattedAgenda] = useState('');
  const [isSendingAgenda, setIsSendingAgenda] = useState(false);
  const [error, setError] = useState('');

  // Email validation regex for name@gmail.com format
  const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;

  const validateEmail = (email: string): boolean => {
    return emailRegex.test(email);
  };

  const addChatMessage = (role: 'user' | 'assistant', content: string) => {
    setChatMessages(prev => [...prev, { role, content, timestamp: new Date() }]);
  };

  const handleMeetingTypeSelect = (type: 'online' | 'physical') => {
    setMeetingData(prev => ({ ...prev, type }));
    addChatMessage('assistant', `Great! I've selected ${type} meeting. The meeting type is now locked.`);

    if (type === 'online') {
      setCurrentStep('attendee_management');
      addChatMessage('assistant', 'Now let\'s add attendees for your online meeting.');
    } else {
      setCurrentStep('information_collection');
      addChatMessage('assistant', 'Let\'s collect information about your physical meeting.');
    }
  };

  const handleAttendeesUpdate = (attendees: AttendeeData[]) => {
    setMeetingData(prev => ({ ...prev, attendees }));
  };

  const handleAttendeeSubmit = () => {
    if (meetingData.attendees.length > 0) {
      setCurrentStep('information_collection');
      addChatMessage('assistant', `Perfect! ${meetingData.attendees.length} attendees added. Now let\'s get some information about your meeting.`);
    }
  };

  const handleInformationSubmit = async (purpose: string) => {
    setIsLoading(true);
    try {
      // Generate title and enhanced purpose using AI
      const response = await apiRequest('POST', '/api/ai/generate-title-and-purpose', {
        purpose,
        participants: meetingData.attendees.map(a => a.email),
        context: `Meeting with ${meetingData.attendees.length} attendees about ${purpose}`
      });

      const aiData = await response.json();
      console.log('AI Response received:', aiData);

      if (!aiData.title) {
        console.warn('No title in response, using purpose as fallback');
      }

      const generatedTitle = aiData.title || `${purpose.substring(0, 50)} Meeting`;
      const enhancedPurpose = aiData.enhancedPurpose || purpose;

      // Enhanced debug logging for enhanced purpose
      console.log('Enhanced purpose from AI:', enhancedPurpose);
      console.log('Enhanced purpose length:', enhancedPurpose?.length || 0);
      console.log('Enhanced purpose is empty?', !enhancedPurpose || enhancedPurpose.trim() === '');
      console.log('Original purpose:', purpose);

      console.log('Setting meeting data with title:', generatedTitle);

      setMeetingData(prev => ({
        ...prev,
        purpose,
        enhancedPurpose,
        title: generatedTitle,
        titleSuggestions: aiData.titleSuggestions,
        keyPoints: aiData.keyPoints
      }));
      
      setCurrentStep('time_selection');
      addChatMessage('assistant', `Great! I've created the title "${generatedTitle}" based on your description. Now let\'s find a good time for your meeting.`);
    } catch (error) {
      console.error('Error generating title and purpose:', error);
      const fallbackTitle = `${purpose.substring(0, 50)} Meeting`;
      setMeetingData(prev => ({ ...prev, purpose, title: fallbackTitle }));
      setCurrentStep('time_selection');
      addChatMessage('assistant', 'Now let\'s find a good time for your meeting.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTimeSubmit = async (timeDescription: string) => {
    setIsLoading(true);
    try {
      // Use AI to interpret natural language time
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

        addChatMessage('assistant', `Perfect! I've scheduled your meeting for ${new Date(timeData.startTime).toLocaleString()}.`);
        setCurrentStep('event_summary');
      } else {
        addChatMessage('assistant', 'I need a bit more clarification on the time. Could you please specify the date and time (e.g., "tomorrow at 2pm" or "October 16 at 3:30pm")?');
      }
    } catch (error) {
      console.error('Error processing time:', error);
      addChatMessage('assistant', 'I had trouble understanding that time. Could you please specify it differently?');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateMeetingLink = async () => {
    setIsLoading(true);
    try {
      // Create Google Calendar event with meeting link
      const description = meetingData.enhancedPurpose && meetingData.enhancedPurpose.trim() !== ''
        ? meetingData.enhancedPurpose
        : meetingData.purpose || 'No description provided';

      console.log('Creating calendar event with description:', description);
      console.log('Enhanced purpose available:', !!meetingData.enhancedPurpose);
      console.log('Using fallback description:', description === meetingData.purpose || description === 'No description provided');

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

        // Update sidebar
        if (onSidebarUpdate) {
          onSidebarUpdate(updatedMeetingData);
        }

        // Generate and review agenda instead of completing
        console.log('About to call generateAndReviewAgenda with:', updatedMeetingData);
        await generateAndReviewAgenda(updatedMeetingData);
        console.log('generateAndReviewAgenda completed');
      } else {
        throw new Error(eventData.error || 'Failed to create meeting');
      }
    } catch (error) {
      console.error('Error creating meeting:', error);
      addChatMessage('assistant', 'I had trouble creating the meeting. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeSomething = async (changeRequest: string) => {
    setIsLoading(true);
    try {
      // Use AI to identify what field to change
      const response = await apiRequest('POST', '/api/ai/identify-field-to-edit', {
        message: changeRequest,
        currentMeeting: meetingData
      });

      const editData = await response.json();

      if (editData.field) {
        addChatMessage('assistant', `I understand you want to change the ${editData.field}. Let me help you with that.`);
        // Navigate back to appropriate step or show specific editor
        switch (editData.field) {
          case 'attendees':
            setCurrentStep('attendee_management');
            break;
          case 'time':
            setCurrentStep('time_selection');
            break;
          case 'purpose':
          case 'title':
            setCurrentStep('information_collection');
            break;
          default:
            addChatMessage('assistant', 'I\'m not sure which field you want to change. Could you be more specific?');
        }
      } else {
        addChatMessage('assistant', 'I\'m not sure what you want to change. Could you please specify (e.g., "change the time", "add more attendees", "modify the purpose")?');
      }
    } catch (error) {
      console.error('Error processing change request:', error);
      addChatMessage('assistant', 'I had trouble understanding your change request. Could you please specify what you want to modify?');
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate duration in minutes between two times
  const calculateDurationInMinutes = (startTime: string, endTime: string): number => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
  };

  // Generate and review agenda after meeting creation
   const generateAndReviewAgenda = async (updatedMeetingData: MeetingWorkflowData) => {
     try {
       console.log('generateAndReviewAgenda called with:', updatedMeetingData);
       setIsLoading(true);

       // Update the meeting data with the meeting link
       setMeetingData(updatedMeetingData);
       console.log('Meeting data updated, transitioning to agenda review...');

       // Transition to Step 7: Agenda Review
       setShowAgendaReview(true);
       setCurrentStep('agenda_review');
       console.log('State updated: showAgendaReview=true, currentStep=agenda_review');

       addChatMessage('assistant', '🎉 Meeting created successfully! Google Meet link: ' + updatedMeetingData.meetingLink);
       addChatMessage('assistant', 'Opening agenda editor for final review...');

     } catch (error) {
       console.error('Error in generateAndReviewAgenda:', error);
       setError('Failed to open agenda review. Please try again.');
     } finally {
       setIsLoading(false);
     }
   };

  // Function to convert agenda to HTML
  const convertAgendaToHtml = (agenda: any) => {
    if (!agenda || !agenda.topics) {
      return '<p>No agenda available</p>';
    }

    let html = `<h2>Meeting Agenda: ${agenda.title}</h2>`;
    html += `<p><strong>Duration:</strong> ${agenda.duration} minutes</p>`;

    html += '<ol>';
    agenda.topics.forEach((topic: any) => {
      html += `<li><strong>${topic.title}</strong> (${topic.duration} min)`;
      if (topic.description) {
        html += `<p>${topic.description}</p>`;
      }
      if (topic.presenter) {
        html += `<p><em>Presenter: ${topic.presenter}</em></p>`;
      }
      html += '</li>';
    });
    html += '</ol>';

    if (agenda.actionItems && agenda.actionItems.length > 0) {
      html += '<h3>Action Items</h3>';
      html += '<ul>';
      agenda.actionItems.forEach((item: any) => {
        html += `<li><strong>${item.task}</strong>`;
        if (item.assignee) {
          html += ` - Assigned to: ${item.assignee}`;
        }
        if (item.deadline) {
          html += ` - Due: ${item.deadline}`;
        }
        html += ` [${item.priority.toUpperCase()}]</li>`;
      });
      html += '</ul>';
    }

    return html;
  };

  // Function to send the agenda to attendees
   const sendAgendaToAttendees = async (htmlAgenda: string) => {
     try {
       setIsSendingAgenda(true);

       // Send the rich HTML agenda via email
       const response = await apiRequest('POST', '/api/email/send-agenda', {
         meetingId: meetingData.id,
         attendees: meetingData.attendees,
         meetingData: {
           title: meetingData.title,
           startTime: meetingData.startTime,
           endTime: meetingData.endTime,
           type: meetingData.type,
           meetingLink: meetingData.meetingLink,
           description: meetingData.enhancedPurpose || meetingData.purpose
         },
         agendaContent: {
           html: htmlAgenda,
           text: htmlAgenda.replace(/<[^>]*>/g, ''), // Strip HTML for text version
           title: meetingData.title,
           duration: meetingData.startTime && meetingData.endTime ?
             calculateDurationInMinutes(meetingData.startTime, meetingData.endTime) : 60
         }
       });

       if (!response.ok) {
         throw new Error('Failed to send agenda');
       }

       // Show success message
       addChatMessage('assistant', '🎉 Meeting agenda sent to all attendees successfully!');
       setCurrentStep('completed');
       setShowAgendaReview(false);

       if (onComplete) {
         onComplete(meetingData);
       }

     } catch (error) {
       console.error('Error sending agenda:', error);
       addChatMessage('assistant', 'Failed to send agenda to attendees. Please try again.');
     } finally {
       setIsSendingAgenda(false);
     }
   };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Progress Indicator */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            {[
               { step: 'meeting_type_selection', label: 'Type', icon: Calendar },
               { step: 'attendee_management', label: 'Attendees', icon: Users },
               { step: 'information_collection', label: 'Purpose', icon: MessageCircle },
               { step: 'time_selection', label: 'Time', icon: Calendar },
               { step: 'event_summary', label: 'Summary', icon: CheckCircle },
               { step: 'agenda_review', label: 'Agenda', icon: Edit },
               { step: 'completed', label: 'Done', icon: CheckCircle }
             ].map(({ step, label, icon: Icon }) => (
              <div key={step} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                  currentStep === step ? 'border-primary bg-primary text-primary-foreground' :
                  Object.keys(meetingData).length > 1 ? 'border-green-500 bg-green-500 text-white' :
                  'border-muted-foreground'
                }`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="ml-2 text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      {currentStep === 'meeting_type_selection' && (
        <MeetingTypeSelectionCard
          selectedType={meetingData.type}
          onSelect={handleMeetingTypeSelect}
        />
      )}

      {currentStep === 'attendee_management' && (
        <AttendeeManagementCard
          attendees={meetingData.attendees}
          onAttendeesUpdate={handleAttendeesUpdate}
          onSubmit={handleAttendeeSubmit}
        />
      )}

      {currentStep === 'information_collection' && (
        <InformationCollectionCard
          purpose={meetingData.purpose}
          onSubmit={handleInformationSubmit}
          isLoading={isLoading}
        />
      )}

      {currentStep === 'time_selection' && (
        <TimeSelectionCard
          onSubmit={handleTimeSubmit}
          isLoading={isLoading}
        />
      )}

      {currentStep === 'event_summary' && (
        <EventSummaryCard
          meetingData={meetingData}
          onCreateMeetingLink={handleCreateMeetingLink}
          onChangeSomething={handleChangeSomething}
          isLoading={isLoading}
        />
      )}

      {currentStep === 'agenda_review' && (
        <EnhancedAgendaEditor
          meetingData={meetingData}
          onSave={sendAgendaToAttendees}
          onCancel={() => setShowAgendaReview(false)}
          isSending={isSendingAgenda}
        />
      )}

      {currentStep === 'completed' && (
        <Card className="text-center py-8">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Meeting Created Successfully!</h3>
          <p className="text-muted-foreground">
            Your meeting "{meetingData.title}" has been created and agenda sent to all attendees.
          </p>
          {meetingData.meetingLink && (
            <p className="mt-2 text-sm">
              <a href={meetingData.meetingLink} className="text-blue-500 hover:underline">
                Join Meeting
              </a>
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

// Meeting Type Selection Component
interface MeetingTypeSelectionCardProps {
  selectedType?: 'online' | 'physical';
  onSelect: (type: 'online' | 'physical') => void;
}

function MeetingTypeSelectionCard({ selectedType, onSelect }: MeetingTypeSelectionCardProps) {
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-500" />
          Select Meeting Type
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose the type of meeting you'd like to schedule. This cannot be changed once selected.
        </p>

        <div className="grid gap-3">
          <Button
            variant={selectedType === 'online' ? 'default' : 'outline'}
            className={`p-4 h-auto ${selectedType === 'online' ? 'bg-blue-500 hover:bg-blue-600' : ''}`}
            onClick={() => onSelect('online')}
          >
            <div className="flex items-center gap-3">
              <Video className="h-5 w-5" />
              <div className="text-left">
                <div className="font-medium">Online Meeting</div>
                <div className="text-sm opacity-90">Virtual meeting with Google Meet</div>
              </div>
            </div>
          </Button>

          <Button
            variant={selectedType === 'physical' ? 'default' : 'outline'}
            className={`p-4 h-auto ${selectedType === 'physical' ? 'bg-green-500 hover:bg-green-600' : ''}`}
            onClick={() => onSelect('physical')}
          >
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5" />
              <div className="text-left">
                <div className="font-medium">Physical Meeting</div>
                <div className="text-sm opacity-90">In-person meeting at a location</div>
              </div>
            </div>
          </Button>
        </div>

        {selectedType && (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-lg">
            <CheckCircle className="h-4 w-4" />
            Meeting type locked: {selectedType}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Attendee Management Component
interface AttendeeManagementCardProps {
  attendees: AttendeeData[];
  onAttendeesUpdate: (attendees: AttendeeData[]) => void;
  onSubmit: () => void;
}

function AttendeeManagementCard({ attendees, onAttendeesUpdate, onSubmit }: AttendeeManagementCardProps) {
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

  const handleRemoveAttendee = (email: string) => {
    onAttendeesUpdate(attendees.filter(a => a.email !== email));
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-green-500" />
          Add Attendees
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {attendees.map((attendee, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
              <Badge variant="default" className="text-xs">
                {attendee.firstName}
              </Badge>
              <span className="text-sm flex-1">{attendee.email}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveAttendee(attendee.email)}
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
          <Button onClick={onSubmit} className="w-full">
            Continue ({attendees.length} attendees)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Information Collection Component
interface InformationCollectionCardProps {
  purpose?: string;
  onSubmit: (purpose: string) => void;
  isLoading: boolean;
}

function InformationCollectionCard({ purpose, onSubmit, isLoading }: InformationCollectionCardProps) {
  const [input, setInput] = useState(purpose || '');

  const handleSubmit = () => {
    if (input.trim()) {
      onSubmit(input.trim());
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-purple-500" />
          Meeting Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Please describe what this meeting is about. I'll use this to generate a suitable title.
        </p>

        <div className="space-y-2">
          <Label htmlFor="meeting-purpose">Meeting Purpose</Label>
          <Textarea
            id="meeting-purpose"
            placeholder="e.g., Team standup to discuss project progress, or Client presentation for Q4 planning"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="w-full"
        >
          {isLoading ? 'Generating Title & Purpose...' : 'Generate Title & Purpose'}
        </Button>
      </CardContent>
    </Card>
  );
}

// Time Selection Component
interface TimeSelectionCardProps {
  onSubmit: (timeDescription: string) => void;
  isLoading: boolean;
}

function TimeSelectionCard({ onSubmit, isLoading }: TimeSelectionCardProps) {
  const [input, setInput] = useState('');

  const handleSubmit = () => {
    if (input.trim()) {
      onSubmit(input.trim());
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-orange-500" />
          Select Meeting Time
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          When would you like to schedule this meeting? You can use natural language like "tomorrow at 2pm" or "next Friday at 10am".
        </p>

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
        >
          {isLoading ? 'Processing Time...' : 'Set Meeting Time'}
        </Button>
      </CardContent>
    </Card>
  );
}

// Event Summary Component
interface EventSummaryCardProps {
  meetingData: MeetingWorkflowData;
  onCreateMeetingLink: () => void;
  onChangeSomething: (changeRequest: string) => void;
  isLoading: boolean;
}

function EventSummaryCard({ meetingData, onCreateMeetingLink, onChangeSomething, isLoading }: EventSummaryCardProps) {
  const [changeInput, setChangeInput] = useState('');

  const handleChangeSubmit = () => {
    if (changeInput.trim()) {
      onChangeSomething(changeInput.trim());
      setChangeInput('');
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          Meeting Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <p className="font-semibold">{meetingData.title}</p>
              <p className="text-sm text-muted-foreground">Meeting Title</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
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
          </div>

          {meetingData.startTime && (
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-semibold">
                  {new Date(meetingData.startTime).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
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
            <div className="p-3 border rounded-lg">
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

          {(meetingData.enhancedPurpose || meetingData.purpose) && (
            <div className="p-3 border rounded-lg bg-blue-50 border-blue-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-semibold mb-2 text-blue-900">Meeting Purpose</p>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    {meetingData.enhancedPurpose || meetingData.purpose}
                  </p>
                </div>
              </div>
              {meetingData.keyPoints && meetingData.keyPoints.length > 0 && (
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <p className="text-xs font-semibold text-blue-900 mb-2">Key Points:</p>
                  <ul className="text-xs text-blue-800 space-y-1">
                    {meetingData.keyPoints.map((point, index) => (
                      <li key={index} className="flex gap-2">
                        <span className="text-blue-500">•</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Button
            onClick={onCreateMeetingLink}
            disabled={isLoading}
            className="flex-1 bg-green-500 hover:bg-green-600"
          >
            {isLoading ? 'Creating Meeting...' : 'Create Meeting Link'}
          </Button>

          <div className="flex-1">
            <div className="space-y-2">
              <Input
                placeholder="What would you like to change?"
                value={changeInput}
                onChange={(e) => setChangeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleChangeSubmit();
                  }
                }}
              />
              <Button
                onClick={handleChangeSubmit}
                disabled={!changeInput.trim() || isLoading}
                variant="outline"
                className="w-full"
              >
                <Edit className="h-4 w-4 mr-2" />
                Change Something
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}