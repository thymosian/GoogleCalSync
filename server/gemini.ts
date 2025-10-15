import { GoogleGenerativeAI, GenerativeModel, GenerationConfig } from '@google/generative-ai';
import { MeetingExtraction, TitleSuggestion, ConversationMessage, MeetingData } from '../shared/schema.js';
import { MEETING_CREATION_PROMPTS, MEETING_CREATION_RULES } from './prompts.js';
import { performanceMonitor } from './performanceMonitor.js';
import { aiServiceErrorHandler } from './errorHandlers/aiServiceErrorHandler.js';

// Gemini configuration interface
export interface GeminiConfig {
    apiKey: string;
    model: string;
    temperature: number;
    maxOutputTokens: number;
    topP: number;
    topK: number;
}

// Gemini message format for API calls
export interface GeminiMessage {
    role: 'user' | 'model';
    parts: [{ text: string }];
}

// Legacy message format for backward compatibility
export interface MistralMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

// Load configuration from validated environment
import { getServiceConfig, isServiceAvailable } from './config/environmentConfig.js';

/**
 * Clean JSON response by removing markdown code blocks and extra formatting
 */
function cleanJsonResponse(content: string): string {
    // Remove markdown code blocks
    let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // Remove any leading/trailing whitespace
    cleaned = cleaned.trim();
    
    // If the response starts with text before JSON, try to extract just the JSON part
    const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
        cleaned = jsonMatch[0];
    }
    
    return cleaned;
}

// Get validated Gemini configuration
const geminiConfig = isServiceAvailable('gemini') ? getServiceConfig('gemini') : null;

if (!geminiConfig) {
    console.error('Gemini service is not properly configured');
    throw new Error('Missing or invalid Gemini configuration');
}

const GEMINI_API_KEY = geminiConfig.apiKey;
const GEMINI_MODEL = geminiConfig.model;
const GEMINI_TEMPERATURE = geminiConfig.temperature;

// Initialize Google Generative AI client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Default configuration using validated environment config
const defaultConfig: GeminiConfig = {
    apiKey: geminiConfig.apiKey,
    model: geminiConfig.model,
    temperature: geminiConfig.temperature,
    maxOutputTokens: 'maxOutputTokens' in geminiConfig ? geminiConfig.maxOutputTokens : 1000,
    topP: 'topP' in geminiConfig ? geminiConfig.topP : 0.8,
    topK: 'topK' in geminiConfig ? geminiConfig.topK : 40
};

// Enhanced system prompt for conversational responses
const SYSTEM_PROMPT = `You are CalAI, an AI calendar assistant. Be concise, professional, and helpful.

Guidelines:
- Keep responses under 2 sentences maximum
- Use natural, conversational language
- Be direct and actionable
- Avoid jargon and complex explanations
- Focus on the user's immediate needs
- When asking questions, be specific and brief
- Never make up information or hallucinate
- Always verify facts before stating them
- If uncertain, ask for clarification`;

// Get Gemini model instance with configuration
function getGeminiModel(config: Partial<GeminiConfig> = {}): GenerativeModel {
    const finalConfig = { ...defaultConfig, ...config };

    const generationConfig: GenerationConfig = {
        temperature: finalConfig.temperature,
        topP: finalConfig.topP,
        topK: finalConfig.topK,
        maxOutputTokens: finalConfig.maxOutputTokens,
    };

    const model = genAI.getGenerativeModel({
        model: finalConfig.model,
        generationConfig,
        systemInstruction: SYSTEM_PROMPT,
    });

    return model;
}

// Basic error handling and logging setup
function handleGeminiError(error: any, operation: string): Error {
    console.error(`Gemini API error during ${operation}:`, error);

    // Log error details for monitoring
    if (error.status) {
        console.error(`Status: ${error.status}, Message: ${error.message}`);
    }

    // Use existing AI service error handler for consistent error handling
    const aiError = aiServiceErrorHandler.classifyError(error);
    return new Error(aiError.message);
}

// Log successful API calls for monitoring with Gemini usage metadata
function logSuccessfulCall(
    operation: string,
    inputTokens: number,
    outputTokens: number,
    responseTime: number,
    usageMetadata?: any,
    model?: string
) {
    performanceMonitor.recordAPICall({
        service: 'gemini',
        operation,
        tokenCount: {
            input: inputTokens,
            output: outputTokens,
            total: inputTokens + outputTokens
        },
        responseTime,
        success: true,
        model,
        usageMetadata
    });
}

