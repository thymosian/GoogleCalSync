import { MeetingData, ConversationMessage } from '../shared/schema.js';
import { getGeminiResponse, MistralMessage } from './aiInterface.js';

export interface AgendaContent {
  title: string;
  duration: number;
  topics: AgendaTopic[];
  actionItems: ActionItem[];
}

export interface AgendaTopic {
  title: string;
  duration: number;
  description?: string;
  presenter?: string;
}

export interface ActionItem {
  task: string;
  assignee?: string;
  deadline?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConversationAnalysis {
  purpose: string;
  topics: string[];
  keywords: string[];
  participants: string[];
  actionItems: string[];
  meetingType: MeetingType;
  urgency: 'low' | 'normal' | 'medium' | 'high';
  duration: number;
}

export type MeetingType = 'general' | 'standup' | 'planning' | 'review' | 'brainstorm';

export class AgendaGenerator {
  /**
   * Generate agenda based on meeting data and conversation context
   */
  async generateAgenda(
    meetingData: MeetingData,
    conversationContext: ConversationMessage[] = []
  ): Promise<AgendaContent> {
    try {
      // Extract comprehensive context from conversation
      const contextAnalysis = this.analyzeConversationContext(conversationContext);
      
      // Calculate meeting duration in minutes
      const duration = meetingData.startTime && meetingData.endTime 
        ? Math.round((meetingData.endTime.getTime() - meetingData.startTime.getTime()) / (1000 * 60))
        : 60; // Default to 60 minutes
      
      // Generate agenda using AI with enhanced context
      const agendaText = await this.generateContextAwareAgenda(
        meetingData.title || 'Meeting',
        meetingData.type || 'online',
        duration,
        meetingData.attendees?.map(a => a.email) || [],
        contextAnalysis
      );
      
      // Parse agenda text into structured format with enhanced parsing
      const agendaContent = this.parseAgendaTextEnhanced(agendaText, duration, contextAnalysis);
      
      // Validate and enhance the generated agenda
      const validationResult = this.validateAgenda(this.formatAgenda(agendaContent));
      if (!validationResult.isValid) {
        console.warn('Generated agenda validation failed:', validationResult.errors);
        // Try to fix common issues
        return this.enhanceAgendaContent(agendaContent, contextAnalysis, duration);
      }
      
      return agendaContent;
    } catch (error) {
      console.error('Error generating agenda:', error);
      // Return enhanced fallback agenda
      return this.createEnhancedFallbackAgenda(meetingData, conversationContext);
    }
  }

