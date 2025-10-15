import React, { useState } from 'react';
import { Calendar, Users, Video, CheckCircle, AlertCircle, FileText, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AttendeeEditor } from './AttendeeEditor';
import { AgendaEditor } from './AgendaEditor';
import { AttendeeData } from '../../../shared/schema';

import { ConversationalUIBlock } from '../services/conversationalMeetingService';

// Export AgendaApproval as an alias for AgendaEditorBlock for backward compatibility
export { AgendaEditorBlock as AgendaApproval };

// Meeting type selection UI block with location input for physical meetings
interface MeetingTypeSelectionProps {
  data: {
    meetingId: string;
    question: string;
    currentType?: 'physical' | 'online';
    currentLocation?: string;
  };
  onTypeSelect: (type: 'physical' | 'online', meetingId: string, location?: string) => void;
}

export function MeetingTypeSelection({ data, onTypeSelect }: MeetingTypeSelectionProps) {
  const [selectedType, setSelectedType] = useState<'physical' | 'online' | null>(data.currentType || null);
  const [location, setLocation] = useState(data.currentLocation || '');
  const [locationError, setLocationError] = useState('');

  const handleTypeSelect = (type: 'physical' | 'online') => {
    setSelectedType(type);
    setLocationError('');
    
    // If online meeting, immediately proceed
    if (type === 'online') {
      onTypeSelect(type, data.meetingId);
    }
  };

  const handleLocationSubmit = () => {
    if (!location.trim()) {
      setLocationError('Location is required for physical meetings');
      return;
    }
    
    if (location.trim().length < 3) {
      setLocationError('Please provide a more specific location');
      return;
    }
    
    onTypeSelect('physical', data.meetingId, location.trim());
  };

  const handleLocationChange = (value: string) => {
    setLocation(value);
    if (locationError) {
      setLocationError('');
    }
  };

  return (
    <Card className="w-full max-w-md border-2 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-500" />
          Meeting Type
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3 space-y-4">
        <p className="text-sm text-muted-foreground font-sans" style={{ lineHeight: '1.5' }}>
          {data.question}
        </p>
        
        {/* Meeting type selection buttons */}
        <div className="flex gap-2">
          <Button
            variant={selectedType === 'physical' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTypeSelect('physical')}
            className={`flex-1 ${selectedType === 'physical' ? 'bg-green-500 hover:bg-green-600' : ''}`}
            data-testid="button-physical-meeting"
          >
            <Users className="h-3 w-3 mr-1" />
            Physical
          </Button>
          <Button
            variant={selectedType === 'online' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTypeSelect('online')}
            className={`flex-1 ${selectedType === 'online' ? 'bg-blue-500 hover:bg-blue-600' : ''}`}
            data-testid="button-online-meeting"
          >
            <Video className="h-3 w-3 mr-1" />
            Online
          </Button>
        </div>

        {/* Location input for physical meetings */}
        {selectedType === 'physical' && (
          <div className="space-y-2">
            <Label htmlFor="meeting-location" className="text-sm font-medium">
              Meeting Location
            </Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="meeting-location"
                type="text"
                placeholder="Enter meeting location (e.g., Conference Room A, 123 Main St)"
                value={location}
                onChange={(e) => handleLocationChange(e.target.value)}
                className={`pl-10 ${locationError ? 'border-red-500' : ''}`}
                data-testid="input-meeting-location"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleLocationSubmit();
                  }
                }}
              />
            </div>
            {locationError && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {locationError}
              </p>
            )}
            <Button
              onClick={handleLocationSubmit}
              disabled={!location.trim()}
              className="w-full bg-green-500 hover:bg-green-600"
              data-testid="button-confirm-physical-meeting"
            >
              Confirm Physical Meeting
            </Button>
          </div>
        )}

        {/* Business rule enforcement message for online meetings */}
        {selectedType === 'online' && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-start gap-2">
                <Video className="h-4 w-4 text-blue-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-800">Online Meeting Selected</p>
                  <p className="text-blue-700">You'll be asked to add attendees next, as online meetings require participants.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}

// Attendee management UI block using the new AttendeeEditor
interface AttendeeManagementProps {
  data: {
    meetingId: string;
    attendees: AttendeeData[];
    meetingType: 'physical' | 'online';
    isRequired: boolean;
  };
  onAttendeesUpdate: (attendees: AttendeeData[], meetingId: string) => void;
  onContinue: (meetingId: string) => void;
}

export function AttendeeManagement({ data, onAttendeesUpdate, onContinue }: AttendeeManagementProps) {
  const [attendees, setAttendees] = useState<AttendeeData[]>(data.attendees);

  const handleAttendeesChange = (newAttendees: AttendeeData[]) => {
    setAttendees(newAttendees);
    onAttendeesUpdate(newAttendees, data.meetingId);
  };

  const canContinue = data.isRequired ? attendees.length > 0 : true;

  return (
    <div className="w-full max-w-2xl space-y-4">
      <AttendeeEditor
        attendees={attendees}
        onAttendeesChange={handleAttendeesChange}
        maxAttendees={50}
      />
      
      {/* Business rule enforcement message */}
      {data.meetingType === 'online' && data.isRequired && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-orange-800">Online meetings require attendees</p>
                <p className="text-orange-700">Please add at least one attendee to continue.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Continue button */}
      <div className="flex justify-end">
        <Button
          onClick={() => onContinue(data.meetingId)}
          disabled={!canContinue}
          className="bg-blue-500 hover:bg-blue-600"
          data-testid="button-continue-attendees"
        >
          {attendees.length > 0 ? `Continue with ${attendees.length} attendee${attendees.length !== 1 ? 's' : ''}` : 'Continue'}
        </Button>
      </div>
    </div>
  );
}

// Meeting approval UI block with comprehensive summary and edit options
interface MeetingApprovalProps {
  data: {
    meetingId: string;
    title: string;
    type: 'physical' | 'online';
    startTime: string;
    endTime: string;
    location?: string;
    attendees: AttendeeData[];
    agenda?: string;
    validation?: {
      isValid: boolean;
      errors: string[];
      warnings: string[];
    };
  };
  onApprove: (meetingId: string) => void;
  onEdit: (field: string, meetingId: string) => void;
}

export function MeetingApproval({ data, onApprove, onEdit }: MeetingApprovalProps) {
  const startTime = new Date(data.startTime);
  const endTime = new Date(data.endTime);
  const duration = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
  
  // Check if meeting can be approved based on validation
  const canApprove = !data.validation || data.validation.isValid;
  const hasErrors = data.validation && data.validation.errors.length > 0;
  const hasWarnings = data.validation && data.validation.warnings && data.validation.warnings.length > 0;

  return (
    <Card className="w-full max-w-2xl border-2 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          Review & Approve Meeting
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Please review all meeting details before creating the calendar event.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Validation Messages */}
        {hasErrors && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-red-800">Please fix the following issues:</p>
                  <ul className="list-disc list-inside text-red-700 mt-1">
                    {data.validation!.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {hasWarnings && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-800">Warnings:</p>
                  <ul className="list-disc list-inside text-yellow-700 mt-1">
                    {data.validation!.warnings!.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {/* Meeting Title */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <p className="font-semibold text-base">{data.title}</p>
              <p className="text-sm text-muted-foreground">Meeting Title</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit('title', data.meetingId)}
              data-testid="button-edit-title"
            >
              Edit
            </Button>
          </div>

          {/* Meeting Type and Location */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3 flex-1">
              {data.type === 'online' ? (
                <Video className="h-5 w-5 text-blue-500" />
              ) : (
                <Users className="h-5 w-5 text-green-500" />
              )}
              <div>
                <p className="font-semibold text-base capitalize">{data.type} Meeting</p>
                {data.location ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {data.location}
                  </p>
                ) : data.type === 'online' ? (
                  <p className="text-sm text-muted-foreground">Meeting link will be generated</p>
                ) : (
                  <p className="text-sm text-red-600">Location required</p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit('type', data.meetingId)}
              data-testid="button-edit-type"
            >
              Edit
            </Button>
          </div>

          {/* Meeting Time and Duration */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <p className="font-semibold text-base">
                {startTime.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                <span className="ml-2">({duration} minutes)</span>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit('time', data.meetingId)}
              data-testid="button-edit-time"
            >
              Edit
            </Button>
          </div>

          {/* Attendees */}
          <div className="flex items-start justify-between p-3 border rounded-lg">
            <div className="flex-1">
              <p className="font-semibold text-base mb-2">
                Attendees ({data.attendees.length})
              </p>
              {data.attendees.length > 0 ? (
                <div className="space-y-2">
                  {data.attendees.map((attendee, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Badge 
                        variant={attendee.isValidated ? "default" : "secondary"} 
                        className="text-xs"
                      >
                        {attendee.firstName || attendee.email}
                        {attendee.isValidated && (
                          <CheckCircle className="h-3 w-3 ml-1 text-green-600" />
                        )}
                      </Badge>
                      {!attendee.isValidated && (
                        <span className="text-xs text-yellow-600">Pending validation</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {data.type === 'online' ? 'No attendees added (required for online meetings)' : 'No attendees added'}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit('attendees', data.meetingId)}
              data-testid="button-edit-attendees"
            >
              Edit
            </Button>
          </div>

          {/* Agenda (if present) */}
          {data.agenda && (
            <div className="flex items-start justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <p className="font-semibold text-base mb-2">Meeting Agenda</p>
                <div className="text-sm text-muted-foreground max-h-32 overflow-y-auto">
                  <div dangerouslySetInnerHTML={{ __html: data.agenda.replace(/\n/g, '<br>') }} />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit('agenda', data.meetingId)}
                data-testid="button-edit-agenda"
              >
                Edit
              </Button>
            </div>
          )}
        </div>

        {/* Business Rules Summary */}
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-800">Meeting Creation Summary</p>
                <ul className="text-blue-700 mt-1 space-y-1">
                  <li>• Calendar event will be created with all attendees</li>
                  {data.type === 'online' && (
                    <li>• Meeting link will be generated and included</li>
                  )}
                  {data.agenda && (
                    <li>• Agenda will be included in the meeting description</li>
                  )}
                  <li>• All attendees will receive calendar invitations</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Approval Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={() => onApprove(data.meetingId)}
            disabled={!canApprove}
            className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300"
            data-testid="button-approve-meeting"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {canApprove ? 'Create Meeting' : 'Fix Issues to Continue'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Agenda editor UI block
interface AgendaEditorBlockProps {
  data: {
    meetingId: string;
    initialAgenda: string;
    meetingTitle: string;
    duration: number;
    isApprovalMode?: boolean;
    validation?: {
      isValid: boolean;
      errors: string[];
      warnings: string[];
    };
  };
  onAgendaUpdate: (agenda: string, meetingId: string) => void;
  onAgendaApprove: (agenda: string, meetingId: string) => void;
  onAgendaRegenerate: (meetingId: string) => void;
}

export function AgendaEditorBlock({ data, onAgendaUpdate, onAgendaApprove, onAgendaRegenerate }: AgendaEditorBlockProps) {
  const [agenda, setAgenda] = useState(data.initialAgenda);

  const handleContentChange = (content: string) => {
    setAgenda(content);
    onAgendaUpdate(content, data.meetingId);
  };

  const handleApprove = (finalContent: string) => {
    onAgendaApprove(finalContent, data.meetingId);
  };

  const handleRegenerate = () => {
    onAgendaRegenerate(data.meetingId);
  };

  return (
    <div className="w-full max-w-4xl">
      <div className="mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-500" />
          {data.isApprovalMode ? 'Review & Approve Agenda' : 'Review & Edit Agenda'}
        </h3>
        <p className="text-sm text-muted-foreground">
          {data.isApprovalMode 
            ? `Please review the agenda for "${data.meetingTitle}" and approve it to proceed with meeting creation.`
            : `Review the generated agenda for "${data.meetingTitle}" and make any necessary edits.`
          }
        </p>
        
        {/* Show validation status if in approval mode */}
        {data.isApprovalMode && data.validation && (
          <div className="mt-2">
            {data.validation.isValid ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                Agenda is ready for approval
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                Please fix validation issues before approving
              </div>
            )}
          </div>
        )}
      </div>
      
      <AgendaEditor
        initialContent={data.initialAgenda}
        onContentChange={handleContentChange}
        onApprove={handleApprove}
        onRegenerate={handleRegenerate}
        showPreview={true}
        maxLength={2000}
      />
    </div>
  );
}

// Main component that renders the appropriate conversational UI block
interface ConversationalMeetingUIBlockProps {
  uiBlock: ConversationalUIBlock;
  onTypeSelect?: (type: 'physical' | 'online', meetingId: string, location?: string) => void;
  onAttendeesUpdate?: (attendees: AttendeeData[], meetingId: string) => void;
  onContinue?: (meetingId: string) => void;
  onApprove?: (meetingId: string) => void;
  onEdit?: (field: string, meetingId: string) => void;
  onAgendaUpdate?: (agenda: string, meetingId: string) => void;
  onAgendaApprove?: (agenda: string, meetingId: string) => void;
  onAgendaRegenerate?: (meetingId: string) => void;
}

export function ConversationalMeetingUIBlock({
  uiBlock,
  onTypeSelect,
  onAttendeesUpdate,
  onContinue,
  onApprove,
  onEdit,
  onAgendaUpdate,
  onAgendaApprove,
  onAgendaRegenerate,
}: ConversationalMeetingUIBlockProps) {
  switch (uiBlock.type) {
    case 'meeting_type_selection':
      return (
        <MeetingTypeSelection
          data={uiBlock.data}
          onTypeSelect={onTypeSelect || (() => {})}
        />
      );
    case 'attendee_management':
      return (
        <AttendeeManagement
          data={uiBlock.data}
          onAttendeesUpdate={onAttendeesUpdate || (() => {})}
          onContinue={onContinue || (() => {})}
        />
      );
    case 'meeting_approval':
      return (
        <MeetingApproval
          data={uiBlock.data}
          onApprove={onApprove || (() => {})}
          onEdit={onEdit || (() => {})}
        />
      );
    case 'agenda_editor':
      return (
        <AgendaEditorBlock
          data={uiBlock.data}
          onAgendaUpdate={onAgendaUpdate || (() => {})}
          onAgendaApprove={onAgendaApprove || (() => {})}
          onAgendaRegenerate={onAgendaRegenerate || (() => {})}
        />
      );
    default:
      return null;
  }
}