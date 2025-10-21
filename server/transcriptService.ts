import { google } from 'googleapis';
import { User } from '../shared/schema';
import { getGeminiResponse } from './aiInterface';
import { performanceMonitor } from './performanceMonitor';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Interface for meeting transcript data
 */
export interface MeetingTranscript {
  meetingId: string;
  title: string;
  transcript: string;
  participants: string[];
  duration: number;
  generatedAt: Date;
  wordCount: number;
}

/**
 * Interface for meeting summary data
 */
export interface MeetingSummary {
  meetingId: string;
  title: string;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: string[];
  generatedAt: Date;
  wordCount: number;
}

/**
 * Interface for extracted tasks from meeting summary
 */
export interface MeetingTask {
  id: string;
  meetingId: string;
  title: string;
  description: string;
  assignee?: string;
  assigneeEmail?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed';
  dueDate?: Date;
  category: string;
  estimatedHours?: number;
}

/**
 * Interface for Kanban board column
 */
export interface KanbanColumn {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  tasks: MeetingTask[];
}

/**
 * Interface for meeting task board
 */
export interface MeetingTaskBoard {
  meetingId: string;
  title: string;
  columns: KanbanColumn[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Transcript and Summary Generation Service
 */
export class TranscriptService {
  private readonly TRANSCRIPTS_DIR = path.join(process.cwd(), 'transcripts');
  private readonly SUMMARIES_DIR = path.join(process.cwd(), 'summaries');

  constructor() {
    this.ensureDirectoriesExist();
  }

  /**
   * Ensure transcript and summary directories exist
   */
  private ensureDirectoriesExist(): void {
    if (!fs.existsSync(this.TRANSCRIPTS_DIR)) {
      fs.mkdirSync(this.TRANSCRIPTS_DIR, { recursive: true });
    }
    if (!fs.existsSync(this.SUMMARIES_DIR)) {
      fs.mkdirSync(this.SUMMARIES_DIR, { recursive: true });
    }
  }

  /**
   * Generate comprehensive meeting transcript based on agenda and attendees
   */
  async generateMeetingTranscript(
    meetingId: string,
    title: string,
    enhancedPurpose: string,
    attendees: string[],
    duration: number,
    startTime: Date,
    meetingLink?: string
  ): Promise<MeetingTranscript> {
    const startTimeMs = Date.now();

    try {
      console.log(`🎬 Generating transcript for meeting: ${title}`);

      // Create detailed transcript prompt
      const transcriptPrompt = `
        Generate a comprehensive, realistic meeting transcript for the following meeting:

        MEETING DETAILS:
        - Title: "${title}"
        - Purpose: "${enhancedPurpose}"
        - Duration: ${duration} minutes
        - Participants: ${attendees.join(', ')}
        - Start Time: ${startTime.toLocaleString()}
        ${meetingLink ? `- Meeting Link: ${meetingLink}` : ''}

        REQUIREMENTS:
        1. Create a realistic, professional meeting transcript
        2. Include natural conversation flow between participants
        3. Show how the meeting addresses the enhanced purpose
        4. Include discussion of challenges, solutions, and decisions
        5. Make it detailed enough to extract meaningful tasks and action items
        6. Include timestamps and speaker identification
        7. Show progression from introduction through discussion to action items
        8. End with clear next steps and assignments
        9. Make it 800-1200 words for comprehensive analysis
        10. Use professional language appropriate for the meeting type

        TRANSCRIPT FORMAT:
        [Time] Speaker Name: Dialogue and discussion content

        [Time] Another Speaker: Response and follow-up discussion

        Include sections for:
        - Opening and introductions
        - Main discussion topics
        - Problem-solving and decision making
        - Action item assignment
        - Meeting wrap-up and next steps

        Focus on creating substantive discussion that would naturally lead to actionable tasks.
      `;

      const messages = [
        {
          role: 'system',
          content: 'You are a professional meeting facilitator and transcript writer. Create realistic, detailed meeting transcripts that capture authentic professional discussions and naturally lead to actionable outcomes.'
        },
        {
          role: 'user',
          content: transcriptPrompt
        }
      ];

      const transcriptContent = await getGeminiResponse(messages);

      // Validate transcript content
      if (!transcriptContent || transcriptContent.length < 500) {
        throw new Error('Generated transcript too short');
      }

      const transcript: MeetingTranscript = {
        meetingId,
        title,
        transcript: transcriptContent,
        participants: attendees,
        duration,
        generatedAt: new Date(),
        wordCount: transcriptContent.split(' ').length
      };

      // Save transcript to file
      await this.saveTranscriptToFile(transcript);

      // Record performance metrics
      performanceMonitor.recordAPICall({
        service: 'gemini',
        operation: 'transcript_generation',
        tokenCount: { input: 0, output: 0, total: 0 },
        responseTime: Date.now() - startTimeMs,
        success: true
      });

      console.log(`✅ Transcript generated successfully: ${transcript.wordCount} words`);
      return transcript;

    } catch (error: any) {
      console.error('Error generating meeting transcript:', error);
      performanceMonitor.recordAPICall({
        service: 'gemini',
        operation: 'transcript_generation',
        tokenCount: { input: 0, output: 0, total: 0 },
        responseTime: Date.now() - startTimeMs,
        success: false,
        error: error.message
      });
      throw new Error(`Failed to generate transcript: ${error.message}`);
    }
  }

  /**
   * Generate meeting summary from transcript
   */
  async generateMeetingSummary(transcript: MeetingTranscript): Promise<MeetingSummary> {
    const startTimeMs = Date.now();

    try {
      console.log(`📝 Generating summary for meeting: ${transcript.title}`);

      const summaryPrompt = `
        Analyze the following meeting transcript and create a comprehensive summary:

        TRANSCRIPT:
        ${transcript.transcript}

        REQUIREMENTS:
        1. Create a concise but comprehensive summary (200-400 words)
        2. Extract 3-5 key discussion points
        3. Identify all decisions made during the meeting
        4. List all action items and assignments
        5. Highlight any challenges or important outcomes
        6. Include participant engagement and key contributions
        7. Note any follow-up requirements or deadlines
        8. Maintain professional tone and focus on actionable content

        SUMMARY FORMAT:
        - Start with a brief overview paragraph
        - List key points as bullet points
        - Clearly identify decisions made
        - List all action items with assignees and deadlines
        - End with overall meeting assessment
      `;

      const messages = [
        {
          role: 'system',
          content: 'You are a professional meeting analyst. Extract key information from meeting transcripts and create clear, actionable summaries that highlight decisions, action items, and important outcomes.'
        },
        {
          role: 'user',
          content: summaryPrompt
        }
      ];

      const summaryContent = await getGeminiResponse(messages);

      // Extract key points, decisions, and action items using AI
      const extractionPrompt = `
        From the following meeting summary, extract:

        SUMMARY:
        ${summaryContent}

        Extract in JSON format:
        {
          "keyPoints": ["point 1", "point 2", "point 3"],
          "decisions": ["decision 1", "decision 2"],
          "actionItems": ["action 1 with assignee if mentioned", "action 2 with assignee if mentioned"]
        }
      `;

      const extractionMessages = [
        {
          role: 'system',
          content: 'Extract key information from meeting summaries in JSON format.'
        },
        {
          role: 'user',
          content: extractionPrompt
        }
      ];

      let extractedData: { keyPoints: string[], decisions: string[], actionItems: string[] } = { keyPoints: [], decisions: [], actionItems: [] };

      try {
        const extractionResponse = await getGeminiResponse(extractionMessages);
        extractedData = JSON.parse(extractionResponse);
      } catch (parseError) {
        console.warn('Failed to parse extraction data, using fallback');
        // Fallback: extract using simple string parsing
        extractedData = this.extractDataFromSummary(summaryContent);
      }

      const summary: MeetingSummary = {
        meetingId: transcript.meetingId,
        title: transcript.title,
        summary: summaryContent,
        keyPoints: extractedData.keyPoints || [],
        decisions: extractedData.decisions || [],
        actionItems: extractedData.actionItems || [],
        generatedAt: new Date(),
        wordCount: summaryContent.split(' ').length
      };

      // Save summary to file
      await this.saveSummaryToFile(summary);

      // Record performance metrics
      performanceMonitor.recordAPICall({
        service: 'gemini',
        operation: 'summary_generation',
        tokenCount: { input: 0, output: 0, total: 0 },
        responseTime: Date.now() - startTimeMs,
        success: true
      });

      console.log(`✅ Summary generated successfully: ${summary.wordCount} words`);
      return summary;

    } catch (error: any) {
      console.error('Error generating meeting summary:', error);
      performanceMonitor.recordAPICall({
        service: 'gemini',
        operation: 'summary_generation',
        tokenCount: { input: 0, output: 0, total: 0 },
        responseTime: Date.now() - startTimeMs,
        success: false,
        error: error.message
      });
      throw new Error(`Failed to generate summary: ${error.message}`);
    }
  }

  /**
   * Extract tasks from meeting summary
   */
  async extractTasksFromSummary(summary: MeetingSummary): Promise<MeetingTask[]> {
    const startTimeMs = Date.now();

    try {
      console.log(`📋 Extracting tasks from summary: ${summary.title}`);

      const taskExtractionPrompt = `
        Analyze the following meeting summary and extract actionable tasks:

        SUMMARY:
        ${summary.summary}

        KEY POINTS:
        ${summary.keyPoints.join('\n')}

        DECISIONS:
        ${summary.decisions.join('\n')}

        ACTION ITEMS:
        ${summary.actionItems.join('\n')}

        REQUIREMENTS:
        1. Extract all specific, actionable tasks from the summary
        2. Create clear, specific task titles
        3. Include detailed descriptions for each task
        4. Assign appropriate priority levels (high, medium, low)
        5. Identify potential assignees based on context
        6. Set reasonable due dates (1-2 weeks from meeting date)
        7. Categorize tasks appropriately
        8. Estimate effort in hours where possible

        Return tasks in JSON format:
        [
          {
            "title": "Specific task title",
            "description": "Detailed description of what needs to be done",
            "assignee": "Person name or email if mentioned",
            "priority": "high|medium|low",
            "category": "development|design|planning|review|communication",
            "estimatedHours": 4
          }
        ]
      `;

      const messages = [
        {
          role: 'system',
          content: 'You are a professional project manager specializing in task extraction from meeting summaries. Create specific, actionable tasks with clear assignments and priorities.'
        },
        {
          role: 'user',
          content: taskExtractionPrompt
        }
      ];

      const tasksResponse = await getGeminiResponse(messages);
      let tasks: MeetingTask[] = [];

      try {
        const parsedTasks = JSON.parse(tasksResponse);
        tasks = parsedTasks.map((task: any, index: number) => ({
          id: `task_${summary.meetingId}_${index + 1}`,
          meetingId: summary.meetingId,
          title: task.title || 'Unnamed Task',
          description: task.description || 'No description provided',
          assignee: task.assignee,
          assigneeEmail: task.assigneeEmail,
          priority: task.priority || 'medium',
          status: 'pending',
          dueDate: task.dueDate ? new Date(task.dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week default
          category: task.category || 'general',
          estimatedHours: task.estimatedHours || 2
        }));
      } catch (parseError) {
        console.warn('Failed to parse tasks, using fallback extraction');
        tasks = this.extractTasksFallback(summary);
      }

      // Record performance metrics
      performanceMonitor.recordAPICall({
        service: 'gemini',
        operation: 'task_extraction',
        tokenCount: { input: 0, output: 0, total: 0 },
        responseTime: Date.now() - startTimeMs,
        success: true
      });

      console.log(`✅ Extracted ${tasks.length} tasks from summary`);
      return tasks;

    } catch (error: any) {
      console.error('Error extracting tasks from summary:', error);
      performanceMonitor.recordAPICall({
        service: 'gemini',
        operation: 'task_extraction',
        tokenCount: { input: 0, output: 0, total: 0 },
        responseTime: Date.now() - startTimeMs,
        success: false,
        error: error.message
      });
      throw new Error(`Failed to extract tasks: ${error.message}`);
    }
  }

  /**
   * Save transcript to file system
   */
  private async saveTranscriptToFile(transcript: MeetingTranscript): Promise<void> {
    try {
      const fileName = `${transcript.meetingId}_transcript.txt`;
      const filePath = path.join(this.TRANSCRIPTS_DIR, fileName);

      const fileContent = `
MEETING TRANSCRIPT
==================

Meeting ID: ${transcript.meetingId}
Title: ${transcript.title}
Generated: ${transcript.generatedAt.toISOString()}
Duration: ${transcript.duration} minutes
Participants: ${transcript.participants.join(', ')}
Word Count: ${transcript.wordCount}

TRANSCRIPT:
${transcript.transcript}

==================
Generated by AI Assistant
      `.trim();

      fs.writeFileSync(filePath, fileContent, 'utf8');
      console.log(`💾 Transcript saved to: ${filePath}`);
    } catch (error: any) {
      console.error('Error saving transcript to file:', error);
      throw new Error(`Failed to save transcript: ${error.message}`);
    }
  }

  /**
   * Save summary to file system
   */
  private async saveSummaryToFile(summary: MeetingSummary): Promise<void> {
    try {
      const fileName = `${summary.meetingId}_summary.txt`;
      const filePath = path.join(this.SUMMARIES_DIR, fileName);

      const fileContent = `
MEETING SUMMARY
===============

Meeting ID: ${summary.meetingId}
Title: ${summary.title}
Generated: ${summary.generatedAt.toISOString()}
Word Count: ${summary.wordCount}

SUMMARY:
${summary.summary}

KEY POINTS:
${summary.keyPoints.map(point => `- ${point}`).join('\n')}

DECISIONS:
${summary.decisions.map(decision => `- ${decision}`).join('\n')}

ACTION ITEMS:
${summary.actionItems.map(item => `- ${item}`).join('\n')}

===============
Generated by AI Assistant
      `.trim();

      fs.writeFileSync(filePath, fileContent, 'utf8');
      console.log(`💾 Summary saved to: ${filePath}`);
    } catch (error: any) {
      console.error('Error saving summary to file:', error);
      throw new Error(`Failed to save summary: ${error.message}`);
    }
  }

  /**
   * Fallback task extraction when AI parsing fails
   */
  private extractTasksFallback(summary: MeetingSummary): MeetingTask[] {
    const tasks: MeetingTask[] = [];

    // Extract tasks from action items
    summary.actionItems.forEach((item, index) => {
      const assigneeMatch = item.match(/(\w+)[\s:]+(.+)/i);
      const assignee = assigneeMatch ? assigneeMatch[1] : undefined;
      const taskDescription = assigneeMatch ? assigneeMatch[2] : item;

      tasks.push({
        id: `task_${summary.meetingId}_${index + 1}`,
        meetingId: summary.meetingId,
        title: `Task ${index + 1}: ${taskDescription.substring(0, 50)}...`,
        description: taskDescription,
        assignee,
        priority: 'medium',
        status: 'pending',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        category: 'general',
        estimatedHours: 4
      });
    });

    return tasks;
  }

  /**
   * Fallback data extraction from summary text
   */
  private extractDataFromSummary(summaryContent: string): { keyPoints: string[], decisions: string[], actionItems: string[] } {
    const lines = summaryContent.split('\n');
    const keyPoints: string[] = [];
    const decisions: string[] = [];
    const actionItems: string[] = [];

    let currentSection = '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.toLowerCase().includes('key point')) {
        currentSection = 'keyPoints';
        continue;
      } else if (trimmedLine.toLowerCase().includes('decision')) {
        currentSection = 'decisions';
        continue;
      } else if (trimmedLine.toLowerCase().includes('action')) {
        currentSection = 'actionItems';
        continue;
      }

      if (trimmedLine.startsWith('-') || trimmedLine.startsWith('•')) {
        const content = trimmedLine.substring(1).trim();
        if (content && currentSection) {
          switch (currentSection) {
            case 'keyPoints':
              keyPoints.push(content);
              break;
            case 'decisions':
              decisions.push(content);
              break;
            case 'actionItems':
              actionItems.push(content);
              break;
          }
        }
      }
    }

    return { keyPoints, decisions, actionItems };
  }

  /**
   * Get transcript by meeting ID
   */
  async getTranscript(meetingId: string): Promise<MeetingTranscript | null> {
    try {
      const fileName = `${meetingId}_transcript.txt`;
      const filePath = path.join(this.TRANSCRIPTS_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const lines = fileContent.split('\n');

      // Parse the file content back to MeetingTranscript object
      const transcript: MeetingTranscript = {
        meetingId: meetingId,
        title: lines.find(line => line.startsWith('Title: '))?.substring(7) || 'Unknown Meeting',
        transcript: fileContent.split('TRANSCRIPT:')[1]?.split('==================')[0]?.trim() || '',
        participants: [],
        duration: 60,
        generatedAt: new Date(lines.find(line => line.startsWith('Generated: '))?.substring(11) || Date.now()),
        wordCount: 0
      };

      return transcript;
    } catch (error: any) {
      console.error('Error reading transcript:', error);
      return null;
    }
  }

  /**
   * Get summary by meeting ID
   */
  async getSummary(meetingId: string): Promise<MeetingSummary | null> {
    try {
      const fileName = `${meetingId}_summary.txt`;
      const filePath = path.join(this.SUMMARIES_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');

      // Parse the file content back to MeetingSummary object
      const summary: MeetingSummary = {
        meetingId: meetingId,
        title: fileContent.match(/Title: (.+)/)?.[1] || 'Unknown Meeting',
        summary: fileContent.split('SUMMARY:')[1]?.split('KEY POINTS:')[0]?.trim() || '',
        keyPoints: [],
        decisions: [],
        actionItems: [],
        generatedAt: new Date(fileContent.match(/Generated: (.+)/)?.[1] || Date.now()),
        wordCount: 0
      };

      return summary;
    } catch (error: any) {
      console.error('Error reading summary:', error);
      return null;
    }
  }
}

// Export singleton instance
export const transcriptService = new TranscriptService();