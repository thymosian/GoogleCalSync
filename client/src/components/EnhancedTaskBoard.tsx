import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, Circle, AlertCircle, Plus, Clock,
  User, Calendar, MoreVertical, Edit, Trash2, ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, isPast } from 'date-fns';

interface Task {
  id: string;
  title: string;
  description?: string;
  assignee: string;
  deadline?: Date;
  status: 'pending' | 'in_progress' | 'completed';
  eventTitle?: string;
  priority?: 'low' | 'medium' | 'high';
}

interface Meeting {
  id: string;
  title: string;
  taskCount: number;
}

interface EnhancedTaskBoardProps {
  tasks: Task[];
  onUpdateTaskStatus: (taskId: string, status: Task['status']) => void;
  onTaskClick: (task: Task) => void;
  onAddTask?: () => void;
}

const statusColumns = [
  {
    status: 'pending' as const,
    title: 'To Do',
    color: 'from-emerald-400 to-emerald-500',
    icon: Circle,
    bgColor: 'bg-emerald-50/50 dark:bg-emerald-900/20',
    borderColor: 'border-emerald-200 dark:border-emerald-700'
  },
  {
    status: 'in_progress' as const,
    title: 'In Progress',
    color: 'from-emerald-500 to-emerald-600',
    icon: AlertCircle,
    bgColor: 'bg-emerald-50/50 dark:bg-emerald-900/20',
    borderColor: 'border-emerald-200 dark:border-emerald-700'
  },
  {
    status: 'completed' as const,
    title: 'Completed',
    color: 'from-emerald-600 to-green-700',
    icon: CheckCircle,
    bgColor: 'bg-emerald-50/50 dark:bg-emerald-900/20',
    borderColor: 'border-emerald-200 dark:border-emerald-700'
  }
];

