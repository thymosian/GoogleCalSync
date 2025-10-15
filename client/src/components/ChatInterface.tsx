import { Bot, Send, User, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { MeetingUIBlock } from "./MeetingUIBlocks";
import { ConversationalMeetingUIBlock } from "./ConversationalMeetingUIBlocks";
import { ConversationalUIBlock } from "../services/conversationalMeetingService";
import { EnhancedChatMessage as ChatMessage, Attendee, UIBlock, MeetingExtraction, AttendeeData } from "../../../shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface MeetingData {
  id: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  attendees: Attendee[];
  includeMeetLink: boolean;
  purpose?: string;
  aiSuggestions?: string[];
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onAddAssistantMessage?: (message: ChatMessage) => void;
  isLoading?: boolean;
  userName?: string;
  userAvatar?: string;
  // Conversational UI block handlers
  onTypeSelect?: (type: 'physical' | 'online', meetingId: string, location?: string) => void;
  onAttendeesUpdate?: (attendees: AttendeeData[], meetingId: string) => void;
  onContinue?: (meetingId: string) => void;
  onApprove?: (meetingId: string) => void;
  onEdit?: (field: string, meetingId: string) => void;
  onAgendaUpdate?: (agenda: string, meetingId: string) => void;
  onAgendaApprove?: (agenda: string, meetingId: string) => void;
  onAgendaRegenerate?: (meetingId: string) => void;
}

const quickActions = [
  "Schedule a meeting with the team",
  "What's my next meeting about?",
  "Generate an agenda for tomorrow's standup",
  "Summarize today's meetings",
  "Find a good time for a 1-on-1",
  "Check for scheduling conflicts",
  "Create a meeting with attendees"
];

const surprisePrompts = [
  "Schedule a team sync for next week",
  "What does my schedule look like tomorrow?",
  "Create a meeting with john@company.com and sarah@company.com",
  "Find time for a 30-minute coffee chat",
  "Generate an agenda for our quarterly review",
  "Reschedule my 2 PM meeting to 4 PM"
];

