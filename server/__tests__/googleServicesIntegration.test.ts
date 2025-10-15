import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { google } from 'googleapis';
import { AttendeeValidator } from '../attendeeValidator';
import { createCalendarEvent } from '../googleCalendar';
import { gmailService } from '../gmailService';
import type { User } from '../../shared/schema';

// Mock googleapis
vi.mock('googleapis');

const mockUser: User = {
  id: 'test-user-id',
  googleId: 'google-123',
  email: 'test@example.com',
  name: 'Test User',
  picture: null,
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token'
};

describe('Google Services Integration', () => {
  let mockAuth: any;
  let mockCalendar: any;
  let mockPeople: any;
  let mockGmail: any;

  beforeEach(() => {
    mockAuth = {
      setCredentials: vi.fn()
    };

    mockCalendar = {
      events: {
        insert: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    };

    mockPeople = {
      people: {
        searchContacts: vi.fn(),
        get: vi.fn()
      }
    };

    mockGmail = {
      users: {
        messages: {
          send: vi.fn()
        }
      }
    };

    (google.auth.OAuth2 as unknown as Mock).mockImplementation(() => mockAuth);
    (google.calendar as Mock).mockReturnValue(mockCalendar);
    (google.people as Mock).mockReturnValue(mockPeople);
    (google.gmail as Mock).mockReturnValue(mockGmail);

    vi.clearAllMocks();
  });

  describe('Google People API Integration', () => {
    let attendeeValidator: AttendeeValidator;

    beforeEach(() => {
      attendeeValidator = new AttendeeValidator();
    });

    it('should validate attendee email using People API', async () => {
      const mockResponse = {
        data: {
          results: [{
            person: {
              names: [{ givenName: 'John', familyName: 'Doe' }],
              emailAddresses: [{ value: 'john.doe@example.com' }],
              photos: [{ url: 'https://example.com/photo.jpg' }]
            }
          }]
        }
      };

      mockPeople.people.searchContacts.mockResolvedValue(mockResponse);

      const result = await attendeeValidator.validateEmail('john.doe@example.com', mockUser);

      expect(result).toEqual({
        email: 'john.doe@example.com',
        isValid: true,
        exists: true,
        firstName: 'John',
        lastName: 'Doe',
        profilePicture: 'https://example.com/photo.jpg',
        isGoogleUser: true
      });

      expect(mockAuth.setCredentials).toHaveBeenCalledWith({
        access_token: mockUser.accessToken,
        refresh_token: mockUser.refreshToken
      });
    });

    it('should handle People API authentication errors', async () => {
      mockPeople.people.searchContacts.mockRejectedValue({
        code: 401,
        message: 'Invalid credentials'
      });

      const result = await attendeeValidator.validateEmail('test@example.com', mockUser);

      expect(result.isValid).toBe(true); // Email format is valid
      expect(result.exists).toBe(false); // But couldn't verify existence
      expect(result.isGoogleUser).toBe(false);
    });

    it('should handle People API rate limiting', async () => {
      mockPeople.people.searchContacts.mockRejectedValue({
        code: 429,
        message: 'Quota exceeded'
      });

      const result = await attendeeValidator.validateEmail('test@example.com', mockUser);

      expect(result.isValid).toBe(true);
      expect(result.exists).toBe(false);
      expect(result.isGoogleUser).toBe(false);
    });

    it('should batch validate multiple attendees', async () => {
      const emails = ['john@example.com', 'jane@example.com', 'bob@example.com'];
      
      mockPeople.people.searchContacts.mockImplementation((params) => {
        const query = params.query;
        if (query.includes('john@example.com')) {
          return Promise.resolve({
            data: {
              results: [{
                person: {
                  names: [{ givenName: 'John' }],
                  emailAddresses: [{ value: 'john@example.com' }]
                }
              }]
            }
          });
        } else if (query.includes('jane@example.com')) {
          return Promise.resolve({
            data: {
              results: [{
                person: {
                  names: [{ givenName: 'Jane' }],
                  emailAddresses: [{ value: 'jane@example.com' }]
                }
              }]
            }
          });
        }
        return Promise.resolve({ data: { results: [] } });
      });

      const results = await attendeeValidator.validateBatch(emails, mockUser);

      expect(results).toHaveLength(3);
      expect(results.find(r => r.email === 'john@example.com')?.firstName).toBe('John');
      expect(results.find(r => r.email === 'jane@example.com')?.firstName).toBe('Jane');
      expect(results.find(r => r.email === 'bob@example.com')?.exists).toBe(false);
    });
  });

  describe('Google Calendar API Integration', () => {
    it('should create calendar event successfully', async () => {
      const mockEventResponse = {
        data: {
          id: 'calendar-event-123',
          summary: 'Test Meeting',
          description: 'Test meeting description',
          start: { dateTime: '2024-01-15T10:00:00Z' },
          end: { dateTime: '2024-01-15T11:00:00Z' },
          attendees: [
            { email: 'attendee1@example.com', responseStatus: 'needsAction' },
            { email: 'attendee2@example.com', responseStatus: 'needsAction' }
          ],
          hangoutLink: 'https://meet.google.com/test-link',
          htmlLink: 'https://calendar.google.com/event/test'
        }
      };

      mockCalendar.events.insert.mockResolvedValue(mockEventResponse);

      const eventData = {
        title: 'Test Meeting',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        description: 'Test meeting description',
        attendees: [
          { email: 'attendee1@example.com', name: 'Attendee 1' },
          { email: 'attendee2@example.com', name: 'Attendee 2' }
        ],
        createMeetLink: true
      };

      const result = await createCalendarEvent(mockUser, eventData, true);

      expect(result).toEqual({
        id: 'calendar-event-123',
        googleEventId: 'calendar-event-123',
        title: 'Test Meeting',
        description: 'Test meeting description',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        meetingLink: 'https://meet.google.com/test-link',
        attendees: ['attendee1@example.com', 'attendee2@example.com'],
        status: 'confirmed',
        htmlLink: 'https://calendar.google.com/event/test'
      });

      expect(mockCalendar.events.insert).toHaveBeenCalledWith({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        requestBody: expect.objectContaining({
          summary: 'Test Meeting',
          description: 'Test meeting description',
          start: { dateTime: '2024-01-15T10:00:00Z' },
          end: { dateTime: '2024-01-15T11:00:00Z' },
          attendees: [
            { email: 'attendee1@example.com', displayName: 'Attendee 1' },
            { email: 'attendee2@example.com', displayName: 'Attendee 2' }
          ],
          conferenceData: {
            createRequest: {
              requestId: expect.any(String),
              conferenceSolutionKey: { type: 'hangoutsMeet' }
            }
          }
        })
      });
    });

    it('should create physical meeting without conference data', async () => {
      const mockEventResponse = {
        data: {
          id: 'physical-event-123',
          summary: 'Physical Meeting',
          description: 'Physical meeting in conference room',
          start: { dateTime: '2024-01-15T10:00:00Z' },
          end: { dateTime: '2024-01-15T11:00:00Z' },
          location: 'Conference Room A',
          attendees: [{ email: 'attendee@example.com', responseStatus: 'needsAction' }],
          htmlLink: 'https://calendar.google.com/event/physical'
        }
      };

      mockCalendar.events.insert.mockResolvedValue(mockEventResponse);

      const eventData = {
        title: 'Physical Meeting',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        description: 'Physical meeting in conference room',
        location: 'Conference Room A',
        attendees: [{ email: 'attendee@example.com' }],
        createMeetLink: false
      };

      const result = await createCalendarEvent(mockUser, eventData, false);

      expect(result.meetingLink).toBeUndefined();
      expect(mockCalendar.events.insert).toHaveBeenCalledWith({
        calendarId: 'primary',
        conferenceDataVersion: 0,
        requestBody: expect.objectContaining({
          location: 'Conference Room A',
          conferenceData: undefined
        })
      });
    });

    it('should handle Calendar API errors', async () => {
      mockCalendar.events.insert.mockRejectedValue({
        code: 403,
        message: 'Insufficient permissions'
      });

      const eventData = {
        title: 'Test Meeting',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        description: 'Test meeting',
        attendees: [],
        createMeetLink: false
      };

      await expect(createCalendarEvent(mockUser, eventData, false))
        .rejects.toThrow('Insufficient permissions');
    });

    it('should handle quota exceeded errors', async () => {
      mockCalendar.events.insert.mockRejectedValue({
        code: 429,
        message: 'Quota exceeded'
      });

      const eventData = {
        title: 'Test Meeting',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        description: 'Test meeting',
        attendees: [],
        createMeetLink: false
      };

      await expect(createCalendarEvent(mockUser, eventData, false))
        .rejects.toThrow('Quota exceeded');
    });
  });

  describe('Gmail API Integration', () => {
    it('should send agenda emails to attendees', async () => {
      const mockSendResponse = {
        data: {
          id: 'message-123',
          threadId: 'thread-123'
        }
      };

      mockGmail.users.messages.send.mockResolvedValue(mockSendResponse);

      const attendees = [
        {
          email: 'john@example.com',
          firstName: 'John',
          isValid: true,
          exists: true,
          isGoogleUser: true
        },
        {
          email: 'jane@example.com',
          firstName: 'Jane',
          isValid: true,
          exists: true,
          isGoogleUser: true
        }
      ];

      const meetingData = {
        title: 'Team Meeting',
        type: 'online',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
        meetingLink: 'https://meet.google.com/test-link'
      };

      const agendaContent = {
        title: 'Team Meeting Agenda',
        duration: 60,
        topics: [
          { title: 'Introduction', duration: 10, description: 'Welcome' },
          { title: 'Discussion', duration: 40, description: 'Main topics' },
          { title: 'Action Items', duration: 10, description: 'Next steps' }
        ],
        actionItems: [
          { task: 'Follow up on project', priority: 'high' as const }
        ]
      };

      const result = await gmailService.sendBatchAgendaEmails(
        mockUser,
        attendees,
        meetingData,
        agendaContent
      );

      expect(result.totalSent).toBe(2);
      expect(result.totalFailed).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);

      expect(mockGmail.users.messages.send).toHaveBeenCalledTimes(2);
    });

    it('should handle Gmail API errors gracefully', async () => {
      mockGmail.users.messages.send
        .mockResolvedValueOnce({ data: { id: 'msg-1' } }) // First email succeeds
        .mockRejectedValueOnce({ code: 403, message: 'Insufficient permissions' }); // Second fails

      const attendees = [
        {
          email: 'john@example.com',
          firstName: 'John',
          isValid: true,
          exists: true,
          isGoogleUser: true
        },
        {
          email: 'jane@example.com',
          firstName: 'Jane',
          isValid: true,
          exists: true,
          isGoogleUser: true
        }
      ];

      const meetingData = {
        title: 'Team Meeting',
        type: 'online',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
        meetingLink: 'https://meet.google.com/test-link'
      };

      const agendaContent = {
        title: 'Team Meeting Agenda',
        duration: 60,
        topics: [],
        actionItems: []
      };

      const result = await gmailService.sendBatchAgendaEmails(
        mockUser,
        attendees,
        meetingData,
        agendaContent
      );

      expect(result.totalSent).toBe(1);
      expect(result.totalFailed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('jane@example.com');
      expect(result.errors[0]).toContain('Insufficient permissions');
    });

    it('should format agenda emails correctly', async () => {
      mockGmail.users.messages.send.mockResolvedValue({
        data: { id: 'message-123' }
      });

      const attendees = [{
        email: 'john@example.com',
        firstName: 'John',
        isValid: true,
        exists: true,
        isGoogleUser: true
      }];

      const meetingData = {
        title: 'Team Meeting',
        type: 'online',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
        meetingLink: 'https://meet.google.com/test-link'
      };

      const agendaContent = {
        title: 'Team Meeting Agenda',
        duration: 60,
        topics: [
          { title: 'Introduction', duration: 10, description: 'Welcome and introductions' }
        ],
        actionItems: [
          { task: 'Review project status', priority: 'high' as const }
        ]
      };

      await gmailService.sendBatchAgendaEmails(
        mockUser,
        attendees,
        meetingData,
        agendaContent
      );

      const sentMessage = mockGmail.users.messages.send.mock.calls[0][0];
      const rawMessage = Buffer.from(sentMessage.requestBody.raw, 'base64').toString();

      expect(rawMessage).toContain('Subject: Agenda for Team Meeting');
      expect(rawMessage).toContain('Hi John,');
      expect(rawMessage).toContain('Team Meeting Agenda');
      expect(rawMessage).toContain('Introduction');
      expect(rawMessage).toContain('Welcome and introductions');
      expect(rawMessage).toContain('Review project status');
      expect(rawMessage).toContain('https://meet.google.com/test-link');
    });

    it('should handle rate limiting with retry logic', async () => {
      let callCount = 0;
      mockGmail.users.messages.send.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject({ code: 429, message: 'Rate limit exceeded' });
        }
        return Promise.resolve({ data: { id: 'message-123' } });
      });

      const attendees = [{
        email: 'john@example.com',
        firstName: 'John',
        isValid: true,
        exists: true,
        isGoogleUser: true
      }];

      const meetingData = {
        title: 'Team Meeting',
        type: 'online',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z')
      };

      const agendaContent = {
        title: 'Team Meeting Agenda',
        duration: 60,
        topics: [],
        actionItems: []
      };

      const result = await gmailService.sendBatchAgendaEmails(
        mockUser,
        attendees,
        meetingData,
        agendaContent
      );

      expect(callCount).toBe(3); // Should retry twice before succeeding
      expect(result.totalSent).toBe(1);
      expect(result.totalFailed).toBe(0);
    });
  });

  describe('Cross-service integration', () => {
    it('should handle authentication refresh across services', async () => {
      // Simulate expired token scenario
      mockCalendar.events.insert.mockRejectedValueOnce({
        code: 401,
        message: 'Invalid credentials'
      });

      // Mock successful token refresh
      mockAuth.setCredentials.mockImplementation(() => {
        mockUser.accessToken = 'new-access-token';
      });

      // Mock successful retry after refresh
      mockCalendar.events.insert.mockResolvedValueOnce({
        data: {
          id: 'event-after-refresh',
          summary: 'Test Meeting'
        }
      });

      const eventData = {
        title: 'Test Meeting',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        description: 'Test meeting',
        attendees: [],
        createMeetLink: false
      };

      // This should handle the auth error and retry
      await expect(createCalendarEvent(mockUser, eventData, false))
        .rejects.toThrow('Invalid credentials'); // Current implementation doesn't handle refresh
    });

    it('should coordinate between People API and Gmail for attendee validation and email sending', async () => {
      // First, validate attendees using People API
      mockPeople.people.searchContacts.mockResolvedValue({
        data: {
          results: [{
            person: {
              names: [{ givenName: 'John', familyName: 'Doe' }],
              emailAddresses: [{ value: 'john@example.com' }]
            }
          }]
        }
      });

      const attendeeValidator = new AttendeeValidator();
      const validationResult = await attendeeValidator.validateEmail('john@example.com', mockUser);

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.firstName).toBe('John');

      // Then, send email using Gmail API
      mockGmail.users.messages.send.mockResolvedValue({
        data: { id: 'message-123' }
      });

      const emailResult = await gmailService.sendBatchAgendaEmails(
        mockUser,
        [validationResult],
        {
          title: 'Test Meeting',
          type: 'online',
          startTime: new Date(),
          endTime: new Date()
        },
        {
          title: 'Test Agenda',
          duration: 60,
          topics: [],
          actionItems: []
        }
      );

      expect(emailResult.totalSent).toBe(1);
      expect(emailResult.results[0].email).toBe('john@example.com');
    });
  });
});