// Log failed API calls for monitoring
function logFailedCall(operation: string, inputTokens: number, responseTime: number, error: string, model?: string) {
    performanceMonitor.recordAPICall({
        service: 'gemini',
        operation,
        tokenCount: {
            input: inputTokens,
            output: 0,
            total: inputTokens
        },
        responseTime,
        success: false,
        error,
        model
    });
}

// Export the configuration and helper functions for use by other functions
export { defaultConfig, getGeminiModel, handleGeminiError, logSuccessfulCall, logFailedCall };

// Message format conversion utilities

/**
 * Convert legacy message format to Gemini format
 * Handles role mapping and content structure conversion
 */
export function convertToGeminiFormat(messages: MistralMessage[]): {
    geminiMessages: GeminiMessage[];
    systemInstruction?: string;
} {
    const geminiMessages: GeminiMessage[] = [];
    let systemInstruction: string | undefined;

    for (const message of messages) {
        if (message.role === 'system') {
            // Handle system messages as system instructions
            // If multiple system messages, concatenate them
            if (systemInstruction) {
                systemInstruction += '\n\n' + message.content;
            } else {
                systemInstruction = message.content;
            }
        } else {
            // Convert user and assistant messages
            const geminiRole = message.role === 'assistant' ? 'model' : 'user';
            geminiMessages.push({
                role: geminiRole,
                parts: [{ text: message.content }]
            });
        }
    }

    return { geminiMessages, systemInstruction };
}

/**
 * Convert ConversationMessage array to legacy format for backward compatibility
 */
export function convertConversationToMistral(messages: ConversationMessage[]): MistralMessage[] {
    return messages.map(msg => ({
        role: msg.role,
        content: msg.content
    }));
}

/**
 * Handle role mapping from legacy format to Gemini format
 * - 'user' stays 'user'
 * - 'assistant' becomes 'model'
 * - 'system' is handled separately as system instruction
 */
export function mapRoleToGemini(mistralRole: 'user' | 'assistant' | 'system'): 'user' | 'model' | 'system' {
    switch (mistralRole) {
        case 'user':
            return 'user';
        case 'assistant':
            return 'model';
        case 'system':
            return 'system'; // Will be handled separately
        default:
            return 'user'; // Fallback to user
    }
}

/**
 * Extract system messages from a message array and return them as a single instruction
 */
export function extractSystemInstruction(messages: MistralMessage[]): string {
    const systemMessages = messages.filter(msg => msg.role === 'system');
    if (systemMessages.length === 0) {
        return SYSTEM_PROMPT; // Use default system prompt
    }

    // Combine multiple system messages
    return systemMessages.map(msg => msg.content).join('\n\n');
}

/**
 * Filter out system messages and convert remaining to Gemini format
 */
export function filterAndConvertMessages(messages: MistralMessage[]): GeminiMessage[] {
    return messages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
            role: mapRoleToGemini(msg.role) as 'user' | 'model',
            parts: [{ text: msg.content }]
        }));
}

// Core response generation functions

/**
 * Main Gemini response function
 * Maintains the same interface for backward compatibility
 */
export async function getGeminiResponse(messages: MistralMessage[]): Promise<string> {
    const startTime = Date.now();
    const inputText = messages.map(m => m.content).join(' ');
    const inputTokens = performanceMonitor.estimateTokenCount(inputText);

    try {
        // Convert messages to Gemini format
        const { geminiMessages, systemInstruction } = convertToGeminiFormat(messages);

        // Get model with custom system instruction if provided
        const model = getGeminiModel();

        // If we have a custom system instruction from the messages, create a new model instance
        let finalModel = model;
        if (systemInstruction && systemInstruction !== SYSTEM_PROMPT) {
            finalModel = genAI.getGenerativeModel({
                model: defaultConfig.model,
                generationConfig: {
                    temperature: defaultConfig.temperature,
                    topP: defaultConfig.topP,
                    topK: defaultConfig.topK,
                    maxOutputTokens: defaultConfig.maxOutputTokens,
                },
                systemInstruction: systemInstruction,
            });
        }

        // Generate response using Gemini
        const result = await finalModel.generateContent({
            contents: geminiMessages.map(msg => ({
                role: msg.role,
                parts: msg.parts
            }))
        });

        const response = await result.response;
        const text = response.text().trim();

        // Extract token usage from response metadata
        const usageMetadata = response.usageMetadata;
        const outputTokens = usageMetadata?.candidatesTokenCount || performanceMonitor.estimateTokenCount(text);
        const totalTokens = usageMetadata?.totalTokenCount || (inputTokens + outputTokens);

        const responseTime = Date.now() - startTime;

        // Log successful call with Gemini usage metadata
        logSuccessfulCall('general_response', inputTokens, outputTokens, responseTime, usageMetadata, defaultConfig.model);

        return text;
    } catch (error: any) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error.message || 'Unknown Gemini API error';

        // Log failed call
        logFailedCall('general_response', inputTokens, responseTime, errorMessage, defaultConfig.model);

        // Handle error using existing error handler
        throw handleGeminiError(error, 'general_response');
    }
}

