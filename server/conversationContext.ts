import { db } from "./storage";
import { conversationContexts } from "../shared/schema";
import { conversationStorage, type ConversationSession } from "./conversationStorage";
import { performanceMonitor } from "./performanceMonitor";
import { summarizeConversation, compressContext } from "./aiInterface.js";
import type {
    ConversationMessage,
    MeetingData,
    ConversationContextData,
    MeetingFields,
    CalendarAccessStatus
} from "../shared/schema";
import { calendarAccessVerifier } from "./calendarAccessVerifier";

export type ConversationMode = 'casual' | 'scheduling' | 'approval';

export interface IntentAnalysis {
    intent: ConversationMode;
    confidence: number;
    extractedFields: MeetingFields;
    missingFields: string[];
}

export interface ContextCompressionResult {
    compressedContext: string;
    tokenCount: number;
    compressionRatio: number;
    compressionStrategy: 'simple' | 'ai_summarization' | 'hybrid';
    originalTokenCount: number;
    tokensSaved: number;
}

export interface ConversationSummary {
    summary: string;
    keyPoints: string[];
    meetingIntent: boolean;
    participantsMentioned: string[];
    timeReferencesMentioned: string[];
    compressionRatio: number;
}

/**
 * ConversationContextEngine manages multi-turn conversation state and context compression
 * for the conversational meeting scheduler. It handles mode transitions, context compression,
 * and meeting data accumulation across conversation turns.
 */
export class ConversationContextEngine {
    private userId: string;
    private conversationId: string | null = null;
    private contextData: ConversationContextData;
    private maxContextLength = 4000; // Maximum tokens for context
    private compressionThreshold = 0.7; // Compress when context exceeds 70% of max

    constructor(userId: string, conversationId?: string) {
        this.userId = userId;
        this.conversationId = conversationId || null;
        this.contextData = {
            messages: [],
            currentMode: 'casual',
            meetingData: undefined,
            compressionLevel: 0,
            calendarAccessStatus: undefined,
            availabilityChecked: false,
            timeCollectionComplete: false
        };
    }

    /**
     * Adds a new message to the conversation context and updates state
     */
    async addMessage(message: ConversationMessage): Promise<void> {
        // Ensure we have a conversation context
        if (!this.conversationId) {
            await this.createNewContext();
        }

        // Add message to context
        this.contextData.messages.push(message);

        // Store message in database
        await conversationStorage.storeChatMessage({
            userId: this.userId,
            conversationId: this.conversationId!,
            role: message.role,
            content: message.content,
            intent: message.metadata?.intent || null,
            confidence: message.metadata?.confidence ? message.metadata.confidence.toString() : null,
            extractedFields: message.metadata?.extractedFields || null
        });

        // Detect if mode transition is needed
        const modeTransition = this.detectModeTransition();
        if (modeTransition !== this.contextData.currentMode) {
            this.contextData.currentMode = modeTransition;
        }

        // Check if compression is needed
        const currentTokenCount = this.estimateTokenCount(this.contextData.messages);
        if (currentTokenCount > this.maxContextLength * this.compressionThreshold) {
            await this.compressContext();
        }

        // Persist the updated context
        await this.persistContext();
    }
    /**
     * Gets compressed context optimized for token usage with multiple strategies
     */
    async getCompressedContext(strategy: 'simple' | 'ai_summarization' | 'hybrid' = 'hybrid'): Promise<ContextCompressionResult> {
        const messages = this.contextData.messages;
        const originalTokenCount = this.estimateTokenCount(messages);

        let compressedContext = '';
        let compressionStrategy = strategy;

        // Choose strategy based on message count and token count
        if (strategy === 'hybrid') {
            if (messages.length <= 5 || originalTokenCount <= 500) {
                compressionStrategy = 'simple';
            } else if (originalTokenCount > 2000) {
                compressionStrategy = 'ai_summarization';
            } else {
                compressionStrategy = 'simple';
            }
        }

        if (compressionStrategy === 'ai_summarization' && messages.length > 5) {
            try {
                // Use AI summarization for long conversations
                const summary = await this.generateConversationSummary();
                compressedContext = this.buildContextFromSummary(summary);
            } catch (error) {
                console.warn('AI summarization failed, falling back to simple compression:', error);
                compressedContext = this.buildSimpleCompressedContext();
                compressionStrategy = 'simple';
            }
        } else {
            compressedContext = this.buildSimpleCompressedContext();
            compressionStrategy = 'simple';
        }

        const tokenCount = this.estimateTokenCount([{
            id: 'compressed',
            role: 'assistant',
            content: compressedContext,
            timestamp: new Date()
        }]);

        const compressionRatio = originalTokenCount > 0 ? tokenCount / originalTokenCount : 1;
        const tokensSaved = originalTokenCount - tokenCount;

        // Record performance metrics
        performanceMonitor.recordAPICall({
            service: 'gemini',
            operation: 'context_compression',
            tokenCount: {
                input: originalTokenCount,
                output: tokenCount,
                total: originalTokenCount
            },
            responseTime: 0, // Not applicable for this operation
            success: true,
            compressionRatio
        });

        return {
            compressedContext,
            tokenCount,
            compressionRatio,
            compressionStrategy,
            originalTokenCount,
            tokensSaved
        };
    }

