import { CalendarSidebar } from '../CalendarSidebar';
import { addDays, addHours } from 'date-fns';

//todo: remove mock functionality
const mockEvents = [
  {
    id: '1',
    title: 'Daily Standup',
    startTime: new Date(),
    endTime: addHours(new Date(), 0.5),
    attendees: ['john@example.com', 'sarah@example.com'],
    meetingLink: 'https://meet.google.com/abc-defg-hij',
    description: 'Quick sync on sprint progress and blockers'
  },
  {
    id: '2', 
    title: 'Client Demo Preparation',
    startTime: addHours(new Date(), 2),
    endTime: addHours(new Date(), 3),
    attendees: ['client@example.com', 'pm@example.com'],
    description: 'Prepare slides and demo environment for Friday presentation'
  },
  {
    id: '3',
    title: 'Design Review Meeting',
    startTime: addDays(new Date(), 1),
    endTime: addDays(addHours(new Date(), 1), 1),
    attendees: ['designer@example.com', 'dev@example.com'],
    meetingLink: 'https://zoom.us/j/123456789',
    description: 'Review new mockups for the user dashboard'
  },
  {
    id: '4',
    title: '1:1 with Manager',
    startTime: addDays(new Date(), 2),
    endTime: addDays(addHours(new Date(), 0.5), 2),
    attendees: ['manager@example.com']
  }
];

export default function CalendarSidebarExample() {
  const handleDeleteEvent = (eventId: string) => {
    console.log('Delete event:', eventId);
  };

  const handleEventClick = (event: any) => {
    console.log('Event clicked:', event);
  };

  return (
    <div className="h-[600px] w-[350px]">
      <CalendarSidebar 
        events={mockEvents}
        onDeleteEvent={handleDeleteEvent}
        onEventClick={handleEventClick}
      />
    </div>
  );
}