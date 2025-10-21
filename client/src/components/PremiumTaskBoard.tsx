import { useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  CheckCircle, Circle, AlertCircle, Plus, Clock,
  User, Calendar, MoreVertical, Edit, Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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

interface PremiumTaskBoardProps {
  tasks: Task[];
  onUpdateTaskStatus: (taskId: string, status: Task['status']) => void;
  onTaskClick: (task: Task) => void;
  onAddTask?: () => void;
}

const statusColumns = [
  {
    status: 'pending' as const,
    title: 'To Do',
    color: 'from-gray-500 to-gray-600',
    icon: Circle,
    bgColor: 'bg-gray-50 dark:bg-gray-800/50'
  },
  {
    status: 'in_progress' as const,
    title: 'In Progress',
    color: 'from-blue-500 to-indigo-600',
    icon: AlertCircle,
    bgColor: 'bg-blue-50 dark:bg-blue-900/20'
  },
  {
    status: 'completed' as const,
    title: 'Completed',
    color: 'from-green-500 to-emerald-600',
    icon: CheckCircle,
    bgColor: 'bg-green-50 dark:bg-green-900/20'
  }
];

export function PremiumTaskBoard({
  tasks,
  onUpdateTaskStatus,
  onTaskClick,
  onAddTask
}: PremiumTaskBoardProps) {
  const getTasksByStatus = (status: Task['status']) => {
    return tasks.filter(task => task.status === status);
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  return (
    <div className="h-full bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-serif font-semibold text-gray-900 dark:text-white">
                Task Management
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Drag tasks between columns to update status
              </p>
            </div>
          </motion.div>

          {onAddTask && (
            <motion.button
              onClick={onAddTask}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Plus className="h-4 w-4" />
              Add Task
            </motion.button>
          )}
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          {statusColumns.map((column) => {
            const columnTasks = getTasksByStatus(column.status);
            const IconComponent = column.icon;

            return (
              <div key={column.status} className="flex flex-col">
                {/* Column Header */}
                <div className={`bg-gradient-to-r ${column.color} p-4 rounded-xl mb-4`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                        <IconComponent className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{column.title}</h3>
                        <p className="text-sm text-white/80">{columnTasks.length} tasks</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tasks Container */}
                <div className="flex-1 space-y-3 overflow-y-auto">
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
                        <Card className={`${column.bgColor} hover:shadow-lg transition-all duration-300 border-0 cursor-pointer`}
                              onClick={() => onTaskClick(task)}>
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              {/* Task Header */}
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-medium text-gray-900 dark:text-white text-sm line-clamp-2 mb-1">
                                    {task.title}
                                  </h4>
                                  {task.description && (
                                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                      {task.description}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Task Meta */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-5 w-5">
                                    <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                                      {task.assignee.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs text-gray-600 dark:text-gray-400">
                                    {task.assignee}
                                  </span>
                                </div>

                                {task.priority && (
                                  <Badge className={`text-xs ${getPriorityColor(task.priority)}`}>
                                    {task.priority}
                                  </Badge>
                                )}
                              </div>

                              {/* Event Association */}
                              {task.eventTitle && (
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="h-3 w-3 text-gray-400" />
                                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {task.eventTitle}
                                  </span>
                                </div>
                              )}

                              {/* Deadline */}
                              {task.deadline && (
                                <div className={`flex items-center gap-1.5 ${
                                  isPast(task.deadline) && task.status !== 'completed'
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-gray-500 dark:text-gray-400'
                                }`}>
                                  <Clock className="h-3 w-3" />
                                  <span className="text-xs">
                                    {format(task.deadline, 'MMM d, yyyy')}
                                  </span>
                                </div>
                              )}

                              {/* Action Buttons */}
                              {column.status !== 'completed' && (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs flex-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const nextStatus = column.status === 'pending' ? 'in_progress' : 'completed';
                                      onUpdateTaskStatus(task.id, nextStatus);
                                    }}
                                  >
                                    {column.status === 'pending' ? 'Start' : 'Complete'}
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
                      className="text-center py-12"
                    >
                      <div className="opacity-50 mb-4">
                        <IconComponent className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto" />
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No {column.title.toLowerCase()} tasks
                      </p>
                    </motion.div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}