import { google } from 'googleapis';
import { User } from '../shared/schema';

export interface AgendaUpdate {
  id: string;
  agendaId: string;
  calendarEventId: string;
  userId: string;
  timestamp: Date;
  updateType: 'created' | 'updated' | 'deleted';
  changes: {
    field: string;
    oldValue?: string;
    newValue?: string;
  }[];
  syncedAt?: Date;
  syncStatus: 'pending' | 'success' | 'failed' | 'skipped';
  errorMessage?: string;
}

export interface CalendarSyncSettings {
  userId: string;
  autoSync: boolean;
  syncOnAgendaUpdate: boolean;
  syncOnVersionChange: boolean;
  includeAgendaInDescription: boolean;
  updateEventTitle: boolean;
  notifyOnSync: boolean;
  lastSyncAt?: Date;
  syncErrors: number;
}

export interface SyncResult {
  success: boolean;
  updatesProcessed: number;
  updatesSynced: number;
  updatesFailed: number;
  errors: string[];
  nextSyncAt?: Date;
}

export class CalendarAgendaSyncService {
  private updates = new Map<string, AgendaUpdate[]>();
  private settings = new Map<string, CalendarSyncSettings>();
  private readonly MAX_PENDING_UPDATES = 100;
  private readonly SYNC_COOLDOWN = 5 * 60 * 1000; // 5 minutes between syncs

  /**
   * Get Google Calendar client for a user
   */
  private getCalendarClient(accessToken: string) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Create a sync settings entry for a user
   */
  createSyncSettings(userId: string, settings: Partial<CalendarSyncSettings>): CalendarSyncSettings {
    const defaultSettings: CalendarSyncSettings = {
      userId,
      autoSync: true,
      syncOnAgendaUpdate: true,
      syncOnVersionChange: false,
      includeAgendaInDescription: true,
      updateEventTitle: false,
      notifyOnSync: false,
      syncErrors: 0
    };

    const finalSettings = { ...defaultSettings, ...settings };
    this.settings.set(userId, finalSettings);

    console.log(`Created sync settings for user ${userId}`);
    return finalSettings;
  }

  /**
   * Get sync settings for a user
   */
  getSyncSettings(userId: string): CalendarSyncSettings | null {
    return this.settings.get(userId) || null;
  }

  /**
   * Update sync settings for a user
   */
  updateSyncSettings(userId: string, updates: Partial<CalendarSyncSettings>): CalendarSyncSettings | null {
    const currentSettings = this.settings.get(userId);
    if (!currentSettings) return null;

    const updatedSettings = { ...currentSettings, ...updates };
    this.settings.set(userId, updatedSettings);

    console.log(`Updated sync settings for user ${userId}`);
    return updatedSettings;
  }

  /**
   * Queue an agenda update for calendar sync
   */
  queueAgendaUpdate(
    agendaId: string,
    calendarEventId: string,
    userId: string,
    updateType: AgendaUpdate['updateType'],
    changes: AgendaUpdate['changes']
  ): AgendaUpdate {
    const update: AgendaUpdate = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agendaId,
      calendarEventId,
      userId,
      timestamp: new Date(),
      updateType,
      changes,
      syncStatus: 'pending'
    };

    // Add to user's update queue
    if (!this.updates.has(userId)) {
      this.updates.set(userId, []);
    }

    const userUpdates = this.updates.get(userId)!;
    userUpdates.push(update);

    // Keep only recent updates
    if (userUpdates.length > this.MAX_PENDING_UPDATES) {
      userUpdates.splice(0, userUpdates.length - this.MAX_PENDING_UPDATES);
    }

