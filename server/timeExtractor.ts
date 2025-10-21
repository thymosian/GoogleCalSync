/**
 * AI-powered time extraction utility using Mistral for natural language processing
 */

import { aiRouter } from './aiRouterService.js';

export interface ExtractedTime {
    startTime: Date;
    endTime?: Date;
    confidence: number;
    reasoning?: string;
}

export interface TimeExtractionContext {
    currentDate: string;
    currentTime: string;
    timezone: string;
    conversationHistory?: string[];
    meetingContext?: any;
}

/**
 * Extracts time information from natural language text using Mistral AI
 */
export async function extractTimeFromMessage(
    message: string,
    context?: TimeExtractionContext
): Promise<ExtractedTime | null> {
    try {
        const now = new Date();
        const timeContext: TimeExtractionContext = {
            currentDate: now.toISOString().split('T')[0],
            currentTime: now.toTimeString().split(' ')[0],
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            ...context
        };

        // Use AI router to call the appropriate AI service
        const result = await aiRouter.routeRequest(
            'extractTimeFromNaturalLanguage',
            [message, timeContext]
        ) as {
            startTime: string;
            endTime?: string;
            confidence: number;
            reasoning: string;
        } | null;

        if (result) {
            return {
                startTime: new Date(result.startTime),
                endTime: result.endTime ? new Date(result.endTime) : undefined,
                confidence: result.confidence,
                reasoning: result.reasoning
            };
        }

        return null;
    } catch (error) {
        console.error('AI time extraction failed, falling back to basic parsing:', error);

        // Fallback to basic regex parsing if AI fails
        return basicTimeExtraction(message);
    }
}

/**
 * Basic fallback time extraction using simple patterns
 */
function basicTimeExtraction(message: string): ExtractedTime | null {
    const text = message.toLowerCase();
    const now = new Date();

    // Simple "tomorrow" detection
    if (text.includes('tomorrow')) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(14, 0, 0, 0); // Default to 2 PM

        return {
            startTime: tomorrow,
            endTime: new Date(tomorrow.getTime() + 60 * 60 * 1000),
            confidence: 0.5,
            reasoning: 'Basic fallback parsing'
        };
    }

    // Simple "today" detection
    if (text.includes('today')) {
        const today = new Date(now);
        today.setHours(14, 0, 0, 0); // Default to 2 PM

        return {
            startTime: today,
            endTime: new Date(today.getTime() + 60 * 60 * 1000),
            confidence: 0.5,
            reasoning: 'Basic fallback parsing'
        };
    }

    return null;
}