/**
 * Backward compatible generateResponse function
 * Maintains the same interface as the previous version
 */
export async function generateResponse(
    messagesOrString: ConversationMessage[] | MistralMessage[] | string,
    contextEngineOrUndefined?: any
): Promise<string> {
    // Handle different function signatures for backward compatibility
    if (typeof messagesOrString === 'string') {
        // Simple string message
        return getGeminiResponse([{ role: 'user', content: messagesOrString }]);
    } else if (Array.isArray(messagesOrString)) {
        // Check if it's ConversationMessage[] or MistralMessage[]
        const firstMessage = messagesOrString[0];
        if (firstMessage && 'timestamp' in firstMessage) {
            // ConversationMessage[] - convert to MistralMessage[]
            const mistralMessages: MistralMessage[] = (messagesOrString as ConversationMessage[]).map(msg => ({
                role: msg.role,
                content: msg.content
            }));
            return getGeminiResponse(mistralMessages);
        } else {
            // Already MistralMessage[]
            return getGeminiResponse(messagesOrString as MistralMessage[]);
        }
    }

    return getGeminiResponse([]);
}

/**
 * Enhanced token counting with Gemini usage metadata
 * Processes actual token counts from Gemini responses when available
 */
export function processGeminiUsageMetadata(usageMetadata: any): {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
} {
    if (!usageMetadata) {
        return {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0
        };
    }

    return {
        inputTokens: usageMetadata.promptTokenCount || 0,
        outputTokens: usageMetadata.candidatesTokenCount || 0,
        totalTokens: usageMetadata.totalTokenCount || 0
    };
}

/**
 * Enhanced logging function that uses actual Gemini usage metadata when available
 */
export function logGeminiAPICall(
    operation: string,
    success: boolean,
    responseTime: number,
    estimatedInputTokens: number,
    usageMetadata?: any,
    model?: string,
    error?: string
): void {
    let tokenCount;

    if (usageMetadata) {
        // Use actual Gemini usage metadata for accurate token counting
        const processedMetadata = processGeminiUsageMetadata(usageMetadata);
        tokenCount = {
            input: processedMetadata.inputTokens,
            output: processedMetadata.outputTokens,
            total: processedMetadata.totalTokens
        };
    } else {
        // Fallback to estimated tokens
        tokenCount = {
            input: estimatedInputTokens,
            output: 0,
            total: estimatedInputTokens
        };
    }

    performanceMonitor.recordAPICall({
        service: 'gemini',
        operation,
        tokenCount,
        responseTime,
        success,
        error,
        model,
        usageMetadata
    });
}

/**
 * Enhanced meeting intent extraction with conversation awareness
 */
