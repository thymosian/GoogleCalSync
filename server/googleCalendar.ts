import { google } from 'googleapis';
import { User } from '../shared/schema';

// Scopes required for calendar access
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
 * Get Google Calendar API client
 */
function getCalendarClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Fetch upcoming events from Google Calendar
 */
export async function fetchUpcomingEvents(user: User, maxResults: number = 10) {
  try {
    if (!user.accessToken) {
      throw new Error('User access token is missing');
    }

    const calendar = getCalendarClient(user.accessToken);
    
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = res.data.items || [];
    
    // Transform Google Calendar events to our format
    return events.map(event => ({
      id: event.id || '',
      googleEventId: event.id || '',
      title: event.summary || 'No Title',
      description: event.description || '',
      startTime: event.start?.dateTime ? new Date(event.start.dateTime) : 
                event.start?.date ? new Date(event.start.date) : new Date(),
      endTime: event.end?.dateTime ? new Date(event.end.dateTime) : 
              event.end?.date ? new Date(event.end.date) : new Date(),
      meetingLink: event.hangoutLink || event.location || '',
      attendees: event.attendees?.map(attendee => attendee.email || '') || [],
      status: event.status
    }));
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    throw new Error('Failed to fetch calendar events');
  }
}

/**
 * Create a new event in Google Calendar with automatic Google Meet link generation for online meetings
 * Requirements: 5.1, 5.2 - Auto-generate Google Meet links for online meetings with proper validation
 */
export async function createCalendarEvent(user: User, event: any, meetingType?: 'online' | 'physical') {
  try {
    if (!user.accessToken) {
      throw new Error('User access token is missing');
    }

    const calendar = getCalendarClient(user.accessToken);
    
    // Determine if we should create a Google Meet link
    // Auto-generate for online meetings or when explicitly requested
    const shouldCreateMeetLink = meetingType === 'online' || event.createMeetLink === true;

    // Add debug logging to see what's being sent to Google Calendar
    console.log('Creating calendar event with description:', event.description);
    console.log('Event title:', event.title);
    console.log('Event description length:', event.description?.length || 0);
    console.log('Event description preview:', event.description?.substring(0, 100) + '...' || 'No description');

    const newEvent: any = {
      summary: event.title,
      description: event.description,
      start: {
        dateTime: event.startTime instanceof Date ? event.startTime.toISOString() : event.startTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: event.endTime instanceof Date ? event.endTime.toISOString() : event.endTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      attendees: event.attendees?.map((attendee: any) => {
        if (typeof attendee === 'string') {
          return { email: attendee };
        }
        return { 
          email: attendee.email, 
          displayName: attendee.name || attendee.displayName,
          responseStatus: 'needsAction'
        };
      }) || [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 10 },
        ],
      },
    };

    // Add location for physical meetings
    if (meetingType === 'physical' && event.location) {
      newEvent.location = event.location;
    }

    // Add Google Meet link for online meetings with enhanced configuration
    if (shouldCreateMeetLink) {
      const requestId = `meet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      newEvent.conferenceData = {
        createRequest: {
          requestId,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      };
      
      console.log(`Creating Google Meet link for online meeting: ${event.title}`);
    }

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: newEvent,
      // Required to create conference data (Google Meet links)
      conferenceDataVersion: shouldCreateMeetLink ? 1 : 0,
      sendUpdates: 'all' // Send calendar invites to attendees
    });

    const createdEvent = res.data;
    
    // Validate Google Meet link creation for online meetings
    if (shouldCreateMeetLink && !createdEvent.hangoutLink && !createdEvent.conferenceData?.entryPoints?.[0]?.uri) {
      console.warn('Google Meet link was not created despite being requested');
      throw new Error('Failed to generate Google Meet link for online meeting');
    }
    
    // Extract meeting link with fallback options
    const meetingLink = createdEvent.hangoutLink || 
                       createdEvent.conferenceData?.entryPoints?.[0]?.uri ||
                       createdEvent.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri;
    
    // Return event data in our standardized format
    const result = {
      id: createdEvent.id,
      googleEventId: createdEvent.id,
      title: createdEvent.summary,
      description: createdEvent.description,
      startTime: createdEvent.start?.dateTime,
      endTime: createdEvent.end?.dateTime,
      meetingLink: meetingLink || null,
      location: createdEvent.location || null,
      attendees: createdEvent.attendees?.map(attendee => attendee.email) || [],
      status: createdEvent.status,
      htmlLink: createdEvent.htmlLink,
      conferenceData: createdEvent.conferenceData
    };

    // Log successful Google Meet link creation
    if (shouldCreateMeetLink && result.meetingLink) {
      console.log(`Google Meet link created successfully: ${result.meetingLink}`);
    }

    return result;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    
    // Enhanced error handling for Google Meet link generation
    if (error instanceof Error) {
      if (error.message.includes('conferenceData') || error.message.includes('hangouts')) {
        throw new Error('Failed to generate Google Meet link. Please check Google Calendar permissions.');
      }
      if (error.message.includes('quota') || error.message.includes('rate limit')) {
        throw new Error('Google Calendar API quota exceeded. Please try again later.');
      }
      if (error.message.includes('authentication') || error.message.includes('token')) {
        throw new Error('Google Calendar authentication failed. Please re-authenticate.');
      }
    }
    
    throw new Error(`Failed to create calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete an event from Google Calendar
 */
export async function deleteCalendarEvent(user: User, eventId: string) {
  try {
    if (!user.accessToken) {
      throw new Error('User access token is missing');
    }

    const calendar = getCalendarClient(user.accessToken);
    
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });

    return { success: true };
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    throw new Error('Failed to delete calendar event');
  }
}