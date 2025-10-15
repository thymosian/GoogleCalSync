import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgendaGenerator } from '../agendaGenerator.js';
import type { MeetingData, ConversationMessage } from '../../shared/schema.js';

// Mock the gemini module
vi.mock('../gemini.js', () => ({
  getGeminiResponse: vi.fn().mockResolvedValue(`
1. Welcome and Introductions (5 min)
2. Project Status Review (20 min)
   - Current progress updates
   - Challenges and blockers
3. Budget Planning Discussion (15 min)
   - Q4 budget allocation
   - Resource requirements
4. Action Items and Next Steps (10 min)
   - Assign responsibilities
   - Set deadlines

Action Items:
- Review budget proposal by Friday
- Update project timeline
- Schedule follow-up meeting
  `)
}));

describe('AgendaGenerator', () => {
  let agendaGenerator: AgendaGenerator;
  
  beforeEach(() => {
    agendaGenerator = new AgendaGenerator();
  });

  describe('generateAgenda', () => {
    it('should generate agenda with conversation context', async () => {
      const meetingData: MeetingData = {
        title: 'Project Planning Meeting',
        type: 'online',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
        attendees: [
          { email: 'john@example.com', isValidated: true, isRequired: true },
          { email: 'jane@example.com', isValidated: true, isRequired: true }
        ],
        status: 'draft'
      };

      const conversationContext: ConversationMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'We need to discuss the project status and budget planning for Q4',
          timestamp: new Date('2024-01-15T09:00:00Z')
        },
        {
          id: '2',
          role: 'assistant',
          content: 'I can help you schedule a meeting to discuss project status and budget planning.',
          timestamp: new Date('2024-01-15T09:01:00Z')
        },
        {
          id: '3',
          role: 'user',
          content: 'Yes, we need to review our current progress and talk about resource allocation',
          timestamp: new Date('2024-01-15T09:02:00Z')
        }
      ];

      const result = await agendaGenerator.generateAgenda(meetingData, conversationContext);

      expect(result).toBeDefined();
      expect(result.title).toBeTruthy();
      expect(result.duration).toBe(60);
      expect(result.topics).toHaveLength(4);
      expect(result.actionItems.length).toBeGreaterThan(0);
      
      // Check that topics have time allocations
      const totalTopicTime = result.topics.reduce((sum, topic) => sum + topic.duration, 0);
      expect(totalTopicTime).toBeLessThanOrEqual(60);
      
      // Check that context was analyzed
      expect(result.topics.some(topic => 
        topic.title.toLowerCase().includes('status') || 
        topic.title.toLowerCase().includes('budget') ||
        topic.title.toLowerCase().includes('review') ||
        topic.title.toLowerCase().includes('planning')
      )).toBe(true);
    });

    it('should handle empty conversation context gracefully', async () => {
      const meetingData: MeetingData = {
        title: 'General Meeting',
        type: 'physical',
        startTime: new Date('2024-01-15T14:00:00Z'),
        endTime: new Date('2024-01-15T15:00:00Z'),
        attendees: [],
        status: 'draft'
      };

      const result = await agendaGenerator.generateAgenda(meetingData, []);

      expect(result).toBeDefined();
      expect(result.title).toBeTruthy();
      expect(result.duration).toBe(60);
      expect(result.topics.length).toBeGreaterThan(0);
    });

    it('should create fallback agenda when AI fails', async () => {
      // Mock AI failure
      const { getGeminiResponse } = await import('../aiInterface.js');
      vi.mocked(getGeminiResponse).mockRejectedValueOnce(new Error('AI service unavailable'));

      const meetingData: MeetingData = {
        title: 'Emergency Meeting',
        type: 'online',
        startTime: new Date('2024-01-15T16:00:00Z'),
        endTime: new Date('2024-01-15T16:30:00Z'),
        attendees: [
          { email: 'urgent@example.com', isValidated: true, isRequired: true }
        ],
        status: 'draft'
      };

      const conversationContext: ConversationMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'We have an urgent issue with the production system that needs immediate attention',
          timestamp: new Date('2024-01-15T15:45:00Z')
        }
      ];

      const result = await agendaGenerator.generateAgenda(meetingData, conversationContext);

      expect(result).toBeDefined();
      expect(result.title).toBeTruthy();
      expect(result.duration).toBe(30);
      expect(result.topics.length).toBeGreaterThan(0);
      expect(result.actionItems.length).toBeGreaterThan(0);
    });
  });

  describe('formatAgenda', () => {
    it('should format agenda content as markdown', () => {
      const agendaContent = {
        title: 'Test Meeting Agenda',
        duration: 60,
        topics: [
          {
            title: 'Introduction',
            duration: 10,
            description: 'Welcome and overview'
          },
          {
            title: 'Main Discussion',
            duration: 40,
            presenter: 'John Doe'
          }
        ],
        actionItems: [
          {
            task: 'Follow up on decisions',
            priority: 'high' as const,
            assignee: 'Jane Smith',
            deadline: '2024-01-20'
          }
        ]
      };

      const formatted = agendaGenerator.formatAgenda(agendaContent);

      expect(formatted).toContain('# Test Meeting Agenda');
      expect(formatted).toContain('**Duration:** 60 minutes');
      expect(formatted).toContain('1. **Introduction** (10 min)');
      expect(formatted).toContain('2. **Main Discussion** (40 min)');
      expect(formatted).toContain('*Presenter: John Doe*');
      expect(formatted).toContain('## Action Items');
      expect(formatted).toContain('Follow up on decisions');
      expect(formatted).toContain('*Jane Smith*');
      expect(formatted).toContain('[HIGH]');
    });
  });

  describe('validateAgenda', () => {
    it('should validate agenda content', () => {
      const validAgenda = `# Meeting Agenda

**Duration:** 60 minutes

## Agenda Items

1. **Introduction** (10 min)
2. **Main Discussion** (40 min)
3. **Action Items** (10 min)

## Action Items

1. Follow up on key points
2. Schedule next meeting
      `;

      const result = agendaGenerator.validateAgenda(validAgenda);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should identify validation issues', () => {
      const invalidAgenda = 'Short agenda';

      const result = agendaGenerator.validateAgenda(invalidAgenda);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('too short');
    });
  });

  describe('generateTemplateAgenda', () => {
    it('should generate standup agenda template', async () => {
      const meetingData: MeetingData = {
        title: 'Daily Standup',
        type: 'online',
        startTime: new Date('2024-01-15T09:00:00Z'),
        endTime: new Date('2024-01-15T09:15:00Z'),
        attendees: [],
        status: 'draft'
      };

      const result = await agendaGenerator.generateTemplateAgenda('standup', meetingData);

      expect(result.title).toContain('Standup');
      expect(result.duration).toBe(15);
      expect(result.topics.some(topic => 
        topic.title.toLowerCase().includes('yesterday') ||
        topic.title.toLowerCase().includes('today') ||
        topic.title.toLowerCase().includes('blocker')
      )).toBe(true);
    });

    it('should generate planning agenda template', async () => {
      const meetingData: MeetingData = {
        title: 'Sprint Planning',
        type: 'online',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T12:00:00Z'),
        attendees: [],
        status: 'draft'
      };

      const result = await agendaGenerator.generateTemplateAgenda('planning', meetingData);

      expect(result.title).toContain('Planning');
      expect(result.duration).toBe(120);
      expect(result.topics.some(topic => 
        topic.title.toLowerCase().includes('objective') ||
        topic.title.toLowerCase().includes('timeline') ||
        topic.title.toLowerCase().includes('resource')
      )).toBe(true);
    });
  });
});