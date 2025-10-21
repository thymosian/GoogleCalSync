import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, CheckSquare, ArrowUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { OnboardingMeetingSetup } from '@/components/OnboardingMeetingSetup';
import { PremiumTaskBoard } from '@/components/PremiumTaskBoard';
import { MeetingTaskDropdown } from '@/components/MeetingTaskDropdown';
import { EnhancedTaskBoard } from '@/components/EnhancedTaskBoard';

interface Task {
  id: string;
  title: string;
  description?: string;
  assignee: string;
  deadline?: Date;
  status: 'pending' | 'in_progress' | 'completed';
  eventTitle?: string;
}

interface MainContentTabsProps {
  tasks: Task[];
  onTaskUpdate: (tasks: Task[]) => void;
  onSidebarUpdate: (data: any) => void;
  onRestartProcess: () => void;
  activeTab: 'events' | 'tasks';
  onTabChange: (tab: 'events' | 'tasks') => void;
  isSidebarOpen?: boolean;
  sidebarWidth?: number;
}

export function MainContentTabs({
  tasks,
  onTaskUpdate,
  onSidebarUpdate,
  onRestartProcess,
  activeTab,
  onTabChange,
  isSidebarOpen = false,
  sidebarWidth = 400
}: MainContentTabsProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [showCompactHeader, setShowCompactHeader] = useState(false);

  // Handle scroll events for sticky header functionality
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setIsScrolled(scrollY > 50);
      setShowCompactHeader(scrollY > 200);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  return (
    <div className="h-screen bg-background overflow-hidden flex flex-col">
      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as 'events' | 'tasks')} className="w-full h-full flex flex-col">
        {/* Sticky Tab Header */}
        <div className={`sticky top-0 z-30 transition-all duration-300 ${isScrolled ? 'bg-background/95 backdrop-blur-lg shadow-md' : 'bg-background'}`}>
          <div className="w-full px-8 py-6">
            <div className="flex justify-center">
              <TabsList className="grid w-full max-w-md grid-cols-2 bg-muted/50 p-1 rounded-xl shadow-lg">
                <TabsTrigger 
                  value="events" 
                  className="flex items-center gap-2 rounded-lg font-medium transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
                >
                  <Calendar className="h-4 w-4" />
                  <span>Events</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="tasks" 
                  className="flex items-center gap-2 rounded-lg font-medium transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
                >
                  <CheckSquare className="h-4 w-4" />
                  <span>Tasks</span>
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
        </div>

        {/* Compact Header Indicator (shows when scrolled) */}
        <AnimatePresence>
          {showCompactHeader && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`fixed top-20 z-20 transition-all duration-300 ${
                isSidebarOpen ? `left-${Math.round(sidebarWidth / 40) * 10}` : 'left-4'
              } bg-primary/90 backdrop-blur-lg text-primary-foreground px-4 py-2 rounded-full shadow-lg`}
              style={{ left: isSidebarOpen ? sidebarWidth + 16 : 16 }}
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {activeTab === 'events' ? 'Create New Event' : 'Task Management'}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab Content with full scrolling */}
        <div className="w-full flex-1 overflow-y-auto">
          <TabsContent value="events" className="m-0 p-0 h-full">
            <motion.div
              key="events"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full"
            >
              {/* Main header section */}
              <div className="px-8 py-12 text-center bg-gradient-to-b from-background to-background/50">
                <h1 className="font-display font-bold text-3xl md:text-4xl text-foreground mb-4">
                  Create New Event
                </h1>
                <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                  Use AI to create and schedule meetings with intelligent automation
                </p>
              </div>
              
              {/* Content area with proper padding and scrolling */}
              <div className="px-8 pb-16">
                <div className="max-w-6xl mx-auto">
                  {/* Content card with better spacing */}
                  <div className="bg-card/50 backdrop-blur-sm rounded-3xl border border-border/20 shadow-xl p-8">
                    <OnboardingMeetingSetup
                      onSidebarUpdate={onSidebarUpdate}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="tasks" className="m-0 p-0 h-full">
            <motion.div
              key="tasks"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full"
            >
              {/* Main header section for tasks */}
              <div className="px-8 py-12 text-center bg-gradient-to-b from-background to-background/50">
                <h1 className="font-display font-bold text-3xl md:text-4xl text-foreground mb-4">
                  Task Management
                </h1>
                <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                  Track and manage tasks across all your projects and meetings
                </p>
              </div>
              
              {/* Enhanced Task board with integrated meeting selector */}
              <div className="px-8 pb-16">
                <div className="max-w-full mx-auto h-[calc(100vh-300px)]">
                  <EnhancedTaskBoard
                    tasks={tasks}
                    onUpdateTaskStatus={(taskId, status) => {
                      const updatedTasks = tasks.map(task =>
                        task.id === taskId ? { ...task, status } : task
                      );
                      onTaskUpdate(updatedTasks);
                    }}
                    onTaskClick={(task) => {
                      // Handle task click - could open task details or chat
                      console.log('Task clicked:', task);
                    }}
                    onAddTask={() => {
                      // Handle adding new task
                      console.log('Add new task');
                    }}
                  />
                </div>
              </div>
            </motion.div>
          </TabsContent>
        </div>

        {/* Scroll to top button */}
        <AnimatePresence>
          {isScrolled && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className={`fixed bottom-8 z-30 bg-primary hover:bg-primary/90 text-primary-foreground p-3 rounded-full shadow-lg transition-all duration-300 ${
                isSidebarOpen ? 'right-8' : 'right-8'
              }`}
            >
              <ArrowUp className="h-5 w-5" />
            </motion.button>
          )}
        </AnimatePresence>
      </Tabs>
    </div>
  );
}