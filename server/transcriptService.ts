import { google } from 'googleapis';
import { User, MeetingData } from '../shared/schema';
import { getGeminiResponse } from './aiInterface';
import { generateResponse as mistralGenerateResponse } from './mistralService.js';
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
  filePath?: string;
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
  filePath?: string;
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

      // Create detailed transcript prompt for Mistral
      const transcriptPrompt = `Generate a comprehensive, realistic meeting transcript for the following meeting:

MEETING DETAILS:
- Title: "${title}"
- Purpose: "${enhancedPurpose}"
- Duration: ${duration} minutes
- Participants: ${attendees.join(', ')}
- Start Time: ${startTime.toLocaleString()}
${meetingLink ? `- Meeting Link: ${meetingLink}` : ''}

CRITICAL REQUIREMENTS:
1. Create a LONG, detailed, realistic professional meeting transcript (1200-2000 words)
2. Include ALL participants in the conversation, including the meeting organizer
3. Make it conversational with natural flow, personal touches, and realistic dialogue
4. Include casual elements like "How's the family?", inside jokes, and team banter
5. Show progression: introductions → main discussion → problem-solving → decisions → action items → wrap-up
6. Ensure every attendee speaks multiple times and contributes meaningfully
7. Make discussions substantive and directly related to the meeting purpose
8. Include specific challenges, solutions, decisions, and assigned action items
9. Use professional language but with realistic conversational elements
10. End with clear next steps, deadlines, and responsible parties

TRANSCRIPT FORMAT:
[09:00:00] Speaker Name (Role): Dialogue and discussion content

[09:05:30] Another Speaker (Role): Response and follow-up discussion

MANDATORY SECTIONS TO INCLUDE:
- Opening introductions with personal touches
- Detailed discussion of the main purpose and challenges
- Problem identification and brainstorming solutions
- Decision making process with different viewpoints
- Action item assignment with specific deadlines and responsibilities
- Meeting wrap-up with summary and next steps

PARTICIPANT ROLES:
- Use realistic names and roles based on email addresses
- Include the meeting organizer as an active participant
- Make sure everyone contributes to the discussion

Focus on creating authentic, lengthy discussion that naturally leads to actionable tasks and demonstrates real team collaboration.`;

      const messages = [
        {
          role: 'system',
          content: 'You are a professional meeting facilitator and transcript writer. Create extremely detailed, realistic meeting transcripts (1200-2000 words) that capture authentic professional discussions with personal elements, natural conversation flow, and comprehensive coverage of all topics. Every participant must speak multiple times. Include casual conversation, challenges, solutions, decisions, and specific action items with deadlines.'
        },
        {
          role: 'user',
          content: transcriptPrompt
        }
      ];

      // Use Mistral for transcript generation
      let transcriptContent: string;
      try {
        transcriptContent = await mistralGenerateResponse(messages as any);

        // Validate transcript content (less strict for Mistral)
        if (!transcriptContent || transcriptContent.length < 800) {
          throw new Error('Generated transcript too short');
        }
      } catch (error) {
        console.warn('Mistral transcript generation failed, using fallback:', error);
        // Use fallback transcript generation
        transcriptContent = this.createFallbackTranscript(
          { title, enhancedPurpose, startTime, endTime: new Date(startTime.getTime() + duration * 60 * 1000) },
          attendees,
          duration,
          startTime
        );
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

      // Save transcript to file and get file path
      const filePath = await this.saveTranscriptToFile(transcript);

      // Add file path to transcript object
      const transcriptWithPath = {
        ...transcript,
        filePath: filePath
      };

      // Record performance metrics
      performanceMonitor.recordAPICall({
        service: 'mistral',
        operation: 'transcript_generation',
        tokenCount: { input: 0, output: 0, total: 0 },
        responseTime: Date.now() - startTimeMs,
        success: true
      });

      console.log(`✅ Transcript generated successfully: ${transcript.wordCount} words, saved to: ${filePath}`);
      return transcriptWithPath;

    } catch (error: any) {
      console.error('Error generating meeting transcript:', error);
      performanceMonitor.recordAPICall({
        service: 'mistral',
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

      const summaryContent = await mistralGenerateResponse(messages as any);

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
        const extractionResponse = await mistralGenerateResponse(extractionMessages as any);
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

      // Save summary to file and get file path
      const filePath = await this.saveSummaryToFile(summary);

      // Add file path to summary object
      const summaryWithPath = {
        ...summary,
        filePath: filePath
      };

      // Record performance metrics
      performanceMonitor.recordAPICall({
        service: 'mistral',
        operation: 'summary_generation',
        tokenCount: { input: 0, output: 0, total: 0 },
        responseTime: Date.now() - startTimeMs,
        success: true
      });

      console.log(`✅ Summary generated successfully: ${summary.wordCount} words, saved to: ${filePath}`);
      return summaryWithPath;

    } catch (error: any) {
      console.error('Error generating meeting summary:', error);
      performanceMonitor.recordAPICall({
        service: 'mistral',
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
      console.log(`📋 Starting task extraction for meeting: ${summary.title} (ID: ${summary.meetingId})`);

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

      console.log(`🤖 Sending task extraction request to AI service...`);
      const tasksResponse = await mistralGenerateResponse(messages as any);
      let tasks: MeetingTask[] = [];

      try {
        console.log(`🔍 Parsing AI response to extract tasks...`);
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
        console.log(`✅ Successfully parsed ${tasks.length} tasks from AI response`);
      } catch (parseError) {
        console.warn('⚠️ Failed to parse tasks from AI response, using fallback extraction');
        tasks = this.extractTasksFallback(summary);
        console.log(`✅ Extracted ${tasks.length} tasks using fallback method`);
      }

      // Save tasks to file system
      try {
        const { taskFileStorage } = await import('./utils/taskFileStorage.js');
        await taskFileStorage.saveTasks(summary.meetingId, tasks);
      } catch (fileError) {
        console.error(`❌ Error saving tasks to file system: ${(fileError as Error).message}`);
      }

      // Record performance metrics
      performanceMonitor.recordAPICall({
        service: 'mistral',
        operation: 'task_extraction',
        tokenCount: { input: 0, output: 0, total: 0 },
        responseTime: Date.now() - startTimeMs,
        success: true
      });

      console.log(`✅ Task extraction completed: ${tasks.length} tasks extracted for meeting: ${summary.title}`);
      return tasks;

    } catch (error: any) {
      console.error('❌ Error extracting tasks from summary:', error);
      performanceMonitor.recordAPICall({
        service: 'mistral',
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
   * Save transcript to file system as JSON
   */
  private async saveTranscriptToFile(transcript: MeetingTranscript): Promise<string> {
    try {
      const fileName = `transcript-${transcript.meetingId}.json`;
      const filePath = path.join(this.TRANSCRIPTS_DIR, fileName);

      const fileContent = JSON.stringify({
        meetingId: transcript.meetingId,
        title: transcript.title,
        transcript: transcript.transcript,
        participants: transcript.participants,
        duration: transcript.duration,
        generatedAt: transcript.generatedAt.toISOString(),
        wordCount: transcript.wordCount,
        filePath: filePath,
        type: 'transcript'
      }, null, 2);

      fs.writeFileSync(filePath, fileContent, 'utf8');
      console.log(`💾 Transcript saved to: ${filePath}`);
      return filePath;
    } catch (error: any) {
      console.error('Error saving transcript to file:', error);
      throw new Error(`Failed to save transcript: ${error.message}`);
    }
  }

  /**
   * Save summary to file system as JSON
   */
  private async saveSummaryToFile(summary: MeetingSummary): Promise<string> {
    try {
      const fileName = `transcript-${summary.meetingId}-summary.json`;
      const filePath = path.join(this.SUMMARIES_DIR, fileName);

      const fileContent = JSON.stringify({
        meetingId: summary.meetingId,
        title: summary.title,
        summary: summary.summary,
        keyPoints: summary.keyPoints,
        decisions: summary.decisions,
        actionItems: summary.actionItems,
        generatedAt: summary.generatedAt.toISOString(),
        wordCount: summary.wordCount,
        filePath: filePath,
        type: 'summary'
      }, null, 2);

      fs.writeFileSync(filePath, fileContent, 'utf8');
      console.log(`💾 Summary saved to: ${filePath}`);
      return filePath;
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
      const fileName = `transcript-${meetingId}.json`;
      const filePath = path.join(this.TRANSCRIPTS_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(fileContent);

      // Parse back to MeetingTranscript object
      const transcript: MeetingTranscript = {
        meetingId: data.meetingId,
        title: data.title,
        transcript: data.transcript,
        participants: data.participants,
        duration: data.duration,
        generatedAt: new Date(data.generatedAt),
        wordCount: data.wordCount
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
      const fileName = `transcript-${meetingId}-summary.json`;
      const filePath = path.join(this.SUMMARIES_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(fileContent);

      // Parse back to MeetingSummary object
      const summary: MeetingSummary = {
        meetingId: data.meetingId,
        title: data.title,
        summary: data.summary,
        keyPoints: data.keyPoints,
        decisions: data.decisions,
        actionItems: data.actionItems,
        generatedAt: new Date(data.generatedAt),
        wordCount: data.wordCount
      };

      return summary;
    } catch (error: any) {
      console.error('Error reading summary:', error);
      return null;
    }
  }

  /**
   * Creates a comprehensive fallback transcript when AI generation fails
   */
  private createFallbackTranscript(
    meetingData: any,
    attendees: string[],
    duration: number,
    startTime: Date
  ): string {
    const participants = attendees.map((email, index) => {
      const name = email.split('@')[0];
      const roles = ['Product Manager', 'Developer', 'Designer', 'QA Engineer', 'Project Manager', 'Team Lead'];
      return `${name} (${roles[index % roles.length]})`;
    });

    const userParticipant = participants[0] || 'Meeting Organizer';
    const otherParticipants = participants.slice(1);

    let transcript = `[${startTime.toLocaleTimeString()}] ${userParticipant}: Good ${startTime.getHours() < 12 ? 'morning' : 'afternoon'}, everyone! Thanks so much for joining this ${meetingData.title} meeting. I hope everyone had a great weekend. ${otherParticipants.length > 0 ? otherParticipants[0].split(' ')[0] : 'Team'}, how's the family doing?\n\n`;

    // Add casual conversation
    if (otherParticipants.length > 0) {
      transcript += `[${new Date(startTime.getTime() + 2 * 60 * 1000).toLocaleTimeString()}] ${otherParticipants[0].split(' ')[0]} (${otherParticipants[0].split('(')[1].replace(')', '')}): Hey! Family's doing great, thanks for asking. The kids are finally settling into the school routine. How about yours?\n\n`;
    }

    transcript += `[${new Date(startTime.getTime() + 4 * 60 * 1000).toLocaleTimeString()}] ${userParticipant}: Oh, they're keeping me on my toes as always! Little ones have so much energy. Alright, let's get down to business. As you all know, we're here to discuss ${meetingData.enhancedPurpose || meetingData.purpose || 'our current projects and priorities'}.\n\n`;

    // Main discussion with all participants
    const discussionPoints = [
      'current challenges and roadblocks',
      'potential solutions and approaches',
      'resource allocation and priorities',
      'timeline considerations and deadlines',
      'team capacity and workload distribution'
    ];

    let currentTime = startTime.getTime() + 6 * 60 * 1000;
    discussionPoints.forEach((point, index) => {
      const speaker = otherParticipants[index % otherParticipants.length] || userParticipant;
      const speakerName = speaker.split(' ')[0];

      transcript += `[${new Date(currentTime).toLocaleTimeString()}] ${speaker}: I've been thinking about ${point}. From my perspective as ${speaker.split('(')[1]?.replace(')', '')}, I see some real opportunities here. For instance, ${point === 'current challenges and roadblocks' ? 'the automation scripts are working well but we need better error handling' : point === 'potential solutions and approaches' ? 'we could implement a more robust monitoring system' : 'we should prioritize the high-impact items first'}.\n\n`;

      // Add responses from other participants
      otherParticipants.forEach((other, otherIndex) => {
        if (other !== speaker) {
          currentTime += 3 * 60 * 1000;
          const otherName = other.split(' ')[0];
          transcript += `[${new Date(currentTime).toLocaleTimeString()}] ${otherName} (${other.split('(')[1].replace(')', '')}): I completely agree with that. ${point === 'current challenges and roadblocks' ? 'The error handling has been a pain point for us too.' : point === 'potential solutions and approaches' ? 'A monitoring system would definitely help us catch issues earlier.' : 'That makes sense - let\'s focus on the critical path items.'} What do you think, ${userParticipant.split(' ')[0]}?\n\n`;
        }
      });

      currentTime += 5 * 60 * 1000;
    });

    // Decision making section
    currentTime += 2 * 60 * 1000;
    transcript += `[${new Date(currentTime).toLocaleTimeString()}] ${userParticipant}: Great discussion, everyone. Based on what we've covered, I think we should move forward with implementing the enhanced monitoring system and prioritizing the critical automation fixes. ${otherParticipants[0]?.split(' ')[0] || 'Team'}, can you take the lead on the monitoring system?\n\n`;

    if (otherParticipants.length > 0) {
      currentTime += 2 * 60 * 1000;
      transcript += `[${new Date(currentTime).toLocaleTimeString()}] ${otherParticipants[0].split(' ')[0]} (${otherParticipants[0].split('(')[1].replace(')', '')}): Absolutely, I'd be happy to lead that. I'll put together a quick proposal by end of day tomorrow and share it with the team for feedback.\n\n`;
    }

    // Action items
    currentTime += 3 * 60 * 1000;
    transcript += `[${new Date(currentTime).toLocaleTimeString()}] ${userParticipant}: Perfect! Let's also make sure we document the current automation processes before making changes. ${otherParticipants[1]?.split(' ')[0] || 'Someone'} from the team, could you handle the documentation?\n\n`;

    if (otherParticipants.length > 1) {
      currentTime += 2 * 60 * 1000;
      transcript += `[${new Date(currentTime).toLocaleTimeString()}] ${otherParticipants[1].split(' ')[0]} (${otherParticipants[1].split('(')[1].replace(')', '')}): Sure thing! I'll start on that this afternoon and aim to have a first draft by Friday.\n\n`;
    }

    // Wrap-up
    currentTime += 5 * 60 * 1000;
    transcript += `[${new Date(currentTime).toLocaleTimeString()}] ${userParticipant}: Excellent! So to summarize our action items:\n`;
    transcript += `1. ${otherParticipants[0]?.split(' ')[0] || 'Team member'} will lead the monitoring system implementation - proposal due tomorrow\n`;
    transcript += `2. ${otherParticipants[1]?.split(' ')[0] || 'Team member'} will document current automation processes - draft due Friday\n`;
    transcript += `3. We'll schedule a follow-up meeting next week to review progress\n\n`;

    transcript += `Thanks everyone for the productive discussion! This was really helpful. Let's touch base if any issues come up before our next meeting.\n\n`;

    // Add final casual exchanges
    otherParticipants.forEach((participant, index) => {
      currentTime += 1 * 60 * 1000;
      const name = participant.split(' ')[0];
      transcript += `[${new Date(currentTime).toLocaleTimeString()}] ${name}: Thanks for organizing this! See you all later.\n\n`;
    });

    return transcript;
  }
}

// Export singleton instance
export const transcriptService = new TranscriptService();