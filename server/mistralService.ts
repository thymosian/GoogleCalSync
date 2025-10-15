import { Mistral } from '@mistralai/mistralai';
import { performanceMonitor } from './performanceMonitor.js';
import { aiServiceErrorHandler } from './errorHandlers/aiServiceErrorHandler.js';

// Mistral configuration interface
export interface MistralConfig {
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    topP: number;
    baseUrl?: string;
}

// Mistral message format for API calls
export interface MistralMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

// Attendee verification result interface
export interface AttendeeVerification {
    email: string;
    valid: boolean;
    trusted: boolean;
}

// Load configuration from validated environment
import { getServiceConfig, isServiceAvailable } from './config/environmentConfig.js';

// Get validated Mistral configuration
const mistralConfig = isServiceAvailable('mistral') ? getServiceConfig('mistral') : null;

if (!mistralConfig) {
    console.warn('Mistral service is not properly configured. Service will not be available.');
}

const MISTRAL_API_KEY = mistralConfig?.apiKey || '';
const MISTRAL_MODEL = mistralConfig?.model || 'mistral-small-latest';
const MISTRAL_TEMPERATURE = mistralConfig?.temperature || 0.3;
const MISTRAL_MAX_TOKENS = (mistralConfig && 'maxTokens' in mistralConfig) ? mistralConfig.maxTokens : 1000;

// Initialize Mistral client
let mistralClient: Mistral | null = null;
if (MISTRAL_API_KEY) {
    mistralClient = new Mistral({
        apiKey: MISTRAL_API_KEY
    });
}

