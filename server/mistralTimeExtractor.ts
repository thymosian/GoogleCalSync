/**
 * AI-powered time extraction using Mistral for natural language processing
 * This function is called by the AI router service
 */

/**
 * Extract time from natural language using Mistral AI
 */
export async function extractTimeFromNaturalLanguage(
    message: string,
    context: {
        currentDate: string;
        currentTime: string;
        timezone: string;
        conversationHistory?: string[];
        meetingContext?: any;
    }
): Promise<{
    startTime: string;
    endTime?: string;
    confidence: number;
    reasoning: string;
} | null> {
    try {
        // Create a prompt for Mistral
        const prompt = `
        Extract time information from the following message:
        "${message}"

        Current date: ${context.currentDate}
        Current time: ${context.currentTime}
        Timezone: ${context.timezone}

        Return the extracted time information in JSON format with the following structure:
        {
            "startTime": "ISO string",
            "endTime": "ISO string or null if not specified",
            "confidence": number between 0 and 1,
            "reasoning": "explanation of how the time was extracted"
        }

        Guidelines:
        - If no specific time is mentioned, use a reasonable default (like 2pm for business meetings)
        - If only start time is mentioned, assume 1 hour duration for end time
        - Consider the current date/time context when parsing relative expressions
        - Be precise with timezone handling
        `;

        // Call Mistral API
        const { generateResponse } = await import('./mistralService.js');
        const mistralMessages = [{ role: 'user' as const, content: prompt }];
        const response = await generateResponse(mistralMessages);

        // Parse the response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const extractedData = JSON.parse(jsonMatch[0]);
            return {
                startTime: extractedData.startTime,
                endTime: extractedData.endTime || undefined,
                confidence: extractedData.confidence,
                reasoning: extractedData.reasoning
            };
        }

        return null;
    } catch (error) {
        console.error('Error in Mistral time extraction:', error);
        return null;
    }
}
