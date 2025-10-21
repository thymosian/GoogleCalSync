import { generateResponse, MistralMessage } from './mistralService.js';
import { ConversationContextEngine } from './conversationContext.js';

export interface ResponseContext {
    currentStep: string;
    meetingData: any;
    hasTitle: boolean;
    hasTime: boolean;
    hasAttendees: boolean;
    meetingType?: string;
    isOnline: boolean;
    attendeeCount: number;
    additionalContext?: any;
}

const RESPONSE_PROMPTS = {
    meeting_type_selection: `Generate a natural, engaging response asking the user to select a meeting type.
Context: Current step is {currentStep}
Make it conversational and helpful. If they already have some meeting details, reference them naturally.`,

    meeting_created: `Generate a celebratory, helpful response confirming successful meeting creation.
Meeting details: {meetingData}
Include relevant details like time, attendees, and next steps. Be warm and professional.`,

    error: `Generate a helpful error response that acknowledges the issue and offers clear next steps.
Error context: {additionalContext}
Current workflow state: {currentStep}
Be empathetic and solution-focused.`,

    fallback: `Generate a friendly fallback response when AI services are unavailable.
Context: {additionalContext}
Encourage the user to continue with manual input and assure them the process will work.`,

    time_collection: `Generate a natural request for meeting time/date information.
Context: They want to schedule a {meetingType} meeting
Existing info: {hasTitle, hasAttendees}
Make it conversational and specific to their needs.`,

    attendee_collection: `Generate a request for attendee information.
Meeting type: {meetingType} ({isOnline})
Existing attendees: {attendeeCount}
Be specific about requirements for {meetingType} meetings.`
};

export async function generateDynamicResponse(
    responseType: keyof typeof RESPONSE_PROMPTS,
    context: ResponseContext
): Promise<string> {
    try {
        const prompt = RESPONSE_PROMPTS[responseType];

        // Replace template variables with actual context
        let dynamicPrompt = prompt
            .replace('{currentStep}', context.currentStep)
            .replace('{meetingData}', JSON.stringify(context.meetingData, null, 2))
            .replace('{meetingType}', context.meetingType || 'meeting')
            .replace('{isOnline}', context.isOnline ? 'online' : 'in-person')
            .replace('{attendeeCount}', context.attendeeCount.toString())
            .replace('{hasTitle}', context.hasTitle ? 'has title' : 'no title yet')
            .replace('{hasAttendees}', context.hasAttendees ? 'has attendees' : 'no attendees yet')
            .replace('{additionalContext}', JSON.stringify(context.additionalContext, null, 2));

        // Add context-specific variations
        if (context.hasTitle && context.meetingData.title) {
            dynamicPrompt += `\nMeeting title: "${context.meetingData.title}"`;
        }

        if (context.hasTime && context.meetingData.startTime) {
            const startTime = new Date(context.meetingData.startTime).toLocaleString();
            dynamicPrompt += `\nPreferred time: ${startTime}`;
        }

        if (context.hasAttendees && context.attendeeCount > 0) {
            dynamicPrompt += `\nCurrent attendees: ${context.attendeeCount} people`;
        }

        // Add personality and context awareness
        dynamicPrompt += `\n\nGuidelines:
- Be conversational and natural
- Reference specific details when available
- Show progress and what's next
- Be encouraging and helpful
- Keep it under 2 sentences when possible
- If asking questions, be specific`;

        const messages: MistralMessage[] = [
            {
                role: 'system',
                content: 'You are CalAI, a helpful calendar assistant. Generate natural, context-aware responses that adapt to the user\'s progress and meeting details.'
            },
            {
                role: 'user',
                content: dynamicPrompt
            }
        ];

        const response = await generateResponse(messages);
        return response;
    } catch (error) {
        console.error('Error generating dynamic response:', error);

        // Fallback to context-aware hardcoded responses
        return generateFallbackResponse(responseType, context);
    }
}

function generateFallbackResponse(responseType: string, context: ResponseContext): string {
    const fallbacks = {
        meeting_type_selection: context.hasTitle
            ? `Great! Let's schedule "${context.meetingData.title}". First, should this be an online meeting or in-person?`
            : "I'd love to help you schedule a meeting! Should this be an online meeting with video calls, or an in-person meeting?",

        meeting_created: `Perfect! I've created your ${context.meetingType} meeting${context.meetingData.title ? ` "${context.meetingData.title}"` : ''} and sent invitations to everyone.`,

        error: "I encountered an issue, but don't worry! Let me help you get back on track with scheduling your meeting.",

        fallback: "I'm experiencing some technical difficulties, but I can still help you schedule your meeting manually. What type of meeting would you like to create?",

        time_collection: `Now let's find the perfect time for your ${context.meetingType} meeting${context.meetingData.title ? ` about ${context.meetingData.title}` : ''}. When works best for you?`,

        attendee_collection: `Who should attend this ${context.meetingType} meeting?${context.isOnline ? ' Online meetings need at least one participant.' : ' You can add as many people as needed.'}`
    };

    return fallbacks[responseType as keyof typeof fallbacks] || "How can I help you with your meeting?";
}