  /**
   * Generate context-aware agenda using AI with enhanced prompts
   */
  private async generateContextAwareAgenda(
    title: string,
    meetingType: string,
    duration: number,
    attendees: string[],
    contextAnalysis: ConversationAnalysis
  ): Promise<string> {
    const prompt = this.buildEnhancedPrompt(title, meetingType, duration, attendees, contextAnalysis);

    const messages: MistralMessage[] = [
      {
        role: 'system',
        content: this.getSystemPromptForMeetingType(contextAnalysis.meetingType)
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    return await getGeminiResponse(messages);
  }

  /**
   * Generate agenda text using AI (legacy method for backward compatibility)
   */
  private async generateAgendaText(
    title: string,
    meetingType: string,
    duration: number,
    attendees: string[],
    context: string
  ): Promise<string> {
    const prompt = `Generate a professional meeting agenda for "${title}".

Meeting Details:
- Type: ${meetingType}
- Duration: ${duration} minutes
- Attendees: ${attendees.length} people
- Context: ${context}

Create a structured agenda with:
1. Welcome/introductions (if needed)
2. Main topics with time allocations
3. Action items discussion
4. Next steps/wrap-up

Format as numbered list with time allocations. Keep it concise and actionable.`;

    const messages: MistralMessage[] = [
      {
        role: 'system',
        content: 'You are a professional meeting agenda generator. Create clear, time-efficient agendas that maximize productivity.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    return await getGeminiResponse(messages);
  }

  /**
   * Parse agenda text into structured format
   */
  private parseAgendaText(agendaText: string, totalDuration: number): AgendaContent {
    const lines = agendaText.split('\n').filter(line => line.trim());
    const topics: AgendaTopic[] = [];
    const actionItems: ActionItem[] = [];
    
    let currentTopic: AgendaTopic | null = null;
    let allocatedTime = 0;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines and headers
      if (!trimmedLine || trimmedLine.toLowerCase().includes('agenda')) {
        continue;
      }
      
      // Parse numbered items (topics)
      const topicMatch = trimmedLine.match(/^\d+\.\s*(.+?)(?:\s*\((\d+)\s*min\))?$/i);
      if (topicMatch) {
        const topicTitle = topicMatch[1].trim();
        const duration = topicMatch[2] ? parseInt(topicMatch[2]) : Math.max(5, Math.floor((totalDuration - allocatedTime) / (lines.length - topics.length)));
        
        currentTopic = {
          title: topicTitle,
          duration: Math.min(duration, totalDuration - allocatedTime),
          description: this.extractTopicDescription(topicTitle)
        };
        
        topics.push(currentTopic);
        allocatedTime += currentTopic.duration;
        continue;
      }
      
      // Parse action items (lines starting with -, *, or containing "action")
      if (trimmedLine.match(/^[-*•]\s*/) || trimmedLine.toLowerCase().includes('action')) {
        const actionText = trimmedLine.replace(/^[-*•]\s*/, '').trim();
        if (actionText) {
          actionItems.push({
            task: actionText,
            priority: this.determinePriority(actionText)
          });
        }
      }
    }
    
    // Ensure we have at least basic topics
    if (topics.length === 0) {
      topics.push(
        { title: 'Discussion', duration: Math.floor(totalDuration * 0.7) },
        { title: 'Action Items & Next Steps', duration: Math.floor(totalDuration * 0.3) }
      );
    }
    
    // Adjust durations to fit total time
    this.adjustTopicDurations(topics, totalDuration);
    
    return {
      title: 'Meeting Agenda',
      duration: totalDuration,
      topics,
      actionItems
    };
  }

  /**
   * Analyze conversation context for comprehensive agenda generation
   */
  private analyzeConversationContext(conversation: ConversationMessage[]): ConversationAnalysis {
    if (conversation.length === 0) {
      return {
        purpose: 'General meeting discussion',
        topics: [],
        keywords: [],
        participants: [],
        actionItems: [],
        meetingType: 'general',
        urgency: 'normal',
        duration: 60
      };
    }
    
    const recentMessages = conversation.slice(-15); // Analyze more messages for better context
    const keywords = new Set<string>();
    const topics = new Set<string>();
    const participants = new Set<string>();
    const actionItems = new Set<string>();
    let purpose = '';
    let meetingType = 'general';
    let urgency = 'normal';
    
    for (const message of recentMessages) {
      const content = message.content.toLowerCase();
      
      // Extract meeting purpose from conversation
      const purposeMatches = content.match(/(?:purpose|goal|objective|aim)(?:\s+is|\s+of|\s*:)\s*([^.!?]+)/gi);
      if (purposeMatches && !purpose) {
        purpose = purposeMatches[0].replace(/^(?:purpose|goal|objective|aim)(?:\s+is|\s+of|\s*:)\s*/i, '').trim();
      }
      
      // Detect meeting type from conversation patterns
      if (content.includes('standup') || content.includes('daily') || content.includes('status update')) {
        meetingType = 'standup';
      } else if (content.includes('planning') || content.includes('roadmap') || content.includes('strategy')) {
        meetingType = 'planning';
      } else if (content.includes('review') || content.includes('retrospective') || content.includes('feedback')) {
        meetingType = 'review';
      } else if (content.includes('brainstorm') || content.includes('ideation') || content.includes('creative')) {
        meetingType = 'brainstorm';
      }
      
      // Detect urgency
      if (content.includes('urgent') || content.includes('asap') || content.includes('critical') || content.includes('emergency')) {
        urgency = 'high';
      } else if (content.includes('soon') || content.includes('priority') || content.includes('important')) {
        urgency = 'medium';
      }
      
      // Extract key topics and keywords with better patterns
      const words = content.split(/\s+/).filter(word => word.length > 3);
      words.forEach(word => {
        if (this.isRelevantKeyword(word)) {
          keywords.add(word);
        }
      });
      
      // Enhanced topic extraction with multiple patterns
      const topicPatterns = [
        /(?:about|discuss|review|regarding|talk about|focus on|cover)\s+([^.!?]+)/gi,
        /(?:topic|subject|matter)(?:\s+is|\s+of|\s*:)\s*([^.!?]+)/gi,
        /(?:need to|should|must|have to)\s+(discuss|review|talk about|address)\s+([^.!?]+)/gi
      ];
      
      topicPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const topic = match.replace(pattern, '$1$2').trim();
            if (topic.length > 3 && topic.length < 80) {
              topics.add(topic);
            }
          });
        }
      });
      