    /**
     * Generates an AI-powered conversation summary
     */
    async generateConversationSummary(): Promise<ConversationSummary> {
        const messages = this.contextData.messages;
        
        if (messages.length === 0) {
            return {
                summary: 'No conversation history',
                keyPoints: [],
                meetingIntent: false,
                participantsMentioned: [],
                timeReferencesMentioned: [],
                compressionRatio: 1
            };
        }

        const startTime = Date.now();
        
        try {
            const summary = await summarizeConversation(messages);
            const responseTime = Date.now() - startTime;
            
            // Extract structured information from summary
            const keyPoints = this.extractKeyPointsFromSummary(summary);
            const meetingIntent = this.detectMeetingIntentInSummary(summary);
            const participantsMentioned = this.extractParticipantsFromMessages(messages);
            const timeReferencesMentioned = this.extractTimeReferencesFromMessages(messages);
            
            const originalTokenCount = this.estimateTokenCount(messages);
            const summaryTokenCount = this.estimateTokenCount([{
                id: 'summary',
                role: 'assistant',
                content: summary,
                timestamp: new Date()
            }]);
            
            const compressionRatio = originalTokenCount > 0 ? summaryTokenCount / originalTokenCount : 1;

            // Record performance metrics
            performanceMonitor.recordAPICall({
                service: 'gemini',
                operation: 'conversation_summarization',
                tokenCount: {
                    input: originalTokenCount,
                    output: summaryTokenCount,
                    total: originalTokenCount + summaryTokenCount
                },
                responseTime,
                success: true,
                compressionRatio
            });

            return {
                summary,
                keyPoints,
                meetingIntent,
                participantsMentioned,
                timeReferencesMentioned,
                compressionRatio
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            // Record failed attempt
            performanceMonitor.recordAPICall({
                service: 'gemini',
                operation: 'conversation_summarization',
                tokenCount: {
                    input: this.estimateTokenCount(messages),
                    output: 0,
                    total: this.estimateTokenCount(messages)
                },
                responseTime,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });

            throw error;
        }
    }

    /**
     * Builds simple compressed context without AI
     */
    private buildSimpleCompressedContext(): string {
        const messages = this.contextData.messages;
        const recentMessages = messages.slice(-8); // Keep last 8 messages
        
        let compressedContext = '';

        // Add current mode and meeting data summary
        compressedContext += `Mode: ${this.contextData.currentMode}\n`;

        if (this.contextData.meetingData) {
            const meeting = this.contextData.meetingData;
            compressedContext += `Meeting: ${meeting.title || 'Untitled'}`;
            if (meeting.startTime) compressedContext += ` at ${meeting.startTime.toISOString()}`;
            if (meeting.attendees?.length) compressedContext += ` with ${meeting.attendees.length} attendees`;
            compressedContext += '\n';
        }

        // Add recent messages in compressed format
        compressedContext += 'Recent:\n';
        for (const msg of recentMessages) {
            const role = msg.role === 'user' ? 'U' : 'A';
            // More aggressive truncation for simple compression
            const content = msg.content.length > 80 ?
                msg.content.substring(0, 80) + '...' : msg.content;
            compressedContext += `${role}: ${content}\n`;
        }

        return compressedContext;
    }

    /**
     * Builds context from AI-generated summary
     */
    private buildContextFromSummary(summary: ConversationSummary): string {
        let compressedContext = '';

        // Add current mode and meeting data
        compressedContext += `Mode: ${this.contextData.currentMode}\n`;

        if (this.contextData.meetingData) {
            const meeting = this.contextData.meetingData;
            compressedContext += `Meeting: ${meeting.title || 'Untitled'}`;
            if (meeting.startTime) compressedContext += ` at ${meeting.startTime.toISOString()}`;
            if (meeting.attendees?.length) compressedContext += ` with ${meeting.attendees.length} attendees`;
            compressedContext += '\n';
        }

        // Add AI-generated summary
        compressedContext += `Summary: ${summary.summary}\n`;

        // Add key points if available
        if (summary.keyPoints.length > 0) {
            compressedContext += `Key points: ${summary.keyPoints.join(', ')}\n`;
        }

        // Add participants if mentioned
        if (summary.participantsMentioned.length > 0) {
            compressedContext += `Participants: ${summary.participantsMentioned.join(', ')}\n`;
        }

        // Add time references if mentioned
        if (summary.timeReferencesMentioned.length > 0) {
            compressedContext += `Times: ${summary.timeReferencesMentioned.join(', ')}\n`;
        }

        // Add last 2 messages for immediate context
        const lastMessages = this.contextData.messages.slice(-2);
        if (lastMessages.length > 0) {
            compressedContext += 'Last exchange:\n';
            for (const msg of lastMessages) {
                const role = msg.role === 'user' ? 'U' : 'A';
                const content = msg.content.length > 60 ?
                    msg.content.substring(0, 60) + '...' : msg.content;
                compressedContext += `${role}: ${content}\n`;
            }
        }

        return compressedContext;
    }

    /**
     * Extracts key points from AI summary
     */
    private extractKeyPointsFromSummary(summary: string): string[] {
        const keyPoints: string[] = [];
        
        // Look for bullet points or numbered lists
        const bulletRegex = /[•\-\*]\s*([^\n]+)/g;
        const numberedRegex = /\d+\.\s*([^\n]+)/g;
        
        let match;
        while ((match = bulletRegex.exec(summary)) !== null) {
            keyPoints.push(match[1].trim());
        }
        
        while ((match = numberedRegex.exec(summary)) !== null) {
            keyPoints.push(match[1].trim());
        }
        
        return keyPoints.slice(0, 5); // Limit to 5 key points
    }

    /**
     * Detects meeting intent in summary
     */
    private detectMeetingIntentInSummary(summary: string): boolean {
        const meetingKeywords = [
            'meeting', 'schedule', 'calendar', 'appointment', 'book', 'plan',
            'discuss', 'call', 'zoom', 'teams', 'conference'
        ];
        
        const summaryLower = summary.toLowerCase();
        return meetingKeywords.some(keyword => summaryLower.includes(keyword));
    }

    /**
     * Extracts participants from messages
     */
    private extractParticipantsFromMessages(messages: ConversationMessage[]): string[] {
        const participants: string[] = [];
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        
        for (const msg of messages) {
            const emails = msg.content.match(emailRegex);
            if (emails) {
                participants.push(...emails);
            }
        }
        
        return Array.from(new Set(participants)).slice(0, 10); // Limit and deduplicate
    }

    /**
     * Extracts time references from messages
     */
    private extractTimeReferencesFromMessages(messages: ConversationMessage[]): string[] {
        const timeReferences: string[] = [];
        const timeRegex = /\b(tomorrow|today|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}:\d{2}|\d{1,2}(am|pm))\b/gi;
        
        for (const msg of messages) {
            const times = msg.content.match(timeRegex);
            if (times) {
                timeReferences.push(...times);
            }
        }
        
        return Array.from(new Set(timeReferences.map(t => t.toLowerCase()))).slice(0, 5);
    }