export function ChatInterface({
  messages,
  onSendMessage,
  onAddAssistantMessage,
  isLoading = false,
  userName = "User",
  userAvatar,
  onTypeSelect,
  onAttendeesUpdate,
  onContinue,
  onApprove,
  onEdit,
  onAgendaUpdate,
  onAgendaApprove,
  onAgendaRegenerate
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [meetingData, setMeetingData] = useState<Record<string, MeetingData>>({});
  const [processingMeeting, setProcessingMeeting] = useState(false);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (input.trim() && !isLoading) {
      const userMessage = input.trim();
      setInput('');

      // Send the regular message first
      onSendMessage(userMessage);

      // Check for special commands
      if (userMessage.toLowerCase() === '/create meeting' || userMessage.toLowerCase() === '/meeting') {
        // Directly trigger the meeting creation flow
        const mockExtraction: MeetingExtraction = {
          intent: 'create_meeting',
          confidence: 0.9,
          fields: {
            duration: 60,
            purpose: 'Team Meeting',
            participants: [],
            suggestedTitle: 'Team Meeting'
          },
          missing: []
        };

        await startMeetingCreationFlow(mockExtraction, userMessage);
        return;
      }

      // Check if this message indicates meeting creation intent
      try {
        setProcessingMeeting(true);
        const response = await apiRequest(
          'POST',
          '/api/ai/extract-meeting',
          {
            message: userMessage,
            context: messages.slice(-3).map(m => ({ role: m.role, content: m.content }))
          }
        );

        const extraction = await response.json();

        if (extraction.intent !== 'other' && extraction.confidence > 0.6) {
          // Start the meeting creation flow
          await startMeetingCreationFlow(extraction, userMessage);
        }
      } catch (error) {
        console.error('Error extracting meeting intent:', error);
      } finally {
        setProcessingMeeting(false);
      }
    }
  };

  const startMeetingCreationFlow = async (extraction: MeetingExtraction, originalMessage: string) => {
    const meetingId = `meeting-${Date.now()}`;

    // Initialize meeting data
    const newMeetingData: MeetingData = {
      id: meetingId,
      title: extraction.fields.suggestedTitle,
      startTime: extraction.fields.startTime,
      endTime: extraction.fields.endTime,
      attendees: extraction.fields.participants.map(email => ({
        email: email.toLowerCase(),
        verified: email.toLowerCase().includes('@gmail.com') || email.toLowerCase().includes('@google.com')
      })),
      includeMeetLink: false,
      purpose: extraction.fields.purpose
    };

    setMeetingData(prev => ({ ...prev, [meetingId]: newMeetingData }));

    // Add AI response with meeting link choice - FIRST QUESTION
    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: "I'd be happy to help create this meeting!\n\nWould you like to include a Google Meet link?",
      timestamp: new Date(),
      uiBlock: {
        type: 'meeting_link_choice',
        data: {
          question: "Would you like to include a Google Meet link for this meeting?",
          meetingId
        }
      },
      metadata: {
        extraction,
        meetingId
      }
    };

    // Add the assistant message with UI block to the message list
    if (onAddAssistantMessage) {
      onAddAssistantMessage(assistantMessage);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const handleQuickAction = (action: string) => {
    // Special handling for the new quick action
    if (action === "Create a meeting with attendees") {
      // Create a mock meeting extraction to trigger the attendee editor directly
      const mockExtraction: MeetingExtraction = {
        intent: 'create_meeting',
        confidence: 0.9,
        fields: {
          duration: 60,
          purpose: 'Team Meeting',
          participants: [],
          suggestedTitle: 'Team Meeting'
        },
        missing: []
      };

      // Start the meeting creation flow with the mock extraction
      startMeetingCreationFlow(mockExtraction, action);
      return;
    }

    onSendMessage(action);
  };

  const handleSurpriseMe = () => {
    const randomPrompt = surprisePrompts[Math.floor(Math.random() * surprisePrompts.length)];
    onSendMessage(randomPrompt);
  };

  // Meeting creation event handlers
  const handleMeetingLinkChoice = (includeLink: boolean, meetingId: string) => {
    setMeetingData(prev => ({
      ...prev,
      [meetingId]: { ...prev[meetingId], includeMeetLink: includeLink }
    }));

    // Move to attendee editor step - SECOND QUESTION
    const message: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `${includeLink ? 'Great! Adding a Google Meet link.' : 'Got it, no meeting link.'}\n\nWho's attending this meeting?`,
      timestamp: new Date(),
      uiBlock: {
        type: 'attendee_editor',
        data: {
          attendees: meetingData[meetingId]?.attendees || [],
          meetingId
        }
      }
    };

    if (onAddAssistantMessage) {
      onAddAssistantMessage(message);
    }
  };

  const handleAttendeesUpdate = async (attendees: Attendee[], meetingId: string) => {
    setMeetingData(prev => ({
      ...prev,
      [meetingId]: { ...prev[meetingId], attendees }
    }));

    // Generate AI title suggestions if we have enough context
    const currentMeeting = meetingData[meetingId];
    if (currentMeeting?.purpose && attendees.length > 0) {
      try {
        const response = await apiRequest(
          'POST',
          '/api/ai/generate-titles',
          {
            purpose: currentMeeting.purpose,
            participants: attendees.map(a => a.email),
            context: `Meeting with ${attendees.length} attendees about ${currentMeeting.purpose}`
          }
        );

        const titleSuggestion = await response.json();

        const message: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: 'What should we call this meeting?',
          timestamp: new Date(),
          uiBlock: {
            type: 'title_suggestions',
            data: {
              suggestions: titleSuggestion.suggestions,
              currentTitle: currentMeeting.title,
              meetingId
            }
          }
        };

        if (onAddAssistantMessage) {
          onAddAssistantMessage(message);
        }
      } catch (error) {
        console.error('Error generating titles:', error);
        // Fallback to a simple message if title generation fails
        const message: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: 'What should we call this meeting?',
          timestamp: new Date(),
          uiBlock: {
            type: 'title_suggestions',
            data: {
              suggestions: [
                `${currentMeeting.purpose || 'Team'} Meeting`,
                `Discussion: ${currentMeeting.purpose || 'Topic'}`,
                `${currentMeeting.purpose || 'Project'} Sync`
              ],
              currentTitle: currentMeeting.title,
              meetingId
            }
          }
        };

        if (onAddAssistantMessage) {
          onAddAssistantMessage(message);
        }
      }
    } else {
      // If we don't have enough context, ask for a title directly
      const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'What should we call this meeting?',
        timestamp: new Date(),
        uiBlock: {
          type: 'title_suggestions',
          data: {
            suggestions: [
              'Team Meeting',
              'Discussion Session',
              'Project Sync'
            ],
            currentTitle: currentMeeting?.title,
            meetingId
          }
        }
      };

      if (onAddAssistantMessage) {
        onAddAssistantMessage(message);
      }
    }
  };

  const handleTitleSelect = (title: string, meetingId: string) => {
    setMeetingData(prev => ({
      ...prev,
      [meetingId]: { ...prev[meetingId], title }
    }));

    // Move to final review step - FINAL CONFIRMATION
    const currentMeeting = meetingData[meetingId];
    if (currentMeeting) {
      const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'Here\'s your meeting summary:',
        timestamp: new Date(),
        uiBlock: {
          type: 'event_review',
          data: {
            title,
            startTime: currentMeeting.startTime || new Date().toISOString(),
            endTime: currentMeeting.endTime || new Date(Date.now() + 60 * 60 * 1000).toISOString(), // Default to 1 hour from now
            attendees: currentMeeting.attendees,
            includeMeetLink: currentMeeting.includeMeetLink,
            meetingId
          }
        }
      };

      if (onAddAssistantMessage) {
        onAddAssistantMessage(message);
      }
    }
  };

  const handleCreateEvent = async (meetingId: string) => {
    const currentMeeting = meetingData[meetingId];
    if (!currentMeeting) return;

    try {
      const response = await apiRequest(
        'POST',
        '/api/calendar/events',
        {
          title: currentMeeting.title,
          startTime: currentMeeting.startTime,
          endTime: currentMeeting.endTime,
          attendees: currentMeeting.attendees,
          createMeetLink: currentMeeting.includeMeetLink,
          description: `Meeting created via AI Calendar Assistant`
        }
      );

      const responseData = await response.json();

      if (responseData.success) {
        const successMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `Meeting created! ${responseData.event?.meetingLink ? `\nGoogle Meet: ${responseData.event.meetingLink}` : ''}\nInvites sent to all attendees.`,
          timestamp: new Date()
        };

        if (onAddAssistantMessage) {
          onAddAssistantMessage(successMessage);
        }

        // Clean up meeting data
        setMeetingData(prev => {
          const updated = { ...prev };
          delete updated[meetingId];
          return updated;
        });
      }
    } catch (error) {
      console.error('Error creating meeting:', error);
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, there was an error creating the meeting. Please try again.',
        timestamp: new Date()
      };

      if (onAddAssistantMessage) {
        onAddAssistantMessage(errorMessage);
      }
    }
  };

  const handleEditField = (field: string, meetingId: string) => {
    // Handle editing specific fields - could navigate back to appropriate UI block
    console.log(`Editing ${field} for meeting ${meetingId}`);
  };

  return (
    <Card className="h-full flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">AI Calendar Assistant</h2>
            <p className="text-sm text-muted-foreground">
              {getTimeBasedGreeting()}! How can I help?
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="space-y-4">
                <div className="text-center py-8">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="font-medium mb-2">Ready to help you schedule smarter</h3>
                  <p className="text-sm text-muted-foreground">
                    Try asking me to schedule a meeting or generate an agenda
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Quick Actions</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSurpriseMe}
                      className="text-xs"
                      data-testid="button-surprise-me"
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Surprise Me
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    {quickActions.map((action, index) => (
                      <Button
                        key={index}
                        variant="ghost"
                        className="justify-start text-left h-auto py-2 px-3"
                        onClick={() => handleQuickAction(action)}
                        data-testid={`button-quick-action-${index}`}
                      >
                        <span className="text-sm">{action}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                data-testid={`message-${message.id}`}
              >
                {message.role === 'assistant' && (
                  <Avatar className="h-8 w-8 mt-1">
                    <AvatarFallback className="bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={`max-w-[85%] ${message.role === 'user' ? 'order-first' : ''}`}>
                  <div
                    className={`rounded-lg px-4 py-3 ${message.role === 'user'
                      ? 'bg-primary text-primary-foreground ml-auto'
                      : 'bg-muted'
                      }`}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed font-sans" style={{ lineHeight: '1.5' }}>{message.content}</p>
                  </div>

                  {/* Render interactive UI blocks for meeting creation */}
                  {message.uiBlock && (
                    <div className="mt-3">
                      {/* Check if it's a conversational UI block */}
                      {(['meeting_type_selection', 'attendee_management', 'meeting_approval', 'agenda_editor'].includes(message.uiBlock.type)) ? (
                        <ConversationalMeetingUIBlock
                          uiBlock={message.uiBlock as ConversationalUIBlock}
                          onTypeSelect={onTypeSelect}
                          onAttendeesUpdate={onAttendeesUpdate}
                          onContinue={onContinue}
                          onApprove={onApprove}
                          onEdit={onEdit}
                          onAgendaUpdate={onAgendaUpdate}
                          onAgendaApprove={onAgendaApprove}
                          onAgendaRegenerate={onAgendaRegenerate}
                        />
                      ) : (
                        <MeetingUIBlock
                          uiBlock={message.uiBlock}
                          onMeetingLinkChoice={handleMeetingLinkChoice}
                          onAttendeesUpdate={handleAttendeesUpdate}
                          onTitleSelect={handleTitleSelect}
                          onCreateEvent={handleCreateEvent}
                          onEditField={handleEditField}
                        />
                      )}
                    </div>
                  )}

                  <div className={`flex items-center gap-2 mt-1 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-xs text-muted-foreground">
                      {format(message.timestamp, 'h:mm a')}
                    </span>
                    {message.role === 'user' && (
                      <Badge variant="outline" className="text-xs">
                        {userName}
                      </Badge>
                    )}
                    {message.metadata?.extraction && (
                      <Badge variant="secondary" className="text-xs">
                        AI Meeting Detection
                      </Badge>
                    )}
                  </div>
                </div>
                {message.role === 'user' && (
                  <Avatar className="h-8 w-8 mt-1">
                    <AvatarImage src={userAvatar} />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}

            {(isLoading || processingMeeting) && (
              <div className="flex gap-3 justify-start">
                <Avatar className="h-8 w-8 mt-1">
                  <AvatarFallback className="bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '600ms' }}></div>
                    </div>
                    <span className="sr-only">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask about your calendar, meetings, or scheduling..."
              className="min-h-[44px] resize-none"
              data-testid="input-chat-message"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-11 w-11"
              data-testid="button-send-message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}