export async function extractMeetingIntent(
    userMessageOrMessages: string | ConversationMessage[],
    conversationContextOrEngine?: ConversationMessage[] | any,
    currentMeetingData?: MeetingData
): Promise<MeetingExtraction & { contextualConfidence: number; extractedFields?: any; missingFields?: string[] }> {

    // Handle both old and new function signatures for backward compatibility
    let userMessage: string;
    let conversationContext: ConversationMessage[] = [];

    if (typeof userMessageOrMessages === 'string') {
        // Old signature: extractMeetingIntent(userMessage, conversationContext, currentMeetingData)
        userMessage = userMessageOrMessages;
        conversationContext = conversationContextOrEngine as ConversationMessage[] || [];
    } else {
        // New signature: extractMeetingIntent(messages, contextEngine)
        const messages = userMessageOrMessages as ConversationMessage[];
        conversationContext = messages;
        userMessage = messages.length > 0 ? messages[messages.length - 1].content : '';
    }

    // Analyze conversation context for better intent detection
    const contextAnalysis = analyzeConversationContext(conversationContext, currentMeetingData);

    // Build compressed context string optimized for token efficiency
    const contextString = buildCompressedContext(conversationContext, contextAnalysis);

    // Apply the enhanced prompt with actual values
    const extractionPrompt = MEETING_CREATION_PROMPTS.MEETING_INTENT_EXTRACTION
        .replace('{userMessage}', userMessage)
        .replace('{context}', contextString);

    const startTime = Date.now();
    const inputTokens = performanceMonitor.estimateTokenCount(extractionPrompt);

    try {
        // Get model with specific configuration for intent extraction
        const model = getGeminiModel({
            temperature: 0.0, // Deterministic for consistent parsing
            maxOutputTokens: 200
        });

        const result = await model.generateContent(extractionPrompt);

        const response = await result.response;
        const content = response.text().trim();

        // Extract token usage from response metadata
        const usageMetadata = response.usageMetadata;
        const outputTokens = usageMetadata?.candidatesTokenCount || performanceMonitor.estimateTokenCount(content);
        const responseTime = Date.now() - startTime;

        // Log successful call with Gemini usage metadata
        logSuccessfulCall('meeting_intent_extraction', inputTokens, outputTokens, responseTime, usageMetadata, 'gemini-1.5-flash');

        try {
            const cleanedContent = cleanJsonResponse(content);
            const extraction = JSON.parse(cleanedContent) as MeetingExtraction;

            // Calculate contextual confidence based on conversation history
            const contextualConfidence = calculateContextualConfidence(
                extraction,
                contextAnalysis,
                userMessage
            );

            // Enhance extraction with context-aware field completion
            const enhancedExtraction = enhanceExtractionWithContext(
                extraction,
                contextAnalysis,
                currentMeetingData
            );

            return {
                ...enhancedExtraction,
                contextualConfidence,
                extractedFields: enhancedExtraction.fields,
                missingFields: enhancedExtraction.missing
            };

        } catch (parseError) {
            console.error('Failed to parse meeting extraction JSON:', content);
            // Return default "other" intent if parsing fails
            return {
                intent: 'other',
                confidence: 0,
                contextualConfidence: 0,
                fields: {
                    participants: []
                },
                missing: [],
                extractedFields: { participants: [] },
                missingFields: []
            } as MeetingExtraction & { contextualConfidence: number; extractedFields?: any; missingFields?: string[] };
        }
    } catch (error: any) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error.message || 'Unknown Gemini API error';

        // Log failed call
        logFailedCall('meeting_intent_extraction', inputTokens, responseTime, errorMessage, 'gemini-1.5-flash');

        console.error('Error extracting meeting intent:', error);
        throw handleGeminiError(error, 'meeting_intent_extraction');
    }
}

/**
 * Analyze conversation context for patterns and meeting-related information
 */
export function analyzeConversationContext(
    conversationContext: ConversationMessage[],
    currentMeetingData?: MeetingData
) {
    const recentMessages = conversationContext.slice(-10); // Last 10 messages

    // Count meeting-related keywords
    const meetingKeywords = [
        'meeting', 'schedule', 'calendar', 'appointment', 'book', 'plan',
        'when', 'time', 'date', 'tomorrow', 'next week', 'discuss', 'call'
    ];

    const keywordCount = recentMessages.reduce((count, msg) => {
        const content = msg.content.toLowerCase();
        return count + meetingKeywords.filter(keyword => content.includes(keyword)).length;
    }, 0);

    // Detect conversation mode based on recent patterns
    const hasSchedulingIntent = recentMessages.some(msg =>
        /\b(schedule|book|plan|create|set up)\b.*\b(meeting|call|appointment)\b/i.test(msg.content)
    );

    const hasTimeReferences = recentMessages.some(msg =>
        /\b(tomorrow|today|next week|monday|tuesday|wednesday|thursday|friday|am|pm|\d{1,2}:\d{2})\b/i.test(msg.content)
    );

    const hasParticipantReferences = recentMessages.some(msg =>
        /@\w+\.\w+|with \w+|invite \w+/i.test(msg.content)
    );

    // Extract previously mentioned information
    const extractedInfo = {
        participants: extractParticipantsFromContext(recentMessages),
        timeReferences: extractTimeReferencesFromContext(recentMessages),
        topics: extractTopicsFromContext(recentMessages)
    };

    return {
        keywordDensity: keywordCount / Math.max(recentMessages.length, 1),
        hasSchedulingIntent,
        hasTimeReferences,
        hasParticipantReferences,
        messageCount: recentMessages.length,
        extractedInfo,
        currentMeetingData
    };
}

/**
 * Build compressed context string optimized for token efficiency
 */
