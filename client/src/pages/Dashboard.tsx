import { useState, useEffect, useRef } from 'react';
import { CalendarSidebar } from '@/components/CalendarSidebar';
import { ChatInterface } from '@/components/ChatInterface';
import { TaskBoard } from '@/components/TaskBoard';
import { ThemeToggle } from '@/components/ThemeToggle';
import { OnboardingMeetingSetup } from '@/components/OnboardingMeetingSetup';
import { SimpleNavbar } from '@/components/SimpleNavbar';
import { SimpleSidebar } from '@/components/SimpleSidebar';
import { MainContentTabs } from '@/components/MainContentTabs';
import { AIAssistantToggle } from '@/components/AIAssistantToggle';
import { PremiumLoading } from '@/components/PremiumLoading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bot, Calendar, CheckSquare, User, LogOut, Clock, Users, ExternalLink, Video, X } from 'lucide-react';
import { addDays, addHours } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ConversationalMeetingUIBlock } from '@/components/ConversationalMeetingUIBlocks';
import { AttendeeData } from '../../../shared/schema';

// Mock data - todo: remove mock functionality when real API is connected

const mockTasks = [
  {
    id: '1',
    title: 'Prepare quarterly business review presentation',
    description: 'Create slides covering Q3 metrics, achievements, and Q4 roadmap',
    assignee: 'Sarah Johnson',
    deadline: addDays(new Date(), 3),
    status: 'pending' as const,
    eventTitle: 'Q3 Business Review Meeting'
  },
  {
    id: '2',
    title: 'Review API documentation',
    description: 'Go through the new authentication endpoints and update integration',
    assignee: 'Mike Chen',
    deadline: addDays(new Date(), 1),
    status: 'in_progress' as const,
    eventTitle: 'API Integration Sync'
  },
  {
    id: '3',
    title: 'Send follow-up email to clients',
    description: 'Include meeting summary and next steps from discussion',
    assignee: 'Sarah Johnson',
    status: 'completed' as const,
    eventTitle: 'Client Strategy Meeting'
  }
];

// Define the event type
interface CalendarEvent {
  id: string;
  googleEventId?: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  meetingLink?: string;
  attendees: string[];
}

// Event Card Component
interface EventCardProps {
  event: CalendarEvent;
  onJoin: (eventId: string) => void;
  onViewDetails: (eventId: string) => void;
}

