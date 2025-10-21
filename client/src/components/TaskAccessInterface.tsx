import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, Circle, AlertCircle, Clock, User,
  Calendar, ArrowLeft, LogIn, Users
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format, isPast } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Task {
  id: string;
  title: string;
  description?: string;
  assignee: string;
  assigneeEmail?: string;
  deadline?: Date;
  status: 'pending' | 'in_progress' | 'completed';
  eventTitle?: string;
  eventId?: string;
  priority?: 'low' | 'medium' | 'high';
  category?: string;
  estimatedHours?: number;
}

interface MeetingData {
  id: string;
  title: string;
  date: Date;
  attendees: Array<{
    email: string;
    firstName?: string;
    lastName?: string;
  }>;
}

interface TaskAccessInterfaceProps {
  meetingId: string;
  magicToken: string;
  onTaskUpdate: (taskId: string, status: Task['status']) => void;
  onBackToDashboard?: () => void;
}

export function TaskAccessInterface({
  meetingId,
  magicToken,
  onTaskUpdate,
  onBackToDashboard
}: TaskAccessInterfaceProps) {
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
  } | null>(null);
  const [meetingData, setMeetingData] = useState<MeetingData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userTasks, setUserTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);

  // Load meeting data and tasks
  useEffect(() => {
    loadMeetingData();
  }, [meetingId]);

  // Filter tasks based on current user
  useEffect(() => {
    if (currentUser && tasks.length > 0) {
      const userEmail = currentUser.email.toLowerCase();
      const filteredTasks = tasks.filter(task =>
        task.assigneeEmail?.toLowerCase() === userEmail ||
        task.assignee.toLowerCase().includes(currentUser.name.toLowerCase().split(' ')[0])
      );
      setUserTasks(filteredTasks);

      // Also show all tasks for context
      setAllTasks(tasks);
    }
  }, [currentUser, tasks]);

  const loadMeetingData = async () => {
    try {
      setIsLoading(true);
      // In a real implementation, this would fetch from your API
      // For now, we'll use mock data
      const mockMeetingData: MeetingData = {
        id: meetingId,
        title: 'Q4 Planning Meeting',
        date: new Date(),
        attendees: [
          { email: 'sarah@example.com', firstName: 'Sarah', lastName: 'Johnson' },
          { email: 'mike@example.com', firstName: 'Mike', lastName: 'Chen' },
          { email: 'alex@example.com', firstName: 'Alex', lastName: 'Rodriguez' }
        ]
      };

      const mockTasks: Task[] = [
        {
          id: '1',
          title: 'Prepare Q4 budget presentation',
          description: 'Create slides covering Q4 budget projections and resource allocation',
          assignee: 'Sarah Johnson',
          assigneeEmail: 'sarah@example.com',
          deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          status: 'pending',
          eventTitle: 'Q4 Planning Meeting',
          eventId: meetingId,
          priority: 'high',
          category: 'presentation',
          estimatedHours: 8
        },
        {
          id: '2',
          title: 'Review competitive analysis',
          description: 'Analyze competitor strategies and market positioning',
          assignee: 'Mike Chen',
          assigneeEmail: 'mike@example.com',
          deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          status: 'in_progress',
          eventTitle: 'Q4 Planning Meeting',
          eventId: meetingId,
          priority: 'medium',
          category: 'research',
          estimatedHours: 4
        },
        {
          id: '3',
          title: 'Update project timeline',
          description: 'Revise project milestones based on Q4 planning decisions',
          assignee: 'Alex Rodriguez',
          assigneeEmail: 'alex@example.com',
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: 'pending',
          eventTitle: 'Q4 Planning Meeting',
          eventId: meetingId,
          priority: 'medium',
          category: 'planning',
          estimatedHours: 3
        }
      ];

      setMeetingData(mockMeetingData);
      setTasks(mockTasks);
    } catch (error) {
      console.error('Error loading meeting data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserSelect = (email: string) => {
    const attendee = meetingData?.attendees.find(a => a.email === email);
    if (attendee) {
      setCurrentUser({
        email: attendee.email,
        name: `${attendee.firstName} ${attendee.lastName}`.trim()
      });
    }
  };

  const handleTaskStatusUpdate = async (taskId: string, newStatus: Task['status']) => {
    try {
      // Update local state immediately for better UX
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.id === taskId ? { ...task, status: newStatus } : task
        )
      );

      // Call the parent update function
      onTaskUpdate(taskId, newStatus);

      // In a real implementation, you would also send this to your backend
      // await fetch(`/api/tasks/${taskId}`, {
      //   method: 'PATCH',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ status: newStatus })
      // });
    } catch (error) {
      console.error('Error updating task status:', error);
      // Revert on error
      loadMeetingData();
    }
  };

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'pending':
        return <Circle className="h-4 w-4" />;
      case 'in_progress':
        return <AlertCircle className="h-4 w-4" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const isTaskOverdue = (task: Task) => {
    return task.deadline && task.status !== 'completed' && isPast(task.deadline);
  };

  const getTasksByStatus = (taskList: Task[], status: Task['status']) => {
    return taskList.filter(task => task.status === status);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading meeting tasks...</p>
        </div>
      </div>
    );
  }

  if (!meetingData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-6 text-center">
            <div className="text-red-500 mb-4">
              <AlertCircle className="h-12 w-12 mx-auto" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Meeting Not Found</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              The meeting you're looking for could not be found or the link has expired.
            </p>
            {onBackToDashboard && (
              <Button onClick={onBackToDashboard} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Welcome to Your Meeting Tasks</CardTitle>
            <p className="text-gray-600 dark:text-gray-400">
              Please select your identity to view and manage your tasks for "{meetingData.title}"
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-select">Select Your Name</Label>
              <Select onValueChange={handleUserSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose your name from the attendee list" />
                </SelectTrigger>
                <SelectContent>
                  {meetingData.attendees.map((attendee) => (
                    <SelectItem key={attendee.email} value={attendee.email}>
                      {attendee.firstName} {attendee.lastName} ({attendee.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-center text-sm text-gray-500 dark:text-gray-400">
              <p>Don't see your name? Contact the meeting organizer.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {onBackToDashboard && (
                <Button variant="ghost" size="sm" onClick={onBackToDashboard}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Dashboard
                </Button>
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {meetingData.title}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Tasks for {currentUser.name} • {format(meetingData.date, 'MMMM d, yyyy')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-sm">
                  {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {currentUser.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* User's Tasks */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Your Tasks ({userTasks.length})
              </h2>

              {userTasks.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <div className="text-green-500 mb-4">
                      <CheckCircle className="h-12 w-12 mx-auto" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      All caught up!
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      You don't have any tasks assigned for this meeting, or they've all been completed.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(['pending', 'in_progress', 'completed'] as const).map((status) => {
                    const statusTasks = getTasksByStatus(userTasks, status);
                    if (statusTasks.length === 0) return null;

                    const statusConfig = {
                      pending: {
                        title: 'To Do',
                        color: 'text-gray-600 dark:text-gray-400',
                        bgColor: 'bg-gray-50 dark:bg-gray-800/50',
                        icon: Circle
                      },
                      in_progress: {
                        title: 'In Progress',
                        color: 'text-blue-600 dark:text-blue-400',
                        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
                        icon: AlertCircle
                      },
                      completed: {
                        title: 'Completed',
                        color: 'text-green-600 dark:text-green-400',
                        bgColor: 'bg-green-50 dark:bg-green-900/20',
                        icon: CheckCircle
                      }
                    };

                    const config = statusConfig[status];
                    const IconComponent = config.icon;

                    return (
                      <Card key={status}>
                        <CardHeader className="pb-3">
                          <CardTitle className={`text-base flex items-center gap-2 ${config.color}`}>
                            <IconComponent className="h-4 w-4" />
                            {config.title} ({statusTasks.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {statusTasks.map((task) => (
                            <div
                              key={task.id}
                              className={`p-4 rounded-lg border ${config.bgColor} hover:shadow-md transition-shadow`}
                            >
                              <div className="space-y-3">
                                <div>
                                  <h4 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-2">
                                    {task.title}
                                  </h4>
                                  {task.description && (
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                                      {task.description}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center justify-between">
                                  {task.priority && (
                                    <Badge className={`text-xs ${getPriorityColor(task.priority)}`}>
                                      {task.priority}
                                    </Badge>
                                  )}

                                  {task.deadline && (
                                    <div className={`flex items-center gap-1 ${isTaskOverdue(task) ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                      <Clock className="h-3 w-3" />
                                      <span className="text-xs">
                                        {format(task.deadline, 'MMM d')}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {status !== 'completed' && (
                                  <Button
                                    size="sm"
                                    className="w-full"
                                    onClick={() => handleTaskStatusUpdate(
                                      task.id,
                                      status === 'pending' ? 'in_progress' : 'completed'
                                    )}
                                  >
                                    {status === 'pending' ? 'Start Task' : 'Mark Complete'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Meeting Overview */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Meeting Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                    {meetingData.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {format(meetingData.date, 'EEEE, MMMM d, yyyy')}
                  </p>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                    All Attendees ({meetingData.attendees.length})
                  </h4>
                  <div className="space-y-2">
                    {meetingData.attendees.map((attendee) => (
                      <div key={attendee.email} className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs bg-gradient-to-br from-gray-500 to-gray-600 text-white">
                            {attendee.firstName?.[0]}{attendee.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {attendee.firstName} {attendee.lastName}
                        </span>
                        {attendee.email === currentUser.email && (
                          <Badge variant="outline" className="text-xs">You</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                    Task Summary
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                      <div className="text-lg font-semibold text-gray-900 dark:text-white">
                        {getTasksByStatus(allTasks, 'pending').length}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">To Do</div>
                    </div>
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                      <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                        {getTasksByStatus(allTasks, 'in_progress').length}
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-400">In Progress</div>
                    </div>
                    <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded">
                      <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                        {getTasksByStatus(allTasks, 'completed').length}
                      </div>
                      <div className="text-xs text-green-600 dark:text-green-400">Done</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}