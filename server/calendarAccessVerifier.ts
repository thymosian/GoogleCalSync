import { google } from 'googleapis';
import { User } from '../shared/schema';
import { calendarErrorHandler, withCalendarErrorHandling, handleCalendarErrors } from './errorHandlers/calendarErrorHandler.js';

// Scopes required for calendar access
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

export interface CalendarAccessStatus {
  hasAccess: boolean;
  tokenValid: boolean;
  needsRefresh: boolean;
  scopes: string[];
  lastVerified?: Date;
  error?: string;
}

export interface AvailabilityResult {
  isAvailable: boolean;
  conflicts: CalendarEvent[];
  suggestedAlternatives?: TimeSlot[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  status: string;
  transparency?: string;
}

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  duration: number;
  isAvailable: boolean;
}

/**
 * CalendarAccessVerifier service handles calendar access verification,
 * token validation, and availability checking without requesting new permissions
 */
export class CalendarAccessVerifier {
  private accessStatusCache = new Map<string, { status: CalendarAccessStatus; timestamp: number }>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes cache

  /**
   * Verifies existing calendar access for a user
   */
  async verifyAccess(user: User): Promise<CalendarAccessStatus> {
    // Check cache first
    const cached = this.accessStatusCache.get(user.id);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.status;
    }

    const status = await withCalendarErrorHandling(
      () => this.performAccessVerification(user),
      'verifyAccess',
      user,
      true
    );
    
    // Cache the result
    this.accessStatusCache.set(user.id, {
      status,
      timestamp: Date.now()
    });

