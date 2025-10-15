import { Calendar, Clock, ExternalLink, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, isToday, isTomorrow } from "date-fns";
import { useState, useEffect } from "react";

interface CalendarEvent {
  id: string;
  googleEventId?: string;
  title: string;
  startTime: Date;
  endTime: Date;
  meetingLink?: string;
  attendees: string[];
  description?: string;
}

interface CalendarSidebarProps {
  events: CalendarEvent[];
  onDeleteEvent: (eventId: string) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export function CalendarSidebar({ events, onDeleteEvent, onEventClick }: CalendarSidebarProps) {
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);

  // Allow only one event to be expanded at a time
  const toggleEvent = (eventId: string) => {
    setOpenEvent(prev => prev === eventId ? null : eventId);
  };

  const getEventDateLabel = (date: Date) => {
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "EEE, MMM d");
  };

  // Group events by date
  const groupedEvents = events.reduce((groups, event) => {
    const dateKey = format(new Date(event.startTime), "yyyy-MM-dd");
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(event);
    return groups;
  }, {} as Record<string, CalendarEvent[]>);

  const handleDeleteClick = (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteEventId(eventId);
  };

  const confirmDelete = () => {
    if (deleteEventId) {
      onDeleteEvent(deleteEventId);
      setDeleteEventId(null);
    }
  };

  const cancelDelete = () => {
    setDeleteEventId(null);
  };

  return (
    <>
      <div className="space-y-4">
        {/* Fixed header */}
        <div className="sticky top-0 bg-card z-10 pb-2 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Upcoming Events
          </h2>
        </div>
        
        <div className="space-y-4">
          {Object.entries(groupedEvents).length > 0 ? (
            Object.entries(groupedEvents).map(([dateKey, dayEvents]) => (
              <div key={dateKey} className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground px-2">
                  {getEventDateLabel(new Date(dayEvents[0].startTime))}
                </h3>
                {dayEvents.map((event) => (
                  <Collapsible
                    key={event.id}
                    open={openEvent === event.id}
                    onOpenChange={() => toggleEvent(event.id)}
                  >
                    <div 
                      className="border rounded-lg hover-elevate cursor-pointer"
                      data-testid={`event-card-${event.id}`}
                    >
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 
                              className="font-medium truncate cursor-pointer"
                              onClick={() => onEventClick(event)}
                              data-testid={`event-title-${event.id}`}
                            >
                              {event.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(event.startTime), "h:mm a")} - {format(new Date(event.endTime), "h:mm a")}
                              </span>
                            </div>
                            {event.attendees.length > 0 && (
                              <Badge variant="secondary" className="mt-2 text-xs">
                                {event.attendees.length} attendee{event.attendees.length > 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {event.meetingLink && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(event.meetingLink, '_blank');
                                }}
                                data-testid={`button-meeting-link-${event.id}`}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={(e) => handleDeleteClick(event.id, e)}
                              data-testid={`button-delete-event-${event.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                data-testid={`button-expand-event-${event.id}`}
                              >
                                <ChevronDown className={`h-3 w-3 transition-transform ${openEvent === event.id ? 'rotate-180' : ''}`} />
                              </Button>
                            </CollapsibleTrigger>
                          </div>
                        </div>
                      </div>
                      <CollapsibleContent>
                        <div className="px-3 pb-3 pt-0 border-t bg-muted/30">
                          {event.description && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground mb-1">Description:</p>
                              <p className="text-sm">{event.description}</p>
                            </div>
                          )}
                          {event.attendees.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground mb-1">Attendees:</p>
                              <div className="flex flex-wrap gap-1">
                                {event.attendees.map((attendee, index) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {attendee}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="mt-3 space-y-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-xs"
                              onClick={() => {
                                console.log('Ask AI about event:', event.id);
                              }}
                              data-testid={`button-ask-ai-${event.id}`}
                            >
                              Ask AI about this event
                            </Button>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No upcoming events</p>
              <p className="text-xs mt-1">Your calendar events will appear here once you add them</p>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteEventId} onOpenChange={(open) => !open && cancelDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this event from your Google Calendar. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Delete Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}