    /**
     * Detects conversation mode transitions based on message content and context
     */
    detectModeTransition(): ConversationMode {
        const recentMessages = this.contextData.messages.slice(-5);
        const lastMessage = recentMessages[recentMessages.length - 1];

        if (!lastMessage) return 'casual';

        const content = lastMessage.content.toLowerCase();

        // Keywords that indicate scheduling intent
        const schedulingKeywords = [
            'meeting', 'schedule', 'calendar', 'appointment', 'book', 'plan',
            'when', 'time', 'date', 'tomorrow', 'next week', 'monday', 'tuesday',
            'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'am', 'pm',
            'o\'clock', 'hour', 'minute', 'discuss', 'call', 'zoom', 'teams'
        ];

        // Keywords that indicate approval/confirmation
        const approvalKeywords = [
            'approve', 'confirm', 'yes', 'looks good', 'correct', 'create',
            'book it', 'schedule it', 'send', 'finalize', 'proceed'
        ];

        // Check for approval intent first (higher priority)
        if (this.contextData.currentMode === 'scheduling') {
            const hasApprovalKeywords = approvalKeywords.some(keyword =>
                content.includes(keyword)
            );
            if (hasApprovalKeywords) {
                return 'approval';
            }
        }

        // Check for scheduling intent
        const hasSchedulingKeywords = schedulingKeywords.some(keyword =>
            content.includes(keyword)
        );

        if (hasSchedulingKeywords) {
            return 'scheduling';
        }

        // Check if we have meeting data but no recent scheduling keywords
        if (this.contextData.meetingData && this.contextData.currentMode === 'scheduling') {
            // Stay in scheduling mode if we have partial meeting data
            const hasRequiredFields = this.contextData.meetingData.title ||
                this.contextData.meetingData.startTime ||
                this.contextData.meetingData.type;
            if (hasRequiredFields) {
                return 'scheduling';
            }
        }

        // Default to casual if no scheduling intent detected
        return 'casual';
    }  /**
 
  * Updates meeting data in the conversation context
   */
    updateMeetingData(data: Partial<MeetingData>): void {
        if (!this.contextData.meetingData) {
            this.contextData.meetingData = {
                status: 'draft',
                attendees: []
            };
        }

        // Merge the new data with existing meeting data
        this.contextData.meetingData = {
            ...this.contextData.meetingData,
            ...data
        };

        // Auto-detect if time collection is complete
        this.updateTimeCollectionStatus();

        // Clear availability result if time changed
        if (data.startTime || data.endTime) {
            this.clearAvailabilityResult();
        }
    }

    /**
     * Updates time collection status based on meeting data
     */
    private updateTimeCollectionStatus(): void {
        if (this.contextData.meetingData?.startTime && this.contextData.meetingData?.endTime) {
            this.setTimeCollectionComplete(true);
        } else if (this.contextData.meetingData?.startTime && this.contextData.meetingData?.type) {
            // If we have start time and meeting type, we can infer end time
            this.setTimeCollectionComplete(true);
        } else {
            this.setTimeCollectionComplete(false);
        }
    }

    /**
     * Updates calendar access status in the conversation context
     */
    updateCalendarAccessStatus(status: CalendarAccessStatus): void {
        this.contextData.calendarAccessStatus = status;
    }

    /**
     * Gets the current calendar access status
     */
    getCalendarAccessStatus(): CalendarAccessStatus | undefined {
        return this.contextData.calendarAccessStatus;
    }