    return status;
  }

  /**
   * Performs the actual access verification
   */
  private async performAccessVerification(user: User): Promise<CalendarAccessStatus> {
    // Check if access token exists
    if (!user.accessToken) {
      return {
        hasAccess: false,
        tokenValid: false,
        needsRefresh: false,
        scopes: [],
        error: 'No access token found'
      };
    }

    try {
      // Create OAuth2 client with user's token
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ 
        access_token: user.accessToken,
        refresh_token: user.refreshToken
      });

      // Perform lightweight API call to test calendar permissions
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      // Test with minimal calendar list request
      await calendar.calendarList.list({ 
        maxResults: 1,
        showHidden: false
      });

      return {
        hasAccess: true,
        tokenValid: true,
        needsRefresh: false,
        scopes: SCOPES,
        lastVerified: new Date()
      };

    } catch (error: any) {
      console.error('Calendar access verification error:', error);

      // Handle specific error cases
      if (error.code === 401) {
        // Token is invalid or expired
        if (user.refreshToken) {
          return {
            hasAccess: false,
            tokenValid: false,
            needsRefresh: true,
            scopes: [],
            error: 'Access token expired, refresh needed'
          };
        } else {
          return {
            hasAccess: false,
            tokenValid: false,
            needsRefresh: false,
            scopes: [],
            error: 'Access token invalid, re-authentication required'
          };
        }
      }

      if (error.code === 403) {
        return {
          hasAccess: false,
          tokenValid: true,
          needsRefresh: false,
          scopes: [],
          error: 'Insufficient calendar permissions'
        };
      }

      // Other errors (network, API issues, etc.)
      return {
        hasAccess: false,
        tokenValid: false,
        needsRefresh: false,
        scopes: [],
        error: error.message || 'Unknown calendar access error'
      };
    }
  }

  /**
   * Refreshes expired access token using refresh token
   */
  async refreshAccessToken(user: User): Promise<{ success: boolean; newToken?: string; error?: string }> {
    if (!user.refreshToken) {
      return {
        success: false,
        error: 'No refresh token available'
      };
    }

    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        refresh_token: user.refreshToken
      });

      // Refresh the access token
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      if (credentials.access_token) {
        // Clear cache for this user since token changed
        this.accessStatusCache.delete(user.id);
        
        return {
          success: true,
          newToken: credentials.access_token
        };
      } else {
        return {
          success: false,
          error: 'Failed to obtain new access token'
        };
      }

    } catch (error: any) {
      console.error('Token refresh error:', error);
      return {
        success: false,
        error: error.message || 'Token refresh failed'
      };
    }
  }

  /**
   * Checks calendar availability for a specific time range
   */
  async checkAvailability(
    user: User, 
    startTime: Date, 
    endTime: Date
  ): Promise<AvailabilityResult> {
    return withCalendarErrorHandling(
      async () => {
        // First verify access
        const accessStatus = await this.verifyAccess(user);
        if (!accessStatus.hasAccess) {
          throw new Error(`Calendar access not available: ${accessStatus.error}`);
        }

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: user.accessToken });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        // Query for events in the time range
        const response = await calendar.events.list({
          calendarId: 'primary',
          timeMin: startTime.toISOString(),
          timeMax: endTime.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 50
        });

        const events = response.data.items || [];
        
        // Filter out cancelled and transparent events
        const conflicts = events
          .filter(event => 
            event.status !== 'cancelled' && 
            event.transparency !== 'transparent'
          )
          .map(event => this.transformToCalendarEvent(event));

        const isAvailable = conflicts.length === 0;
        let suggestedAlternatives: TimeSlot[] | undefined;

        // Generate alternative time slots if conflicts exist
        if (!isAvailable) {
          suggestedAlternatives = await this.suggestAlternativeSlots(
            user, 
            startTime, 
            endTime
          );
        }

        return {
          isAvailable,
          conflicts,
          suggestedAlternatives
        };
      },
      'checkAvailability',
      user,
      true
    );
  }

  /**
   * Suggests alternative time slots when conflicts exist
   */
  async suggestAlternativeSlots(
    user: User,
    preferredStart: Date,
    preferredEnd: Date
  ): Promise<TimeSlot[]> {
    return withCalendarErrorHandling(
      async () => {
        const duration = preferredEnd.getTime() - preferredStart.getTime();
        const alternatives: TimeSlot[] = [];

        // Look for alternatives within the same day first
        const dayStart = new Date(preferredStart);
        dayStart.setHours(9, 0, 0, 0); // 9 AM
        const dayEnd = new Date(preferredStart);
        dayEnd.setHours(17, 0, 0, 0); // 5 PM

        // Get all events for the day
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: user.accessToken });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const response = await calendar.events.list({
          calendarId: 'primary',
          timeMin: dayStart.toISOString(),
          timeMax: dayEnd.toISOString(),
          singleEvents: true,
          orderBy: 'startTime'
        });

        const dayEvents = (response.data.items || [])
          .filter(event => 
            event.status !== 'cancelled' && 
            event.transparency !== 'transparent' &&
            event.start?.dateTime && 
            event.end?.dateTime
          )
          .map(event => ({
            start: new Date(event.start!.dateTime!),
            end: new Date(event.end!.dateTime!)
          }))
          .sort((a, b) => a.start.getTime() - b.start.getTime());

        // Find gaps between events that can accommodate the meeting
        let currentTime = new Date(Math.max(dayStart.getTime(), Date.now()));
        
        for (const event of dayEvents) {
          // Check if there's a gap before this event
          if (event.start.getTime() - currentTime.getTime() >= duration) {
            const slotEnd = new Date(currentTime.getTime() + duration);
            if (slotEnd <= event.start) {
              alternatives.push({
                startTime: new Date(currentTime),
                endTime: slotEnd,
                duration: Math.round(duration / (1000 * 60)),
                isAvailable: true
              });
            }
          }
          currentTime = new Date(Math.max(currentTime.getTime(), event.end.getTime()));
          
          // Stop if we have enough alternatives
          if (alternatives.length >= 3) break;
        }

        // Check for time after the last event
        if (alternatives.length < 3 && currentTime < dayEnd) {
          const remainingTime = dayEnd.getTime() - currentTime.getTime();
          if (remainingTime >= duration) {
            const slotEnd = new Date(currentTime.getTime() + duration);
            alternatives.push({
              startTime: new Date(currentTime),
              endTime: slotEnd,
              duration: Math.round(duration / (1000 * 60)),
              isAvailable: true
            });
          }
        }

        // If we don't have enough alternatives, suggest next day slots
        if (alternatives.length < 2) {
          const nextDay = new Date(preferredStart);
          nextDay.setDate(nextDay.getDate() + 1);
          nextDay.setHours(preferredStart.getHours(), preferredStart.getMinutes(), 0, 0);
          
          const nextDayEnd = new Date(nextDay.getTime() + duration);
          alternatives.push({
            startTime: nextDay,
            endTime: nextDayEnd,
            duration: Math.round(duration / (1000 * 60)),
            isAvailable: true
          });
        }

        return alternatives.slice(0, 3); // Return max 3 alternatives
      },
      'suggestAlternatives',
      user,
      true
    );
  }

  /**
   * Generates basic alternative time slots without calendar checking
   */
  private generateBasicAlternatives(startTime: Date, endTime: Date): TimeSlot[] {
    const duration = endTime.getTime() - startTime.getTime();
    const alternatives: TimeSlot[] = [];

    // Suggest 1 hour later
    const alt1Start = new Date(startTime.getTime() + 60 * 60 * 1000);
    alternatives.push({
      startTime: alt1Start,
      endTime: new Date(alt1Start.getTime() + duration),
      duration: Math.round(duration / (1000 * 60)),
      isAvailable: true
    });

    // Suggest 2 hours later
    const alt2Start = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
    alternatives.push({
      startTime: alt2Start,
      endTime: new Date(alt2Start.getTime() + duration),
      duration: Math.round(duration / (1000 * 60)),
      isAvailable: true
    });

    // Suggest next day same time
    const alt3Start = new Date(startTime);
    alt3Start.setDate(alt3Start.getDate() + 1);
    alternatives.push({
      startTime: alt3Start,
      endTime: new Date(alt3Start.getTime() + duration),
      duration: Math.round(duration / (1000 * 60)),
      isAvailable: true
    });

    return alternatives;
  }

  /**
   * Transforms Google Calendar event to our CalendarEvent interface
   */
  private transformToCalendarEvent(googleEvent: any): CalendarEvent {
    return {
      id: googleEvent.id || '',
      title: googleEvent.summary || 'Busy',
      startTime: googleEvent.start?.dateTime ? 
        new Date(googleEvent.start.dateTime) : 
        new Date(googleEvent.start?.date || new Date()),
      endTime: googleEvent.end?.dateTime ? 
        new Date(googleEvent.end.dateTime) : 
        new Date(googleEvent.end?.date || new Date()),
      status: googleEvent.status || 'confirmed',
      transparency: googleEvent.transparency
    };
  }

  /**
   * Clears the access status cache for a user (useful after token refresh)
   */
  clearCache(userId: string): void {
    this.accessStatusCache.delete(userId);
  }

  /**
   * Clears all cached access statuses
   */
  clearAllCache(): void {
    this.accessStatusCache.clear();
  }
}

// Export singleton instance
export const calendarAccessVerifier = new CalendarAccessVerifier();