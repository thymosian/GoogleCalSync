import { useState } from "react";
import { Check, Plus, X, Calendar, Users, Video, Mail, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format, parseISO } from "date-fns";
import { Attendee, UIBlock } from "../../../shared/schema";

// Email validation utility
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isVerifiedEmail = (email: string): boolean => {
  // Consider Gmail emails as verified, but don't restrict to only Gmail
  return email.toLowerCase().includes('@gmail.com') || email.toLowerCase().includes('@google.com');
};

interface MeetingLinkChoiceProps {
  data: UIBlock & { type: 'meeting_link_choice' };
  onChoice: (includeLink: boolean, meetingId: string) => void;
}

export function MeetingLinkChoice({ data, onChoice }: MeetingLinkChoiceProps) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Video className="h-4 w-4" />
          Google Meet Link
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-sm text-muted-foreground mb-4">
          {data.data.question}
        </p>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => onChoice(true, data.data.meetingId)}
            className="flex-1"
            data-testid="button-add-meet-link"
          >
            <Video className="h-3 w-3 mr-1" />
            Yes, add link
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

  const addAttendee = () => {
    if (!newEmail.trim()) return;
    
    const isValid = validateEmail(newEmail);
    if (!isValid) return; // Don't add invalid emails
    
    const newAttendee: Attendee = {
      email: newEmail.trim().toLowerCase(),
      verified: isVerifiedEmail(newEmail.trim().toLowerCase()),
    };

    const updatedAttendees = [...attendees, newAttendee];
    setAttendees(updatedAttendees);
    setNewEmail('');
    onAttendeesUpdate(updatedAttendees, data.data.meetingId);
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

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
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
              {attendee.verified && (
                <CheckCircle className="h-4 w-4 text-green-600" data-testid="verified-tick" />
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
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Enter email address"
            className="flex-1"
            data-testid="input-attendee-email"
          />
          <Button
            onClick={addAttendee}
            size="sm"
            variant="outline"
            disabled={!newEmail.trim()}
            data-testid="button-add-attendee"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        {newEmail && !validateEmail(newEmail) && (
          <p className="text-xs text-destructive">
            Please enter a valid email address
          </p>
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

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Meeting Title
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">AI Suggestions:</p>
          <div className="space-y-1">
            {data.data.suggestions.map((suggestion, index) => (
              <Button
                key={index}
                variant="ghost"
                className="w-full justify-start text-left h-auto py-2"
                onClick={() => onTitleSelect(suggestion, data.data.meetingId)}
                data-testid={`button-title-suggestion-${index}`}
              >
                <span className="text-sm">{suggestion}</span>
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Or enter custom title:</p>
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
    <Card className="w-full max-w-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Review Meeting Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{data.data.title}</p>
              <p className="text-xs text-muted-foreground">Meeting title</p>
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
              <p className="font-medium text-sm">
                {format(startTime, 'MMM d, yyyy')}
              </p>
              <p className="text-xs text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">
                  Google Meet link will be included
                </p>
              </div>
            </>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={() => onCreateEvent(data.data.meetingId)}
          className="w-full"
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