export function buildCompressedContext(
    conversationContext: ConversationMessage[],
    contextAnalysis: any
): string {
    const recentMessages = conversationContext.slice(-5); // Last 5 messages for context

    let contextString = '';

    // Add current meeting data if available
    if (contextAnalysis.currentMeetingData) {
        const meeting = contextAnalysis.currentMeetingData;
        contextString += `Current meeting draft: ${meeting.title || 'Untitled'}, `;
        if (meeting.startTime) contextString += `${meeting.startTime.toISOString()}, `;
        if (meeting.attendees?.length) contextString += `attendees: ${meeting.attendees.map((a: any) => a.email).join(', ')}\n`;
    }

    // Add compressed conversation history
    contextString += 'Recent conversation:\n';
    for (const msg of recentMessages) {
        const role = msg.role === 'user' ? 'U' : 'A';
        // Truncate long messages but preserve key information
        const content = msg.content.length > 80 ?
            msg.content.substring(0, 80) + '...' : msg.content;
        contextString += `${role}: ${content}\n`;
    }

    // Add extracted context information
    if (contextAnalysis.extractedInfo.participants.length > 0) {
        contextString += `Mentioned participants: ${contextAnalysis.extractedInfo.participants.join(', ')}\n`;
    }

    if (contextAnalysis.extractedInfo.timeReferences.length > 0) {
        contextString += `Time references: ${contextAnalysis.extractedInfo.timeReferences.join(', ')}\n`;
    }

    return contextString;
}

/**
 * Calculate contextual confidence based on conversation history
 */
export function calculateContextualConfidence(
    extraction: MeetingExtraction,
    contextAnalysis: any,
    userMessage: string
): number {
    let contextualConfidence = extraction.confidence;

    // Boost confidence if conversation has strong meeting context
    if (contextAnalysis.keywordDensity > 0.3) {
        contextualConfidence += 0.2;
    }

    // Boost confidence if scheduling intent was detected in recent messages
    if (contextAnalysis.hasSchedulingIntent) {
        contextualConfidence += 0.15;
    }

    // Boost confidence if current message builds on previous context
    if (contextAnalysis.hasTimeReferences && /\b(yes|ok|that works|sounds good)\b/i.test(userMessage)) {
        contextualConfidence += 0.1;
    }

    // Reduce confidence if message seems unrelated to ongoing meeting discussion
    if (contextAnalysis.messageCount > 3 && contextAnalysis.keywordDensity < 0.1 &&
        !/\b(meeting|schedule|calendar)\b/i.test(userMessage)) {
        contextualConfidence -= 0.2;
    }

    return Math.min(Math.max(contextualConfidence, 0), 1);
}

/**
 * Enhance extraction with context-aware field completion
 */
export function enhanceExtractionWithContext(
    extraction: MeetingExtraction,
    contextAnalysis: any,
    currentMeetingData?: MeetingData
): MeetingExtraction {
    const enhanced = { ...extraction };

    // Fill in missing participants from context
    if (enhanced.fields.participants.length === 0 && contextAnalysis.extractedInfo.participants.length > 0) {
        enhanced.fields.participants = contextAnalysis.extractedInfo.participants;
        enhanced.missing = enhanced.missing.filter(field => field !== 'participants');
    }

    // Use current meeting data to fill gaps
    if (currentMeetingData) {
        if (!enhanced.fields.suggestedTitle && currentMeetingData.title) {
            enhanced.fields.suggestedTitle = currentMeetingData.title;
        }

        if (!enhanced.fields.startTime && currentMeetingData.startTime) {
            enhanced.fields.startTime = currentMeetingData.startTime.toISOString();
            enhanced.missing = enhanced.missing.filter(field => field !== 'startTime');
        }

        if (!enhanced.fields.endTime && currentMeetingData.endTime) {
            enhanced.fields.endTime = currentMeetingData.endTime.toISOString();
            enhanced.missing = enhanced.missing.filter(field => field !== 'endTime');
        }
    }

    // Infer purpose from conversation topics
    if (!enhanced.fields.purpose && contextAnalysis.extractedInfo.topics.length > 0) {
        enhanced.fields.purpose = contextAnalysis.extractedInfo.topics[0];
    }

    return enhanced;
}

/**
 * Helper functions for context extraction
 */
export function extractParticipantsFromContext(messages: ConversationMessage[]): string[] {
    const participants: string[] = [];
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

    for (const msg of messages) {
        const emails = msg.content.match(emailRegex);
        if (emails) {
            participants.push(...emails);
        }
    }

    return Array.from(new Set(participants)); // Remove duplicates
}

export function extractTimeReferencesFromContext(messages: ConversationMessage[]): string[] {
    const timeReferences: string[] = [];
    const timeRegex = /\b(tomorrow|today|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}:\d{2}|\d{1,2}(am|pm)|am|pm)\b/gi;

    for (const msg of messages) {
        const times = msg.content.match(timeRegex);
        if (times) {
            timeReferences.push(...times);
        }
    }

    return Array.from(new Set(timeReferences.map(t => t.toLowerCase())));
}