    console.log(`Queued agenda update for calendar sync: ${updateType} on agenda ${agendaId}`);
    return update;
  }

  /**
   * Sync agenda updates to calendar
   */
  async syncToCalendar(user: User, agendaContent: string, meetingData: any): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      updatesProcessed: 0,
      updatesSynced: 0,
      updatesFailed: 0,
      errors: []
    };

    try {
      const settings = this.getSyncSettings(user.id);
      if (!settings?.autoSync) {
        console.log(`Auto-sync disabled for user ${user.id}`);
        return { ...result, success: true };
      }

      if (!user.accessToken) {
        throw new Error('User access token is missing');
      }

      const calendar = this.getCalendarClient(user.accessToken);
      const pendingUpdates = this.getPendingUpdates(user.id);

      if (pendingUpdates.length === 0) {
        console.log(`No pending updates for user ${user.id}`);
        return { ...result, success: true, updatesProcessed: 0 };
      }

      result.updatesProcessed = pendingUpdates.length;

      for (const update of pendingUpdates) {
        try {
          await this.syncSingleUpdate(calendar, update, agendaContent, meetingData, settings);
          update.syncStatus = 'success';
          update.syncedAt = new Date();
          result.updatesSynced++;
        } catch (error: any) {
          update.syncStatus = 'failed';
          update.errorMessage = error.message;
          result.updatesFailed++;
          result.errors.push(`Failed to sync update ${update.id}: ${error.message}`);

          // Increment error count in settings
          if (settings) {
            settings.syncErrors++;
          }
        }
      }

      // Update last sync time
      if (settings) {
        settings.lastSyncAt = new Date();
      }

      result.success = result.updatesFailed === 0;
      result.nextSyncAt = new Date(Date.now() + this.SYNC_COOLDOWN);

      console.log(`Calendar sync completed for user ${user.id}: ${result.updatesSynced}/${result.updatesProcessed} successful`);

    } catch (error: any) {
      console.error('Error during calendar sync:', error);
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Sync a single agenda update to calendar
   */
  private async syncSingleUpdate(
    calendar: any,
    update: AgendaUpdate,
    agendaContent: string,
    meetingData: any,
    settings: CalendarSyncSettings
  ): Promise<void> {
    const eventPatch: any = {};

    // Update event description with agenda content if enabled
    if (settings.includeAgendaInDescription && agendaContent) {
      eventPatch.description = this.formatAgendaForCalendar(agendaContent, meetingData);
    }

    // Update event title if enabled and title has changed
    const titleChange = update.changes.find(c => c.field === 'title');
    if (settings.updateEventTitle && titleChange && titleChange.newValue) {
      eventPatch.summary = titleChange.newValue;
    }

    // Update event timing if changed
    const timeChange = update.changes.find(c => c.field === 'startTime' || c.field === 'endTime');
    if (timeChange && meetingData.startTime && meetingData.endTime) {
      eventPatch.start = {
        dateTime: meetingData.startTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
      eventPatch.end = {
        dateTime: meetingData.endTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
    }

    // Only update if there are actual changes
    if (Object.keys(eventPatch).length === 0) {
      console.log(`No calendar changes needed for update ${update.id}`);
      return;
    }

    // Update the calendar event
    await calendar.events.patch({
      calendarId: 'primary',
      eventId: update.calendarEventId,
      resource: eventPatch,
      sendUpdates: 'none' // Don't send notifications for agenda updates
    });

    console.log(`Successfully synced update ${update.id} to calendar event ${update.calendarEventId}`);
  }

  /**
   * Format agenda content for calendar description
   */
  private formatAgendaForCalendar(agendaContent: string, meetingData: any): string {
    // Strip HTML tags and format for calendar
    const textContent = agendaContent
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
      .replace(/&/g, '&') // Decode HTML entities
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .trim();

    // Create a nicely formatted calendar description
    let description = `📋 Meeting Agenda\n\n`;

    if (meetingData.title) {
      description += `Title: ${meetingData.title}\n`;
    }

    if (meetingData.enhancedPurpose) {
      description += `Purpose: ${meetingData.enhancedPurpose}\n\n`;
    }

    // Add the agenda content
    description += textContent;

    // Add meeting link if available
    if (meetingData.meetingLink) {
      description += `\n\n🔗 Join Meeting: ${meetingData.meetingLink}`;
    }

    return description;
  }

  /**
   * Get pending updates for a user
   */
  getPendingUpdates(userId: string): AgendaUpdate[] {
    const userUpdates = this.updates.get(userId) || [];
    return userUpdates.filter(update => update.syncStatus === 'pending');
  }

  /**
   * Get all updates for a user
   */
  getAllUpdates(userId: string): AgendaUpdate[] {
    return this.updates.get(userId) || [];
  }

  /**
   * Mark updates as processed
   */
  markUpdatesProcessed(userId: string, updateIds: string[]): number {
    const userUpdates = this.updates.get(userId) || [];
    let markedCount = 0;

    userUpdates.forEach(update => {
      if (updateIds.includes(update.id)) {
        update.syncStatus = 'skipped';
        markedCount++;
      }
    });

    return markedCount;
  }

  /**
   * Clean up old updates
   */
  cleanupOldUpdates(userId: string, olderThanDays: number = 30): number {
    const userUpdates = this.updates.get(userId) || [];
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const initialCount = userUpdates.length;
    const filteredUpdates = userUpdates.filter(update => update.timestamp > cutoffDate);

    this.updates.set(userId, filteredUpdates);

    const removedCount = initialCount - filteredUpdates.length;
    if (removedCount > 0) {
      console.log(`Cleaned up ${removedCount} old updates for user ${userId}`);
    }

    return removedCount;
  }

  /**
   * Get sync statistics for a user
   */
  getSyncStats(userId: string): {
    settings: CalendarSyncSettings | null;
    pendingUpdates: number;
    totalUpdates: number;
    lastSyncAt?: Date;
    syncErrors: number;
    recentUpdates: AgendaUpdate[];
  } {
    const settings = this.getSyncSettings(userId);
    const allUpdates = this.getAllUpdates(userId);
    const pendingUpdates = this.getPendingUpdates(userId);

    return {
      settings,
      pendingUpdates: pendingUpdates.length,
      totalUpdates: allUpdates.length,
      lastSyncAt: settings?.lastSyncAt,
      syncErrors: settings?.syncErrors || 0,
      recentUpdates: allUpdates.slice(-10) // Last 10 updates
    };
  }

  /**
   * Force sync all pending updates for a user
   */
  async forceSync(user: User, agendaContent: string, meetingData: any): Promise<SyncResult> {
    console.log(`Force syncing all pending updates for user ${user.id}`);

    // Reset error count
    const settings = this.getSyncSettings(user.id);
    if (settings) {
      settings.syncErrors = 0;
    }

    return this.syncToCalendar(user, agendaContent, meetingData);
  }

  /**
   * Test calendar connection
   */
  async testCalendarConnection(user: User): Promise<{ success: boolean; error?: string }> {
    try {
      if (!user.accessToken) {
        return { success: false, error: 'Access token is missing' };
      }

      const calendar = this.getCalendarClient(user.accessToken);

      // Try to list calendar events
      await calendar.events.list({
        calendarId: 'primary',
        maxResults: 1,
        orderBy: 'startTime',
        singleEvents: true,
        timeMin: new Date().toISOString()
      });

      return { success: true };
    } catch (error: any) {
      console.error('Calendar connection test failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get calendar events that might need agenda sync
   */
  async getRelevantCalendarEvents(user: User, agendaId?: string): Promise<any[]> {
    try {
      if (!user.accessToken) {
        throw new Error('Access token is missing');
      }

      const calendar = this.getCalendarClient(user.accessToken);

      // Get events from the next 30 days
      const timeMin = new Date();
      const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: 50,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = response.data.items || [];

      // Filter events that might be related to agendas
      return events.filter(event => {
        // Look for events with agenda-related keywords in title or description
        const title = event.summary?.toLowerCase() || '';
        const description = event.description?.toLowerCase() || '';

        const hasAgendaKeywords = title.includes('meeting') ||
                                 title.includes('agenda') ||
                                 description.includes('agenda') ||
                                 description.includes('meeting');

        return hasAgendaKeywords;
      });

    } catch (error: any) {
      console.error('Error getting relevant calendar events:', error);
      return [];
    }
  }
}

// Export singleton instance
export const calendarAgendaSyncService = new CalendarAgendaSyncService();