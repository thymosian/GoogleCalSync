/**
 * Unified AI Interface Wrapper
 * 
 * FAST PATH ENABLED: Bypasses AI router for zero-latency direct Gemini calls
 * No circuit breakers, no retries, no fallbacks - just raw speed
 */

import {
    extractMeetingIntent as extractMeetingIntentDirect,
    generateMeetingTitles as generateMeetingTitlesDirect,
    generateMeetingAgenda as generateMeetingAgendaDirect,
    generateActionItems as generateActionItemsDirect,
    getGeminiResponse as getGeminiResponseDirect,
    verifyAttendees as verifyAttendeesDirect
} from './gemini.js';
import { MeetingExtraction, TitleSuggestion, ConversationMessage, MeetingData } from '../shared/schema.js';

// Re-export types for convenience
export type { MistralMessage, GeminiMessage } from './gemini.js';

/**
 * Extract meeting intent - FAST PATH (direct Gemini call, no routing overhead)
 */
export async function extractMeetingIntent(
    userMessageOrMessages: string | ConversationMessage[],
    conversationContextOrEngine?: ConversationMessage[] | any,
    currentMeetingData?: MeetingData
): Promise<MeetingExtraction & { contextualConfidence: number; extractedFields?: any; missingFields?: string[] }> {
    // Direct call to Gemini - bypasses all router overhead
    return extractMeetingIntentDirect(
        userMessageOrMessages,
        conversationContextOrEngine,
        currentMeetingData
    );
}

/**
 * Generate meeting titles - FAST PATH (direct Gemini call)
 */
export async function generateMeetingTitles(
    purpose: string,
    participants: string[],
    context: string = ''
): Promise<TitleSuggestion> {
    return generateMeetingTitlesDirect(purpose, participants, context);
}

/**
 * Generate meeting agenda - FAST PATH (direct Gemini call)
 */
export async function generateMeetingAgenda(
    title: string,
    purpose: string,
    participants: string[],
    duration: number,
    context: string = ''
): Promise<string> {
    return generateMeetingAgendaDirect(title, purpose, participants, duration, context);
}

/**
 * Generate action items - FAST PATH (direct Gemini call)
 */
export async function generateActionItems(
    title: string,
    purpose: string,
    participants: string[],
    topics: string[],
    context: string = ''
): Promise<any[]> {
    return generateActionItemsDirect(title, purpose, participants, topics, context);
}

/**
 * Get AI response - FAST PATH (direct Gemini call)
 */
export async function getGeminiResponse(messages: any[]): Promise<string> {
    return getGeminiResponseDirect(messages);
}

/**
 * Verify attendees - FAST PATH (direct Gemini call)
 */
export async function verifyAttendees(emails: string[]): Promise<Array<{ email: string, valid: boolean, trusted: boolean }>> {
    return verifyAttendeesDirect(emails);
}

/**
 * Backward compatible generateResponse function - FAST PATH
 */
export async function generateResponse(
    messagesOrString: ConversationMessage[] | any[] | string,
    contextEngineOrUndefined?: any
): Promise<string> {
    // Handle different function signatures for backward compatibility
    if (typeof messagesOrString === 'string') {
        // Simple string message - convert to message format
        return getGeminiResponseDirect([{ role: 'user', content: messagesOrString }]);
    } else if (Array.isArray(messagesOrString)) {
        // Check if it's ConversationMessage[] or other message format
        const firstMessage = messagesOrString[0];
        if (firstMessage && 'timestamp' in firstMessage) {
            // ConversationMessage[] - convert to simple message format
            const simpleMessages = (messagesOrString as ConversationMessage[]).map(msg => ({
                role: msg.role,
                content: msg.content
            }));
            return getGeminiResponseDirect(simpleMessages);
        } else {
            // Already in simple message format
            return getGeminiResponseDirect(messagesOrString);
        }
    }

    // Fallback to empty message array
    return getGeminiResponseDirect([]);
}

/**
 * Get contextual response with conversation history - FAST PATH
 */
export async function getContextualResponse(conversationHistory: any[], userInput: string): Promise<string> {
    const messages = [
        ...conversationHistory,
        { role: 'user' as const, content: userInput }
    ];

    return getGeminiResponseDirect(messages);
}

// Additional utility functions that may be used by other parts of the system

/**
 * Summarize conversation using AI router
 */
export async function summarizeConversation(messages: ConversationMessage[]): Promise<string> {
    // Import the original function and route it through the router
    const { summarizeConversation: originalSummarize } = await import('./gemini.js');
    
    // For now, call the original function directly since it's not in the routing rules
    // This can be added to routing rules later if needed
    return originalSummarize(messages);
}

/**
 * Compress context using AI router
 */
export async function compressContext(
    fullContext: string,
    meetingData?: MeetingData
): Promise<string> {
    // Import the original function and route it through the router
    const { compressContext: originalCompress } = await import('./gemini.js');
    
    // For now, call the original function directly since it's not in the routing rules
    // This can be added to routing rules later if needed
    return originalCompress(fullContext, meetingData);
}

/**
 * Analyze multi-turn intent using AI router
 */
export async function analyzeMultiTurnIntent(
    conversation: ConversationMessage[],
    currentMessage: string
): Promise<{
    overallIntent: string;
    turnIntent: string;
    confidence: number;
    contextSupport: number;
}> {
    // Import the original function and route it through the router
    const { analyzeMultiTurnIntent: originalAnalyze } = await import('./gemini.js');
    
    // For now, call the original function directly since it's not in the routing rules
    // This can be added to routing rules later if needed
    return originalAnalyze(conversation, currentMessage);
}

// Export the router instance for direct access if needed
export { aiRouter } from './aiRouterService.js';

// Export configuration types for external use
export type {
    RoutingOptions,
    RoutingRule,
    RoutingRules,
    ServiceHealthStatus,
    UsageStatistics,
    FunctionStats
} from './aiRouterService.js';