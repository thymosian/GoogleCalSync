import { Clock, User, Calendar, CheckCircle, Circle, AlertCircle, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, isPast } from "date-fns";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Task {
  id: string;
  title: string;
  description?: string;
  assignee: string;
  deadline?: Date;
  status: 'pending' | 'in_progress' | 'completed';
  eventTitle?: string;
}

interface TaskBoardProps {
  tasks: Task[];
  onUpdateTaskStatus: (taskId: string, status: Task['status']) => void;
  onTaskClick: (task: Task) => void;
  onAddTask?: (task: Omit<Task, 'id' | 'status'>) => void; // New prop for adding tasks
}

// Sample assignees - in a real app, this would come from your user management system
const sampleAssignees = [
  "Sarah Johnson",
  "Mike Chen",
  "Alex Rodriguez",
  "Emma Wilson",
  "David Kim"
];

const statusColumns = [
  { 
    status: 'pending' as const, 
    title: 'To Do', 
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/20'
  },
  { 
    status: 'in_progress' as const, 
    title: 'In Progress', 
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20'
  },
  { 
    status: 'completed' as const, 
    title: 'Completed', 
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/20'
  }
];

export function TaskBoard({ tasks, onUpdateTaskStatus, onTaskClick, onAddTask }: TaskBoardProps) {
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assignee: sampleAssignees[0],
    eventTitle: ''
  });

  const getTasksByStatus = (status: Task['status']) => {
    return tasks.filter(task => task.status === status);
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

  const isTaskOverdue = (task: Task) => {
    return task.deadline && task.status !== 'completed' && isPast(task.deadline);
  };

  const handleAddTask = () => {
    if (newTask.title.trim() && onAddTask) {
      onAddTask({
        title: newTask.title,
        description: newTask.description,
        assignee: newTask.assignee,
        eventTitle: newTask.eventTitle
      });
      // Reset form
      setNewTask({
        title: '',
        description: '',
        assignee: sampleAssignees[0],
        eventTitle: ''
      });
      setIsAddTaskOpen(false);
    }
  };

  return (
    <div className="h-full">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
        {statusColumns.map((column) => {
          const columnTasks = getTasksByStatus(column.status);
          
          return (
            <Card key={column.status} className="h-fit lg:h-full">
              <CardHeader className="pb-3">
                <CardTitle className={`text-base flex items-center justify-between ${column.color}`}>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(column.status)}
                    {column.title}
                  </div>
                  <div className="flex items-center gap-2">
                    {column.status === 'pending' && onAddTask && (
                      <Dialog open={isAddTaskOpen} onOpenChange={setIsAddTaskOpen}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-6 w-6 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent 
                          className="sm:max-w-[425px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DialogHeader>
                            <DialogTitle>Add New Task</DialogTitle>
                            <DialogDescription>
                              Create a new task to track your work and assign it to a team member.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                              <label htmlFor="title" className="text-right text-sm font-medium">
                                Title
                              </label>
                              <div className="col-span-3">
                                <Input
                                  id="title"
                                  value={newTask.title}
                                  onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                                  placeholder="Task title"
                                  className="w-full"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                              <label htmlFor="description" className="text-right text-sm font-medium">
                                Description
                              </label>
                              <div className="col-span-3">
                                <Textarea
                                  id="description"
                                  value={newTask.description}
                                  onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                                  placeholder="Task description"
                                  className="w-full"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                              <label htmlFor="event" className="text-right text-sm font-medium">
                                Event
                              </label>
                              <div className="col-span-3">
                                <Input
                                  id="event"
                                  value={newTask.eventTitle}
                                  onChange={(e) => setNewTask({...newTask, eventTitle: e.target.value})}
                                  placeholder="Related event (optional)"
                                  className="w-full"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                              <label htmlFor="assignee" className="text-right text-sm font-medium">
                                Assignee
                              </label>
                              <div className="col-span-3">
                                <Select 
                                  value={newTask.assignee} 
                                  onValueChange={(value) => setNewTask({...newTask, assignee: value})}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select assignee" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {sampleAssignees.map((assignee) => (
                                      <SelectItem key={assignee} value={assignee}>
                                        {assignee}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setIsAddTaskOpen(false)}
                            >
                              Cancel
                            </Button>
                            <Button 
                              onClick={handleAddTask}
                              disabled={!newTask.title.trim()}
                            >
                              Add Task
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {columnTasks.length}
                    </Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
                  {columnTasks.map((task) => (
                    <Card
                      key={task.id}
                      className={`cursor-pointer hover-elevate transition-colors ${column.bgColor}`}
                      onClick={() => onTaskClick(task)}
                      data-testid={`task-card-${task.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div>
                            <h4 className="font-medium text-sm line-clamp-2">
                              {task.title}
                            </h4>
                            {task.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                          </div>

                          {task.eventTitle && (
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground truncate">
                                {task.eventTitle}
                              </span>
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs">
                                  {task.assignee.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-muted-foreground">
                                {task.assignee}
                              </span>
                            </div>

                            {task.deadline && (
                              <div className={`flex items-center gap-1 ${isTaskOverdue(task) ? 'text-destructive' : 'text-muted-foreground'}`}>
                                <Clock className="h-3 w-3" />
                                <span className="text-xs">
                                  {format(task.deadline, 'MMM d')}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-1">
                            {column.status !== 'completed' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nextStatus = column.status === 'pending' ? 'in_progress' : 'completed';
                                  onUpdateTaskStatus(task.id, nextStatus);
                                }}
                                data-testid={`button-update-task-${task.id}`}
                              >
                                {column.status === 'pending' ? 'Start' : 'Complete'}
                              </Button>
                            )}
                            {column.status === 'completed' && (
                              <Button
                                size="sm"
                                variant="outline" 
                                className="h-6 px-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateTaskStatus(task.id, 'in_progress');
                                }}
                                data-testid={`button-reopen-task-${task.id}`}
                              >
                                Reopen
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {columnTasks.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <div className="opacity-50 mb-2">
                        {getStatusIcon(column.status)}
                      </div>
                      <p className="text-sm">No {column.title.toLowerCase()} tasks</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}