export function extractTopicsFromContext(messages: ConversationMessage[]): string[] {
    const topics: string[] = [];
    const topicKeywords = ['discuss', 'about', 'regarding', 'review', 'plan', 'sync', 'update'];

    for (const msg of messages) {
        for (const keyword of topicKeywords) {
            const regex = new RegExp(`\\b${keyword}\\s+([\\w\\s]{3,20})`, 'gi');
            const matches = msg.content.match(regex);
            if (matches) {
                topics.push(...matches.map(m => m.replace(keyword, '').trim()));
            }
        }
    }

    return Array.from(new Set(topics)).slice(0, 3); // Return top 3 unique topics
}

/**
 * Generate meeting titles using Gemini
 */
export async function generateMeetingTitles(purpose: string, participants: string[], context: string = ''): Promise<TitleSuggestion> {
    // Apply the enhanced prompt with actual values
    const titlePrompt = MEETING_CREATION_PROMPTS.TITLE_GENERATION
        .replace('{purpose}', purpose)
        .replace('{participants}', participants.join(', '))
        .replace('{context}', context);

    const startTime = Date.now();
    const inputTokens = performanceMonitor.estimateTokenCount(titlePrompt);

    try {
        // Get model with specific configuration for title generation
        const model = getGeminiModel({
            temperature: 0.2,
            maxOutputTokens: 120
        });

        const result = await model.generateContent(titlePrompt);

        const response = await result.response;
        const content = response.text().trim();

        // Extract token usage from response metadata
        const usageMetadata = response.usageMetadata;
        const outputTokens = usageMetadata?.candidatesTokenCount || performanceMonitor.estimateTokenCount(content);
        const responseTime = Date.now() - startTime;

        // Log successful call with Gemini usage metadata
        logSuccessfulCall('meeting_title_generation', inputTokens, outputTokens, responseTime, usageMetadata, 'gemini-1.5-flash');

        try {
            const cleanedContent = cleanJsonResponse(content);
            return JSON.parse(cleanedContent) as TitleSuggestion;
        } catch (parseError) {
            console.error('Failed to parse title suggestions JSON:', content);
            // Return default suggestions if parsing fails
            return {
                suggestions: ["Team Meeting", "Discussion Session", "Project Sync"],
                context: "General meeting"
            } as TitleSuggestion;
        }
    } catch (error: any) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error.message || 'Unknown Gemini API error';

        // Log failed call
        logFailedCall('meeting_title_generation', inputTokens, responseTime, errorMessage, 'gemini-1.5-flash');

        console.error('Error generating meeting titles:', error);
        throw handleGeminiError(error, 'meeting_title_generation');
    }
}

/**
 * Verify attendees using Gemini
 */
export async function verifyAttendees(emails: string[]): Promise<Array<{ email: string, valid: boolean, trusted: boolean }>> {
    const verificationPrompt = MEETING_CREATION_PROMPTS.ATTENDEE_VERIFICATION
        .replace('{emails}', JSON.stringify(emails));

    const startTime = Date.now();
    const inputTokens = performanceMonitor.estimateTokenCount(verificationPrompt);

    try {
        // Get model with specific configuration for attendee verification
        const model = getGeminiModel({
            temperature: 0.0, // Deterministic validation
            maxOutputTokens: 200
        });

        const result = await model.generateContent(verificationPrompt);

        const response = await result.response;
        const content = response.text().trim();

        // Extract token usage from response metadata
        const usageMetadata = response.usageMetadata;
        const outputTokens = usageMetadata?.candidatesTokenCount || performanceMonitor.estimateTokenCount(content);
        const responseTime = Date.now() - startTime;

        // Log successful call with Gemini usage metadata
        logSuccessfulCall('attendee_verification', inputTokens, outputTokens, responseTime, usageMetadata, 'gemini-1.5-flash');

        try {
            const cleanedContent = cleanJsonResponse(content);
            return JSON.parse(cleanedContent);
        } catch (parseError) {
            console.error('Failed to parse attendee verification JSON:', content);
            // Return basic validation if parsing fails
            return emails.map(email => ({
                email,
                valid: MEETING_CREATION_RULES.EMAIL_VALIDATION.PATTERN.test(email),
                trusted: MEETING_CREATION_RULES.EMAIL_VALIDATION.TRUSTED_DOMAINS.some(domain =>
                    email.toLowerCase().endsWith('@' + domain))
            }));
        }
    } catch (error: any) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error.message || 'Unknown Gemini API error';

        // Log failed call
        logFailedCall('attendee_verification', inputTokens, responseTime, errorMessage, 'gemini-1.5-flash');

        console.error('Error verifying attendees:', error);
        // Fallback to basic validation
        return emails.map(email => ({
            email,
            valid: MEETING_CREATION_RULES.EMAIL_VALIDATION.PATTERN.test(email),
            trusted: MEETING_CREATION_RULES.EMAIL_VALIDATION.TRUSTED_DOMAINS.some(domain =>
                email.toLowerCase().endsWith('@' + domain))
        }));
    }
}

