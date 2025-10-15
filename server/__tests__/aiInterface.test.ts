import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
    extractMeetingIntent, 
    generateMeetingTitles, 
    generateMeetingAgenda, 
    generateActionItems,
    getGeminiResponse,
    verifyAttendees
} from '../aiInterface.js';

// Mock the AI router service
vi.mock('../aiRouterService.js', () => ({
    aiRouter: {
        routeRequest: vi.fn()
    }
}));

describe('AI Interface Wrapper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('extractMeetingIntent', () => {
        it('should route request through AI router', async () => {
            const { aiRouter } = await import('../aiRouterService.js');
            const mockResult = { intent: 'schedule', confidence: 0.9 };
            vi.mocked(aiRouter.routeRequest).mockResolvedValue(mockResult);

            const result = await extractMeetingIntent('Schedule a meeting tomorrow');

            expect(aiRouter.routeRequest).toHaveBeenCalledWith('extractMeetingIntent', [
                'Schedule a meeting tomorrow',
                undefined,
                undefined
            ]);
            expect(result).toEqual(mockResult);
        });
    });

    describe('generateMeetingTitles', () => {
        it('should route request through AI router', async () => {
            const { aiRouter } = await import('../aiRouterService.js');
            const mockResult = { suggestions: ['Team Meeting', 'Project Sync'] };
            vi.mocked(aiRouter.routeRequest).mockResolvedValue(mockResult);

            const result = await generateMeetingTitles('Project discussion', ['john@example.com']);

            expect(aiRouter.routeRequest).toHaveBeenCalledWith('generateMeetingTitles', [
                'Project discussion',
                ['john@example.com'],
                ''
            ]);
            expect(result).toEqual(mockResult);
        });
    });

    describe('generateMeetingAgenda', () => {
        it('should route request through AI router', async () => {
            const { aiRouter } = await import('../aiRouterService.js');
            const mockResult = 'Meeting agenda content';
            vi.mocked(aiRouter.routeRequest).mockResolvedValue(mockResult);

            const result = await generateMeetingAgenda('Team Meeting', 'Project discussion', ['john@example.com'], 60);

            expect(aiRouter.routeRequest).toHaveBeenCalledWith('generateMeetingAgenda', [
                'Team Meeting',
                'Project discussion',
                ['john@example.com'],
                60,
                ''
            ]);
            expect(result).toEqual(mockResult);
        });
    });

    describe('generateActionItems', () => {
        it('should route request through AI router', async () => {
            const { aiRouter } = await import('../aiRouterService.js');
            const mockResult = [{ task: 'Complete project', assignee: 'john@example.com' }];
            vi.mocked(aiRouter.routeRequest).mockResolvedValue(mockResult);

            const result = await generateActionItems('Team Meeting', 'Project discussion', ['john@example.com'], ['topic1']);

            expect(aiRouter.routeRequest).toHaveBeenCalledWith('generateActionItems', [
                'Team Meeting',
                'Project discussion',
                ['john@example.com'],
                ['topic1'],
                ''
            ]);
            expect(result).toEqual(mockResult);
        });
    });

    describe('getGeminiResponse', () => {
        it('should route request through AI router to use Mistral as primary', async () => {
            const { aiRouter } = await import('../aiRouterService.js');
            const mockResult = 'AI response';
            vi.mocked(aiRouter.routeRequest).mockResolvedValue(mockResult);

            const messages = [{ role: 'user', content: 'Hello' }];
            const result = await getGeminiResponse(messages);

            expect(aiRouter.routeRequest).toHaveBeenCalledWith('getGeminiResponse', [messages]);
            expect(result).toEqual(mockResult);
        });
    });

    describe('verifyAttendees', () => {
        it('should route request through AI router', async () => {
            const { aiRouter } = await import('../aiRouterService.js');
            const mockResult = [{ email: 'john@example.com', valid: true, trusted: true }];
            vi.mocked(aiRouter.routeRequest).mockResolvedValue(mockResult);

            const result = await verifyAttendees(['john@example.com']);

            expect(aiRouter.routeRequest).toHaveBeenCalledWith('verifyAttendees', [['john@example.com']]);
            expect(result).toEqual(mockResult);
        });
    });
});