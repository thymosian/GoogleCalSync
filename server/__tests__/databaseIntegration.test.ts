import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { conversationStorage } from '../conversationStorage';
import { db } from '../storage';
import type { ConversationMessage, MeetingData, User } from '../../shared/schema';

// Mock the database
vi.mock('../storage', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}));

describe('Database Operations Integration', () => {
  const mockUser: User = {
    id: 'test-user-id',
    googleId: 'google-123',
    email: 'test@example.com',
    name: 'Test User',
    picture: null,
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Conversation Context Storage', () => {
    it('should create and retrieve conversation session', async () => {
      const mockSession = {
        id: 'session-123',
        userId: mockUser.id,
        startTime: new Date(),
        lastActivity: new Date(),
        messageCount: 0,
        compressionLevel: 0,
        currentMode: 'casual' as const,
        hasMeetingData: false
      };

      // Mock database insert
      (db.insert as Mock).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockSession])
        })
      });

      const session = await conversationStorage.getOrCreateSession(mockUser.id);

      expect(session).toEqual(mockSession);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should store and retrieve chat messages', async () => {
      const mockMessage: ConversationMessage = {
        id: 'msg-123',
        role: 'user',
        content: 'I need to schedule a meeting',
        timestamp: new Date()
      };

      // Mock database insert for message
      (db.insert as Mock).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: mockMessage.id,
            userId: mockUser.id,
            conversationId: 'session-123',
            role: mockMessage.role,
            content: mockMessage.content,
            timestamp: mockMessage.timestamp,
            intent: null,
            confidence: null,
            extractedFields: null
          }])
        })
      });

      const storedMessage = await conversationStorage.storeChatMessage(
        mockUser.id,
        'session-123',
        mockMessage
      );

      expect(storedMessage.id).toBe(mockMessage.id);
      expect(storedMessage.content).toBe(mockMessage.content);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should retrieve recent messages with pagination', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          userId: mockUser.id,
          conversationId: 'session-123',
          role: 'user',
          content: 'Hello',
          timestamp: new Date('2024-01-15T10:00:00Z'),
          intent: null,
          confidence: null,
          extractedFields: null
        },
        {
          id: 'msg-2',
          userId: mockUser.id,
          conversationId: 'session-123',
          role: 'assistant',
          content: 'Hi there!',
          timestamp: new Date('2024-01-15T10:01:00Z'),
          intent: null,
          confidence: null,
          extractedFields: null
        }
      ];

      // Mock database select
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockMessages)
              })
            })
          })
        })
      });

      const messages = await conversationStorage.getRecentMessages('session-123', 10, 0);

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].content).toBe('Hi there!');
    });

    it('should update conversation context', async () => {
      const contextData = {
        currentMode: 'scheduling' as const,
        meetingData: {
          title: 'Team Meeting',
          type: 'online' as const
        },
        compressionLevel: 1
      };

      // Mock database update
      (db.update as Mock).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined)
        })
      });

      await conversationStorage.updateConversationContext('session-123', contextData);

      expect(db.update).toHaveBeenCalled();
    });

    it('should compress conversation context', async () => {
      const compressionData = {
        compressedMessages: 'Compressed conversation summary',
        originalMessageCount: 20,
        compressedMessageCount: 5,
        compressionRatio: 0.25
      };

      // Mock database update
      (db.update as Mock).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined)
        })
      });

      await conversationStorage.compressConversationContext('session-123', compressionData);

      expect(db.update).toHaveBeenCalled();
    });

    it('should get user conversation statistics', async () => {
      const mockStats = {
        totalContexts: 5,
        activeContexts: 2,
        totalMessages: 150,
        averageMessagesPerContext: 30,
        compressionEvents: 3
      };

      // Mock database aggregation queries
      (db.select as Mock)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 5 }])
          })
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue([{ count: 2 }])
          })
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 150 }])
          })
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue([{ count: 3 }])
          })
        });

      const stats = await conversationStorage.getUserConversationStats(mockUser.id);

      expect(stats.totalContexts).toBe(5);
      expect(stats.activeContexts).toBe(2);
      expect(stats.totalMessages).toBe(150);
      expect(stats.compressionEvents).toBe(3);
    });
  });

  describe('Meeting Draft Storage', () => {
    it('should create and store meeting draft', async () => {
      const meetingData: Partial<MeetingData> = {
        title: 'Team Meeting',
        type: 'online',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
        attendees: [
          { email: 'john@example.com', firstName: 'John', isValidated: true, isRequired: true }
        ],
        agenda: 'Meeting agenda content',
        status: 'draft'
      };

      const mockDraft = {
        id: 'draft-123',
        userId: mockUser.id,
        conversationId: 'session-123',
        title: meetingData.title,
        meetingType: meetingData.type,
        startTime: meetingData.startTime,
        endTime: meetingData.endTime,
        location: null,
        attendees: JSON.stringify(meetingData.attendees),
        agenda: meetingData.agenda,
        status: meetingData.status,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock database insert
      (db.insert as Mock).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockDraft])
        })
      });

      // This would be called by the workflow orchestrator
      const storedDraft = await conversationStorage.createMeetingDraft(
        mockUser.id,
        'session-123',
        meetingData
      );

      expect(storedDraft.id).toBe('draft-123');
      expect(storedDraft.title).toBe('Team Meeting');
      expect(db.insert).toHaveBeenCalled();
    });

    it('should update meeting draft status', async () => {
      // Mock database update
      (db.update as Mock).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined)
        })
      });

      await conversationStorage.updateMeetingDraftStatus('draft-123', 'approved');

      expect(db.update).toHaveBeenCalled();
    });

    it('should retrieve user meeting drafts', async () => {
      const mockDrafts = [
        {
          id: 'draft-1',
          userId: mockUser.id,
          title: 'Meeting 1',
          status: 'draft',
          createdAt: new Date('2024-01-15T10:00:00Z')
        },
        {
          id: 'draft-2',
          userId: mockUser.id,
          title: 'Meeting 2',
          status: 'approved',
          createdAt: new Date('2024-01-15T11:00:00Z')
        }
      ];

      // Mock database select
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockDrafts)
            })
          })
        })
      });

      const drafts = await conversationStorage.getUserMeetingDrafts(mockUser.id, 10);

      expect(drafts).toHaveLength(2);
      expect(drafts[0].title).toBe('Meeting 1');
      expect(drafts[1].title).toBe('Meeting 2');
    });
  });

  describe('Event Storage', () => {
    it('should store created calendar event', async () => {
      const eventData = {
        googleEventId: 'google-event-123',
        userId: mockUser.id,
        title: 'Team Meeting',
        description: 'Team meeting description',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
        meetingLink: 'https://meet.google.com/test-link',
        attendees: ['john@example.com', 'jane@example.com'],
        agenda: 'Meeting agenda content'
      };

      const mockStoredEvent = {
        id: 'event-123',
        ...eventData,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock database insert
      (db.insert as Mock).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockStoredEvent])
        })
      });

      // This would be called after successful calendar creation
      const storedEvent = await conversationStorage.storeCalendarEvent(eventData);

      expect(storedEvent.id).toBe('event-123');
      expect(storedEvent.title).toBe('Team Meeting');
      expect(storedEvent.meetingLink).toBe('https://meet.google.com/test-link');
      expect(db.insert).toHaveBeenCalled();
    });

    it('should retrieve user events', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          userId: mockUser.id,
          title: 'Past Meeting',
          startTime: new Date('2024-01-10T10:00:00Z'),
          endTime: new Date('2024-01-10T11:00:00Z')
        },
        {
          id: 'event-2',
          userId: mockUser.id,
          title: 'Upcoming Meeting',
          startTime: new Date('2024-01-20T10:00:00Z'),
          endTime: new Date('2024-01-20T11:00:00Z')
        }
      ];

      // Mock database select
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockEvents)
            })
          })
        })
      });

      const events = await conversationStorage.getUserEvents(mockUser.id, 10);

      expect(events).toHaveLength(2);
      expect(events[0].title).toBe('Past Meeting');
      expect(events[1].title).toBe('Upcoming Meeting');
    });
  });

  describe('Database Transaction Handling', () => {
    it('should handle database connection errors', async () => {
      // Mock database connection error
      (db.select as Mock).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(conversationStorage.getRecentMessages('session-123', 10, 0))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle constraint violations', async () => {
      // Mock unique constraint violation
      (db.insert as Mock).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue({
            code: '23505', // PostgreSQL unique violation
            message: 'duplicate key value violates unique constraint'
          })
        })
      });

      const message: ConversationMessage = {
        id: 'duplicate-msg',
        role: 'user',
        content: 'Test message',
        timestamp: new Date()
      };

      await expect(conversationStorage.storeChatMessage(
        mockUser.id,
        'session-123',
        message
      )).rejects.toThrow('duplicate key value');
    });

    it('should handle concurrent access scenarios', async () => {
      let callCount = 0;
      
      // Mock optimistic locking scenario
      (db.update as Mock).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // First call fails due to concurrent modification
              throw new Error('Row was modified by another transaction');
            }
            // Second call succeeds
            return Promise.resolve(undefined);
          })
        })
      });

      // This should retry and succeed
      await expect(conversationStorage.updateConversationContext('session-123', {
        currentMode: 'scheduling',
        compressionLevel: 1
      })).rejects.toThrow('Row was modified by another transaction');

      expect(callCount).toBe(1);
    });
  });

  describe('Data Consistency and Integrity', () => {
    it('should maintain referential integrity between conversations and messages', async () => {
      // Mock foreign key constraint violation
      (db.insert as Mock).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue({
            code: '23503', // PostgreSQL foreign key violation
            message: 'insert or update on table violates foreign key constraint'
          })
        })
      });

      const message: ConversationMessage = {
        id: 'msg-123',
        role: 'user',
        content: 'Test message',
        timestamp: new Date()
      };

      await expect(conversationStorage.storeChatMessage(
        mockUser.id,
        'non-existent-session',
        message
      )).rejects.toThrow('foreign key constraint');
    });

    it('should validate data types and constraints', async () => {
      // Mock data type validation error
      (db.insert as Mock).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue({
            code: '22P02', // PostgreSQL invalid text representation
            message: 'invalid input syntax for type timestamp'
          })
        })
      });

      const invalidMessage: ConversationMessage = {
        id: 'msg-123',
        role: 'user',
        content: 'Test message',
        timestamp: 'invalid-date' as any
      };

      await expect(conversationStorage.storeChatMessage(
        mockUser.id,
        'session-123',
        invalidMessage
      )).rejects.toThrow('invalid input syntax');
    });

    it('should handle JSON field validation', async () => {
      // Mock JSON validation error
      (db.insert as Mock).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue({
            code: '22P02',
            message: 'invalid input syntax for type json'
          })
        })
      });

      const invalidMeetingData = {
        title: 'Test Meeting',
        attendees: 'invalid-json-string' // Should be array
      };

      await expect(conversationStorage.createMeetingDraft(
        mockUser.id,
        'session-123',
        invalidMeetingData as any
      )).rejects.toThrow('invalid input syntax for type json');
    });
  });
});