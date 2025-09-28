import { useState, useEffect, useRef } from 'react';
import { CalendarSidebar } from '@/components/CalendarSidebar';
import { ChatInterface } from '@/components/ChatInterface';
import { TaskBoard } from '@/components/TaskBoard';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Calendar, CheckSquare, User, LogOut } from 'lucide-react';
import { addDays, addHours } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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

// Import enhanced ChatMessage from shared schema to support UI blocks
import { EnhancedChatMessage as ChatMessage } from '../../../shared/schema';

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
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320); // 320px = 80 * 4 (w-80 in Tailwind)
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  
  // Set the initial greeting message with the user's name
  useEffect(() => {
    if (user?.name) {
      const greeting = `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user.name}! 🌟 I'm your AI Calendar Assistant. I can help you schedule meetings, manage your calendar, and automate your meeting workflows. What would you like to work on today?`;
      
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

  const handleDeleteEvent = async (eventId: string) => {
    // Show confirmation dialog
    const confirmed = window.confirm('Are you sure you want to delete this event? This action cannot be undone.');
    
    if (!confirmed) {
      return; // User cancelled the deletion
    }

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
      // Prepare messages for the AI (excluding the new user message)
      const messagesForAI = chatMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      // Add the new user message
      messagesForAI.push({
        role: 'user',
        content: message
      });
      
      // Call the Mistral API endpoint
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ messages: messagesForAI })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get response from AI');
      }
      
      const data = await response.json();
      
      // Add AI response to chat
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date()
      } as ChatMessage;
      setChatMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error getting AI response:', error);
      // Show error message in chat
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      } as ChatMessage;
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateTaskStatus = (taskId: string, status: 'pending' | 'in_progress' | 'completed') => {
    const updatedTasks = tasks.map(task => 
      task.id === taskId ? { ...task, status } : task
    );
    setTasks(updatedTasks);
    console.log('Task updated:', taskId, status);
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

  // Resizing functionality
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      // Calculate new width based on mouse position
      const newWidth = e.clientX;
      
      // Set minimum and maximum width constraints
      if (newWidth > 200 && newWidth < 600) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">AI Calendar Assistant</h1>
              <p className="text-sm text-muted-foreground">Intelligent meeting management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-xs">
              {events.length} upcoming events
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {tasks.filter(t => t.status !== 'completed').length} active tasks
            </Badge>
            <ThemeToggle />
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.picture} />
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="text-sm">
                <div className="font-medium">{user?.name || 'User'}</div>
                <div className="text-muted-foreground text-xs">{user?.email || ''}</div>
              </div>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleSignOut}
                disabled={isLoggingOut}
                data-testid="button-sign-out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Calendar Sidebar Container */}
        <div 
          ref={sidebarRef}
          className="relative h-full flex"
          style={{ width: `${sidebarWidth}px` }}
        >
          {/* Sidebar Background - Full Height */}
          <div className="absolute inset-0 border-r bg-card"></div>
          
          {/* Sidebar Content - Scrollable with infinite padding */}
          <aside 
            className="relative z-10 h-full w-full overflow-y-auto"
            data-testid="sidebar-scroll-area"
          >
            <div className="p-4 min-h-full">
              <CalendarSidebar 
                events={events}
                onDeleteEvent={handleDeleteEvent}
                onEventClick={handleEventClick}
              />
            </div>
          </aside>
          
          {/* Resizer handle */}
          <div
            className="absolute top-0 right-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-primary/20 transition-colors z-20"
            onMouseDown={startResizing}
          />
        </div>

        {/* Main Panel */}
        <main 
          className="flex-1 overflow-y-auto"
          data-testid="main-scroll-area"
        >
          <Tabs defaultValue="chat" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chat" className="flex items-center gap-2">
                <Bot className="h-4 w-4" />
                AI Assistant
              </TabsTrigger>
              <TabsTrigger value="tasks" className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4" />
                Task Boards
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="chat" className="flex-1 mt-0 h-full">
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-4 border-b">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Bot className="h-5 w-5" />
                    AI Calendar Assistant
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-0">
                  <ChatInterface
                    messages={chatMessages}
                    onSendMessage={handleSendMessage}
                    onAddAssistantMessage={handleAddAssistantMessage}
                    isLoading={isLoading}
                    userName={user?.name || 'User'}
                    userAvatar={user?.picture}
                  />
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="tasks" className="flex-1 mt-0 h-full">
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-4 border-b">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CheckSquare className="h-5 w-5" />
                    Action Plans & Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-0">
                  <TaskBoard
                    tasks={tasks}
                    onUpdateTaskStatus={handleUpdateTaskStatus}
                    onTaskClick={handleTaskClick}
                    onAddTask={handleAddTask}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}