    /**
     * Verifies and updates calendar access status for the user
     */
    async verifyAndUpdateCalendarAccess(user: any): Promise<CalendarAccessStatus> {
        try {
            const status = await calendarAccessVerifier.verifyAccess(user);
            this.updateCalendarAccessStatus(status);
            await this.persistContext();
            return status;
        } catch (error) {
            console.error('Error verifying calendar access:', error);
            const errorStatus: CalendarAccessStatus = {
                hasAccess: false,
                tokenValid: false,
                needsRefresh: false,
                scopes: [],
                error: error instanceof Error ? error.message : 'Unknown error'
            };
            this.updateCalendarAccessStatus(errorStatus);
            return errorStatus;
        }
    }

    /**
     * Marks availability as checked
     */
    setAvailabilityChecked(checked: boolean): void {
        this.contextData.availabilityChecked = checked;
    }

    /**
     * Gets availability checked status
     */
    isAvailabilityChecked(): boolean {
        return this.contextData.availabilityChecked;
    }

    /**
     * Marks time collection as complete
     */
    setTimeCollectionComplete(complete: boolean): void {
        this.contextData.timeCollectionComplete = complete;
    }

    /**
     * Gets time collection completion status
     */
    isTimeCollectionComplete(): boolean {
        return this.contextData.timeCollectionComplete;
    }

    /**
     * Stores availability check results in conversation context
     */
    storeAvailabilityResult(result: any): void {
        if (!this.contextData.meetingData) {
            this.contextData.meetingData = {
                status: 'draft',
                attendees: []
            };
        }
        
        // Store availability result in meeting data metadata
        (this.contextData.meetingData as any).availabilityResult = result;
        this.setAvailabilityChecked(true);
    }

    /**
     * Gets stored availability check results
     */
    getAvailabilityResult(): any {
        if (!this.contextData.meetingData) {
            return null;
        }
        return (this.contextData.meetingData as any).availabilityResult || null;
    }

    /**
     * Clears availability check results (useful when time changes)
     */
    clearAvailabilityResult(): void {
        if (this.contextData.meetingData) {
            delete (this.contextData.meetingData as any).availabilityResult;
        }
        this.setAvailabilityChecked(false);
    }

    /**
     * Checks if attendee collection should be allowed based on workflow state
     */
    canCollectAttendees(): boolean {
        // Attendee collection requires time to be collected first
        return this.isTimeCollectionComplete();
    }

    /**
     * Validates workflow step sequence
     */
    validateWorkflowStep(requestedStep: string): { isValid: boolean; reason?: string } {
        switch (requestedStep) {
            case 'attendee_collection':
                if (!this.isTimeCollectionComplete()) {
                    return {
                        isValid: false,
                        reason: 'Time collection must be completed before attendee collection'
                    };
                }
                break;
            case 'availability_check':
                if (!this.isTimeCollectionComplete()) {
                    return {
                        isValid: false,
                        reason: 'Time must be collected before checking availability'
                    };
                }
                break;
            case 'meeting_creation':
                if (!this.isTimeCollectionComplete()) {
                    return {
                        isValid: false,
                        reason: 'Time collection must be completed before creating meeting'
                    };
                }
                break;
        }
        return { isValid: true };
    }

    /**
     * Gets workflow state summary for prompt context
     */
    getWorkflowState(): {
        calendarAccessStatus: CalendarAccessStatus | undefined;
        timeCollectionComplete: boolean;
        availabilityChecked: boolean;
        canCollectAttendees: boolean;
        nextRequiredStep: string;
    } {
        let nextRequiredStep = 'calendar_verification';
        
        if (this.contextData.calendarAccessStatus?.hasAccess) {
            if (!this.isTimeCollectionComplete()) {
                nextRequiredStep = 'time_collection';
            } else if (!this.isAvailabilityChecked()) {
                nextRequiredStep = 'availability_check';
            } else {
                nextRequiredStep = 'attendee_collection';
            }
        }

        return {
            calendarAccessStatus: this.contextData.calendarAccessStatus,
            timeCollectionComplete: this.isTimeCollectionComplete(),
            availabilityChecked: this.isAvailabilityChecked(),
            canCollectAttendees: this.canCollectAttendees(),
            nextRequiredStep
        };
    }

    /**
     * Handles calendar access authentication failures
     */
    async handleCalendarAccessFailure(user: any, error: any): Promise<void> {
        console.error('Calendar access failure:', error);
        
        const errorStatus: CalendarAccessStatus = {
            hasAccess: false,
            tokenValid: false,
            needsRefresh: false,
            scopes: [],
            error: error.message || 'Calendar access failed'
        };

        // Check if this is a token refresh scenario
        if (error.code === 401 && user.refreshToken) {
            errorStatus.needsRefresh = true;
            errorStatus.error = 'Access token expired, refresh needed';
        }

        this.updateCalendarAccessStatus(errorStatus);
        await this.persistContext();
    }

    /**
     * Gets the current conversation context data
     */
    getContextData(): ConversationContextData {
        return { ...this.contextData };
    }

    /**
     * Gets the conversation messages
     */
    getMessages(): ConversationMessage[] {
        return this.contextData.messages;
    }

    /**
     * Gets the current conversation mode
     */
    getCurrentMode(): ConversationMode {
        return this.contextData.currentMode;
    }

    /**
     * Gets the current meeting data
     */
    getMeetingData(): MeetingData | undefined {
        return this.contextData.meetingData;
    }

    /**
     * Gets the conversation ID
     */
    getConversationId(): string | null {
        return this.conversationId;
    }

