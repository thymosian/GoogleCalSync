import { useState, useEffect } from "react";
import { Check, Plus, X, Calendar, Users, Video, Mail, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format, parseISO } from "date-fns";
import { Attendee, UIBlock } from "../../../shared/schema";
import { apiRequest } from "@/lib/queryClient";

// Email validation utility
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isVerifiedEmail = (email: string): boolean => {
  // Consider common email providers as verified
  const trustedDomains = ['gmail.com', 'google.com', 'outlook.com', 'hotmail.com', 'yahoo.com'];
  const domain = email.toLowerCase().split('@')[1];
  return trustedDomains.includes(domain);
};

interface MeetingLinkChoiceProps {
  data: UIBlock & { type: 'meeting_link_choice' };
  onChoice: (includeLink: boolean, meetingId: string) => void;
}

export function MeetingLinkChoice({ data, onChoice }: MeetingLinkChoiceProps) {
  return (
    <Card className="w-full max-w-md border-2 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Video className="h-4 w-4 text-blue-500" />
          Google Meet Link
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-sm text-muted-foreground mb-4 font-sans" style={{ lineHeight: '1.5' }}>
          {data.data.question}
        </p>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => onChoice(true, data.data.meetingId)}
            className="flex-1 bg-blue-500 hover:bg-blue-600"
            data-testid="button-add-meet-link"
          >
            <Video className="h-3 w-3 mr-1" />
            Yes
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChoice(false, data.data.meetingId)}
            className="flex-1"
            data-testid="button-skip-meet-link"
          >
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface AttendeeEditorProps {
  data: UIBlock & { type: 'attendee_editor' };
  onAttendeesUpdate: (attendees: Attendee[], meetingId: string) => void;
}

