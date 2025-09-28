import { TaskBoard } from '../TaskBoard';
import { useState } from 'react';
import { addDays } from 'date-fns';

//todo: remove mock functionality
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
    title: 'Design mockups for mobile app',
    assignee: 'Alex Rivera',
    deadline: addDays(new Date(), 7),
    status: 'pending' as const,
    eventTitle: 'Design Review Session'
  },
  {
    id: '4',
    title: 'Send follow-up email to clients',
    description: 'Include meeting summary and next steps from today\'s discussion',
    assignee: 'Sarah Johnson',
    status: 'completed' as const,
    eventTitle: 'Client Strategy Meeting'
  },
  {
    id: '5',
    title: 'Update project timeline',
    description: 'Adjust milestones based on team capacity discussion',
    assignee: 'Mike Chen',
    status: 'completed' as const,
    eventTitle: 'Sprint Planning Meeting'
  },
  {
    id: '6',
    title: 'Research competitive analysis',
    assignee: 'Alex Rivera',
    deadline: addDays(new Date(), -1), // Overdue task
    status: 'in_progress' as const,
    eventTitle: 'Product Strategy Session'
  }
];

export default function TaskBoardExample() {
  const [tasks, setTasks] = useState(mockTasks);

  const handleUpdateTaskStatus = (taskId: string, status: 'pending' | 'in_progress' | 'completed') => {
    setTasks(prev => prev.map(task => 
      task.id === taskId ? { ...task, status } : task
    ));
    console.log('Updated task:', taskId, 'to status:', status);
  };

  const handleTaskClick = (task: any) => {
    console.log('Task clicked:', task);
  };

  return (
    <div className="h-[600px] w-full max-w-6xl">
      <TaskBoard
        tasks={tasks}
        onUpdateTaskStatus={handleUpdateTaskStatus}
        onTaskClick={handleTaskClick}
      />
    </div>
  );
}