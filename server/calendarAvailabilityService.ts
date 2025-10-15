import { google } from 'googleapis';
import { User } from '../shared/schema';
import { withCalendarErrorHandling } from './errorHandlers/calendarErrorHandler.js';

// Types for calendar availability checking
export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  status: string;
  transparency?: string;
  attendees?: string[];
  location?: string;
}

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  duration: number; // in minutes
  isAvailable: boolean;
}

export interface AvailabilityResult {
  isAvailable: boolean;
  conflicts: CalendarEvent[];
  suggestedAlternatives?: TimeSlot[];
}

export interface ConflictDetails {
  hasConflicts: boolean;
  conflictingEvents: CalendarEvent[];
  totalConflicts: number;
}

/**
 * Business hours configuration
 */
const BUSINESS_HOURS = {
  start: 9, // 9 AM
  end: 17,  // 5 PM
  days: [1, 2, 3, 4, 5] // Monday to Friday (0 = Sunday, 6 = Saturday)
};

/**
 * Get Google Calendar API client
 */
function getCalendarClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Transform Google Calendar event to our CalendarEvent format
 */
function transformGoogleEvent(googleEvent: any): CalendarEvent {
  return {
    id: googleEvent.id || '',
    title: googleEvent.summary || 'No Title',
    startTime: googleEvent.start?.dateTime ? new Date(googleEvent.start.dateTime) : 
              googleEvent.start?.date ? new Date(googleEvent.start.date) : new Date(),
    endTime: googleEvent.end?.dateTime ? new Date(googleEvent.end.dateTime) : 
            googleEvent.end?.date ? new Date(googleEvent.end.date) : new Date(),
    status: googleEvent.status || 'confirmed',
    transparency: googleEvent.transparency,
    attendees: googleEvent.attendees?.map((attendee: any) => attendee.email || '') || [],
    location: googleEvent.location || ''
  };
}

/**
 * Check if an event should be considered a conflict
 * Filters out cancelled and transparent events
 */
function isConflictingEvent(event: CalendarEvent): boolean {
  // Skip cancelled events
  if (event.status === 'cancelled') {
    return false;
  }
  
  // Skip transparent events (events that don't block time)
  if (event.transparency === 'transparent') {
    return false;
  }
  
  return true;
}

/**
 * Check for calendar conflicts in a specific time range
 * Requirements: 4.1, 4.2
 */
export async function checkCalendarConflicts(
  user: User,
  startTime: Date,
  endTime: Date
): Promise<ConflictDetails> {
  return withCalendarErrorHandling(
    async () => {
      if (!user.accessToken) {
        throw new Error('User access token is missing');
      }

      const calendar = getCalendarClient(user.accessToken);
      
      // Query for events in the proposed time range
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50 // Reasonable limit for conflict checking
      });

      const events = response.data.items || [];
      
      // Transform and filter events
      const calendarEvents = events
        .map(transformGoogleEvent)
        .filter(isConflictingEvent);
      
      // Find actual conflicts (events that overlap with proposed time)
      const conflictingEvents = calendarEvents.filter(event => {
        // Check if events overlap
        return (
          (event.startTime < endTime && event.endTime > startTime) ||
          (startTime < event.endTime && endTime > event.startTime)
        );
      });

      return {
        hasConflicts: conflictingEvents.length > 0,
        conflictingEvents,
        totalConflicts: conflictingEvents.length
      };
    },
    'checkCalendarConflicts',
    user,
    true
  );
}

/**
 * Get detailed availability information including conflicts and alternatives
 * Requirements: 4.1, 4.2
 */
export async function checkCalendarAvailability(
  user: User,
  startTime: Date,
  endTime: Date
): Promise<AvailabilityResult> {
  return withCalendarErrorHandling(
    async () => {
      const conflictDetails = await checkCalendarConflicts(user, startTime, endTime);
      
      let suggestedAlternatives: TimeSlot[] | undefined;
      
      // If there are conflicts, suggest alternative time slots
      if (conflictDetails.hasConflicts) {
        const duration = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60)); // duration in minutes
        suggestedAlternatives = await suggestAlternativeTimeSlots(user, startTime, duration);
      }
      
      return {
        isAvailable: !conflictDetails.hasConflicts,
        conflicts: conflictDetails.conflictingEvents,
        suggestedAlternatives
      };
    },
    'checkCalendarAvailability',
    user,
    true
  );
}