// Default configuration using validated environment config
const defaultConfig: MistralConfig = {
    apiKey: MISTRAL_API_KEY,
    model: MISTRAL_MODEL,
    temperature: MISTRAL_TEMPERATURE,
    maxTokens: MISTRAL_MAX_TOKENS,
    topP: 0.8,
    baseUrl: (mistralConfig && 'baseUrl' in mistralConfig) ? mistralConfig.baseUrl : undefined
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

/**
 * Check if Mistral service is available
 */
export function isMistralAvailable(): boolean {
    return mistralClient !== null && MISTRAL_API_KEY !== '';
}

/**
 * Get service health status
 */
export async function getServiceHealth(): Promise<{ available: boolean; model: string; lastCheck: Date }> {
    return {
        available: isMistralAvailable(),
        model: defaultConfig.model,
        lastCheck: new Date()
    };
}

/**
 * Basic error handling and logging setup
 */
function handleMistralError(error: any, operation: string): Error {
    console.error(`Mistral API error during ${operation}:`, error);

    // Log error details for monitoring
    if (error.status) {
        console.error(`Status: ${error.status}, Message: ${error.message}`);
    }

    // Use existing AI service error handler for consistent error handling
    const aiError = aiServiceErrorHandler.classifyError(error);
    return new Error(aiError.message);
}

/**
 * Log successful API calls for monitoring
 */
function logSuccessfulCall(
    operation: string,
    inputTokens: number,
    outputTokens: number,
    responseTime: number,
    model?: string
) {
    performanceMonitor.recordAPICall({
        service: 'mistral',
        operation,
        tokenCount: {
            input: inputTokens,
            output: outputTokens,
            total: inputTokens + outputTokens
        },
        responseTime,
        success: true,
        model
    });
}

/**
 * Log failed API calls for monitoring
 */
function logFailedCall(
    operation: string,
    inputTokens: number,
    responseTime: number,
    error: string,
    model?: string
) {
    performanceMonitor.recordAPICall({
        service: 'mistral',
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

/**
 * Core response generation function using Mistral
 */
export async function generateResponse(messages: MistralMessage[]): Promise<string> {
    if (!isMistralAvailable()) {
        throw new Error('Mistral service is not available. Please check MISTRAL_API_KEY configuration.');
    }

    const startTime = Date.now();
    const inputText = messages.map(m => m.content).join(' ');
    const inputTokens = performanceMonitor.estimateTokenCount(inputText);

    try {
        // Ensure we have a system message
        const messagesWithSystem = messages.some(m => m.role === 'system') 
            ? messages 
            : [{ role: 'system' as const, content: SYSTEM_PROMPT }, ...messages];

        const response = await mistralClient!.chat.complete({
            model: defaultConfig.model,
            messages: messagesWithSystem,
            temperature: defaultConfig.temperature,
            maxTokens: defaultConfig.maxTokens,
            topP: defaultConfig.topP
        });

        const rawContent = response.choices?.[0]?.message?.content || '';
        const content = typeof rawContent === 'string' ? rawContent.trim() : '';
        const outputTokens = performanceMonitor.estimateTokenCount(content);
        const responseTime = Date.now() - startTime;

        // Log successful call
        logSuccessfulCall('general_response', inputTokens, outputTokens, responseTime, defaultConfig.model);

        return content;
    } catch (error: any) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error.message || 'Unknown Mistral API error';

        // Log failed call
        logFailedCall('general_response', inputTokens, responseTime, errorMessage, defaultConfig.model);

        // Handle error using existing error handler
        throw handleMistralError(error, 'general_response');
    }
}

/**
 * Generate basic conversational response
 * Optimized for simple chat interactions
 */
export async function generateBasicResponse(prompt: string): Promise<string> {
    const messages: MistralMessage[] = [
        { role: 'user', content: prompt }
    ];

    return generateResponse(messages);
}

/**
 * Generate response using Mistral for general chat
 * Maintains compatibility with getGeminiResponse interface for routing
 */
export async function getGeminiResponse(messages: MistralMessage[]): Promise<string> {
    return generateResponse(messages);
}

/**
 * Verify attendees using Mistral for simple email validation
 * This is a simpler task suitable for Mistral's capabilities
 */
export async function verifyAttendees(emails: string[]): Promise<AttendeeVerification[]> {
    if (!isMistralAvailable()) {
        throw new Error('Mistral service is not available. Please check MISTRAL_API_KEY configuration.');
    }

    const verificationPrompt = `Analyze the following email addresses and determine if they are valid email formats and appear to be from trusted domains (common business domains, educational institutions, or well-known email providers).

Email addresses to verify: ${JSON.stringify(emails)}

Return a JSON array with this exact format:
[
  {
    "email": "example@domain.com",
    "valid": true,
    "trusted": true
  }
]

Rules:
- "valid": true if the email format is correct (contains @ and valid domain structure)
- "trusted": true if the domain appears to be from a business, educational, or well-known email provider
- Be conservative with trust assessment - only mark as trusted if clearly legitimate`;

    const startTime = Date.now();
    const inputTokens = performanceMonitor.estimateTokenCount(verificationPrompt);

    try {
        const messages: MistralMessage[] = [
            { role: 'system', content: 'You are an email validation assistant. Respond only with valid JSON.' },
            { role: 'user', content: verificationPrompt }
        ];

        const response = await mistralClient!.chat.complete({
            model: defaultConfig.model,
            messages: messages,
            temperature: 0.0, // Deterministic for validation
            maxTokens: 500,
            topP: 1.0 // Must be 1.0 when using greedy sampling (temperature: 0.0)
        });

        const rawContent = response.choices?.[0]?.message?.content || '';
        const content = typeof rawContent === 'string' ? rawContent.trim() : '';
        const outputTokens = performanceMonitor.estimateTokenCount(content);
        const responseTime = Date.now() - startTime;

        // Log successful call
        logSuccessfulCall('attendee_verification', inputTokens, outputTokens, responseTime, defaultConfig.model);

        try {
            return JSON.parse(content) as AttendeeVerification[];
        } catch (parseError) {
            console.error('Failed to parse attendee verification JSON:', content);
            // Return basic validation if parsing fails
            return emails.map(email => ({
                email,
                valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
                trusted: false // Conservative fallback
            }));
        }
    } catch (error: any) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error.message || 'Unknown Mistral API error';

        // Log failed call
        logFailedCall('attendee_verification', inputTokens, responseTime, errorMessage, defaultConfig.model);

        console.error('Error verifying attendees with Mistral:', error);
        throw handleMistralError(error, 'attendee_verification');
    }
}

/**
 * Get usage metrics for monitoring
 */
export function getUsageMetrics(): {
    service: string;
    model: string;
    available: boolean;
    configuration: Partial<MistralConfig>;
} {
    return {
        service: 'mistral',
        model: defaultConfig.model,
        available: isMistralAvailable(),
        configuration: {
            model: defaultConfig.model,
            temperature: defaultConfig.temperature,
            maxTokens: defaultConfig.maxTokens,
            topP: defaultConfig.topP
        }
    };
}

// Export configuration and helper functions for use by other modules
export { 
    defaultConfig, 
    handleMistralError, 
    logSuccessfulCall, 
    logFailedCall,
    SYSTEM_PROMPT
};