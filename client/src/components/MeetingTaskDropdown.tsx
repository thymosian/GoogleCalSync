import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle, Circle, Clock, Users, ChevronDown, ChevronRight, ExternalLink, Check } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { apiRequest } from '@/lib/queryClient';

interface MeetingTask {
  id: string;
  meetingId: string;
  title: string;
  description: string;
  assignee?: string;
  assigneeEmail?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed';
  dueDate?: Date;
  category: string;
  estimatedHours?: number;
}

interface MeetingWithTasks {
  meetingId: string;
  title: string;
  tasks: MeetingTask[];
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
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

interface MeetingTaskDropdownProps {
  tasks?: Task[];
  onUpdateTaskStatus?: (taskId: string, status: 'pending' | 'in_progress' | 'completed') => void;
  onTaskClick?: (task: Task) => void;
  onAddTask?: (meetingId: string) => void;
  onTaskSelect?: (meetingId: string, taskId: string) => void;
  onMeetingSelect?: (meetingId: string) => void;
}

export function MeetingTaskDropdown({
  tasks = [],
  onUpdateTaskStatus,
  onTaskClick,
  onAddTask,
  onTaskSelect,
  onMeetingSelect
}: MeetingTaskDropdownProps) {
  const [meetings, setMeetings] = useState<MeetingWithTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMeetings, setExpandedMeetings] = useState<Set<string>>(new Set());

  // Convert external tasks to meetings format if provided
  useEffect(() => {
    if (tasks && tasks.length > 0) {
      // Group tasks by event title
      const meetingsMap = new Map<string, MeetingTask[]>();

      tasks.forEach(task => {
        const meetingTitle = task.eventTitle || 'Unknown Meeting';
        if (!meetingsMap.has(meetingTitle)) {
          meetingsMap.set(meetingTitle, []);
        }
        // Convert Task to MeetingTask
        const meetingTask: MeetingTask = {
          id: task.id,
          meetingId: `meeting-${task.id}`,
          title: task.title,
          description: task.description || '',
          assignee: task.assignee,
          priority: 'medium',
          status: task.status,
          category: 'general'
        };
        meetingsMap.get(meetingTitle)!.push(meetingTask);
      });

      const convertedMeetings: MeetingWithTasks[] = Array.from(meetingsMap.entries()).map(([title, meetingTasks]) => ({
        meetingId: `meeting-${title}`,
        title,
        tasks: meetingTasks,
        totalTasks: meetingTasks.length,
        completedTasks: meetingTasks.filter(t => t.status === 'completed').length,
        pendingTasks: meetingTasks.filter(t => t.status === 'pending').length,
        inProgressTasks: meetingTasks.filter(t => t.status === 'in_progress').length
      }));

      setMeetings(convertedMeetings);

      // Expand the first meeting by default
      if (convertedMeetings.length > 0) {
        setExpandedMeetings(new Set([convertedMeetings[0].meetingId]));
      }
    } else {
      // Load mock data if no external tasks provided
      loadMeetingsWithTasks();
    }
  }, [tasks]);

  useEffect(() => {
    loadMeetingsWithTasks();
  }, []);