/**
 * Check if a time slot falls within business hours
 */
function isWithinBusinessHours(startTime: Date, endTime: Date): boolean {
  const startHour = startTime.getHours();
  const endHour = endTime.getHours();
  const dayOfWeek = startTime.getDay();
  
  // Check if it's a business day
  if (!BUSINESS_HOURS.days.includes(dayOfWeek)) {
    return false;
  }
  
  // Check if it's within business hours
  return startHour >= BUSINESS_HOURS.start && endHour <= BUSINESS_HOURS.end;
}

/**
 * Generate potential time slots around a preferred time
 */
function generatePotentialTimeSlots(
  preferredStartTime: Date,
  durationMinutes: number,
  searchRangeHours: number = 4
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const searchRangeMs = searchRangeHours * 60 * 60 * 1000; // Convert to milliseconds
  const durationMs = durationMinutes * 60 * 1000;
  
  // Generate slots before and after the preferred time
  for (let offset = -searchRangeMs; offset <= searchRangeMs; offset += 30 * 60 * 1000) { // 30-minute intervals
    const slotStart = new Date(preferredStartTime.getTime() + offset);
    const slotEnd = new Date(slotStart.getTime() + durationMs);
    
    // Skip if not within business hours
    if (!isWithinBusinessHours(slotStart, slotEnd)) {
      continue;
    }
    
    // Skip if it's in the past
    if (slotStart < new Date()) {
      continue;
    }
    
    slots.push({
      startTime: slotStart,
      endTime: slotEnd,
      duration: durationMinutes,
      isAvailable: true // Will be checked later
    });
  }
  
  return slots;
}

/**
 * Check if a time slot conflicts with existing events
 */
function hasTimeSlotConflict(
  slot: TimeSlot,
  existingEvents: CalendarEvent[]
): boolean {
  return existingEvents.some(event => {
    // Check if the slot overlaps with any existing event
    return (
      (slot.startTime < event.endTime && slot.endTime > event.startTime) ||
      (event.startTime < slot.endTime && event.endTime > slot.startTime)
    );
  });
}

/**
 * Suggest alternative time slots when conflicts exist
 * Requirements: 4.2 - Suggest 2-3 alternative slots when conflicts exist
 * Requirements: 4.2 - Consider business hours and user preferences
 */
export async function suggestAlternativeTimeSlots(
  user: User,
  preferredStartTime: Date,
  durationMinutes: number,
  maxSuggestions: number = 3
): Promise<TimeSlot[]> {
  try {
    if (!user.accessToken) {
      throw new Error('User access token is missing');
    }

    // Generate potential time slots around the preferred time
    const potentialSlots = generatePotentialTimeSlots(preferredStartTime, durationMinutes);
    
    // Get existing events for a broader time range to check conflicts
    const searchStart = new Date(preferredStartTime.getTime() - 4 * 60 * 60 * 1000); // 4 hours before
    const searchEnd = new Date(preferredStartTime.getTime() + 4 * 60 * 60 * 1000); // 4 hours after
    
    const calendar = getCalendarClient(user.accessToken);
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: searchStart.toISOString(),
      timeMax: searchEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100 // Broader search for alternatives
    });

    const events = response.data.items || [];
    const existingEvents = events
      .map(transformGoogleEvent)
      .filter(isConflictingEvent);
    
    // Filter out slots that conflict with existing events
    const availableSlots = potentialSlots.filter(slot => 
      !hasTimeSlotConflict(slot, existingEvents)
    );
    
    // Sort by proximity to preferred time
    availableSlots.sort((a, b) => {
      const aDistance = Math.abs(a.startTime.getTime() - preferredStartTime.getTime());
      const bDistance = Math.abs(b.startTime.getTime() - preferredStartTime.getTime());
      return aDistance - bDistance;
    });
    
    // Return the top suggestions
    return availableSlots.slice(0, maxSuggestions);
  } catch (error) {
    console.error('Error suggesting alternative time slots:', error);
    throw new Error('Failed to suggest alternative time slots');
  }
}

/**
 * Get available time slots for a specific day
 * Useful for finding longer available periods
 */
