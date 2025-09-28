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
import { EnhancedChatMessage as ChatMessage, Attendee, UIBlock, MeetingExtraction } from "../../../shared/schema";
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
}

const quickActions = [
  "Schedule a meeting with the team",
  "What's my next meeting about?",
  "Generate an agenda for tomorrow's standup", 
  "Summarize today's meetings",
  "Find a good time for a 1-on-1",
  "Check for scheduling conflicts"
];

const surprisePrompts = [
  "What would be the most productive meeting schedule for this week?",
  "Help me prepare talking points for my upcoming client call",
  "Suggest ways to reduce meeting fatigue in my calendar",
  "What patterns do you notice in my meeting schedule?",
  "Help me block time for focused work between meetings"
];

export function ChatInterface({ 
  messages, 
  onSendMessage, 
  onAddAssistantMessage,
  isLoading = false,
  userName = "User",
  userAvatar
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
      
      // Check if this message indicates meeting creation intent
      try {
        setProcessingMeeting(true);
        const response = await apiRequest('/api/ai/extract-meeting', {
          method: 'POST',
          body: JSON.stringify({
            message: userMessage,
            context: messages.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const { extraction } = response;
        
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
        verified: email.toLowerCase().includes('@gmail.com')
      })),
      includeMeetLink: false,
      purpose: extraction.fields.purpose
    };

    setMeetingData(prev => ({ ...prev, [meetingId]: newMeetingData }));

    // Add AI response with meeting link choice
    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: "I'd be happy to help you create this meeting! Let me guide you through the process.",
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
    
    // Move to attendee editor step
    const message: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `${includeLink ? 'Great! I\'ll include a Google Meet link.' : 'Got it, no meeting link needed.'} Now let's add the attendees for this meeting.`,
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
        const response = await apiRequest('/api/ai/generate-titles', {
          method: 'POST',
          body: JSON.stringify({
            purpose: currentMeeting.purpose,
            participants: attendees.map(a => a.email),
            context: `Meeting with ${attendees.length} attendees about ${currentMeeting.purpose}`
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const { titleSuggestion } = response;
        
        const message: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: 'Perfect! Now let\'s choose a title for your meeting. I\'ve generated some suggestions based on the context.',
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
      }
    }
  };

  const handleTitleSelect = (title: string, meetingId: string) => {
    setMeetingData(prev => ({
      ...prev,
      [meetingId]: { ...prev[meetingId], title }
    }));
    
    // Move to final review step
    const currentMeeting = meetingData[meetingId];
    if (currentMeeting && currentMeeting.startTime && currentMeeting.endTime) {
      const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'Excellent! Here\'s a summary of your meeting. Please review the details and create the event when you\'re ready.',
        timestamp: new Date(),
        uiBlock: {
          type: 'event_review',
          data: {
            title,
            startTime: currentMeeting.startTime,
            endTime: currentMeeting.endTime,
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
      const response = await apiRequest('/api/calendar/events', {
        method: 'POST',
        body: JSON.stringify({
          title: currentMeeting.title,
          startTime: currentMeeting.startTime,
          endTime: currentMeeting.endTime,
          attendees: currentMeeting.attendees,
          createMeetLink: currentMeeting.includeMeetLink,
          description: `Meeting created via AI Calendar Assistant`
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.success) {
        const successMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `🎉 Meeting created successfully! ${response.event.meetingLink ? `Google Meet link: ${response.event.meetingLink}` : ''} Calendar invites have been sent to all attendees.`,
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
              {getTimeBasedGreeting()}! How can I help you manage your calendar today?
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
                    Try asking me to schedule a meeting, generate an agenda, or get insights about your calendar
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
                <div className={`max-w-[80%] ${message.role === 'user' ? 'order-first' : ''}`}>
                  <div
                    className={`rounded-lg px-4 py-2 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground ml-auto'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                  
                  {/* Render interactive UI blocks for meeting creation */}
                  {message.uiBlock && (
                    <div className="mt-3">
                      <MeetingUIBlock
                        uiBlock={message.uiBlock}
                        onMeetingLinkChoice={handleMeetingLinkChoice}
                        onAttendeesUpdate={handleAttendeesUpdate}
                        onTitleSelect={handleTitleSelect}
                        onCreateEvent={handleCreateEvent}
                        onEditField={handleEditField}
                      />
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
            
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <Avatar className="h-8 w-8 mt-1">
                  <AvatarFallback className="bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">AI is thinking...</span>
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
              placeholder="Ask me anything about your calendar, meetings, or scheduling..."
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