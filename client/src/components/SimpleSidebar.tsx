import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Clock, Users, ExternalLink, Video,
  MapPin, ChevronRight, GripVertical, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { format, isToday, isTomorrow, isWithinInterval, addDays } from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attendees: string[];
  meetingLink?: string;
  location?: string;
}

interface SimpleSidebarProps {
  events: CalendarEvent[];
  onJoinEvent: (eventId: string) => void;
  onViewEvent: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  isOpen: boolean;
  width?: number;
  onWidthChange?: (width: number) => void;
}

export function SimpleSidebar({
  events,
  onJoinEvent,
  onViewEvent,
  onDeleteEvent,
  isOpen,
  width = 400,
  onWidthChange
}: SimpleSidebarProps) {
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [startX, setStartX] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    setStartX(e.clientX);
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing || !onWidthChange) return;
    
    const diff = e.clientX - startX;
    const newWidth = Math.max(280, Math.min(600, width + diff));
    onWidthChange(newWidth);
    setStartX(e.clientX);
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  // Add mouse event listeners
  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Get all upcoming events (not limited to 5)
  const upcomingEvents = events
    .filter(event => new Date(event.startTime) > new Date())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const getTimeLabel = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d');
  };

  const getEventStatus = (event: CalendarEvent) => {
    const now = new Date();
    const eventStart = new Date(event.startTime);
    const eventEnd = new Date(event.endTime);
    
    if (now >= eventStart && now <= eventEnd) return 'live';
    if (now < eventStart && eventStart.getTime() - now.getTime() < 30 * 60 * 1000) return 'starting';
    return 'upcoming';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live': return 'bg-destructive';
      case 'starting': return 'bg-amber-500 dark:bg-amber-600';
      default: return 'bg-emerald-500 dark:bg-emerald-600';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'live': return 'Live';
      case 'starting': return 'Starting Soon';
      default: return 'Upcoming';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: -width, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -width, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0.0, 0.2, 1] }}
          style={{ width }}
          className="fixed left-0 top-16 bottom-0 bg-card backdrop-blur-lg border-r-2 border-border/50 shadow-2xl z-40 flex flex-col"
        >
          {/* Header with optimized padding */}
          <div className="flex-shrink-0 px-6 py-6 border-b-2 border-border/40 bg-gradient-to-br from-card to-muted/10 dark:from-card dark:to-muted/5">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/15 dark:bg-primary/20 rounded-xl">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <h2 className="font-display font-bold text-xl text-foreground">
                  Upcoming Events
                </h2>
              </div>
              <p className="text-sm text-muted-foreground font-medium">
                {upcomingEvents.length} event{upcomingEvents.length !== 1 ? 's' : ''} scheduled
              </p>
            </motion.div>
          </div>

          {/* Events List with enhanced padding and proper scrolling */}
          <div className="flex-1 min-h-0 flex flex-col">
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-4 py-4 space-y-3">
                {upcomingEvents.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-col items-center justify-center py-16 text-center"
                  >
                    <div className="p-4 bg-muted/40 dark:bg-muted/50 rounded-2xl mb-6">
                      <Calendar className="h-16 w-16 text-muted-foreground/60 dark:text-muted-foreground/50" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">No upcoming events</h3>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground/80">Create your first meeting to get started</p>
                  </motion.div>
                ) : (
                  upcomingEvents.map((event, index) => {
                    const status = getEventStatus(event);
                    return (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onHoverStart={() => setHoveredEvent(event.id)}
                        onHoverEnd={() => setHoveredEvent(null)}
                        className="group"
                      >
                        <div className="bg-muted/30 dark:bg-muted/40 rounded-2xl p-4 border-2 border-border/40 hover:border-primary/50 transition-all duration-300 hover:bg-muted/50 dark:hover:bg-muted/60 hover:shadow-lg">
                          {/* Event Header */}
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-semibold text-sm text-foreground break-words line-clamp-3">
                                  {event.title}
                                </h3>
                                <Badge
                                  variant="outline"
                                  className={`${getStatusColor(status)} text-white text-xs px-2 py-1 font-medium`}
                                >
                                  {getStatusText(status)}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span className="font-medium">{getTimeLabel(new Date(event.startTime))}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span className="font-medium">{format(new Date(event.startTime), 'HH:mm')}</span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Status Indicator */}
                            <div className={`w-3 h-3 rounded-full ${getStatusColor(status)} shadow-lg`} />
                          </div>

                          {/* Event Details with enhanced spacing */}
                          <div className="space-y-3 mb-4">
                            {event.attendees.length > 0 && (
                              <div className="flex items-center gap-2">
                                <Users className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground font-medium">
                                  {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                            )}
                            
                            {event.location && (
                              <div className="flex items-start gap-2">
                                <MapPin className="h-3 w-3 text-muted-foreground mt-0.5" />
                                <span className="text-xs text-muted-foreground break-words font-medium">
                                  {event.location}
                                </span>
                              </div>
                            )}
                            
                            {event.meetingLink && (
                              <div className="flex items-center gap-2">
                                <Video className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground font-medium">Video call enabled</span>
                              </div>
                            )}
                          </div>

                          {/* Action Buttons with enhanced styling */}
                          <div className="flex gap-2">
                            {status === 'live' || status === 'starting' ? (
                              <Button
                                size="sm"
                                onClick={() => onJoinEvent(event.id)}
                                className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs h-9 shadow-md hover:shadow-lg transition-all duration-200"
                              >
                                Join Now
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onViewEvent(event.id)}
                                className="flex-1 text-xs h-9 hover:bg-muted/50 border-2 hover:border-primary/40 transition-all duration-200"
                              >
                                View Details
                                <ChevronRight className="h-3 w-3 ml-1" />
                              </Button>
                            )}
                            
                            {event.meetingLink && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(event.meetingLink, '_blank')}
                                className="px-3 h-9 hover:bg-primary/10"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            )}
                            
                            {/* Delete Button with Confirmation Dialog */}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="px-3 h-9 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors duration-200"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Event</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{event.title}"? This action cannot be undone and the event will be permanently removed from your calendar.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => onDeleteEvent(event.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete Event
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
            
            {/* Well-defined footer with contrasted ending */}
            <div className="flex-shrink-0 px-4 py-3 border-t-2 border-border/40 bg-gradient-to-br from-card to-muted/5 dark:from-card dark:to-muted/3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground/70 dark:text-muted-foreground/80 font-medium">
                  CalAI Dashboard • Powered by AI
                </p>
              </div>
            </div>
          </div>
          
          {/* Resize Handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-transparent hover:bg-primary/30 dark:hover:bg-primary/40 transition-colors duration-200 flex items-center justify-center group"
            onMouseDown={handleMouseDown}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/40 dark:text-muted-foreground/60 group-hover:text-primary group-hover:dark:text-primary transition-colors duration-200" />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}