export async function getAvailableTimeSlotsForDay(
  user: User,
  targetDate: Date,
  durationMinutes: number
): Promise<TimeSlot[]> {
  try {
    if (!user.accessToken) {
      throw new Error('User access token is missing');
    }

    // Set up day boundaries
    const dayStart = new Date(targetDate);
    dayStart.setHours(BUSINESS_HOURS.start, 0, 0, 0);
    
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(BUSINESS_HOURS.end, 0, 0, 0);
    
    // Get all events for the day
    const calendar = getCalendarClient(user.accessToken);
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = response.data.items || [];
    const dayEvents = events
      .map(transformGoogleEvent)
      .filter(isConflictingEvent)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    
    const availableSlots: TimeSlot[] = [];
    let currentTime = dayStart;
    
    // Find gaps between events
    for (const event of dayEvents) {
      // Check if there's a gap before this event
      const gapDuration = event.startTime.getTime() - currentTime.getTime();
      const gapMinutes = gapDuration / (1000 * 60);
      
      if (gapMinutes >= durationMinutes) {
        availableSlots.push({
          startTime: new Date(currentTime),
          endTime: new Date(currentTime.getTime() + durationMinutes * 60 * 1000),
          duration: durationMinutes,
          isAvailable: true
        });
      }
      
      // Move current time to after this event
      currentTime = new Date(Math.max(currentTime.getTime(), event.endTime.getTime()));
    }
    
    // Check if there's time after the last event
    const remainingTime = dayEnd.getTime() - currentTime.getTime();
    const remainingMinutes = remainingTime / (1000 * 60);
    
    if (remainingMinutes >= durationMinutes) {
      availableSlots.push({
        startTime: new Date(currentTime),
        endTime: new Date(currentTime.getTime() + durationMinutes * 60 * 1000),
        duration: durationMinutes,
        isAvailable: true
      });
    }
    
    return availableSlots;
  } catch (error) {
    console.error('Error getting available time slots for day:', error);
    throw new Error('Failed to get available time slots for day');
  }
}

/**
 * Find the next available time slot after a given time
 * Useful for "find next available" functionality
 */
export async function findNextAvailableSlot(
  user: User,
  afterTime: Date,
  durationMinutes: number,
  searchDays: number = 7
): Promise<TimeSlot | null> {
  try {
    // Search through the next few days
    for (let dayOffset = 0; dayOffset < searchDays; dayOffset++) {
      const searchDate = new Date(afterTime);
      searchDate.setDate(searchDate.getDate() + dayOffset);
      
      // Skip weekends if it's not a business day
      if (!BUSINESS_HOURS.days.includes(searchDate.getDay())) {
        continue;
      }
      
      const availableSlots = await getAvailableTimeSlotsForDay(user, searchDate, durationMinutes);
      
      // For the first day, filter out slots before the afterTime
      if (dayOffset === 0) {
        const validSlots = availableSlots.filter(slot => slot.startTime >= afterTime);
        if (validSlots.length > 0) {
          return validSlots[0];
        }
      } else {
        // For subsequent days, return the first available slot
        if (availableSlots.length > 0) {
          return availableSlots[0];
        }
      }
    }
    
    return null; // No available slot found
  } catch (error) {
    console.error('Error finding next available slot:', error);
    throw new Error('Failed to find next available slot');
  }
}

/**
 * Utility function to format time slots for display
 */
export function formatTimeSlot(slot: TimeSlot): string {
  const startTime = slot.startTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  const endTime = slot.endTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  const date = slot.startTime.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  return `${date} from ${startTime} to ${endTime}`;
}

/**
 * Utility function to format conflict information for display
 */
export function formatConflictInfo(conflicts: CalendarEvent[]): string {
  if (conflicts.length === 0) {
    return 'No conflicts found.';
  }
  
  if (conflicts.length === 1) {
    const conflict = conflicts[0];
    const startTime = conflict.startTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    const endTime = conflict.endTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    return `Conflict with "${conflict.title}" from ${startTime} to ${endTime}`;
  }
  
  return `${conflicts.length} conflicts found: ${conflicts.map(c => c.title).join(', ')}`;
}

/**
 * Main export object for calendar availability service
 */
export const CalendarAvailabilityService = {
  checkCalendarConflicts,
  checkCalendarAvailability,
  suggestAlternativeTimeSlots,
  getAvailableTimeSlotsForDay,
  findNextAvailableSlot,
  formatTimeSlot,
  formatConflictInfo
};