export function EnhancedTaskBoard({
  tasks,
  onUpdateTaskStatus,
  onTaskClick,
  onAddTask
}: EnhancedTaskBoardProps) {
  const [selectedMeeting, setSelectedMeeting] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  // Extract unique meetings from tasks
  useEffect(() => {
    const meetingMap = new Map<string, number>();
    
    tasks.forEach(task => {
      const meetingTitle = task.eventTitle || 'Unassigned Tasks';
      meetingMap.set(meetingTitle, (meetingMap.get(meetingTitle) || 0) + 1);
    });

    const meetingList = Array.from(meetingMap.entries()).map(([title, count]) => ({
      id: title,
      title,
      taskCount: count
    }));

    setMeetings(meetingList);

    // Select the first meeting by default if none selected
    if (!selectedMeeting && meetingList.length > 0) {
      setSelectedMeeting(meetingList[0].id);
    }
  }, [tasks, selectedMeeting]);

  const getFilteredTasks = () => {
    if (!selectedMeeting) return tasks;
    if (selectedMeeting === 'All Tasks') return tasks;
    return tasks.filter(task => (task.eventTitle || 'Unassigned Tasks') === selectedMeeting);
  };

  const getTasksByStatus = (status: Task['status']) => {
    return getFilteredTasks().filter(task => task.status === status);
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400 border-gray-200';
    }
  };

  const handleMeetingSelect = (meetingId: string) => {
    setSelectedMeeting(meetingId);
  };

  const getTotalTasksForMeeting = (meetingId: string) => {
    if (meetingId === 'All Tasks') return tasks.length;
    return tasks.filter(task => (task.eventTitle || 'Unassigned Tasks') === meetingId).length;
  };

  return (
    <div className="h-full flex bg-gradient-to-br from-gray-50/50 to-white dark:from-gray-900 dark:to-gray-800 rounded-2xl overflow-hidden">
      {/* Main Task Board */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-8 border-b border-gray-200/50 dark:border-gray-700/50">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="font-display font-bold text-2xl text-gray-900 dark:text-white">
                  Task Management
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {selectedMeeting && selectedMeeting !== 'All Tasks' ? selectedMeeting : 'All your tasks across projects'}
                </p>
              </div>
            </div>

            {onAddTask && (
              <motion.button
                onClick={onAddTask}
                className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white px-6 py-3 rounded-xl font-medium text-sm flex items-center gap-2 shadow-lg transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Plus className="h-4 w-4" />
                Add Task
              </motion.button>
            )}
          </motion.div>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 p-8 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
            {statusColumns.map((column) => {
              const columnTasks = getTasksByStatus(column.status);
              const IconComponent = column.icon;

              return (
                <div key={column.status} className="flex flex-col h-full">
                  {/* Column Header - Taller and more prominent */}
                  <div className={`bg-gradient-to-r ${column.color} p-6 rounded-2xl mb-6 shadow-lg`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                          <IconComponent className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-white">{column.title}</h3>
                          <p className="text-sm text-white/80">{columnTasks.length} tasks</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tasks Container - Enhanced with better spacing */}
                  <div className="flex-1">
                    <ScrollArea className="h-full pr-2">
                      <div className="space-y-4">
                        <AnimatePresence>
                          {columnTasks.map((task, index) => (
                            <motion.div
                              key={task.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -20 }}
                              transition={{ delay: index * 0.1 }}
                              layout
                              whileHover={{ scale: 1.02 }}
                              className="group"
                            >
                              <Card 
                                className={`${column.bgColor} hover:shadow-xl transition-all duration-300 border ${column.borderColor} cursor-pointer backdrop-blur-sm rounded-xl overflow-hidden`}
                                onClick={() => onTaskClick(task)}
                              >
                                <CardContent className="p-6">
                                  <div className="space-y-4">
                                    {/* Task Header */}
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-2 mb-2">
                                          {task.title}
                                        </h4>
                                        {task.description && (
                                          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3 leading-relaxed">
                                            {task.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    {/* Task Meta */}
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <Avatar className="h-7 w-7">
                                          <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-medium">
                                            {task.assignee.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                          </AvatarFallback>
                                        </Avatar>
                                        <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                                          {task.assignee}
                                        </span>
                                      </div>

                                      {task.priority && (
                                        <Badge className={`text-xs px-3 py-1 rounded-full border ${getPriorityColor(task.priority)}`}>
                                          {task.priority}
                                        </Badge>
                                      )}
                                    </div>

                                    {/* Event Association */}
                                    {task.eventTitle && (
                                      <div className="flex items-center gap-2 p-2 bg-white/50 dark:bg-white/5 rounded-lg">
                                        <Calendar className="h-3 w-3 text-gray-500" />
                                        <span className="text-xs text-gray-600 dark:text-gray-400 truncate font-medium">
                                          {task.eventTitle}
                                        </span>
                                      </div>
                                    )}

                                    {/* Deadline */}
                                    {task.deadline && (
                                      <div className={`flex items-center gap-2 p-2 rounded-lg ${
                                        isPast(task.deadline) && task.status !== 'completed'
                                          ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                                          : 'bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400'
                                      }`}>
                                        <Clock className="h-3 w-3" />
                                        <span className="text-xs font-medium">
                                          {format(task.deadline, 'MMM d, yyyy')}
                                        </span>
                                      </div>
                                    )}

                                    {/* Action Buttons */}
                                    {column.status !== 'completed' && (
                                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                          size="sm"
                                          className="h-8 px-4 text-xs flex-1 bg-white/80 hover:bg-white text-gray-700 border border-gray-200"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const nextStatus = column.status === 'pending' ? 'in_progress' : 'completed';
                                            onUpdateTaskStatus(task.id, nextStatus);
                                          }}
                                        >
                                          {column.status === 'pending' ? 'Start Task' : 'Complete'}
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            </motion.div>
                          ))}
                        </AnimatePresence>

                        {columnTasks.length === 0 && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center py-16"
                          >
                            <div className="opacity-40 mb-4">
                              <IconComponent className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto" />
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                              No {column.title.toLowerCase()} tasks
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              Tasks will appear here when assigned
                            </p>
                          </motion.div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Sidebar - Meeting Selector */}
      <div className="w-80 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border-l border-gray-200/50 dark:border-gray-700/50 flex flex-col">
        <div className="p-6 border-b border-gray-200/50 dark:border-gray-700/50">
          <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
            Meetings
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Select a meeting to view its tasks
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {/* All Tasks Option */}
            <motion.button
              onClick={() => handleMeetingSelect('All Tasks')}
              className={`w-full text-left p-4 rounded-xl transition-all ${
                selectedMeeting === 'All Tasks'
                  ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg'
                  : 'bg-white/50 hover:bg-white/80 dark:bg-gray-800/50 dark:hover:bg-gray-800/80 text-gray-900 dark:text-white'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">All Tasks</p>
                  <p className={`text-xs mt-1 ${
                    selectedMeeting === 'All Tasks' 
                      ? 'text-white/80' 
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    {tasks.length} total tasks
                  </p>
                </div>
                <ChevronRight className={`h-4 w-4 ${
                  selectedMeeting === 'All Tasks' ? 'text-white/80' : 'text-gray-400'
                }`} />
              </div>
            </motion.button>

            {/* Individual Meetings */}
            {meetings.map((meeting) => (
              <motion.button
                key={meeting.id}
                onClick={() => handleMeetingSelect(meeting.id)}
                className={`w-full text-left p-4 rounded-xl transition-all ${
                  selectedMeeting === meeting.id
                    ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg'
                    : 'bg-white/50 hover:bg-white/80 dark:bg-gray-800/50 dark:hover:bg-gray-800/80 text-gray-900 dark:text-white'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">
                      {meeting.title}
                    </p>
                    <p className={`text-xs mt-1 ${
                      selectedMeeting === meeting.id 
                        ? 'text-white/80' 
                        : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {meeting.taskCount} tasks
                    </p>
                  </div>
                  <ChevronRight className={`h-4 w-4 ml-2 ${
                    selectedMeeting === meeting.id ? 'text-white/80' : 'text-gray-400'
                  }`} />
                </div>
              </motion.button>
            ))}

            {meetings.length === 0 && (
              <div className="text-center py-12">
                <div className="opacity-40 mb-4">
                  <Calendar className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  No meetings found
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Create meetings to organize tasks
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}