    /**
     * Resets the conversation context (for testing or new conversations)
     */
    reset(): void {
        this.contextData = {
            messages: [],
            currentMode: 'casual',
            meetingData: undefined,
            compressionLevel: 0,
            calendarAccessStatus: undefined,
            availabilityChecked: false,
            timeCollectionComplete: false
        };
        this.conversationId = null;
    }

    /**
     * Sets the conversation mode manually (useful for testing)
     */
    setMode(mode: ConversationMode): void {
        this.contextData.currentMode = mode;
    }

    /**
     * Gets conversation statistics
     */
    getStats(): {
        messageCount: number;
        tokenCount: number;
        compressionLevel: number;
        currentMode: ConversationMode;
        hasMeetingData: boolean;
    } {
        return {
            messageCount: this.contextData.messages.length,
            tokenCount: this.estimateTokenCount(this.contextData.messages),
            compressionLevel: this.contextData.compressionLevel,
            currentMode: this.contextData.currentMode,
            hasMeetingData: !!this.contextData.meetingData
        };
    }

    /**
     * Loads conversation context from database using enhanced storage
     */
    async loadContext(conversationId?: string): Promise<void> {
        const targetId = conversationId || this.conversationId;

        if (!targetId) {
            // Create new conversation context using session management
            const session = await conversationStorage.getOrCreateSession(this.userId);
            this.conversationId = session.id;
            this.contextData = {
                messages: [],
                currentMode: session.currentMode,
                meetingData: undefined,
                compressionLevel: session.compressionLevel,
                calendarAccessStatus: undefined,
                availabilityChecked: false,
                timeCollectionComplete: false
            };
            return;
        }

        try {
            const context = await conversationStorage.getConversationContext(targetId);

            if (!context) {
                // Create new session if context not found
                const session = await conversationStorage.getOrCreateSession(this.userId);
                this.conversationId = session.id;
                this.contextData = {
                    messages: [],
                    currentMode: session.currentMode,
                    meetingData: undefined,
                    compressionLevel: session.compressionLevel,
                    calendarAccessStatus: undefined,
                    availabilityChecked: false,
                    timeCollectionComplete: false
                };
                return;
            }

            this.conversationId = context.id;
            this.contextData = {
                messages: [],
                currentMode: (context.currentMode as ConversationMode) || 'casual',
                meetingData: context.meetingData as MeetingData || undefined,
                compressionLevel: context.compressionLevel || 0,
                calendarAccessStatus: undefined,
                availabilityChecked: false,
                timeCollectionComplete: false
            };

            // Load recent messages using enhanced storage
            this.contextData.messages = await conversationStorage.getRecentMessages(targetId, 20);

        } catch (error) {
            console.error('Error loading conversation context:', error);
            // Fallback to creating new session
            const session = await conversationStorage.getOrCreateSession(this.userId);
            this.conversationId = session.id;
            this.contextData = {
                messages: [],
                currentMode: session.currentMode,
                meetingData: undefined,
                compressionLevel: session.compressionLevel,
                calendarAccessStatus: undefined,
                availabilityChecked: false,
                timeCollectionComplete: false
            };
        }
    }

    /**
     * Retrieves conversation context by ID with full message history
     */
    async retrieveContext(conversationId: string, messageLimit: number = 50): Promise<ConversationContextData | null> {
        try {
            const context = await conversationStorage.getConversationContext(conversationId);
            if (!context) {
                return null;
            }

            const messages = await conversationStorage.getRecentMessages(conversationId, messageLimit);

            return {
                messages,
                currentMode: (context.currentMode as ConversationMode) || 'casual',
                meetingData: context.meetingData as MeetingData || undefined,
                compressionLevel: context.compressionLevel || 0,
                calendarAccessStatus: undefined,
                availabilityChecked: false,
                timeCollectionComplete: false
            };
        } catch (error) {
            console.error('Error retrieving conversation context:', error);
            return null;
        }
    }

    /**
     * Retrieves multiple conversation contexts for a user
     */
    async retrieveUserContexts(limit: number = 10): Promise<Array<{
        id: string;
        contextData: ConversationContextData;
        lastActivity: Date;
        messageCount: number;
    }>> {
        try {
            const contexts = await conversationStorage.getUserConversationContexts(this.userId, limit);
            const results = [];

            for (const context of contexts) {
                const messages = await conversationStorage.getRecentMessages(context.id, 10);
                const messageCount = await conversationStorage.getMessageCount(context.id);

                results.push({
                    id: context.id,
                    contextData: {
                        messages,
                        currentMode: (context.currentMode as ConversationMode) || 'casual',
                        meetingData: context.meetingData as MeetingData || undefined,
                        compressionLevel: context.compressionLevel || 0,
                        calendarAccessStatus: undefined,
                        availabilityChecked: false,
                        timeCollectionComplete: false
                    },
                    lastActivity: context.updatedAt || new Date(),
                    messageCount
                });
            }

            return results;
        } catch (error) {
            console.error('Error retrieving user contexts:', error);
            return [];
        }
    }

