import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailWorkflowOrchestrator } from '../emailWorkflowOrchestrator.js';
import { EmailNotificationService } from '../emailNotificationService.js';
import { AgendaContent } from '../agendaGenerator.js';
import { EmailValidationResult } from '../attendeeValidator.js';

// Mock the Gmail service
vi.mock('../gmailService.js', () => ({
  gmailService: {
    sendBatchAgendaEmails: vi.fn().mockResolvedValue({
      totalSent: 2,
      totalFailed: 0,
      results: [
        { email: 'attendee1@example.com', success: true, messageId: 'msg1' },
        { email: 'attendee2@example.com', success: true, messageId: 'msg2' }
      ],
      errors: []
    })
  }
}));

// Mock the notification service
vi.mock('../emailNotificationService.js', () => ({
  emailNotificationService: {
    notifyEmailJobStarted: vi.fn(),
    notifyEmailJobCompleted: vi.fn()
  }
}));

describe('Email Workflow Integration', () => {
  let orchestrator: EmailWorkflowOrchestrator;
  let notificationService: EmailNotificationService;
  
  const mockUser = {
    id: 'user123',
    email: 'test@example.com',
    name: 'Test User',
    accessToken: 'mock-token',
    googleId: 'google123',
    picture: null,
    refreshToken: null
  };

  const mockAttendees: EmailValidationResult[] = [
    {
      email: 'attendee1@example.com',
      isValid: true,
      exists: true,
      firstName: 'John',
      isGoogleUser: true
    },
    {
      email: 'attendee2@example.com',
      isValid: true,
      exists: true,
      firstName: 'Jane',
      isGoogleUser: true
    }
  ];

  const mockMeetingData = {
    title: 'Test Meeting',
    type: 'online',
    startTime: new Date('2024-01-15T10:00:00Z'),
    endTime: new Date('2024-01-15T11:00:00Z'),
    meetingLink: 'https://meet.google.com/test'
  };

  const mockAgendaContent: AgendaContent = {
    title: 'Test Meeting Agenda',
    duration: 60,
    topics: [
      {
        title: 'Introduction',
        duration: 10,
        description: 'Welcome and introductions'
      },
      {
        title: 'Main Discussion',
        duration: 40,
        description: 'Core meeting topics'
      },
      {
        title: 'Action Items',
        duration: 10,
        description: 'Next steps and assignments'
      }
    ],
    actionItems: [
      {
        task: 'Follow up on project status',
        priority: 'high'
      }
    ]
  };

  beforeEach(() => {
    orchestrator = new EmailWorkflowOrchestrator();
    notificationService = new EmailNotificationService();
    vi.clearAllMocks();
  });

  describe('EmailWorkflowOrchestrator', () => {
    it('should start email sending workflow successfully', async () => {
      const jobId = await orchestrator.startEmailSendingWorkflow(
        mockUser,
        'meeting123',
        mockAttendees,
        mockMeetingData,
        mockAgendaContent
      );

      expect(jobId).toBeDefined();
      expect(jobId).toMatch(/^email_job_/);

      const status = orchestrator.getEmailSendingStatus(jobId);
      expect(status).toBeDefined();
      expect(status?.totalAttendees).toBe(2);
      expect(['pending', 'in_progress'].includes(status?.status || '')).toBe(true);
    });

    it('should filter out invalid attendees', async () => {
      const attendeesWithInvalid = [
        ...mockAttendees,
        {
          email: 'invalid@example.com',
          isValid: false,
          exists: false,
          isGoogleUser: false
        }
      ];

      const jobId = await orchestrator.startEmailSendingWorkflow(
        mockUser,
        'meeting123',
        attendeesWithInvalid,
        mockMeetingData,
        mockAgendaContent
      );

      const status = orchestrator.getEmailSendingStatus(jobId);
      expect(status?.totalAttendees).toBe(2); // Only valid attendees
    });

    it('should return null for non-existent job status', () => {
      const status = orchestrator.getEmailSendingStatus('non-existent-job');
      expect(status).toBeNull();
    });

    it('should cancel pending jobs', () => {
      const jobId = 'test-job-id';
      // Manually add a job for testing
      (orchestrator as any).jobs.set(jobId, {
        id: jobId,
        status: 'pending',
        attendees: mockAttendees,
        errors: []
      });

      const success = orchestrator.cancelEmailSendingJob(jobId);
      expect(success).toBe(true);

      const status = orchestrator.getEmailSendingStatus(jobId);
      expect(status?.status).toBe('failed');
    });

    it('should not cancel completed jobs', () => {
      const jobId = 'completed-job-id';
      // Manually add a completed job for testing
      (orchestrator as any).jobs.set(jobId, {
        id: jobId,
        status: 'completed',
        attendees: mockAttendees,
        errors: []
      });

      const success = orchestrator.cancelEmailSendingJob(jobId);
      expect(success).toBe(false);
    });

    it('should get user email jobs', () => {
      const jobId1 = 'job1';
      const jobId2 = 'job2';
      
      // Manually add jobs for testing
      (orchestrator as any).jobs.set(jobId1, {
        id: jobId1,
        userId: mockUser.id,
        status: 'completed',
        attendees: mockAttendees,
        errors: []
      });
      
      (orchestrator as any).jobs.set(jobId2, {
        id: jobId2,
        userId: 'other-user',
        status: 'pending',
        attendees: mockAttendees,
        errors: []
      });

      const userJobs = orchestrator.getUserEmailJobs(mockUser.id);
      expect(userJobs).toHaveLength(1);
      expect(userJobs[0].id).toBe(jobId1);
    });

    it('should calculate job statistics correctly', () => {
      // Manually add jobs with different statuses
      (orchestrator as any).jobs.set('job1', { status: 'pending' });
      (orchestrator as any).jobs.set('job2', { status: 'in_progress' });
      (orchestrator as any).jobs.set('job3', { status: 'completed' });
      (orchestrator as any).jobs.set('job4', { status: 'failed' });
      (orchestrator as any).jobs.set('job5', { status: 'partially_failed' });

      const stats = orchestrator.getJobStatistics();
      expect(stats.total).toBe(5);
      expect(stats.pending).toBe(1);
      expect(stats.inProgress).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.partiallyFailed).toBe(1);
    });
  });

  describe('EmailNotificationService', () => {
    it('should create email job started notification', () => {
      const notification = notificationService.notifyEmailJobStarted(
        mockUser.id,
        'job123',
        2
      );

      expect(notification.userId).toBe(mockUser.id);
      expect(notification.jobId).toBe('job123');
      expect(notification.type).toBe('started');
      expect(notification.title).toBe('Agenda Email Sending Started');
      expect(notification.message).toContain('2 attendees');
      expect(notification.read).toBe(false);
    });

    it('should get user notifications', () => {
      // Create some notifications
      notificationService.notifyEmailJobStarted(mockUser.id, 'job1', 2);
      notificationService.notifyEmailJobStarted(mockUser.id, 'job2', 3);

      const notifications = notificationService.getUserNotifications(mockUser.id);
      expect(notifications).toHaveLength(2);
      expect(notifications[0].jobId).toBe('job2'); // Most recent first
      expect(notifications[1].jobId).toBe('job1');
    });

    it('should mark notification as read', () => {
      const notification = notificationService.notifyEmailJobStarted(
        mockUser.id,
        'job123',
        2
      );

      expect(notification.read).toBe(false);

      const success = notificationService.markNotificationAsRead(
        mockUser.id,
        notification.id
      );

      expect(success).toBe(true);
      expect(notification.read).toBe(true);
    });

    it('should count unread notifications', () => {
      notificationService.notifyEmailJobStarted(mockUser.id, 'job1', 2);
      notificationService.notifyEmailJobStarted(mockUser.id, 'job2', 3);

      let unreadCount = notificationService.getUnreadNotificationCount(mockUser.id);
      expect(unreadCount).toBe(2);

      const notifications = notificationService.getUserNotifications(mockUser.id);
      notificationService.markNotificationAsRead(mockUser.id, notifications[0].id);

      unreadCount = notificationService.getUnreadNotificationCount(mockUser.id);
      expect(unreadCount).toBe(1);
    });

    it('should mark all notifications as read', () => {
      notificationService.notifyEmailJobStarted(mockUser.id, 'job1', 2);
      notificationService.notifyEmailJobStarted(mockUser.id, 'job2', 3);

      const markedCount = notificationService.markAllNotificationsAsRead(mockUser.id);
      expect(markedCount).toBe(2);

      const unreadCount = notificationService.getUnreadNotificationCount(mockUser.id);
      expect(unreadCount).toBe(0);
    });

    it('should create appropriate completion notifications', () => {
      const mockStatus = {
        jobId: 'job123',
        status: 'completed' as const,
        totalAttendees: 3,
        emailsSent: 3,
        emailsFailed: 0,
        progress: 100,
        errors: []
      };

      const notification = notificationService.notifyEmailJobCompleted(
        mockUser.id,
        'job123',
        mockStatus
      );

      expect(notification.type).toBe('completed');
      expect(notification.title).toBe('Agenda Emails Sent Successfully');
      expect(notification.message).toContain('all 3 attendees');
    });

    it('should create partial failure notifications', () => {
      const mockStatus = {
        jobId: 'job123',
        status: 'partially_failed' as const,
        totalAttendees: 3,
        emailsSent: 2,
        emailsFailed: 1,
        progress: 100,
        errors: ['Failed to send to one attendee']
      };

      const notification = notificationService.notifyEmailJobCompleted(
        mockUser.id,
        'job123',
        mockStatus
      );

      expect(notification.type).toBe('partially_failed');
      expect(notification.title).toBe('Agenda Emails Partially Sent');
      expect(notification.message).toContain('Sent 2 of 3');
    });
  });
});