      // Extract potential action items
      const actionPatterns = [
        /(?:need to|should|must|have to|will|going to)\s+([^.!?]+)/gi,
        /(?:action|task|todo)(?:\s*:)\s*([^.!?]+)/gi,
        /(?:follow up|check|review|update|create|implement)\s+([^.!?]+)/gi
      ];
      
      actionPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const action = match.replace(/^(?:need to|should|must|have to|will|going to|action|task|todo|follow up|check|review|update|create|implement)(?:\s*:)?\s*/i, '').trim();
            if (action.length > 5 && action.length < 100) {
              actionItems.add(action);
            }
          });
        }
      });
      
      // Extract participant mentions (email addresses or @mentions)
      const emailMatches = content.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
      if (emailMatches) {
        emailMatches.forEach(email => participants.add(email));
      }
      
      const mentionMatches = content.match(/@(\w+)/g);
      if (mentionMatches) {
        mentionMatches.forEach(mention => participants.add(mention.substring(1)));
      }
    }
    
    return {
      purpose: purpose || this.inferPurposeFromTopics(Array.from(topics)),
      topics: Array.from(topics).slice(0, 8),
      keywords: Array.from(keywords).slice(0, 10),
      participants: Array.from(participants).slice(0, 10),
      actionItems: Array.from(actionItems).slice(0, 6),
      meetingType: meetingType as MeetingType,
      urgency: urgency as 'low' | 'normal' | 'medium' | 'high',
      duration: this.estimateDurationFromContext(Array.from(topics), Array.from(actionItems))
    };
  }

  /**
   * Extract context summary from conversation (legacy method for backward compatibility)
   */
  private extractContextFromConversation(conversation: ConversationMessage[]): string {
    const analysis = this.analyzeConversationContext(conversation);
    return `Purpose: ${analysis.purpose}. Topics: ${analysis.topics.join(', ')}. Keywords: ${analysis.keywords.join(', ')}.`;
  }

  /**
   * Check if a word is relevant for agenda generation
   */
  private isRelevantKeyword(word: string): boolean {
    const relevantWords = [
      'project', 'update', 'review', 'planning', 'strategy', 'budget',
      'timeline', 'goals', 'objectives', 'issues', 'challenges', 'solutions',
      'progress', 'status', 'deliverables', 'requirements', 'feedback'
    ];
    
    return relevantWords.includes(word.toLowerCase());
  }

  /**
   * Extract description for a topic based on its title
   */
  private extractTopicDescription(title: string): string | undefined {
    const lowerTitle = title.toLowerCase();
    
    if (lowerTitle.includes('welcome') || lowerTitle.includes('introduction')) {
      return 'Brief introductions and meeting overview';
    }
    if (lowerTitle.includes('review') || lowerTitle.includes('status')) {
      return 'Review current progress and status updates';
    }
    if (lowerTitle.includes('discussion') || lowerTitle.includes('brainstorm')) {
      return 'Open discussion and idea sharing';
    }
    if (lowerTitle.includes('action') || lowerTitle.includes('next steps')) {
      return 'Define action items and next steps';
    }
    
    return undefined;
  }

  /**
   * Determine priority based on action item text
   */
  private determinePriority(actionText: string): 'high' | 'medium' | 'low' {
    const lowerText = actionText.toLowerCase();
    
    if (lowerText.includes('urgent') || lowerText.includes('asap') || lowerText.includes('critical')) {
      return 'high';
    }
    if (lowerText.includes('important') || lowerText.includes('priority') || lowerText.includes('deadline')) {
      return 'high';
    }
    if (lowerText.includes('follow up') || lowerText.includes('check') || lowerText.includes('monitor')) {
      return 'low';
    }
    
    return 'medium';
  }

  /**
   * Adjust topic durations to fit total meeting time
   */
  private adjustTopicDurations(topics: AgendaTopic[], totalDuration: number): void {
    const currentTotal = topics.reduce((sum, topic) => sum + topic.duration, 0);
    
    if (currentTotal === totalDuration) {
      return; // Already fits perfectly
    }
    
    const ratio = totalDuration / currentTotal;
    let remainingTime = totalDuration;
    
    // Adjust each topic proportionally, ensuring minimum 5 minutes
    for (let i = 0; i < topics.length; i++) {
      const topic = topics[i];
      const adjustedDuration = Math.round(topic.duration * ratio);
      const minDuration = Math.min(5, Math.floor(remainingTime / (topics.length - i)));
      
      topic.duration = Math.max(minDuration, Math.min(adjustedDuration, remainingTime - (topics.length - i - 1) * 5));
      remainingTime -= topic.duration;
    }
  }

  /**
   * Format agenda content as text
   */
  formatAgenda(content: AgendaContent): string {
    let formatted = `# ${content.title}\n\n`;
    formatted += `**Duration:** ${content.duration} minutes\n\n`;
    
    if (content.topics.length > 0) {
      formatted += `## Agenda Items\n\n`;
      content.topics.forEach((topic, index) => {
        formatted += `${index + 1}. **${topic.title}** (${topic.duration} min)\n`;
        if (topic.description) {
          formatted += `   ${topic.description}\n`;
        }
        if (topic.presenter) {
          formatted += `   *Presenter: ${topic.presenter}*\n`;
        }
        formatted += '\n';
      });
    }
    
    if (content.actionItems.length > 0) {
      formatted += `## Action Items\n\n`;
      content.actionItems.forEach((item, index) => {
        formatted += `${index + 1}. ${item.task}`;
        if (item.assignee) {
          formatted += ` (*${item.assignee}*)`;
        }
        if (item.deadline) {
          formatted += ` - Due: ${item.deadline}`;
        }
        formatted += ` [${item.priority.toUpperCase()}]\n`;
      });
    }
    
    return formatted;
  }

  /**
   * Validate agenda content
   */
  validateAgenda(agenda: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check minimum length
    if (agenda.length < 50) {
      errors.push('Agenda is too short. Please add more details.');
    }
    
    // Check for basic structure
    if (!agenda.includes('1.') && !agenda.includes('•') && !agenda.includes('-')) {
      warnings.push('Agenda should include numbered or bulleted items.');
    }
    
    // Check for time allocations
    if (!agenda.match(/\d+\s*min/i)) {
      warnings.push('Consider adding time allocations for agenda items.');
    }
    
    // Check length (not too long)
    if (agenda.length > 2000) {
      warnings.push('Agenda is quite long. Consider condensing for better readability.');
    }
    
    // Check for action items section
    if (!agenda.toLowerCase().includes('action') && !agenda.toLowerCase().includes('next steps')) {
      warnings.push('Consider adding an action items or next steps section.');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Build enhanced prompt for AI agenda generation
   */
  private buildEnhancedPrompt(
    title: string,
    meetingType: string,
    duration: number,
    attendees: string[],
    contextAnalysis: ConversationAnalysis
  ): string {
    const urgencyText = contextAnalysis.urgency === 'high' ? 'URGENT - ' : 
                       contextAnalysis.urgency === 'medium' ? 'Important - ' : '';
    
    let prompt = `Generate a professional meeting agenda for "${urgencyText}${title}".

Meeting Details:
- Type: ${meetingType} (${contextAnalysis.meetingType} format)
- Duration: ${duration} minutes
- Attendees: ${attendees.length} people
- Urgency: ${contextAnalysis.urgency}

Meeting Purpose: ${contextAnalysis.purpose}

Key Topics to Cover:
${contextAnalysis.topics.map((topic, i) => `${i + 1}. ${topic}`).join('\n')}

Relevant Keywords: ${contextAnalysis.keywords.join(', ')}`;

    if (contextAnalysis.actionItems.length > 0) {
      prompt += `\n\nPotential Action Items from Discussion:
${contextAnalysis.actionItems.map((item, i) => `- ${item}`).join('\n')}`;
    }

    if (contextAnalysis.participants.length > 0) {
      prompt += `\n\nKey Participants: ${contextAnalysis.participants.join(', ')}`;
    }

    prompt += `\n\nCreate a structured agenda with:
1. Brief welcome/context setting (2-5 min)
2. Main discussion topics with realistic time allocations
3. Action items and decision points
4. Next steps and wrap-up (5-10 min)

Requirements:
- Format as numbered list with time allocations in minutes
- Ensure total time does not exceed ${duration} minutes
- Include specific discussion points based on the topics mentioned
- Be concise but comprehensive
- Focus on actionable outcomes`;

    return prompt;
  }

  /**
   * Get system prompt based on meeting type
   */
  private getSystemPromptForMeetingType(meetingType: MeetingType): string {
    const prompts = {
      standup: 'You are a professional standup meeting facilitator. Create efficient, focused agendas that keep teams aligned and identify blockers quickly.',
      planning: 'You are a strategic planning facilitator. Create comprehensive agendas that guide teams through goal-setting, timeline planning, and resource allocation.',
      review: 'You are a project review specialist. Create structured agendas that facilitate thorough progress assessment, lessons learned, and improvement planning.',
      brainstorm: 'You are a creative facilitation expert. Create dynamic agendas that encourage idea generation, creative thinking, and collaborative problem-solving.',
      general: 'You are a professional meeting agenda generator. Create clear, time-efficient agendas that maximize productivity and ensure all participants contribute meaningfully.'
    };
    
    return prompts[meetingType] || prompts.general;
  }

  /**
   * Parse agenda text with enhanced parsing capabilities
   */
  private parseAgendaTextEnhanced(
    agendaText: string, 
    totalDuration: number, 
    contextAnalysis: ConversationAnalysis
  ): AgendaContent {
    const basicParsed = this.parseAgendaText(agendaText, totalDuration);
    
    // Enhance with context analysis
    const enhancedTopics = basicParsed.topics.map(topic => ({
      ...topic,
      description: topic.description || this.generateTopicDescription(topic.title, contextAnalysis),
      presenter: this.suggestPresenter(topic.title, contextAnalysis.participants)
    }));
    
    // Add action items from context if not already present
    const contextActionItems = contextAnalysis.actionItems
      .filter(item => !basicParsed.actionItems.some(existing => 
        existing.task.toLowerCase().includes(item.toLowerCase().substring(0, 20))
      ))
      .map(item => ({
        task: item,
        priority: this.determinePriority(item),
        assignee: this.suggestAssignee(item, contextAnalysis.participants)
      }));
    
    return {
      ...basicParsed,
      title: `${contextAnalysis.purpose ? contextAnalysis.purpose : basicParsed.title}`,
      topics: enhancedTopics,
      actionItems: [...basicParsed.actionItems, ...contextActionItems]
    };
  }

  /**
   * Generate topic description based on context
   */
  private generateTopicDescription(topicTitle: string, contextAnalysis: ConversationAnalysis): string | undefined {
    const lowerTitle = topicTitle.toLowerCase();
    
    // Check if topic matches any from context analysis
    const matchingTopic = contextAnalysis.topics.find(topic => 
      lowerTitle.includes(topic.toLowerCase().substring(0, 10)) ||
      topic.toLowerCase().includes(lowerTitle.substring(0, 10))
    );
    
    if (matchingTopic && matchingTopic !== topicTitle) {
      return `Discussion focus: ${matchingTopic}`;
    }
    
    // Use existing logic as fallback
    return this.extractTopicDescription(topicTitle);
  }

  /**
   * Suggest presenter based on participants
   */
  private suggestPresenter(topicTitle: string, participants: string[]): string | undefined {
    if (participants.length === 0) return undefined;
    
    const lowerTitle = topicTitle.toLowerCase();
    
    // Simple heuristic: if topic mentions a participant, suggest them
    const matchingParticipant = participants.find(participant => 
      lowerTitle.includes(participant.toLowerCase()) ||
      participant.toLowerCase().includes(lowerTitle.split(' ')[0])
    );
    
    return matchingParticipant;
  }

  /**
   * Suggest assignee for action items
   */
  private suggestAssignee(actionItem: string, participants: string[]): string | undefined {
    if (participants.length === 0) return undefined;
    
    const lowerAction = actionItem.toLowerCase();
    
    // Look for participant mentions in action item
    const matchingParticipant = participants.find(participant => 
      lowerAction.includes(participant.toLowerCase())
    );
    
    return matchingParticipant;
  }

  /**
   * Infer meeting purpose from topics
   */
  private inferPurposeFromTopics(topics: string[]): string {
    if (topics.length === 0) return 'General discussion and alignment';
    
    const topicsText = topics.join(' ').toLowerCase();
    
    if (topicsText.includes('planning') || topicsText.includes('roadmap') || topicsText.includes('strategy')) {
      return 'Strategic planning and roadmap discussion';
    }
    if (topicsText.includes('review') || topicsText.includes('progress') || topicsText.includes('status')) {
      return 'Progress review and status update';
    }
    if (topicsText.includes('problem') || topicsText.includes('issue') || topicsText.includes('challenge')) {
      return 'Problem-solving and issue resolution';
    }
    if (topicsText.includes('decision') || topicsText.includes('approve') || topicsText.includes('choose')) {
      return 'Decision-making and approval process';
    }
    
    return `Discussion on ${topics.slice(0, 2).join(' and ')}`;
  }

  /**
   * Estimate duration from context complexity
   */
  private estimateDurationFromContext(topics: string[], actionItems: string[]): number {
    const baseTime = 30; // minimum meeting time
    const topicTime = topics.length * 10; // 10 minutes per topic
    const actionTime = actionItems.length * 5; // 5 minutes per action item
    const bufferTime = 15; // buffer for discussion
    
    return Math.min(120, Math.max(baseTime, topicTime + actionTime + bufferTime));
  }

  /**
   * Enhance agenda content with validation fixes
   */
  private enhanceAgendaContent(
    content: AgendaContent, 
    contextAnalysis: ConversationAnalysis, 
    duration: number
  ): AgendaContent {
    // Ensure minimum content quality
    if (content.topics.length === 0) {
      content.topics = [
        { title: 'Opening and Context', duration: Math.floor(duration * 0.1) },
        { title: contextAnalysis.purpose || 'Main Discussion', duration: Math.floor(duration * 0.7) },
        { title: 'Action Items and Next Steps', duration: Math.floor(duration * 0.2) }
      ];
    }
    
    // Ensure action items exist
    if (content.actionItems.length === 0 && contextAnalysis.actionItems.length > 0) {
      content.actionItems = contextAnalysis.actionItems.slice(0, 3).map(item => ({
        task: item,
        priority: this.determinePriority(item)
      }));
    }
    
    // Adjust durations
    this.adjustTopicDurations(content.topics, duration);
    
    return content;
  }

  /**
   * Create enhanced fallback agenda when AI generation fails
   */
  private createEnhancedFallbackAgenda(
    meetingData: MeetingData,
    conversationContext: ConversationMessage[]
  ): AgendaContent {
    const contextAnalysis = this.analyzeConversationContext(conversationContext);
    const duration = meetingData.startTime && meetingData.endTime 
      ? Math.round((meetingData.endTime.getTime() - meetingData.startTime.getTime()) / (1000 * 60))
      : contextAnalysis.duration;
    
    const topics: AgendaTopic[] = [];
    
    // Add welcome if multiple attendees
    if (meetingData.attendees && meetingData.attendees.length > 2) {
      topics.push({
        title: 'Welcome & Introductions',
        duration: Math.min(10, Math.floor(duration * 0.15)),
        description: 'Brief introductions and meeting overview'
      });
    }
    
    // Add topics from context analysis
    if (contextAnalysis.topics.length > 0) {
      contextAnalysis.topics.slice(0, 4).forEach((topic, index) => {
        topics.push({
          title: topic,
          duration: Math.floor(duration * 0.6 / contextAnalysis.topics.length),
          description: `Discussion and alignment on ${topic.toLowerCase()}`
        });
      });
    } else {
      topics.push({
        title: contextAnalysis.purpose || 'Main Discussion',
        duration: Math.floor(duration * 0.6),
        description: 'Core meeting discussion and decision-making'
      });
    }
    
    // Add action items discussion
    topics.push({
      title: 'Action Items & Next Steps',
      duration: Math.floor(duration * 0.25),
      description: 'Define action items, assign responsibilities, and plan next steps'
    });
    
    // Adjust durations to match total
    this.adjustTopicDurations(topics, duration);
    
    // Create action items from context
    const actionItems: ActionItem[] = contextAnalysis.actionItems.slice(0, 4).map(item => ({
      task: item,
      priority: this.determinePriority(item),
      assignee: this.suggestAssignee(item, contextAnalysis.participants)
    }));
    
    // Add default action item if none from context
    if (actionItems.length === 0) {
      actionItems.push({
        task: 'Follow up on key discussion points',
        priority: 'medium'
      });
    }
    
    return {
      title: meetingData.title || contextAnalysis.purpose || 'Meeting Agenda',
      duration,
      topics,
      actionItems
    };
  }

  /**
   * Create fallback agenda when AI generation fails (legacy method)
   */
  private createFallbackAgenda(
    meetingData: MeetingData,
    conversationContext: ConversationMessage[]
  ): AgendaContent {
    const duration = meetingData.startTime && meetingData.endTime 
      ? Math.round((meetingData.endTime.getTime() - meetingData.startTime.getTime()) / (1000 * 60))
      : 60;
    
    const topics: AgendaTopic[] = [
      {
        title: 'Welcome & Introductions',
        duration: Math.min(10, Math.floor(duration * 0.15))
      },
      {
        title: 'Main Discussion',
        duration: Math.floor(duration * 0.6)
      },
      {
        title: 'Action Items & Next Steps',
        duration: Math.floor(duration * 0.25)
      }
    ];
    
    // Adjust durations to match total
    this.adjustTopicDurations(topics, duration);
    
    return {
      title: meetingData.title || 'Meeting Agenda',
      duration,
      topics,
      actionItems: [
        {
          task: 'Follow up on discussion points',
          priority: 'medium'
        }
      ]
    };
  }

  /**
   * Generate agenda based on template
   */
  async generateTemplateAgenda(
    template: 'standup' | 'planning' | 'review' | 'brainstorm',
    meetingData: MeetingData
  ): Promise<AgendaContent> {
    const duration = meetingData.startTime && meetingData.endTime 
      ? Math.round((meetingData.endTime.getTime() - meetingData.startTime.getTime()) / (1000 * 60))
      : 60;
    
    const templates = {
      standup: {
        topics: [
          { title: 'What did you accomplish yesterday?', duration: Math.floor(duration * 0.4) },
          { title: 'What will you work on today?', duration: Math.floor(duration * 0.4) },
          { title: 'Any blockers or challenges?', duration: Math.floor(duration * 0.2) }
        ],
        actionItems: [
          { task: 'Address identified blockers', priority: 'high' as const }
        ]
      },
      planning: {
        topics: [
          { title: 'Review objectives', duration: Math.floor(duration * 0.2) },
          { title: 'Discuss timeline and milestones', duration: Math.floor(duration * 0.4) },
          { title: 'Resource allocation', duration: Math.floor(duration * 0.2) },
          { title: 'Risk assessment', duration: Math.floor(duration * 0.2) }
        ],
        actionItems: [
          { task: 'Finalize project timeline', priority: 'high' as const },
          { task: 'Assign team responsibilities', priority: 'medium' as const }
        ]
      },
      review: {
        topics: [
          { title: 'Progress review', duration: Math.floor(duration * 0.3) },
          { title: 'Achievements and challenges', duration: Math.floor(duration * 0.3) },
          { title: 'Lessons learned', duration: Math.floor(duration * 0.2) },
          { title: 'Next steps', duration: Math.floor(duration * 0.2) }
        ],
        actionItems: [
          { task: 'Document lessons learned', priority: 'medium' as const },
          { task: 'Plan next phase activities', priority: 'high' as const }
        ]
      },
      brainstorm: {
        topics: [
          { title: 'Problem definition', duration: Math.floor(duration * 0.2) },
          { title: 'Idea generation', duration: Math.floor(duration * 0.5) },
          { title: 'Idea evaluation', duration: Math.floor(duration * 0.2) },
          { title: 'Next steps', duration: Math.floor(duration * 0.1) }
        ],
        actionItems: [
          { task: 'Research top ideas', priority: 'medium' as const },
          { task: 'Prepare implementation plan', priority: 'high' as const }
        ]
      }
    };
    
    const selectedTemplate = templates[template];
    
    return {
      title: `${template.charAt(0).toUpperCase() + template.slice(1)} Meeting Agenda`,
      duration,
      topics: selectedTemplate.topics,
      actionItems: selectedTemplate.actionItems
    };
  }
}

// Export singleton instance
export const agendaGenerator = new AgendaGenerator();