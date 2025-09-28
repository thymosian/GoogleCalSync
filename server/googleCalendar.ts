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
 * Create a new event in Google Calendar with optional Google Meet link
 */
export async function createCalendarEvent(user: User, event: any, createMeetLink: boolean = false) {
  try {
    if (!user.accessToken) {
      throw new Error('User access token is missing');
    }

    const calendar = getCalendarClient(user.accessToken);
    
    const newEvent: any = {
      summary: event.title,
      description: event.description,
      start: {
        dateTime: event.startTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: event.endTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      attendees: event.attendees?.map((attendee: any) => {
        if (typeof attendee === 'string') {
          return { email: attendee };
        }
        return { email: attendee.email, displayName: attendee.name };
      }) || [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 10 },
        ],
      },
    };

    // Add Google Meet link if requested
    if (createMeetLink) {
      newEvent.conferenceData = {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      };
    }

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: newEvent,
      // Required to create conference data (Google Meet links)
      conferenceDataVersion: createMeetLink ? 1 : 0,
      sendUpdates: 'all' // Send calendar invites to attendees
    });

    const createdEvent = res.data;
    
    // Return event data in our standardized format
    return {
      id: createdEvent.id,
      googleEventId: createdEvent.id,
      title: createdEvent.summary,
      description: createdEvent.description,
      startTime: createdEvent.start?.dateTime,
      endTime: createdEvent.end?.dateTime,
      meetingLink: createdEvent.hangoutLink || createdEvent.conferenceData?.entryPoints?.[0]?.uri,
      attendees: createdEvent.attendees?.map(attendee => attendee.email) || [],
      status: createdEvent.status,
      htmlLink: createdEvent.htmlLink
    };
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw new Error('Failed to create calendar event');
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