/**
 * Generate meeting agenda using Gemini
 */
export async function generateMeetingAgenda(title: string, purpose: string, participants: string[], duration: number, context: string = ''): Promise<string> {
    const agendaPrompt = MEETING_CREATION_PROMPTS.AGENDA_GENERATION
        .replace('{title}', title)
        .replace('{purpose}', purpose)
        .replace('{participants}', JSON.stringify(participants))
        .replace('{duration}', duration.toString())
        .replace('{context}', context);

    const startTime = Date.now();
    const inputTokens = performanceMonitor.estimateTokenCount(agendaPrompt);

    try {
        // Get model with specific configuration for agenda generation
        const model = getGeminiModel({
            temperature: 0.2,
            maxOutputTokens: 300
        });

        const result = await model.generateContent(agendaPrompt);

        const response = await result.response;
        const content = response.text().trim();

        // Extract token usage from response metadata
        const usageMetadata = response.usageMetadata;
        const outputTokens = usageMetadata?.candidatesTokenCount || performanceMonitor.estimateTokenCount(content);
        const responseTime = Date.now() - startTime;

        // Log successful call with Gemini usage metadata
        logSuccessfulCall('meeting_agenda_generation', inputTokens, outputTokens, responseTime, usageMetadata, 'gemini-1.5-flash');

        return content;
    } catch (error: any) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error.message || 'Unknown Gemini API error';

        // Log failed call
        logFailedCall('meeting_agenda_generation', inputTokens, responseTime, errorMessage, 'gemini-1.5-flash');

        console.error('Error generating meeting agenda:', error);
        throw handleGeminiError(error, 'meeting_agenda_generation');
    }
}

/**
 * Generate action items using Gemini
 */
export async function generateActionItems(title: string, purpose: string, participants: string[], topics: string[], context: string = ''): Promise<any[]> {
    const actionItemsPrompt = MEETING_CREATION_PROMPTS.ACTION_ITEMS_GENERATION
        .replace('{title}', title)
        .replace('{purpose}', purpose)
        .replace('{participants}', JSON.stringify(participants))
        .replace('{topics}', JSON.stringify(topics))
        .replace('{context}', context);

    const startTime = Date.now();
    const inputTokens = performanceMonitor.estimateTokenCount(actionItemsPrompt);

    try {
        // Get model with specific configuration for action items generation
        const model = getGeminiModel({
            temperature: 0.2,
            maxOutputTokens: 250
        });

        const result = await model.generateContent(actionItemsPrompt);

        const response = await result.response;
        const content = response.text().trim();

        // Extract token usage from response metadata
        const usageMetadata = response.usageMetadata;
        const outputTokens = usageMetadata?.candidatesTokenCount || performanceMonitor.estimateTokenCount(content);
        const responseTime = Date.now() - startTime;

        // Log successful call with Gemini usage metadata
        logSuccessfulCall('action_items_generation', inputTokens, outputTokens, responseTime, usageMetadata, 'gemini-1.5-flash');

        try {
            const cleanedContent = cleanJsonResponse(content);
            return JSON.parse(cleanedContent);
        } catch (parseError) {
            console.error('Failed to parse action items JSON:', content);
            return [];
        }
    } catch (error: any) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error.message || 'Unknown Gemini API error';

        // Log failed call
        logFailedCall('action_items_generation', inputTokens, responseTime, errorMessage, 'gemini-1.5-flash');

        console.error('Error generating action items:', error);
        return [];
    }
}

/**
 * Summarize conversation to reduce token usage
 */
export async function summarizeConversation(messages: ConversationMessage[]): Promise<string> {
    const messagesText = messages
        .slice(-10) // Last 10 messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

    const summaryPrompt = MEETING_CREATION_PROMPTS.CONVERSATION_SUMMARIZATION
        .replace('{messages}', messagesText);

    const startTime = Date.now();
    const inputTokens = performanceMonitor.estimateTokenCount(summaryPrompt);

    try {
        // Get model with specific configuration for conversation summarization
        const model = getGeminiModel({
            temperature: 0.1,
            maxOutputTokens: 120
        });

        const result = await model.generateContent(summaryPrompt);

        const response = await result.response;
        const content = response.text().trim();

        // Extract token usage from response metadata
        const usageMetadata = response.usageMetadata;
        const outputTokens = usageMetadata?.candidatesTokenCount || performanceMonitor.estimateTokenCount(content);
        const responseTime = Date.now() - startTime;

        // Log successful call with Gemini usage metadata
        logSuccessfulCall('conversation_summarization', inputTokens, outputTokens, responseTime, usageMetadata, 'gemini-1.5-flash');

        return content;
    } catch (error: any) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error.message || 'Unknown Gemini API error';

        // Log failed call
        logFailedCall('conversation_summarization', inputTokens, responseTime, errorMessage, 'gemini-1.5-flash');

        console.error('Error summarizing conversation:', error);
        return 'Recent conversation about meeting planning.';
    }
}