  const loadMeetingsWithTasks = async () => {
    try {
      setLoading(true);
      setError(null);

      // For now, we'll use mock data since the backend services aren't fully implemented
      // In a real implementation, this would call an API endpoint
      const mockMeetings: MeetingWithTasks[] = [
        {
          meetingId: 'meeting-1',
          title: 'AI Assistant Rollout: Scope Reset',
          tasks: [
            {
              id: 'task-1',
              meetingId: 'meeting-1',
              title: 'Define MVP scope boundaries',
              description: 'Clearly define what features are included vs excluded in the initial AI Assistant release',
              priority: 'high',
              status: 'pending',
              category: 'planning',
              estimatedHours: 4
            },
            {
              id: 'task-2',
              meetingId: 'meeting-1',
              title: 'Update technical requirements',
              description: 'Revise technical specifications based on agreed scope limitations',
              priority: 'high',
              status: 'in_progress',
              category: 'development',
              estimatedHours: 6
            },
            {
              id: 'task-3',
              meetingId: 'meeting-1',
              title: 'Revise marketing messaging',
              description: 'Update external communications to accurately reflect AI Assistant capabilities',
              priority: 'medium',
              status: 'pending',
              category: 'marketing',
              estimatedHours: 3
            }
          ],
          totalTasks: 3,
          completedTasks: 0,
          pendingTasks: 2,
          inProgressTasks: 1
        },
        {
          meetingId: 'meeting-2',
          title: 'Improve Cross-Team Communication',
          tasks: [
            {
              id: 'task-4',
              meetingId: 'meeting-2',
              title: 'Establish single source of truth',
              description: 'Create centralized communication channel for project updates and blockers',
              priority: 'high',
              status: 'completed',
              category: 'process',
              estimatedHours: 2
            }
          ],
          totalTasks: 1,
          completedTasks: 1,
          pendingTasks: 0,
          inProgressTasks: 0
        }
      ];

      setMeetings(mockMeetings);

      // Expand the first meeting by default
      if (mockMeetings.length > 0) {
        setExpandedMeetings(new Set([mockMeetings[0].meetingId]));
      }

    } catch (error: any) {
      console.error('Error loading meetings with tasks:', error);
      setError(error.message || 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  };

  const toggleMeetingExpansion = (meetingId: string) => {
    const newExpanded = new Set(expandedMeetings);
    if (newExpanded.has(meetingId)) {
      newExpanded.delete(meetingId);
    } else {
      newExpanded.add(meetingId);
    }
    setExpandedMeetings(newExpanded);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'in_progress': return <Clock className="h-4 w-4 text-blue-600" />;
      default: return <Circle className="h-4 w-4 text-gray-400" />;
    }
  };

  const handleTaskClick = (meetingId: string, taskId: string) => {
    if (onTaskSelect) {
      onTaskSelect(meetingId, taskId);
    }
    // Also handle with the Task interface if provided
    const meeting = meetings.find(m => m.meetingId === meetingId);
    const meetingTask = meeting?.tasks.find(t => t.id === taskId);
    if (meetingTask && onTaskClick && meeting) {
      // Convert MeetingTask to Task interface
      const task: Task = {
        id: meetingTask.id,
        title: meetingTask.title,
        description: meetingTask.description,
        assignee: meetingTask.assignee || 'Unassigned',
        status: meetingTask.status,
        eventTitle: meeting.title
      };
      onTaskClick(task);
    }
  };

  const handleTaskStatusUpdate = (taskId: string, newStatus: 'pending' | 'in_progress' | 'completed') => {
    // Update internal state
    setMeetings(prevMeetings =>
      prevMeetings.map(meeting => ({
        ...meeting,
        tasks: meeting.tasks.map(task =>
          task.id === taskId ? { ...task, status: newStatus } : task
        ),
        // Recalculate counts
        completedTasks: newStatus === 'completed' ? meeting.completedTasks + 1 : meeting.completedTasks,
        pendingTasks: newStatus === 'pending' ? meeting.pendingTasks + 1 : meeting.pendingTasks,
        inProgressTasks: newStatus === 'in_progress' ? meeting.inProgressTasks + 1 : meeting.inProgressTasks
      }))
    );

    // Call external handler if provided
    if (onUpdateTaskStatus) {
      onUpdateTaskStatus(taskId, newStatus);
    }
  };

  const handleMeetingClick = (meetingId: string) => {
    if (onMeetingSelect) {
      onMeetingSelect(meetingId);
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Loading meetings and tasks...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="py-8">
          <div className="text-center text-red-600">
            <p>Error loading meetings: {error}</p>
            <Button
              onClick={loadMeetingsWithTasks}
              variant="outline"
              size="sm"
              className="mt-2"
            >
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (meetings.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No meetings with tasks found</p>
            <p className="text-sm">Complete meetings will appear here with extracted tasks</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Meeting Tasks
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            View and manage tasks extracted from your meetings
          </p>
        </CardHeader>
      </Card>

      <div className="space-y-3">
        {meetings.map((meeting) => (
          <Card key={meeting.meetingId} className="overflow-hidden">
            <Collapsible
              open={expandedMeetings.has(meeting.meetingId)}
              onOpenChange={() => toggleMeetingExpansion(meeting.meetingId)}
            >
              <CollapsibleTrigger asChild>
                <div className="w-full p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedMeetings.has(meeting.meetingId) ?
                        <ChevronDown className="h-4 w-4" /> :
                        <ChevronRight className="h-4 w-4" />
                      }
                      <div>
                        <h3 className="font-medium text-left">{meeting.title}</h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span>{meeting.totalTasks} tasks</span>
                          <span className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-green-600" />
                            {meeting.completedTasks}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-blue-600" />
                            {meeting.inProgressTasks}
                          </span>
                          <span className="flex items-center gap-1">
                            <Circle className="h-3 w-3 text-gray-400" />
                            {meeting.pendingTasks}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMeetingClick(meeting.meetingId);
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View Details
                    </Button>
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t">
                  <ScrollArea className="max-h-96">
                    <div className="p-4 space-y-3">
                      {meeting.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="border rounded-lg p-3 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div
                              className="flex items-start gap-3 flex-1 cursor-pointer"
                              onClick={() => handleTaskClick(meeting.meetingId, task.id)}
                            >
                              {getStatusIcon(task.status)}
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm mb-1">{task.title}</h4>
                                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                                  {task.description}
                                </p>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${getPriorityColor(task.priority)}`}
                                  >
                                    {task.priority}
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs">
                                    {task.category}
                                  </Badge>
                                  {task.estimatedHours && (
                                    <span className="text-xs text-muted-foreground">
                                      {task.estimatedHours}h
                                    </span>
                                  )}
                                  {task.assignee && (
                                    <span className="text-xs text-muted-foreground">
                                      👤 {task.assignee}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newStatus = task.status === 'completed' ? 'pending' : 'completed';
                                  handleTaskStatusUpdate(task.id, newStatus);
                                }}
                                className="h-6 w-6 p-0"
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>
    </div>
  );
}