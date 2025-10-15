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
        // This is a simplified implementation
        // In a real implementation, this would use Mistral API to parse natural language

        const text = message.toLowerCase();

        // Handle "tomorrow evening 8pm" style patterns
        if (text.includes('tomorrow')) {
            const tomorrow = new Date(context.currentDate);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Look for time patterns
            const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|evening|morning|afternoon)/i);

            if (timeMatch) {
                let hours = parseInt(timeMatch[1]);
                const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
                const period = timeMatch[3];

                // Convert to 24-hour format
                if (period === 'pm' && hours < 12) {
                    hours += 12;
                } else if (period === 'am' && hours === 12) {
                    hours = 0;
                } else if (period === 'evening' && hours < 12) {
                    hours += 12;
                }

                tomorrow.setHours(hours, minutes, 0, 0);

                return {
                    startTime: tomorrow.toISOString(),
                    endTime: new Date(tomorrow.getTime() + 60 * 60 * 1000).toISOString(), // 1 hour later
                    confidence: 0.9,
                    reasoning: `Parsed "tomorrow" with time ${hours}:${minutes.toString().padStart(2, '0')} ${period}`
                };
            } else {
                // Default to 2pm if no specific time mentioned
                tomorrow.setHours(14, 0, 0, 0);

                return {
                    startTime: tomorrow.toISOString(),
                    endTime: new Date(tomorrow.getTime() + 60 * 60 * 1000).toISOString(),
                    confidence: 0.7,
                    reasoning: 'Parsed "tomorrow" with default time 2pm'
                };
            }
        }

        // Handle "today" patterns
        if (text.includes('today')) {
            const today = new Date(context.currentDate);

            const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|evening|morning|afternoon)/i);

            if (timeMatch) {
                let hours = parseInt(timeMatch[1]);
                const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
                const period = timeMatch[3];

                if (period === 'pm' && hours < 12) {
                    hours += 12;
                } else if (period === 'am' && hours === 12) {
                    hours = 0;
                }

                today.setHours(hours, minutes, 0, 0);

                return {
                    startTime: today.toISOString(),
                    endTime: new Date(today.getTime() + 60 * 60 * 1000).toISOString(),
                    confidence: 0.9,
                    reasoning: `Parsed "today" with time ${hours}:${minutes.toString().padStart(2, '0')} ${period}`
                };
            }
        }

        // Handle specific date formats like "October 16 at 2pm"
        const dateMatch = text.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);

        if (dateMatch) {
            const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
            const month = months.indexOf(dateMatch[1].toLowerCase());
            const day = parseInt(dateMatch[2]);
            let hours = parseInt(dateMatch[3]);
            const minutes = dateMatch[4] ? parseInt(dateMatch[4]) : 0;
            const period = dateMatch[5];

            if (period === 'pm' && hours < 12) {
                hours += 12;
            } else if (period === 'am' && hours === 12) {
                hours = 0;
            }

            const year = new Date().getFullYear();
            const targetDate = new Date(year, month, day, hours, minutes, 0, 0);

            return {
                startTime: targetDate.toISOString(),
                endTime: new Date(targetDate.getTime() + 60 * 60 * 1000).toISOString(),
                confidence: 0.85,
                reasoning: `Parsed specific date ${dateMatch[1]} ${day} at ${hours}:${minutes.toString().padStart(2, '0')}`
            };
        }

        // Handle "next Monday" patterns
        const nextDayMatch = text.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
        if (nextDayMatch) {
            const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const targetDay = daysOfWeek.indexOf(nextDayMatch[1].toLowerCase());
            const currentDay = new Date(context.currentDate).getDay();

            let daysToAdd = targetDay - currentDay;
            if (daysToAdd <= 0) daysToAdd += 7;

            const nextDate = new Date(context.currentDate);
            nextDate.setDate(nextDate.getDate() + daysToAdd);

            // Look for time
            const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
            if (timeMatch) {
                let hours = parseInt(timeMatch[1]);
                const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
                const period = timeMatch[3];

                if (period === 'pm' && hours < 12) {
                    hours += 12;
                } else if (period === 'am' && hours === 12) {
                    hours = 0;
                }

                nextDate.setHours(hours, minutes, 0, 0);

                return {
                    startTime: nextDate.toISOString(),
                    endTime: new Date(nextDate.getTime() + 60 * 60 * 1000).toISOString(),
                    confidence: 0.85,
                    reasoning: `Parsed "next ${nextDayMatch[1]}" with time ${hours}:${minutes.toString().padStart(2, '0')}`
                };
            }
        }

        return null;

    } catch (error) {
        console.error('Error in Mistral time extraction:', error);
        return null;
    }
}
