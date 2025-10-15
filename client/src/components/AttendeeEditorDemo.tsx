import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Bot, User, Calendar, Video } from 'lucide-react';
import { AttendeeEditor } from './AttendeeEditor';
import { ConversationalMeetingUIBlock } from './ConversationalMeetingUIBlocks';
import { useConversationalMeeting } from '../hooks/useConversationalMeeting';
import { AttendeeData } from '../../../shared/schema';

interface DemoMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  uiBlock?: any;
}

export function AttendeeEditorDemo() {
  const [messages, setMessages] = useState<DemoMessage[]>([
    {
      id: '1',
      role: 'user',
      content: 'I need to schedule an online meeting with the team for tomorrow at 2 PM',
      timestamp: new Date(),
    }
  ]);

  const {
    createMeetingWorkflow,
    generateUIBlock,
    handleTypeSelection,
    handleAttendeesUpdate,
    handleContinueFromAttendees,
    handleMeetingApproval,
    getMeetingData
  } = useConversationalMeeting();

  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);

  // Simulate AI detecting online meeting intent
  const simulateOnlineMeetingDetection = () => {
    const meetingId = `meeting-${Date.now()}`;
    setCurrentMeetingId(meetingId);

    // Create meeting workflow
    createMeetingWorkflow(meetingId, {
      title: 'Team Meeting',
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(), // Tomorrow + 1 hour
    });

    // Add AI response asking about meeting type
    const aiMessage: DemoMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: 'I can help you schedule that meeting! First, let me confirm the meeting type.',
      timestamp: new Date(),
      uiBlock: generateUIBlock(meetingId)
    };

    setMessages(prev => [...prev, aiMessage]);
  };

  // Handle meeting type selection
  const onTypeSelect = (type: 'physical' | 'online', meetingId: string) => {
    handleTypeSelection(meetingId, type);

    let content = '';
    if (type === 'online') {
      content = 'Perfect! Since this is an online meeting, I\'ll need to collect attendee information. Online meetings require at least one attendee.';
    } else {
      content = 'Got it! For a physical meeting, please add any attendees you\'d like to invite.';
    }

    const aiMessage: DemoMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: new Date(),
      uiBlock: generateUIBlock(meetingId)
    };

    setMessages(prev => [...prev, aiMessage]);
  };

  // Handle attendee updates
  const onAttendeesUpdate = (attendees: AttendeeData[], meetingId: string) => {
    handleAttendeesUpdate(meetingId, attendees);
  };

  // Handle continue from attendees
  const onContinue = (meetingId: string) => {
    const result = handleContinueFromAttendees(meetingId);
    
    if (result.success) {
      const aiMessage: DemoMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'Great! Here\'s a summary of your meeting. Please review and approve.',
        timestamp: new Date(),
        uiBlock: generateUIBlock(meetingId)
      };

      setMessages(prev => [...prev, aiMessage]);
    } else {
      const errorMessage: DemoMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${result.error}`,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // Handle meeting approval
  const onApprove = (meetingId: string) => {
    handleMeetingApproval(meetingId);

    const aiMessage: DemoMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: 'Meeting approved! I\'ll create the calendar event and send invites to all attendees.',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, aiMessage]);
    setCurrentMeetingId(null);
  };

  // Handle field editing
  const onEdit = (field: string, meetingId: string) => {
    console.log(`Editing ${field} for meeting ${meetingId}`);
  };

  // Reset demo
  const resetDemo = () => {
    setMessages([
      {
        id: '1',
        role: 'user',
        content: 'I need to schedule an online meeting with the team for tomorrow at 2 PM',
        timestamp: new Date(),
      }
    ]);
    setCurrentMeetingId(null);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            AttendeeEditor Integration Demo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            This demo shows how the AttendeeEditor component integrates with the conversational meeting scheduler.
            When an online meeting is detected, the system automatically triggers the attendee management workflow.
          </p>
          
          <div className="flex gap-2 mb-4">
            <Button onClick={simulateOnlineMeetingDetection} disabled={currentMeetingId !== null}>
              Start Online Meeting Flow
            </Button>
            <Button variant="outline" onClick={resetDemo}>
              Reset Demo
            </Button>
          </div>

          {currentMeetingId && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 text-blue-800">
                <Video className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Online meeting detected - Attendee management workflow active
                </span>
              </div>
              <p className="text-xs text-blue-600 mt-1">
                Meeting ID: {currentMeetingId}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chat Interface Simulation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Chat Interface</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="p-2 bg-primary/10 rounded-full">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                
                <div className={`max-w-[85%] ${message.role === 'user' ? 'order-first' : ''}`}>
                  <div
                    className={`rounded-lg px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground ml-auto'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                  
                  {/* Render UI blocks */}
                  {message.uiBlock && (
                    <div className="mt-3">
                      <ConversationalMeetingUIBlock
                        uiBlock={message.uiBlock}
                        onTypeSelect={onTypeSelect}
                        onAttendeesUpdate={onAttendeesUpdate}
                        onContinue={onContinue}
                        onApprove={onApprove}
                        onEdit={onEdit}
                      />
                    </div>
                  )}
                  
                  <div className={`flex items-center gap-2 mt-1 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-xs text-muted-foreground">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {message.role === 'user' && (
                      <Badge variant="outline" className="text-xs">
                        User
                      </Badge>
                    )}
                  </div>
                </div>
                
                {message.role === 'user' && (
                  <div className="p-2 bg-muted rounded-full">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Standalone AttendeeEditor Demo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Standalone AttendeeEditor</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            This is the AttendeeEditor component in standalone mode for testing.
          </p>
          <StandaloneAttendeeEditorDemo />
        </CardContent>
      </Card>
    </div>
  );
}

// Standalone demo component
function StandaloneAttendeeEditorDemo() {
  const [attendees, setAttendees] = useState<AttendeeData[]>([]);

  const handleAttendeesChange = (newAttendees: AttendeeData[]) => {
    setAttendees(newAttendees);
  };

  const handleValidation = (results: any[]) => {
    console.log('Validation results:', results);
  };

  return (
    <div className="space-y-4">
      <AttendeeEditor
        attendees={attendees}
        onAttendeesChange={handleAttendeesChange}
        onValidation={handleValidation}
        maxAttendees={10}
      />
      
      {attendees.length > 0 && (
        <div className="p-4 bg-muted rounded-lg">
          <h4 className="font-medium mb-2">Current Attendees:</h4>
          <div className="space-y-1">
            {attendees.map((attendee, index) => (
              <div key={index} className="text-sm">
                <span className="font-medium">
                  {attendee.firstName ? `${attendee.firstName} ${attendee.lastName || ''}`.trim() : attendee.email}
                </span>
                <span className="text-muted-foreground ml-2">({attendee.email})</span>
                {attendee.isValidated && (
                  <Badge variant="default" className="ml-2 text-xs">Verified</Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}