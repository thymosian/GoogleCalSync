/**
 * Unified AI Interface Wrapper
 * 
 * FAST PATH ENABLED: Bypasses AI router for zero-latency direct Gemini calls
 * No circuit breakers, no retries, no fallbacks - just raw speed
 */

import {
    extractMeetingIntent as extractMeetingIntentDirect,
    generateMeetingAgenda as generateMeetingAgendaDirect,
    generateActionItems as generateActionItemsDirect,
    getGeminiResponse as getGeminiResponseDirect,
    verifyAttendees as verifyAttendeesDirect
} from './gemini.js';
import {
    generateMeetingTitles as generateMeetingTitlesMistral,
    enhancePurposeWording as enhancePurposeWordingMistral
} from './mistralService.js';
import { aiRouter } from './aiRouterService.js';
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
 * Generate meeting titles - Using AI router (Gemini primary, Mistral fallback) with degradation mode
 */
export async function generateMeetingTitles(
    purpose: string,
    participants: string[],
    context: string = ''
): Promise<TitleSuggestion> {
    try {
        // Try AI router first
        return await aiRouter.routeRequest<TitleSuggestion>('generateMeetingTitles', [purpose, participants, context]);
    } catch (error) {
        console.error('AI router failed for generateMeetingTitles, falling back to direct Mistral call:', error);
        try {
            // Try direct Mistral call
            return await generateMeetingTitlesMistral(purpose, participants, context);
        } catch (mistralError) {
            console.error('Mistral fallback failed, using degradation mode:', mistralError);
            // Degradation mode - use rule-based approach
            return {
                suggestions: [
                    generateBasicTitle(purpose, participants),
                    "Team Discussion",
                    "Project Meeting"
                ],
                context: "Generated in degradation mode due to service unavailability"
            };
        }
    }
}

// Simple rule-based title generator for degradation mode
function generateBasicTitle(purpose: string, participants: string[]): string {
    // Extract key terms from purpose (first 3-4 words or up to 30 chars)
    const keyTerms = purpose.split(' ').slice(0, 4).join(' ').substring(0, 30);
    return keyTerms || "Team Meeting";
}

/**
 * Enhance purpose wording - Using AI router (Gemini primary, Mistral fallback) with degradation mode
 */
export async function enhancePurposeWording(
    purpose: string,
    title: string,
    participants: string[] = [],
    context: string = ''
): Promise<{ enhancedPurpose: string; keyPoints: string[] }> {
    try {
        // Try AI router first
        return await aiRouter.routeRequest<{ enhancedPurpose: string; keyPoints: string[] }>('enhancePurposeWording', [purpose, title, participants, context]);
    } catch (error) {
        console.error('AI router failed for enhancePurposeWording, falling back to direct Mistral call:', error);
        try {
            // Try direct Mistral call
            return await enhancePurposeWordingMistral(purpose, title, participants, context);
        } catch (mistralError) {
            console.error('Mistral fallback failed, using degradation mode:', mistralError);
            // Degradation mode - use rule-based approach
            return {
                enhancedPurpose: generateBasicEnhancedPurpose(purpose, title),
                keyPoints: generateBasicKeyPoints(purpose)
            };
        }
    }
}

// Simple rule-based purpose enhancer for degradation mode
function generateBasicEnhancedPurpose(purpose: string, title: string): string {
    let enhanced = purpose.charAt(0).toUpperCase() + purpose.slice(1);
    if (!enhanced.match(/[.!?]$/)) {
        enhanced += '.';
    }
    if (title && title !== purpose && !enhanced.includes(title)) {
        enhanced = `${title}: ${enhanced}`;
    }
    return enhanced;
}

// Simple rule-based key points generator for degradation mode
function generateBasicKeyPoints(purpose: string): string[] {
    const sentences = purpose.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length === 0) {
        return [purpose];
    }
    if (sentences.length <= 3) {
        return sentences.map(s => s.trim());
    }
    return sentences.slice(0, 3).map(s => s.trim());
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