    /**
     * Creates a new conversation context using enhanced storage
     */
    private async createNewContext(): Promise<void> {
        try {
            const [newContext] = await db
                .insert(conversationContexts)
                .values({
                    userId: this.userId,
                    currentMode: 'casual',
                    meetingData: null,
                    compressionLevel: 0
                })
                .returning();

            this.conversationId = newContext.id;
            this.contextData = {
                messages: [],
                currentMode: 'casual',
                meetingData: undefined,
                compressionLevel: 0,
                calendarAccessStatus: undefined,
                availabilityChecked: false,
                timeCollectionComplete: false
            };
        } catch (error) {
            console.error('Error creating new conversation context:', error);
            throw error;
        }
    }

    /**
     * Persists the current context using enhanced storage
     */
    private async persistContext(): Promise<void> {
        if (!this.conversationId) {
            await this.createNewContext();
        }

        try {
            await conversationStorage.updateConversationContext(this.conversationId!, {
                currentMode: this.contextData.currentMode,
                meetingData: this.contextData.meetingData,
                compressionLevel: this.contextData.compressionLevel
            });
        } catch (error) {
            console.error('Error persisting conversation context:', error);
            throw error;
        }
    }

    /**
     * Compresses conversation context using enhanced storage with multiple strategies
     */
    private async compressContext(): Promise<void> {
        if (!this.conversationId) {
            return;
        }

        const messages = this.contextData.messages;

        if (messages.length <= 10) {
            return; // No need to compress if we have few messages
        }

        const startTime = Date.now();
        const originalTokenCount = this.estimateTokenCount(messages);

        try {
            // Determine compression strategy based on current compression level and token count
            const compressionLevel = this.contextData.compressionLevel;
            let keepRecentCount: number;
            let keepInitialCount: number;

            if (originalTokenCount > 3000) {
                // Aggressive compression for high token usage
                keepRecentCount = Math.max(4, Math.floor(messages.length * 0.2));
                keepInitialCount = 1;
            } else if (compressionLevel === 0) {
                // First compression: moderate reduction
                keepRecentCount = Math.max(6, Math.floor(messages.length * 0.4));
                keepInitialCount = 2;
            } else if (compressionLevel === 1) {
                // Second compression: more aggressive
                keepRecentCount = Math.max(5, Math.floor(messages.length * 0.3));
                keepInitialCount = 1;
            } else {
                // Subsequent compressions: very aggressive
                keepRecentCount = Math.max(4, Math.floor(messages.length * 0.25));
                keepInitialCount = 1;
            }

            // Perform database compression
            await conversationStorage.compressConversationContext(
                this.conversationId,
                keepRecentCount,
                keepInitialCount
            );

            // Reload messages after compression
            this.contextData.messages = await conversationStorage.getRecentMessages(this.conversationId, 20);
            this.contextData.compressionLevel += 1;

            const newTokenCount = this.estimateTokenCount(this.contextData.messages);
            const compressionRatio = originalTokenCount > 0 ? newTokenCount / originalTokenCount : 1;
            const responseTime = Date.now() - startTime;

            // Record compression performance
            performanceMonitor.recordAPICall({
                service: 'gemini',
                operation: 'database_compression',
                tokenCount: {
                    input: originalTokenCount,
                    output: newTokenCount,
                    total: originalTokenCount
                },
                responseTime,
                success: true,
                compressionRatio
            });

            console.log(`Context compressed: ${originalTokenCount} → ${newTokenCount} tokens (${Math.round((1 - compressionRatio) * 100)}% reduction)`);

        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            performanceMonitor.recordAPICall({
                service: 'gemini',
                operation: 'database_compression',
                tokenCount: {
                    input: originalTokenCount,
                    output: 0,
                    total: originalTokenCount
                },
                responseTime,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });

            console.error('Context compression failed:', error);
            throw error;
        }
    }

    /**
     * Manually triggers context compression with custom parameters
     */
    async manualCompression(keepRecentCount: number = 8, keepInitialCount: number = 2): Promise<void> {
        if (!this.conversationId) {
            throw new Error('No active conversation context to compress');
        }

        await conversationStorage.compressConversationContext(
            this.conversationId,
            keepRecentCount,
            keepInitialCount
        );

        // Reload messages after compression
        this.contextData.messages = await conversationStorage.getRecentMessages(this.conversationId, 20);
        this.contextData.compressionLevel += 1;

        // Persist the updated compression level
        await this.persistContext();
    }

    /**
     * Gets compression recommendations based on current context
     */
    getCompressionRecommendation(): {
        shouldCompress: boolean;
        reason: string;
        recommendedStrategy: {
            keepRecentCount: number;
            keepInitialCount: number;
        };
    } {
        const tokenCount = this.estimateTokenCount(this.contextData.messages);
        const messageCount = this.contextData.messages.length;
        const compressionLevel = this.contextData.compressionLevel;

        if (tokenCount > this.maxContextLength * this.compressionThreshold) {
            return {
                shouldCompress: true,
                reason: `Token count (${tokenCount}) exceeds threshold (${Math.floor(this.maxContextLength * this.compressionThreshold)})`,
                recommendedStrategy: {
                    keepRecentCount: Math.max(5, Math.floor(messageCount * 0.3)),
                    keepInitialCount: compressionLevel === 0 ? 2 : 1
                }
            };
        }

        if (messageCount > 30) {
            return {
                shouldCompress: true,
                reason: `Message count (${messageCount}) is high, compression recommended for performance`,
                recommendedStrategy: {
                    keepRecentCount: 10,
                    keepInitialCount: compressionLevel === 0 ? 2 : 1
                }
            };
        }

        return {
            shouldCompress: false,
            reason: 'Context size is within acceptable limits',
            recommendedStrategy: {
                keepRecentCount: 8,
                keepInitialCount: 2
            }
        };
    }