function EventCard({ event, onJoin, onViewDetails }: EventCardProps) {
  const isUpcoming = new Date(event.startTime) > new Date();
  const isToday = new Date(event.startTime).toDateString() === new Date().toDateString();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-semibold">{event.title}</h4>
              {isToday && (
                <Badge variant="secondary" className="text-xs">Today</Badge>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(event.startTime).toLocaleDateString()}
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            {event.attendees.length > 0 && (
              <div className="flex items-center gap-1 mb-3">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              {isUpcoming && event.meetingLink && (
                <Button
                  size="sm"
                  onClick={() => onJoin(event.id)}
                  className="bg-green-500 hover:bg-green-600"
                >
                  Join Meeting
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewDetails(event.id)}
              >
                View Details
              </Button>
            </div>
          </div>

          {event.meetingLink && (
            <div className="ml-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.open(event.meetingLink, '_blank')}
                title="Open meeting link"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Import enhanced ChatMessage from shared schema to support UI blocks
import { EnhancedChatMessage as ChatMessage, UIBlock } from '../../../shared/schema';

// Define ConversationalResponse interface for proper response typing
interface ConversationalResponse {
  message: string;
  conversationId: string;
  uiBlock?: UIBlock;
  workflow: {
    currentStep: string;
    progress: number;
    requiresUserInput: boolean;
  };
  validation: {
    errors: string[];
    warnings: string[];
  };
}

interface Task {
  id: string;
  title: string;
  description?: string;
  assignee: string;
  deadline?: Date;
  status: 'pending' | 'in_progress' | 'completed';
  eventTitle?: string;
}

export default function Dashboard() {
  const { user, logout, isLoggingOut } = useAuth();
  const queryClient = useQueryClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);


  // New state for conversational API integration
  const [activeUIBlock, setActiveUIBlock] = useState<UIBlock | null>(null);
  const [conversationId, setConversationId] = useState<string>('');
  const [workflowState, setWorkflowState] = useState<any>(null);



  // Premium dashboard state
  const [activeTab, setActiveTab] = useState<'events' | 'tasks'>('events');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Open sidebar by default
  const [sidebarWidth, setSidebarWidth] = useState(400);

  // Process restart functionality
  const handleRestartProcess = () => {
    // Reset process - handled by MainContentTabs
  };

  // Handle sidebar updates when new meetings are created
  const handleSidebarUpdate = (updatedMeetingData: any) => {
    console.log('Sidebar should be updated with:', updatedMeetingData);
    // Refresh the calendar events when a new meeting is created
    queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
  };
  
  // Set the initial greeting message with the user's name
  useEffect(() => {
    if (user?.name) {
      const greeting = `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user.name}! 🌟 I'm CalAI, your AI Calendar Assistant. I can help you schedule meetings, manage your calendar, and automate your meeting workflows. What would you like to work on today?`;
      
      setChatMessages([{
        id: '1',
        role: 'assistant',
        content: greeting,
        timestamp: new Date()
      } as ChatMessage]);
    }
  }, [user?.name]);

  // Handler for adding assistant messages with UI blocks
  const handleAddAssistantMessage = (message: ChatMessage) => {
    setChatMessages(prev => [...prev, message]);
  };

  // Handle workflow response from conversational API
  const handleWorkflowResponse = (response: ConversationalResponse) => {
    // Update conversation ID for continuity
    if (response.conversationId) {
      setConversationId(response.conversationId);
    }

    // Update workflow state
    setWorkflowState(response.workflow);

    // Add AI response message to chat
    const aiMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
      uiBlock: response.uiBlock
    } as ChatMessage;
    setChatMessages(prev => [...prev, aiMessage]);

    // Set active UI block for rendering
    if (response.uiBlock) {
      setActiveUIBlock(response.uiBlock);
    } else {
      setActiveUIBlock(null);
    }

    // Handle validation errors and warnings
    if (response.validation.errors.length > 0) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: `⚠️ Please address the following issues: ${response.validation.errors.join(', ')}`,
        timestamp: new Date()
      } as ChatMessage;
      setChatMessages(prev => [...prev, errorMessage]);
    }

    if (response.validation.warnings.length > 0) {
      const warningMessage: ChatMessage = {
        id: (Date.now() + 3).toString(),
        role: 'assistant',
        content: `ℹ️ Note: ${response.validation.warnings.join(', ')}`,
        timestamp: new Date()
      } as ChatMessage;
      setChatMessages(prev => [...prev, warningMessage]);
    }
  };

  // UI Block Event Handlers
  const handleTypeSelect = async (type: 'physical' | 'online', meetingId: string, location?: string) => {
    try {
      const response = await fetch('/api/workflow/ui-interaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          blockType: 'meeting_type_selection',
          action: 'select_type',
          data: { type, meetingId, location },
          conversationId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to process type selection');
      }

      const data: ConversationalResponse = await response.json();
      handleWorkflowResponse(data);
    } catch (error) {
      handleAPIError(error, 'Failed to process meeting type selection. Please try again.');
    }
  };

  const handleAttendeesUpdate = async (attendees: AttendeeData[], meetingId: string) => {
    try {
      const response = await fetch('/api/workflow/ui-interaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          blockType: 'attendee_management',
          action: 'update_attendees',
          data: { attendees, meetingId },
          conversationId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update attendees');
      }

      const data: ConversationalResponse = await response.json();
      handleWorkflowResponse(data);
    } catch (error) {
      handleAPIError(error, 'Failed to update attendees. Please try again.');
    }
  };

  const handleContinue = async (meetingId: string) => {
    try {
      const response = await fetch('/api/workflow/ui-interaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          blockType: 'attendee_management',
          action: 'continue',
          data: { meetingId },
          conversationId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to continue workflow');
      }

      const data: ConversationalResponse = await response.json();
      handleWorkflowResponse(data);
    } catch (error) {
      handleAPIError(error, 'Failed to continue workflow. Please try again.');
    }
  };

  const handleApprove = async (meetingId: string) => {
    try {
      const response = await fetch('/api/workflow/ui-interaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          blockType: 'meeting_approval',
          action: 'approve',
          data: { meetingId },
          conversationId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to approve meeting');
      }

      const data: ConversationalResponse = await response.json();
      handleWorkflowResponse(data);
      
      // Clear UI block after successful approval
      setActiveUIBlock(null);
    } catch (error) {
      handleAPIError(error, 'Failed to approve meeting. Please try again.');
    }
  };

  const handleEdit = async (field: string, meetingId: string) => {
    try {
      const response = await fetch('/api/workflow/ui-interaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          blockType: 'meeting_approval',
          action: 'edit',
          data: { field, meetingId },
          conversationId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to edit meeting');
      }

      const data: ConversationalResponse = await response.json();
      handleWorkflowResponse(data);
    } catch (error) {
      handleAPIError(error, 'Failed to edit meeting. Please try again.');
    }
  };

  const handleAgendaUpdate = async (agenda: string, meetingId: string) => {
    try {
      const response = await fetch('/api/workflow/ui-interaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          blockType: 'agenda_editor',
          action: 'update',
          data: { agenda, meetingId },
          conversationId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update agenda');
      }

      const data: ConversationalResponse = await response.json();
      handleWorkflowResponse(data);
    } catch (error) {
      handleAPIError(error, 'Failed to update agenda. Please try again.');
    }
  };

  const handleAgendaApprove = async (agenda: string, meetingId: string) => {
    try {
      const response = await fetch('/api/workflow/ui-interaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          blockType: 'agenda_editor',
          action: 'approve',
          data: { agenda, meetingId },
          conversationId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to approve agenda');
      }

      const data: ConversationalResponse = await response.json();
      handleWorkflowResponse(data);
    } catch (error) {
      handleAPIError(error, 'Failed to approve agenda. Please try again.');
    }
  };

  const handleAgendaRegenerate = async (meetingId: string) => {
    try {
      const response = await fetch('/api/workflow/ui-interaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          blockType: 'agenda_editor',
          action: 'regenerate',
          data: { meetingId },
          conversationId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate agenda');
      }

      const data: ConversationalResponse = await response.json();
      handleWorkflowResponse(data);
    } catch (error) {
      handleAPIError(error, 'Failed to regenerate agenda. Please try again.');
    }
  };

  // Comprehensive error handling function
  const handleAPIError = (error: any, fallbackMessage: string) => {
    console.error('API Error:', error);
    
    let errorMessage = fallbackMessage;
    
    // Determine error type and provide appropriate messaging
    if (error.message?.includes('authentication') || error.message?.includes('401')) {
      errorMessage = 'Your session has expired. Please refresh the page and sign in again.';
    } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
      errorMessage = 'Connection issue detected. Please check your internet connection and try again.';
    } else if (error.message?.includes('validation') || error.message?.includes('400')) {
      errorMessage = 'Invalid data provided. Please check your input and try again.';
    } else if (error.message?.includes('403')) {
      errorMessage = 'You don\'t have permission to perform this action.';
    } else if (error.message?.includes('404')) {
      errorMessage = 'The requested resource was not found. Please try again.';
    } else if (error.message?.includes('500')) {
      errorMessage = 'Server error occurred. Please try again in a moment.';
    }
    
    // Add error message to chat with recovery suggestions
    const errorChatMessage: ChatMessage = {
      id: (Date.now() + Math.random()).toString(),
      role: 'assistant',
      content: `❌ ${errorMessage}`,
      timestamp: new Date()
    } as ChatMessage;
    
    setChatMessages(prev => [...prev, errorChatMessage]);
    
    // Preserve conversation state by not clearing activeUIBlock or conversationId
    // This allows users to retry their action without losing progress
    
    return errorMessage;
  };

  // Fetch calendar events
  const { data: events = [], isLoading: isEventsLoading, isError, error } = useQuery({
    queryKey: ['calendarEvents'],
    queryFn: async (): Promise<CalendarEvent[]> => {
      const response = await fetch('/api/calendar/events', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch calendar events');
      }

      const data = await response.json();
      // Convert date strings to Date objects
      return data.events.map((event: any) => ({
        ...event,
        startTime: new Date(event.startTime),
        endTime: new Date(event.endTime)
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });

  // Fetch tasks from database
  const { data: dbTasks = [], isLoading: isTasksLoading } = useQuery({
    queryKey: ['meetingTasks'],
    queryFn: async (): Promise<Task[]> => {
      const response = await fetch('/api/tasks', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }

      const data = await response.json();
      // Convert date strings to Date objects and ensure proper typing
      return data.tasks.map((task: any) => ({
        ...task,
        deadline: task.deadline ? new Date(task.deadline) : undefined,
        status: task.status as 'pending' | 'in_progress' | 'completed',
        eventTitle: task.eventTitle || task.meetingTitle || 'Meeting'
      }));
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  });

  // Use database tasks if available, otherwise fall back to mock tasks
  const displayTasks = dbTasks.length > 0 ? dbTasks : mockTasks;

  // Update local tasks state when database tasks are fetched
  useEffect(() => {
    if (dbTasks.length > 0) {
      setTasks(dbTasks);
    }
  }, [dbTasks]);

  const handleDeleteEvent = async (eventId: string) => {
    try {
      const response = await fetch(`/api/calendar/events/${eventId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to delete event');
      }

      // Refresh the events
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
      
      // Show success message in chat
      const successMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'I\'ve successfully deleted the event from your calendar.',
        timestamp: new Date()
      } as ChatMessage;
      setChatMessages(prev => [...prev, successMessage]);
    } catch (error) {
      console.error('Error deleting event:', error);
      // Show error message in chat
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Sorry, I couldn\'t delete the event. Please try again.',
        timestamp: new Date()
      } as ChatMessage;
      setChatMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    const message = `Tell me about my "${event.title}" meeting.`;
    handleSendMessage(message);
  };

  const handleSendMessage = async (message: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date()
    } as ChatMessage;
    
    // Add user message immediately
    setChatMessages(prev => [...prev, newMessage]);
    setIsLoading(true);
    
    try {
      // Call the conversational API endpoint instead of basic chat
      const response = await fetch('/api/chat/conversational', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          message,
          conversationId: conversationId || undefined,
          context: workflowState || undefined
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get response from conversational API');
      }
      
      const data: ConversationalResponse = await response.json();
      
      // Handle workflow response
      handleWorkflowResponse(data);
      
    } catch (error) {
      console.error('Error getting conversational AI response:', error);
      handleAPIError(error, 'Sorry, I encountered an error processing your request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: 'pending' | 'in_progress' | 'completed') => {
    try {
      // Update local state immediately for better UX
      const updatedTasks = tasks.map(task =>
        task.id === taskId ? { ...task, status } : task
      );
      setTasks(updatedTasks);

      // Update in database
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ status })
      });

      if (!response.ok) {
        throw new Error('Failed to update task in database');
      }

      console.log('Task updated:', taskId, status);

      // Refresh tasks from database to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['meetingTasks'] });
    } catch (error) {
      console.error('Error updating task status:', error);

      // Revert local state on error
      queryClient.invalidateQueries({ queryKey: ['meetingTasks'] });
    }
  };

  const handleTaskClick = (task: Task) => {
    const message = `Give me more details about the task: "${task.title}"`;
    handleSendMessage(message);
  };

  const handleAddTask = (newTask: Omit<Task, 'id' | 'status'>) => {
    const task: Task = {
      ...newTask,
      id: `task-${Date.now()}`,
      status: 'pending'
    };
    setTasks(prev => [...prev, task]);
    console.log('Task added:', task);
  };

  const handleSignOut = () => {
    logout();
  };


  // AI Assistant Panel state


  // Handle AI prompt from navbar
  const handleAIPrompt = (prompt: string) => {
    handleSendMessage(prompt);
  };

  return (
    <div className="h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Simple Navbar */}
      <SimpleNavbar
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
        user={user || undefined}
        onLogout={logout}
      />

      {/* Main Layout */}
      <div className="flex-1 flex min-h-0 pt-16"> {/* Add padding for fixed navbar */}
        {/* Sidebar */}
        <SimpleSidebar
          events={events}
          onJoinEvent={(eventId) => {
            const event = events.find(e => e.id === eventId);
            if (event?.meetingLink) {
              window.open(event.meetingLink, '_blank');
            }
          }}
          onViewEvent={(eventId) => {
            const event = events.find(e => e.id === eventId);
            if (event) handleEventClick(event);
          }}
          onDeleteEvent={handleDeleteEvent}
          isOpen={isSidebarOpen}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />

        {/* Main Content */}
        <div 
          className="flex-1 transition-all duration-300"
          style={{ 
            marginLeft: isSidebarOpen ? sidebarWidth : 0 
          }}
        >
          <MainContentTabs
            tasks={tasks}
            onTaskUpdate={setTasks}
            onSidebarUpdate={handleSidebarUpdate}
            onRestartProcess={handleRestartProcess}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isSidebarOpen={isSidebarOpen}
            sidebarWidth={sidebarWidth}
          />
        </div>
      </div>

      {/* AI Assistant Toggle */}
      <AIAssistantToggle
        onAIPrompt={handleAIPrompt}
        chatMessages={chatMessages}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        activeUIBlock={activeUIBlock}
        onTypeSelect={handleTypeSelect}
        onAttendeesUpdate={handleAttendeesUpdate}
        onContinue={handleContinue}
        onApprove={handleApprove}
      />
    </div>
  );
}