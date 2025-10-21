import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Clock, Users, ExternalLink, Video,
  MapPin, ChevronDown, ChevronUp, ArrowRight, Plus, Trash2
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { format, isToday, isTomorrow } from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attendees: string[];
  meetingLink?: string;
  location?: string;
}

interface PremiumEventSidebarProps {
  events: CalendarEvent[];
  onJoinEvent: (eventId: string) => void;
  onViewEvent: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onCreateEvent?: () => void;
}

export function PremiumEventSidebar({
  events,
  onJoinEvent,
  onViewEvent,
  onDeleteEvent,
  onCreateEvent
}: PremiumEventSidebarProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  
  const upcomingEvents = useMemo(() => {
    return events
      .filter(event => new Date(event.startTime) > new Date())
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 5);
  }, [events]);

  const toggleEventExpansion = (eventId: string) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId);
    } else {
      newExpanded.add(eventId);
    }
    setExpandedEvents(newExpanded);
  };

  const getTimeLabel = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d');
  };

  const getEventStatus = (event: CalendarEvent) => {
    const now = new Date();
    const eventStart = new Date(event.startTime);
    const eventEnd = new Date(event.endTime);
    
    if (now >= eventStart && now <= eventEnd) return 'active';
    if (now < eventStart && eventStart.getTime() - now.getTime() < 30 * 60 * 1000) return 'starting';
    return 'upcoming';
  };

  return (
    <div className="h-full bg-gradient-to-b from-background via-card to-background/95 border-r border-border/50">
      {/* Header */}
      <div className="p-8 border-b border-border/20">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0.0, 0.2, 1] }}
          className="space-y-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 muted-gradient-primary rounded-2xl flex items-center justify-center premium-shadow-subtle">
              <Calendar className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-xl text-foreground tracking-tight">
                Upcoming Events
              </h2>
              <p className="text-sm text-muted-foreground font-mono">
                {upcomingEvents.length} scheduled this week
              </p>
            </div>
          </div>
          
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-xl p-3 hover-lift-subtle">
              <div className="text-lg font-bold text-foreground">
                {events.filter(e => isToday(new Date(e.startTime))).length}
              </div>
              <div className="text-xs text-muted-foreground">Today</div>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 hover-lift-subtle">
              <div className="text-lg font-bold text-foreground">
                {events.filter(e => isTomorrow(new Date(e.startTime))).length}
              </div>
              <div className="text-xs text-muted-foreground">Tomorrow</div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Events List */}
      <ScrollArea className="flex-1 p-6">
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {upcomingEvents.map((event, index) => {
              const isExpanded = expandedEvents.has(event.id);
              const timeLabel = getTimeLabel(new Date(event.startTime));
              const status = getEventStatus(event);

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  transition={{ 
                    delay: index * 0.1,
                    type: "spring",
                    stiffness: 400,
                    damping: 30
                  }}
                  layout
                  className="stagger-item"
                >
                  <Card className="group card-transition glass-effect border border-border/20 hover:border-accent/30 overflow-hidden">
                    <CardContent className="p-0">
                      {/* Main Event Header */}
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <Badge 
                                className={`text-xs px-2 py-1 rounded-lg font-mono ${
                                  status === 'active' 
                                    ? 'bg-destructive/20 text-destructive border-destructive/30' 
                                    : status === 'starting'
                                    ? 'bg-accent/20 text-accent-foreground border-accent/30'
                                    : 'bg-muted text-muted-foreground border-muted-foreground/20'
                                }`}
                              >
                                {timeLabel}
                              </Badge>
                              {status === 'active' && (
                                <Badge className="bg-destructive text-destructive-foreground animate-pulse">
                                  Live
                                </Badge>
                              )}
                            </div>

                            <h3 className="font-semibold text-lg text-foreground mb-2 line-clamp-2 group-hover:text-accent-foreground transition-colors">
                              {event.title}
                            </h3>

                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                <span className="font-mono">
                                  {format(new Date(event.startTime), 'HH:mm')}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Users className="h-3 w-3" />
                                <span>{event.attendees.length}</span>
                              </div>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleEventExpansion(event.id)}
                            className="opacity-60 group-hover:opacity-100 transition-all p-2 rounded-lg hover:bg-muted/50"
                          >
                            <motion.div
                              animate={{ rotate: isExpanded ? 180 : 0 }}
                              transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </motion.div>
                          </Button>
                        </div>

                        {/* Quick Action Buttons */}
                        <div className="flex gap-2">
                          {event.meetingLink && (
                            <Button
                              size="sm"
                              onClick={() => onJoinEvent(event.id)}
                              className="flex-1 muted-gradient-accent text-sidebar-accent-foreground hover-lift-subtle btn-bounce"
                            >
                              <Video className="h-3 w-3 mr-2" />
                              Join
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onViewEvent(event.id)}
                            className="flex-1 hover:bg-muted/50"
                          >
                            Details
                            <ArrowRight className="h-3 w-3 ml-2" />
                          </Button>
                        </div>
                      </div>

                      {/* Expanded Content */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            className="border-t border-border/20 bg-muted/30"
                          >
                            <div className="p-5 space-y-4">
                              {/* Attendees */}
                              {event.attendees.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wider">
                                    Attendees ({event.attendees.length})
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {event.attendees.slice(0, 4).map((attendee, idx) => (
                                      <Badge key={idx} variant="secondary" className="text-xs bg-background/50">
                                        {attendee.length > 20 ? `${attendee.substring(0, 20)}...` : attendee}
                                      </Badge>
                                    ))}
                                    {event.attendees.length > 4 && (
                                      <Badge variant="outline" className="text-xs">
                                        +{event.attendees.length - 4} more
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Meeting Details */}
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                  Meeting Details
                                </p>
                                <div className="space-y-2">
                                  <div className="flex items-center gap-3 text-sm">
                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-muted-foreground">
                                      {format(new Date(event.startTime), 'EEEE, MMMM d, yyyy')}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-sm">
                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-muted-foreground font-mono">
                                      {format(new Date(event.startTime), 'HH:mm')} - {format(new Date(event.endTime), 'HH:mm')}
                                    </span>
                                  </div>
                                  
                                  {event.meetingLink ? (
                                    <div className="flex items-center gap-3 text-sm">
                                      <Video className="h-3 w-3 text-accent" />
                                      <span className="text-accent font-medium">Online Meeting</span>
                                    </div>
                                  ) : event.location ? (
                                    <div className="flex items-center gap-3 text-sm">
                                      <MapPin className="h-3 w-3 text-muted-foreground" />
                                      <span className="text-muted-foreground">{event.location}</span>
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              {/* Delete Button */}
                              <div className="pt-2 border-t border-border/20">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete Event
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
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Empty State */}
          {upcomingEvents.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="text-center py-16"
            >
              <div className="w-20 h-20 muted-gradient-primary rounded-full flex items-center justify-center mx-auto mb-6 premium-shadow-subtle">
                <Calendar className="h-10 w-10 text-primary-foreground" />
              </div>
              <h3 className="font-serif font-semibold text-lg text-foreground mb-2">
                No upcoming events
              </h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
                Your calendar is clear. Create your first event to get started with intelligent scheduling.
              </p>
              {onCreateEvent && (
                <Button
                  onClick={onCreateEvent}
                  className="muted-gradient-primary text-primary-foreground hover-lift-subtle btn-bounce"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Event
                </Button>
              )}
            </motion.div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}