    /**
     * Estimates token count for messages (rough approximation)
     */
    private estimateTokenCount(messages: ConversationMessage[]): number {
        const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
        // Rough approximation: 1 token ≈ 4 characters
        return Math.ceil(totalChars / 4);
    }

    /**
     * Gets the current session information
     */
    async getSession(): Promise<ConversationSession | null> {
        if (!this.conversationId) {
            return null;
        }

        return await conversationStorage.getActiveSession(this.userId);
    }

    /**
     * Gets user conversation statistics
     */
    async getUserStats(): Promise<{
        totalContexts: number;
        activeContexts: number;
        totalMessages: number;
        averageMessagesPerContext: number;
        compressionEvents: number;
    }> {
        return await conversationStorage.getUserConversationStats(this.userId);
    }

    /**
     * Session Management: Creates a new conversation session
     */
    async createNewSession(): Promise<ConversationSession> {
        const session = await conversationStorage.getOrCreateSession(this.userId);
        this.conversationId = session.id;
        this.contextData = {
            messages: [],
            currentMode: session.currentMode,
            meetingData: undefined,
            compressionLevel: session.compressionLevel,
            calendarAccessStatus: undefined,
            availabilityChecked: false,
            timeCollectionComplete: false
        };
        return session;
    }

    /**
     * Session Management: Resumes an existing session or creates new one
     */
    async resumeOrCreateSession(): Promise<ConversationSession> {
        const activeSession = await conversationStorage.getActiveSession(this.userId);
        
        if (activeSession) {
            await this.loadContext(activeSession.id);
            return activeSession;
        }

        return await this.createNewSession();
    }

    /**
     * Session Management: Ends the current session
     */
    async endSession(): Promise<void> {
        if (this.conversationId) {
            // Persist final state
            await this.persistContext();
            
            // Clear local context
            this.contextData = {
                messages: [],
                currentMode: 'casual',
                meetingData: undefined,
                compressionLevel: 0,
                calendarAccessStatus: undefined,
                availabilityChecked: false,
                timeCollectionComplete: false
            };
            this.conversationId = null;
        }
    }

    /**
     * Advanced persistence: Saves context with custom options
     */
    async saveContext(options: {
        compressIfNeeded?: boolean;
        forceCompression?: boolean;
        compressionStrategy?: {
            keepRecentCount: number;
            keepInitialCount: number;
        };
    } = {}): Promise<void> {
        if (!this.conversationId) {
            await this.createNewContext();
        }

        // Apply compression if requested
        if (options.forceCompression && this.conversationId) {
            const strategy = options.compressionStrategy || { keepRecentCount: 8, keepInitialCount: 2 };
            await conversationStorage.compressConversationContext(
                this.conversationId,
                strategy.keepRecentCount,
                strategy.keepInitialCount
            );
            this.contextData.compressionLevel += 1;
        } else if (options.compressIfNeeded) {
            const recommendation = this.getCompressionRecommendation();
            if (recommendation.shouldCompress && this.conversationId) {
                await conversationStorage.compressConversationContext(
                    this.conversationId,
                    recommendation.recommendedStrategy.keepRecentCount,
                    recommendation.recommendedStrategy.keepInitialCount
                );
                this.contextData.compressionLevel += 1;
            }
        }

        // Persist the context
        await this.persistContext();
    }