export function AttendeeEditor({ data, onAttendeesUpdate }: AttendeeEditorProps) {
  const [attendees, setAttendees] = useState<Attendee[]>(data.data.attendees);
  const [newEmail, setNewEmail] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState('');

  const addAttendee = async () => {
    if (!newEmail.trim()) return;
    
    const isValid = validateEmail(newEmail);
    if (!isValid) {
      setVerificationError('Please enter a valid email address');
      return;
    }
    
    setVerificationError('');
    setIsVerifying(true);
    
    try {
      // Verify the email address
      const response = await apiRequest(
        'POST',
        '/api/ai/verify-attendees',
        {
          emails: [newEmail.trim().toLowerCase()]
        }
      );

      const verificationResults = await response.json();
      const verificationResult = verificationResults[0];
      
      const newAttendee: Attendee = {
        email: newEmail.trim().toLowerCase(),
        verified: verificationResult.trusted || verificationResult.valid,
      };

      const updatedAttendees = [...attendees, newAttendee];
      setAttendees(updatedAttendees);
      setNewEmail('');
      onAttendeesUpdate(updatedAttendees, data.data.meetingId);
    } catch (error) {
      console.error('Error verifying attendee:', error);
      // Add the attendee anyway but mark as unverified
      const newAttendee: Attendee = {
        email: newEmail.trim().toLowerCase(),
        verified: isVerifiedEmail(newEmail.trim().toLowerCase()),
      };

      const updatedAttendees = [...attendees, newAttendee];
      setAttendees(updatedAttendees);
      setNewEmail('');
      onAttendeesUpdate(updatedAttendees, data.data.meetingId);
    } finally {
      setIsVerifying(false);
    }
  };

  const removeAttendee = (index: number) => {
    const updatedAttendees = attendees.filter((_, i) => i !== index);
    setAttendees(updatedAttendees);
    onAttendeesUpdate(updatedAttendees, data.data.meetingId);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addAttendee();
    }
  };

  // Function to proceed to next step
  const handleNext = () => {
    if (attendees.length > 0) {
      onAttendeesUpdate(attendees, data.data.meetingId);
    }
  };

  return (
    <Card className="w-full max-w-lg border-2 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-green-500" />
          Meeting Attendees
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {attendees.map((attendee, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 bg-muted rounded-md"
              data-testid={`attendee-${index}`}
            >
              <Mail className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm flex-1">{attendee.email}</span>
              {attendee.verified ? (
                <CheckCircle className="h-4 w-4 text-green-600" data-testid="verified-tick" />
              ) : (
                <span className="text-xs text-muted-foreground">Unverified</span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeAttendee(index)}
                className="h-6 w-6 p-0"
                data-testid={`button-remove-attendee-${index}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              setVerificationError('');
            }}
            onKeyDown={handleKeyPress}
            placeholder="Enter email address"
            className="flex-1"
            data-testid="input-attendee-email"
            disabled={isVerifying}
          />
          <Button
            onClick={addAttendee}
            size="sm"
            variant="outline"
            disabled={!newEmail.trim() || isVerifying}
            data-testid="button-add-attendee"
          >
            {isVerifying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
          </Button>
        </div>

        {verificationError && (
          <p className="text-xs text-destructive font-sans" style={{ lineHeight: '1.5' }}>
            {verificationError}
          </p>
        )}
        
        <p className="text-xs text-muted-foreground font-sans" style={{ lineHeight: '1.5' }}>
          Add attendees by entering their email addresses.
        </p>
        
        {attendees.length > 0 && (
          <Button
            onClick={handleNext}
            className="w-full mt-2 bg-green-500 hover:bg-green-600"
            data-testid="button-next-attendees"
          >
            Next: Choose Title
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface TitleSuggestionsProps {
  data: UIBlock & { type: 'title_suggestions' };
  onTitleSelect: (title: string, meetingId: string) => void;
}

export function TitleSuggestions({ data, onTitleSelect }: TitleSuggestionsProps) {
  const [customTitle, setCustomTitle] = useState(data.data.currentTitle || '');

  const handleCustomTitle = () => {
    if (customTitle.trim()) {
      onTitleSelect(customTitle.trim(), data.data.meetingId);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCustomTitle();
    }
  };

  const handleSuggestionSelect = (suggestion: string) => {
    onTitleSelect(suggestion, data.data.meetingId);
  };

  return (
    <Card className="w-full max-w-lg border-2 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-purple-500" />
          Meeting Title
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-sans" style={{ lineHeight: '1.5' }}>
            Suggestions:
          </p>
          <div className="space-y-1">
            {data.data.suggestions.map((suggestion, index) => (
              <Button
                key={index}
                variant="ghost"
                className="w-full justify-start text-left h-auto py-2 hover:bg-purple-50"
                onClick={() => handleSuggestionSelect(suggestion)}
                data-testid={`button-title-suggestion-${index}`}
              >
                <span className="text-sm">{suggestion}</span>
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-sans" style={{ lineHeight: '1.5' }}>
            Or create your own:
          </p>
          <div className="flex gap-2">
            <Input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Enter meeting title"
              className="flex-1"
              data-testid="input-custom-title"
            />
            <Button
              onClick={handleCustomTitle}
              size="sm"
              disabled={!customTitle.trim()}
              className="bg-purple-500 hover:bg-purple-600"
              data-testid="button-use-custom-title"
            >
              <Check className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface EventReviewProps {
  data: UIBlock & { type: 'event_review' };
  onCreateEvent: (meetingId: string) => void;
  onEdit: (field: string, meetingId: string) => void;
}

export function EventReview({ data, onCreateEvent, onEdit }: EventReviewProps) {
  const startTime = parseISO(data.data.startTime);
  const endTime = parseISO(data.data.endTime);

  return (
    <Card className="w-full max-w-lg border-2 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-orange-500" />
          Review Meeting
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm font-sans" style={{ lineHeight: '1.5' }}>{data.data.title}</p>
              <p className="text-xs text-muted-foreground font-sans" style={{ lineHeight: '1.5' }}>
                Title
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit('title', data.data.meetingId)}
              data-testid="button-edit-title"
            >
              Edit
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm font-sans" style={{ lineHeight: '1.5' }}>
                {format(startTime, 'MMM d, yyyy')}
              </p>
              <p className="text-xs text-muted-foreground font-sans" style={{ lineHeight: '1.5' }}>
                {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit('time', data.data.meetingId)}
              data-testid="button-edit-time"
            >
              Edit
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <div className="flex flex-wrap gap-1 mb-1">
                {data.data.attendees.map((attendee, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {attendee.email}
                    {attendee.verified && (
                      <CheckCircle className="h-3 w-3 ml-1 text-green-600" />
                    )}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground font-sans" style={{ lineHeight: '1.5' }}>
                {data.data.attendees.length} attendee{data.data.attendees.length !== 1 ? 's' : ''}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit('attendees', data.data.meetingId)}
              data-testid="button-edit-attendees"
            >
              Edit
            </Button>
          </div>

          {data.data.includeMeetLink && (
            <>
              <Separator />
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-blue-600" />
                <p className="text-sm text-muted-foreground font-sans" style={{ lineHeight: '1.5' }}>
                  Google Meet link included
                </p>
              </div>
            </>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={() => onCreateEvent(data.data.meetingId)}
          className="w-full bg-orange-500 hover:bg-orange-600"
          data-testid="button-create-event"
        >
          <Calendar className="h-4 w-4 mr-2" />
          Create Meeting
        </Button>
      </CardFooter>
    </Card>
  );
}

// Main component that renders the appropriate UI block
interface MeetingUIBlockProps {
  uiBlock: UIBlock;
  onMeetingLinkChoice?: (includeLink: boolean, meetingId: string) => void;
  onAttendeesUpdate?: (attendees: Attendee[], meetingId: string) => void;
  onTitleSelect?: (title: string, meetingId: string) => void;
  onCreateEvent?: (meetingId: string) => void;
  onEditField?: (field: string, meetingId: string) => void;
}

export function MeetingUIBlock({
  uiBlock,
  onMeetingLinkChoice,
  onAttendeesUpdate,
  onTitleSelect,
  onCreateEvent,
  onEditField,
}: MeetingUIBlockProps) {
  switch (uiBlock.type) {
    case 'meeting_link_choice':
      return (
        <MeetingLinkChoice
          data={uiBlock}
          onChoice={onMeetingLinkChoice || (() => {})}
        />
      );
    case 'attendee_editor':
      return (
        <AttendeeEditor
          data={uiBlock}
          onAttendeesUpdate={onAttendeesUpdate || (() => {})}
        />
      );
    case 'title_suggestions':
      return (
        <TitleSuggestions
          data={uiBlock}
          onTitleSelect={onTitleSelect || (() => {})}
        />
      );
    case 'event_review':
      return (
        <EventReview
          data={uiBlock}
          onCreateEvent={onCreateEvent || (() => {})}
          onEdit={onEditField || (() => {})}
        />
      );
    default:
      return null;
  }
}