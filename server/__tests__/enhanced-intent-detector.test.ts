import { describe, it, expect } from 'vitest';
import { ConversationMessage, MeetingData } from '../../shared/schema.js';

// Import the helper functions we created
import {
    analyzeConversationContext,
    buildCompressedContext,
    calculateContextualConfidence,
    enhanceExtractionWithContext,
    extractParticipantsFromContext,
    extractTimeReferencesFromContext,
    extractTopicsFromContext
} from '../aiInterface.js';

// Mock conversation data for testing
const mockConversation: ConversationMessage[] = [
    {
        id: '1',
        role: 'user',
        content: 'I need to schedule a meeting with john@example.com',
        timestamp: new Date()
    },
    {
        id: '2',
        role: 'assistant',
        content: 'I can help you schedule that meeting. When would you like to meet?',
        timestamp: new Date()
    },
    {
        id: '3',
        role: 'user',
        content: 'How about tomorrow at 2pm to discuss the project update?',
        timestamp: new Date()
    }
];

const mockMeetingData: MeetingData = {
    title: 'Project Update Meeting',
    startTime: new Date('2024-01-15T14:00:00Z'),
    attendees: [{ email: 'john@example.com', isValidated: false, isRequired: true }],
    status: 'draft'
};

describe('Enhanced Meeting Intent Detector', () => {
    it('should extract participants from conversation context', () => {
        const participants = extractParticipantsFromContext(mockConversation);
        expect(participants).toContain('john@example.com');
    });

    it('should extract time references from conversation context', () => {
        const timeRefs = extractTimeReferencesFromContext(mockConversation);
        expect(timeRefs).toContain('tomorrow');
        expect(timeRefs).toContain('2pm');
    });

    it('should extract topics from conversation context', () => {
        const topics = extractTopicsFromContext(mockConversation);
        expect(topics.length).toBeGreaterThan(0);
    });

    it('should analyze conversation context correctly', () => {
        const analysis = analyzeConversationContext(mockConversation, mockMeetingData);

        expect(analysis.hasSchedulingIntent).toBe(true);
        expect(analysis.hasTimeReferences).toBe(true);
        expect(analysis.hasParticipantReferences).toBe(true);
        expect(analysis.keywordDensity).toBeGreaterThan(0);
    });

    it('should build compressed context efficiently', () => {
        const analysis = analyzeConversationContext(mockConversation, mockMeetingData);
        const compressed = buildCompressedContext(mockConversation, analysis);

        expect(compressed).toContain('Project Update Meeting');
        expect(compressed).toContain('john@example.com');
        expect(compressed.length).toBeLessThan(500); // Should be reasonably compressed
    });

    it('should calculate contextual confidence correctly', () => {
        const mockExtraction = {
            intent: 'schedule_meeting' as const,
            confidence: 0.7,
            fields: { participants: ['john@example.com'] },
            missing: []
        };

        const analysis = analyzeConversationContext(mockConversation, mockMeetingData);
        const contextualConfidence = calculateContextualConfidence(
            mockExtraction,
            analysis,
            'How about tomorrow at 2pm?'
        );

        expect(contextualConfidence).toBeGreaterThan(0.7); // Should boost confidence
        expect(contextualConfidence).toBeLessThanOrEqual(1.0);
    });

    it('should enhance extraction with context', () => {
        const mockExtraction = {
            intent: 'schedule_meeting' as const,
            confidence: 0.7,
            fields: { participants: [] }, // Empty initially
            missing: ['participants' as const]
        };

        const analysis = analyzeConversationContext(mockConversation, mockMeetingData);
        const enhanced = enhanceExtractionWithContext(
            mockExtraction,
            analysis,
            mockMeetingData
        );

        expect(enhanced.fields.participants).toContain('john@example.com');
        expect(enhanced.missing).not.toContain('participants');
    });
});