    /**
     * Context retrieval: Gets paginated message history
     */
    async getMessageHistory(
        offset: number = 0,
        limit: number = 20
    ): Promise<{
        messages: ConversationMessage[];
        totalCount: number;
        hasMore: boolean;
    }> {
        if (!this.conversationId) {
            return { messages: [], totalCount: 0, hasMore: false };
        }

        const messages = await conversationStorage.getConversationMessages(
            this.conversationId,
            limit,
            offset
        );

        const totalCount = await conversationStorage.getMessageCount(this.conversationId);

        // Convert to ConversationMessage format
        const conversationMessages: ConversationMessage[] = messages.map(msg => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: msg.timestamp || new Date(),
            metadata: {
                intent: msg.intent || undefined,
                confidence: msg.confidence ? Number(msg.confidence) : undefined,
                extractedFields: msg.extractedFields as Record<string, any> || undefined
            }
        }));

        return {
            messages: conversationMessages,
            totalCount,
            hasMore: offset + limit < totalCount
        };
    }

    /**
     * Context cleanup: Removes old conversation data
     */
    async cleanupOldContexts(olderThanDays: number = 30): Promise<number> {
        return await conversationStorage.cleanupOldContexts(olderThanDays);
    }

    /**
     * Gets performance metrics for this conversation context
     */
    getPerformanceMetrics(): {
        tokenEfficiency: number;
        compressionEffectiveness: number;
        averageMessageLength: number;
        contextUtilization: number;
    } {
        const messages = this.contextData.messages;
        const totalTokens = this.estimateTokenCount(messages);
        const messageCount = messages.length;
        
        // Calculate average message length
        const averageMessageLength = messageCount > 0 
            ? messages.reduce((sum, msg) => sum + msg.content.length, 0) / messageCount 
            : 0;

        // Calculate token efficiency (tokens per message)
        const tokenEfficiency = messageCount > 0 ? totalTokens / messageCount : 0;

        // Calculate compression effectiveness based on compression level
        const compressionEffectiveness = this.contextData.compressionLevel > 0 
            ? Math.min(1, this.contextData.compressionLevel * 0.3) // Each compression level saves ~30%
            : 0;

        // Calculate context utilization (how much of max context we're using)
        const contextUtilization = totalTokens / this.maxContextLength;

        return {
            tokenEfficiency,
            compressionEffectiveness,
            averageMessageLength,
            contextUtilization
        };
    }

    /**
     * Gets optimization recommendations for this conversation
     */
    getOptimizationRecommendations(): Array<{
        type: 'compression' | 'summarization' | 'cleanup';
        priority: 'high' | 'medium' | 'low';
        description: string;
        estimatedTokenSavings: number;
    }> {
        const recommendations = [];
        const metrics = this.getPerformanceMetrics();
        const totalTokens = this.estimateTokenCount(this.contextData.messages);
        const messageCount = this.contextData.messages.length;

        // High token usage recommendation
        if (metrics.contextUtilization > 0.8) {
            recommendations.push({
                type: 'compression' as const,
                priority: 'high' as const,
                description: 'Context is near token limit. Immediate compression recommended.',
                estimatedTokenSavings: Math.floor(totalTokens * 0.4)
            });
        }

        // Many messages recommendation
        if (messageCount > 20 && this.contextData.compressionLevel === 0) {
            recommendations.push({
                type: 'summarization' as const,
                priority: 'medium' as const,
                description: 'Long conversation detected. AI summarization could reduce token usage.',
                estimatedTokenSavings: Math.floor(totalTokens * 0.6)
            });
        }

        // Low compression effectiveness
        if (this.contextData.compressionLevel > 2 && metrics.compressionEffectiveness < 0.5) {
            recommendations.push({
                type: 'cleanup' as const,
                priority: 'low' as const,
                description: 'Multiple compressions applied. Consider starting fresh conversation.',
                estimatedTokenSavings: Math.floor(totalTokens * 0.8)
            });
        }

        // Inefficient token usage
        if (metrics.tokenEfficiency > 200) { // More than 200 tokens per message on average
            recommendations.push({
                type: 'compression' as const,
                priority: 'medium' as const,
                description: 'Messages are token-heavy. Compression could improve efficiency.',
                estimatedTokenSavings: Math.floor(totalTokens * 0.3)
            });
        }

        return recommendations.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    /**
     * Applies automatic optimization based on current context state
     */
    async applyAutoOptimization(): Promise<{
        applied: boolean;
        strategy: string;
        tokensSaved: number;
        newTokenCount: number;
    }> {
        const recommendations = this.getOptimizationRecommendations();
        const originalTokenCount = this.estimateTokenCount(this.contextData.messages);

        if (recommendations.length === 0) {
            return {
                applied: false,
                strategy: 'none',
                tokensSaved: 0,
                newTokenCount: originalTokenCount
            };
        }

        const topRecommendation = recommendations[0];

        try {
            switch (topRecommendation.type) {
                case 'compression':
                    await this.compressContext();
                    break;
                case 'summarization':
                    // Generate summary and replace older messages
                    const summary = await this.generateConversationSummary();
                    await this.applySummarizationCompression(summary);
                    break;
                case 'cleanup':
                    // Keep only the most recent messages and current meeting data
                    this.contextData.messages = this.contextData.messages.slice(-5);
                    await this.persistContext();
                    break;
            }

            const newTokenCount = this.estimateTokenCount(this.contextData.messages);
            const tokensSaved = originalTokenCount - newTokenCount;

            return {
                applied: true,
                strategy: topRecommendation.type,
                tokensSaved,
                newTokenCount
            };

        } catch (error) {
            console.error('Auto-optimization failed:', error);
            return {
                applied: false,
                strategy: topRecommendation.type,
                tokensSaved: 0,
                newTokenCount: originalTokenCount
            };
        }
    }

    /**
     * Applies summarization-based compression
     */
    private async applySummarizationCompression(summary: ConversationSummary): Promise<void> {
        if (!this.conversationId) {
            return;
        }

        // Keep only the last 3 messages and replace older ones with summary
        const recentMessages = this.contextData.messages.slice(-3);
        
        // Create a summary message to replace older conversation
        const summaryMessage: ConversationMessage = {
            id: `summary_${Date.now()}`,
            role: 'assistant',
            content: `[Conversation Summary] ${summary.summary}`,
            timestamp: new Date(),
            metadata: {
                intent: 'summary',
                confidence: 1.0,
                extractedFields: {
                    participants: summary.participantsMentioned,
                    timeReferences: summary.timeReferencesMentioned
                }
            }
        };

        // Update context with summary + recent messages
        this.contextData.messages = [summaryMessage, ...recentMessages];
        this.contextData.compressionLevel += 1;

        // Persist the changes
        await this.persistContext();
    }
}

/**
 * Factory function to create a ConversationContextEngine instance
 */
export async function createConversationContextEngine(
    userId: string,
    conversationId?: string
): Promise<ConversationContextEngine> {
    const engine = new ConversationContextEngine(userId, conversationId);
    await engine.loadContext(conversationId);
    return engine;
}