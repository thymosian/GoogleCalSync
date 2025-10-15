import { EmailSendingStatus } from './emailWorkflowOrchestrator.js';

/**
 * Interface for email notification
 */
export interface EmailNotification {
  id: string;
  userId: string;
  jobId: string;
  type: 'started' | 'progress' | 'completed' | 'failed' | 'partially_failed';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  data?: any;
}

/**
 * Email Notification Service for user notifications about email sending status
 */
export class EmailNotificationService {
  private notifications: Map<string, EmailNotification[]> = new Map();
  private notificationId = 0;

  /**
   * Create notification for email job status
   */
  createEmailJobNotification(
    userId: string,
    jobId: string,
    status: EmailSendingStatus,
    type: EmailNotification['type']
  ): EmailNotification {
    const notification: EmailNotification = {
      id: `notification_${++this.notificationId}`,
      userId,
      jobId,
      type,
      title: this.getNotificationTitle(type, status),
      message: this.getNotificationMessage(type, status),
      timestamp: new Date(),
      read: false,
      data: {
        totalAttendees: status.totalAttendees,
        emailsSent: status.emailsSent,
        emailsFailed: status.emailsFailed,
        progress: status.progress
      }
    };

    // Add to user's notifications
    const userNotifications = this.notifications.get(userId) || [];
    userNotifications.unshift(notification); // Add to beginning
    
    // Keep only last 50 notifications per user
    if (userNotifications.length > 50) {
      userNotifications.splice(50);
    }
    
    this.notifications.set(userId, userNotifications);
    
    return notification;
  }

  /**
   * Get notifications for a user
   */
  getUserNotifications(userId: string, limit: number = 20): EmailNotification[] {
    const userNotifications = this.notifications.get(userId) || [];
    return userNotifications.slice(0, limit);
  }

  /**
   * Mark notification as read
   */
  markNotificationAsRead(userId: string, notificationId: string): boolean {
    const userNotifications = this.notifications.get(userId) || [];
    const notification = userNotifications.find(n => n.id === notificationId);
    
    if (notification) {
      notification.read = true;
      return true;
    }
    
    return false;
  }

  /**
   * Mark all notifications as read for a user
   */
  markAllNotificationsAsRead(userId: string): number {
    const userNotifications = this.notifications.get(userId) || [];
    let markedCount = 0;
    
    userNotifications.forEach(notification => {
      if (!notification.read) {
        notification.read = true;
        markedCount++;
      }
    });
    
    return markedCount;
  }

  /**
   * Get unread notification count for a user
   */
  getUnreadNotificationCount(userId: string): number {
    const userNotifications = this.notifications.get(userId) || [];
    return userNotifications.filter(n => !n.read).length;
  }

  /**
   * Delete notification
   */
  deleteNotification(userId: string, notificationId: string): boolean {
    const userNotifications = this.notifications.get(userId) || [];
    const index = userNotifications.findIndex(n => n.id === notificationId);
    
    if (index !== -1) {
      userNotifications.splice(index, 1);
      return true;
    }
    
    return false;
  }

  /**
   * Clear all notifications for a user
   */
  clearUserNotifications(userId: string): number {
    const userNotifications = this.notifications.get(userId) || [];
    const count = userNotifications.length;
    this.notifications.set(userId, []);
    return count;
  }

  /**
   * Get notification title based on type and status
   */
  private getNotificationTitle(type: EmailNotification['type'], status: EmailSendingStatus): string {
    switch (type) {
      case 'started':
        return 'Agenda Email Sending Started';
      case 'progress':
        return 'Agenda Email Sending in Progress';
      case 'completed':
        return 'Agenda Emails Sent Successfully';
      case 'failed':
        return 'Agenda Email Sending Failed';
      case 'partially_failed':
        return 'Agenda Emails Partially Sent';
      default:
        return 'Agenda Email Update';
    }
  }

  /**
   * Get notification message based on type and status
   */
  private getNotificationMessage(type: EmailNotification['type'], status: EmailSendingStatus): string {
    const { totalAttendees, emailsSent, emailsFailed, progress } = status;
    
    switch (type) {
      case 'started':
        return `Started sending agenda emails to ${totalAttendees} attendee${totalAttendees !== 1 ? 's' : ''}`;
      
      case 'progress':
        return `Sending agenda emails... ${progress}% complete (${emailsSent}/${totalAttendees} sent)`;
      
      case 'completed':
        return `Successfully sent agenda emails to all ${totalAttendees} attendee${totalAttendees !== 1 ? 's' : ''}`;
      
      case 'failed':
        return `Failed to send agenda emails. ${emailsFailed} of ${totalAttendees} emails failed to send`;
      
      case 'partially_failed':
        return `Sent ${emailsSent} of ${totalAttendees} agenda emails successfully. ${emailsFailed} failed to send`;
      
      default:
        return 'Agenda email status updated';
    }
  }

  /**
   * Create notification for specific email events
   */
  notifyEmailJobStarted(userId: string, jobId: string, totalAttendees: number): EmailNotification {
    const status: EmailSendingStatus = {
      jobId,
      status: 'in_progress',
      totalAttendees,
      emailsSent: 0,
      emailsFailed: 0,
      progress: 0,
      errors: []
    };
    
    return this.createEmailJobNotification(userId, jobId, status, 'started');
  }

  /**
   * Create notification for job completion
   */
  notifyEmailJobCompleted(userId: string, jobId: string, status: EmailSendingStatus): EmailNotification {
    const notificationType = status.emailsFailed > 0 
      ? (status.emailsSent > 0 ? 'partially_failed' : 'failed')
      : 'completed';
    
    return this.createEmailJobNotification(userId, jobId, status, notificationType);
  }

  /**
   * Create notification for job progress (optional, for long-running jobs)
   */
  notifyEmailJobProgress(userId: string, jobId: string, status: EmailSendingStatus): EmailNotification {
    return this.createEmailJobNotification(userId, jobId, status, 'progress');
  }

  /**
   * Get notification statistics
   */
  getNotificationStatistics(): {
    totalUsers: number;
    totalNotifications: number;
    unreadNotifications: number;
  } {
    let totalNotifications = 0;
    let unreadNotifications = 0;
    
    Array.from(this.notifications.values()).forEach(userNotifications => {
      totalNotifications += userNotifications.length;
      unreadNotifications += userNotifications.filter(n => !n.read).length;
    });
    
    return {
      totalUsers: this.notifications.size,
      totalNotifications,
      unreadNotifications
    };
  }

  /**
   * Clean up old notifications
   */
  cleanupOldNotifications(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void { // Default 7 days
    const cutoffTime = Date.now() - maxAgeMs;
    
    Array.from(this.notifications.entries()).forEach(([userId, userNotifications]) => {
      const filteredNotifications = userNotifications.filter(
        notification => notification.timestamp.getTime() > cutoffTime
      );
      
      if (filteredNotifications.length !== userNotifications.length) {
        this.notifications.set(userId, filteredNotifications);
      }
    });
  }
}

// Export singleton instance
export const emailNotificationService = new EmailNotificationService();