/**
 * Compress context to optimize token usage
 */
export async function compressContext(
    fullContext: string,
    meetingData?: MeetingData
): Promise<string> {
    const meetingDataString = meetingData ?
        `${meetingData.title || 'Untitled'} - ${meetingData.startTime || 'No time'} - ${meetingData.attendees?.map(a => a.email).join(', ') || 'No attendees'}` :
        'No current meeting';

    const compressionPrompt = MEETING_CREATION_PROMPTS.CONTEXT_COMPRESSION
        .replace('{fullContext}', fullContext)
        .replace('{meetingData}', meetingDataString);

    const startTime = Date.now();
    const inputTokens = performanceMonitor.estimateTokenCount(compressionPrompt);

    try {
        // Get model with specific configuration for context compression
        const model = getGeminiModel({
            temperature: 0.0,
            maxOutputTokens: 100
        });

        const result = await model.generateContent(compressionPrompt);

        const response = await result.response;
        const content = response.text().trim();

        // Extract token usage from response metadata
        const usageMetadata = response.usageMetadata;
        const outputTokens = usageMetadata?.candidatesTokenCount || performanceMonitor.estimateTokenCount(content);
        const responseTime = Date.now() - startTime;

        // Log successful call with Gemini usage metadata
        logSuccessfulCall('context_compression', inputTokens, outputTokens, responseTime, usageMetadata, 'gemini-1.5-flash');

        return content;
    } catch (error: any) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error.message || 'Unknown Gemini API error';

        // Log failed call
        logFailedCall('context_compression', inputTokens, responseTime, errorMessage, 'gemini-1.5-flash');

        console.error('Error compressing context:', error);
        return fullContext.substring(0, 200) + '...'; // Fallback to simple truncation
    }
}

/**
 * Analyze multi-turn intent using Gemini
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
    const conversationText = conversation
        .slice(-5) // Last 5 messages for context
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

    const intentPrompt = MEETING_CREATION_PROMPTS.MULTI_TURN_INTENT
        .replace('{conversation}', conversationText)
        .replace('{message}', currentMessage);

    const startTime = Date.now();
    const inputTokens = performanceMonitor.estimateTokenCount(intentPrompt);

    try {
        // Get model with specific configuration for multi-turn intent analysis
        const model = getGeminiModel({
            temperature: 0.0,
            maxOutputTokens: 100
        });

        const result = await model.generateContent(intentPrompt);

        const response = await result.response;
        const content = response.text().trim();

        // Extract token usage from response metadata
        const usageMetadata = response.usageMetadata;
        const outputTokens = usageMetadata?.candidatesTokenCount || performanceMonitor.estimateTokenCount(content);
        const responseTime = Date.now() - startTime;

        // Log successful call with Gemini usage metadata
        logSuccessfulCall('multi_turn_intent_analysis', inputTokens, outputTokens, responseTime, usageMetadata, 'gemini-1.5-flash');

        try {
            const cleanedContent = cleanJsonResponse(content);
            return JSON.parse(cleanedContent);
        } catch (parseError) {
            console.error('Failed to parse multi-turn intent JSON:', content);
            return {
                overallIntent: 'other',
                turnIntent: 'new_topic',
                confidence: 0,
                contextSupport: 0
            };
        }
    } catch (error: any) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error.message || 'Unknown Gemini API error';

        // Log failed call
        logFailedCall('multi_turn_intent_analysis', inputTokens, responseTime, errorMessage, 'gemini-1.5-flash');

        console.error('Error analyzing multi-turn intent:', error);
        return {
            overallIntent: 'other',
            turnIntent: 'new_topic',
            confidence: 0,
            contextSupport: 0
        };
    }
}

/**
 * Get contextual response with conversation history
 */
export async function getContextualResponse(conversationHistory: MistralMessage[], userInput: string): Promise<string> {
    const messages = [
        ...conversationHistory,
        { role: 'user' as const, content: userInput }
    ];

    try {
        return await getGeminiResponse(messages);
    } catch (error: any) {
        console.error('Error getting contextual response:', error);
        return "I'm having trouble processing that right now. Could you try rephrasing?";
    }
}