import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { fetchUpcomingEvents, deleteCalendarEvent, createCalendarEvent } from "./googleCalendar";
import { getGeminiResponse, extractMeetingIntent, generateMeetingTitles, enhancePurposeWording, verifyAttendees, generateMeetingAgenda, generateActionItems, type MistralMessage, getContextualResponse } from "./aiInterface.js";
import { generateResponse as mistralGenerateResponse } from "./mistralService.js";
import { createEventRequestSchema } from "../shared/schema.js";
import {
  validateMeetingCreation,
  validateMeetingType,
  validateAttendeeRequirements,
  validateTimeConstraints,
  validateEmailFormats
} from "./middleware/businessRulesMiddleware.js";
import { MeetingWorkflowOrchestrator } from "./meetingWorkflowOrchestrator.js";
import { performanceMonitor } from "./performanceMonitor.js";
import { createConversationContextEngine } from "./conversationContext.js";
import { BusinessRulesEngine } from "./businessRules.js";
import { AttendeeValidator } from "./attendeeValidator.js";
import { workflowChatIntegration } from "./workflowChatIntegration.js";
import performanceRoutes from "./routes/performanceRoutes.js";
import configHealthRoutes from "./routes/configHealth.js";
import errorReportingRoutes from "./routes/errorReportingRoutes";



// Helper functions for fallback processing when AI fails
function generateFallbackTitle(purpose: string): string {
  if (!purpose || purpose.trim().length === 0) {
    return "Team Meeting";
  }

  // Extract meaningful words (nouns, verbs) from the purpose
  const words = purpose.toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 3); // Filter out short words

  if (words.length === 0) {
    return "Team Meeting";
  }

  // Look for action verbs
  const actionVerbs = ['discuss', 'review', 'plan', 'analyze', 'create', 'design', 'build', 'develop', 'address', 'resolve', 'implement', 'update', 'organize', 'coordinate', 'schedule'];
  const action = words.find(word => actionVerbs.includes(word));

  // Get 2-3 key topic words
  const topicWords = words
    .filter(w => !actionVerbs.includes(w))
    .slice(0, 2);

  if (action && topicWords.length > 0) {
    // Format: "Action Topic Words"
    const title = [action.charAt(0).toUpperCase() + action.slice(1), ...topicWords.map(w => w.charAt(0).toUpperCase() + w.slice(1))].join(' ');
    return title.substring(0, 50); // Limit to 50 chars
  }

  // Fallback: Use first few meaningful words
  if (topicWords.length > 0) {
    const title = topicWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return title.substring(0, 50);
  }

  return "Team Meeting";
}

function generateFallbackPurpose(purpose: string): string {
  // Create a more professional and structured version of the original purpose
  if (!purpose || purpose.trim().length === 0) {
    return "Team meeting to discuss important matters.";
  }

  const sentences = purpose.split(/[.!?]+/).filter(s => s.trim().length > 0);

  if (sentences.length === 0) {
    return purpose + '.';
  }

  // Enhance the first sentence and add structure
  const mainPurpose = sentences[0].trim();
  let enhanced = mainPurpose.charAt(0).toUpperCase() + mainPurpose.slice(1);

  // Add additional context if there are multiple sentences
  if (sentences.length > 1) {
    enhanced += '. ' + sentences.slice(1, 3).join('. ').trim(); // Limit to 3 sentences total
  }

  // Ensure it ends with proper punctuation
  if (!enhanced.match(/[.!?]$/)) {
    enhanced += '.';
  }

  return enhanced;
}

function extractFallbackKeyPoints(purpose: string): string[] {
  if (!purpose || purpose.trim().length === 0) {
    return ["Discuss agenda", "Review progress", "Plan next steps"];
  }

  // Split into sentences
  const sentences = purpose.split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (sentences.length === 0) {
    // Extract key phrases from the purpose text
    const words = purpose.split(/[\s,;]+/).filter(w => w.length > 3);
    if (words.length > 0) {
      return [
        words.slice(0, 2).join(' '),
        words.slice(2, 4).join(' ') || "Review details",
        words.slice(4, 6).join(' ') || "Plan outcomes"
      ];
    }
    return ["Discuss agenda", "Review progress", "Plan next steps"];
  }

  if (sentences.length <= 3) {
    return sentences;
  }

  // Extract the most meaningful sentences as key points
  return sentences.slice(0, 3);
}

// Helper functions for UI block rendering
function getUIBlockPriority(blockType: string): 'high' | 'medium' | 'low' {
  switch (blockType) {
    case 'meeting_approval':
    case 'attendee_management':
      return 'high';
    case 'meeting_type_selection':
    case 'agenda_editor':
      return 'medium';
    default:
      return 'low';
  }
}

function isUIBlockInteractive(blockType: string): boolean {
  const interactiveBlocks = [
    'meeting_type_selection',
    'attendee_management',
    'meeting_approval',
    'agenda_editor',
    'attendee_editor',
    'title_suggestions',
    'event_review'
  ];
  return interactiveBlocks.includes(blockType);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication routes
  app.get('/api/auth/google', (req: Request, res: Response, next) => {
    // Check if remember me preference is set in query params
    const rememberMe = req.query.remember === 'true';

    // Store remember me preference in session for use in callback
    req.session.rememberMe = rememberMe;

    passport.authenticate('google', {
      scope: [
        'profile',
        'email',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/contacts.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.compose'
      ],
      accessType: 'offline',
      prompt: 'consent'
    })(req, res, next);
  });

  app.get('/api/auth/google/callback',
    (req: Request, res: Response, next) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] OAuth callback route accessed`);

      passport.authenticate('google', {
        failureRedirect: '/',
        failureMessage: true
      })(req, res, next);
    },
    (req: Request, res: Response) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] OAuth callback successful, user:`, req.user ? (req.user as any).name || (req.user as any).email : 'unknown');

      // Set session duration based on remember me preference
      const rememberMe = req.session.rememberMe;
      if (rememberMe) {
        // 30 days for remember me
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        console.log(`[${timestamp}] Extended session duration for remember me`);
      } else {
        // 24 hours for regular login
        req.session.cookie.maxAge = 24 * 60 * 60 * 1000;
        console.log(`[${timestamp}] Standard session duration`);
      }

      // Clean up the temporary remember me flag
      delete req.session.rememberMe;

      // Clear the last callback time to prevent duplicate processing
      delete req.session.lastCallbackTime;

      // Successful authentication, redirect to dashboard
      res.redirect('/');
    }
  );

  // Add error handling for OAuth failures
  app.get('/api/auth/error', (req: Request, res: Response) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] OAuth error accessed:`, req.flash());

    // Clear any session data that might be corrupted
    if (req.session) {
      delete req.session.lastCallbackTime;
    }

    res.status(401).json({
      error: 'Authentication failed',
      details: req.flash(),
      timestamp,
      suggestion: 'Please try logging in again. If the problem persists, please contact support.'
    });
  });

  // Handle OAuth errors with better error recovery
  app.use('/api/auth/google/callback', (err: any, req: Request, res: Response, next: any) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] OAuth callback error:`, err);

    // Clear session data on error
    if (req.session) {
      delete req.session.lastCallbackTime;
    }

    // If it's a TokenError (Bad Request), try to redirect to auth again
    if (err && err.name === 'TokenError' && err.message === 'Bad Request') {
      console.log(`[${timestamp}] TokenError detected, redirecting to auth`);
      return res.redirect('/api/auth/google');
    }

    // For other errors, redirect to error page
    res.redirect('/api/auth/error');
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({ success: true });
    });
  });

  app.get('/api/auth/user', (req: Request, res: Response) => {
    if (req.isAuthenticated()) {
      res.json({ user: req.user });
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  });

  // Extend session endpoint for active users
  app.post('/api/auth/extend-session', (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check if user has remember me preference
    const rememberMe = req.body.rememberMe || false;

    if (rememberMe) {
      // Extend session to 30 days
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
    } else {
      // Extend session to 24 hours
      req.session.cookie.maxAge = 24 * 60 * 60 * 1000;
    }

    res.json({ success: true, message: 'Session extended' });
  });

  // Calendar routes
  app.get('/api/calendar/events', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const events = await fetchUpcomingEvents(user);
      res.json({ events });
    } catch (error: any) {
      console.error('Error fetching calendar events:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch calendar events' });
    }
  });

  // Delete calendar event
  app.delete('/api/calendar/events/:eventId', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { eventId } = req.params;

      await deleteCalendarEvent(user, eventId);
      res.json({ success: true, message: 'Event deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting calendar event:', error);
      res.status(500).json({ error: error.message || 'Failed to delete calendar event' });
    }
  });

  // Get tasks for current user
  app.get('/api/tasks', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;

      // Import database and schema
      const { db } = await import('./storage.js');
      const { tasks, events } = await import('../shared/schema.js');
      const { eq } = await import('drizzle-orm');

      // Get all events for the current user
      const userEvents = await db
        .select()
        .from(events)
        .where(eq(events.userId, user.id));

      if (userEvents.length === 0) {
        return res.json({ tasks: [] });
      }

      // Get all tasks for user's events
      const eventIds = userEvents.map(event => event.id);
      const eventTasks = await db
        .select({
          id: tasks.id,
          eventId: tasks.eventId,
          title: tasks.title,
          description: tasks.description,
          assignee: tasks.assignee,
          deadline: tasks.deadline,
          status: tasks.status,
          createdAt: tasks.createdAt,
          eventTitle: events.title,
          eventStartTime: events.startTime
        })
        .from(tasks)
        .innerJoin(events, eq(tasks.eventId, events.id))
        .where(eq(events.userId, user.id));

      // Convert to frontend format
      const formattedTasks = eventTasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        assignee: task.assignee,
        deadline: task.deadline,
        status: task.status as 'pending' | 'in_progress' | 'completed',
        eventTitle: task.eventTitle,
        eventId: task.eventId,
        priority: 'medium' as const, // Default priority
        category: 'general'
      }));

      res.json({
        tasks: formattedTasks,
        totalCount: formattedTasks.length,
        meetingCount: userEvents.length
      });
    } catch (error: any) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch tasks' });
    }
  });

  // Update task status
  app.patch('/api/tasks/:taskId', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { taskId } = req.params;
      const { status } = req.body;

      if (!status || !['pending', 'in_progress', 'completed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      // Import database and schema
      const { db } = await import('./storage.js');
      const { tasks, events } = await import('../shared/schema.js');
      const { eq } = await import('drizzle-orm');

      // Update task status
      await db
        .update(tasks)
        .set({ status })
        .where(eq(tasks.id, taskId));

      res.json({
        success: true,
        message: 'Task updated successfully',
        taskId,
        status
      });
    } catch (error: any) {
      console.error('Error updating task:', error);
      res.status(500).json({ error: error.message || 'Failed to update task' });
    }
  });

  // Enhanced Gemini AI chat endpoint with contextual responses
  app.post('/api/chat', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { messages }: { messages: MistralMessage[] } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid messages format' });
      }

      // For multi-turn conversations, use the contextual response function
      if (messages.length > 1) {
        // Use the last user message as the current input
        const lastUserMessage = messages.filter(m => m.role === 'user').pop();
        if (lastUserMessage) {
          const response = await getContextualResponse(messages.slice(0, -1), lastUserMessage.content);
          return res.json({ response });
        }
      }

      // Fallback to standard response for single messages
      const response = await getGeminiResponse(messages);
      res.json({ response });
    } catch (error: any) {
      console.error('Error getting AI response:', error);
      res.status(500).json({ error: error.message || 'Failed to get AI response' });
    }
  });

  // Enhanced conversational meeting scheduler chat endpoint with workflow orchestration
  app.post('/api/chat/conversational', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { message, conversationId, context } = req.body;
      const user = req.user as any;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Process message through workflow integration with enhanced context support
      const response = await workflowChatIntegration.processMessage(
        user.id,
        message,
        conversationId,
        user
      );

      // Validate workflow state consistency
      const validation = await workflowChatIntegration.validateWorkflowState(
        user.id,
        conversationId || response.conversationId,
        user
      );

      // Add validation warnings to response if any
      if (validation.warnings.length > 0) {
        response.validation.warnings.push(...validation.warnings);
      }

      // Enhanced response with specialized UI block rendering
      const enhancedResponse = {
        ...response,
        // Add conversation context metadata
        conversationContext: {
          id: response.conversationId,
          mode: response.contextStats.currentMode,
          messageCount: response.contextStats.messageCount,
          hasWorkflowData: response.contextStats.hasMeetingData,
        },
        // Add workflow progress indicators
        workflowProgress: {
          currentStep: response.workflow.currentStep,
          progress: response.workflow.progress,
          nextAction: response.workflow.nextAction,
          canAdvance: !response.workflow.requiresUserInput,
        },
        // Include UI block rendering hints
        uiBlockRendering: response.uiBlock ? {
          type: response.uiBlock.type,
          priority: getUIBlockPriority(response.uiBlock.type),
          requiresUserAction: isUIBlockInteractive(response.uiBlock.type),
        } : null,
      };

      res.json(enhancedResponse);
    } catch (error: any) {
      console.error('Error processing conversational chat:', error);
      res.status(500).json({
        error: error.message || 'Failed to process conversational chat',
        conversationId: req.body.conversationId || null,
        fallbackMessage: 'I encountered an error processing your message. Please try again or start a new conversation.'
      });
    }
  });

  // AI meeting extraction endpoint
  app.post('/api/ai/extract-meeting', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { message, context } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Parse context if it's a stringified array
      let geminiContext: MistralMessage[] = [];
      if (typeof context === 'string') {
        try {
          geminiContext = JSON.parse(context);
        } catch (e) {
          // If parsing fails, treat as a simple string context
          geminiContext = [{ role: 'user', content: context }];
        }
      } else if (Array.isArray(context)) {
        geminiContext = context;
      }

      // Convert message format to ConversationMessage[] for extractMeetingIntent
      const conversationContext = geminiContext.map((msg, index) => ({
        id: `msg-${index}`,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(),
        metadata: undefined
      }));

      const extraction = await extractMeetingIntent(message, conversationContext);
      res.json({ extraction });
    } catch (error: any) {
      console.error('Error extracting meeting intent:', error);
      res.status(500).json({ error: error.message || 'Failed to extract meeting intent' });
    }
  });

  // AI title generation endpoint
  app.post('/api/ai/generate-titles', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { purpose, participants, context } = req.body;

      if (!purpose || typeof purpose !== 'string') {
        return res.status(400).json({ error: 'Purpose is required' });
      }

      console.log('Processing purpose with Mistral AI:', purpose);

      // Generate titles using Mistral
      const titleSuggestion = await generateMeetingTitles(
        purpose,
        participants || [],
        context || ''
      );

      const selectedTitle = titleSuggestion.suggestions[0];
      console.log('Generated title:', selectedTitle);

      // Enhance purpose using Mistral
      const purposeEnhancement = await enhancePurposeWording(
        purpose,
        selectedTitle,
        participants || [],
        context || ''
      );

      console.log('Enhanced purpose and extracted key points');

      res.json({
        title: selectedTitle,
        titleSuggestions: titleSuggestion.suggestions,
        enhancedPurpose: purposeEnhancement.enhancedPurpose,
        keyPoints: purposeEnhancement.keyPoints,
        context: titleSuggestion.context
      });
    } catch (error: any) {
      console.error('Mistral AI error, attempting fallback:', error);

      try {
        const { purpose, participants, context } = req.body;
        
        // Fallback: Generate with basic processing
        const fallbackTitle = generateFallbackTitle(purpose);
        const fallbackPurpose = generateFallbackPurpose(purpose);

        console.log('Using fallback processing');

        res.json({
          title: fallbackTitle,
          titleSuggestions: [fallbackTitle, `${fallbackTitle} Discussion`, `${fallbackTitle} Planning`],
          enhancedPurpose: fallbackPurpose,
          keyPoints: extractFallbackKeyPoints(purpose),
          fallback: true,
          error: error.message
        });
      } catch (fallbackError: any) {
        console.error('Both Mistral and fallback failed:', fallbackError);
        res.status(500).json({ error: error.message || 'Failed to generate meeting titles and purpose' });
      }
    }
  });

  // AI endpoint for generating title and enhanced purpose together (using Mistral)
  app.post('/api/ai/generate-title-and-purpose', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { purpose, participants, context } = req.body;

    if (!purpose || typeof purpose !== 'string') {
      return res.status(400).json({ error: 'Purpose is required' });
    }

    console.log('Processing purpose with Mistral AI:', purpose);

    try {
      // Generate titles using Mistral
      const titleSuggestion = await generateMeetingTitles(
        purpose,
        participants || [],
        context || ''
      );

      const selectedTitle = titleSuggestion.suggestions[0];
      console.log('Generated title:', selectedTitle);

      // Enhance purpose using Mistral
      const purposeEnhancement = await enhancePurposeWording(
        purpose,
        selectedTitle,
        participants || [],
        context || ''
      );

      console.log('Mistral AI processing successful:', {
        title: selectedTitle,
        enhancedPurpose: purposeEnhancement.enhancedPurpose?.substring(0, 100) + '...',
        keyPointsCount: purposeEnhancement.keyPoints?.length || 0
      });

      // Enhanced debug logging for enhanced purpose
      console.log('Full enhanced purpose:', purposeEnhancement.enhancedPurpose);
      console.log('Enhanced purpose length:', purposeEnhancement.enhancedPurpose?.length || 0);
      console.log('Enhanced purpose is empty?', !purposeEnhancement.enhancedPurpose || purposeEnhancement.enhancedPurpose.trim() === '');

      res.json({
        title: selectedTitle,
        titleSuggestions: titleSuggestion.suggestions,
        enhancedPurpose: purposeEnhancement.enhancedPurpose,
        keyPoints: purposeEnhancement.keyPoints,
        context: titleSuggestion.context
      });
    } catch (error: any) {
      console.error('Mistral AI error, attempting fallback:', error);

      try {
        // Fallback: Generate with basic processing
        const fallbackTitle = generateFallbackTitle(purpose);
        const fallbackPurpose = generateFallbackPurpose(purpose);

        console.log('Using fallback processing:', fallbackTitle);

        res.json({
          title: fallbackTitle,
          titleSuggestions: [fallbackTitle, `${fallbackTitle} Discussion`, `${fallbackTitle} Review`],
          enhancedPurpose: fallbackPurpose,
          keyPoints: extractFallbackKeyPoints(purpose),
          fallback: 'hardcoded',
          error: error.message
        });
      } catch (fallbackError: any) {
        console.error('Both Mistral and fallback failed:', fallbackError);
        res.status(500).json({ error: error.message || 'Failed to generate meeting titles and purpose' });
      }
    }
  });

  // AI time extraction endpoint for natural language processing
  app.post('/api/ai/extract-time', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { message, context } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Import time extractor
      const { extractTimeFromMessage } = await import('./timeExtractor.js');

      const extractedTime = await extractTimeFromMessage(message, context);

      if (extractedTime) {
        res.json({
          startTime: extractedTime.startTime.toISOString(),
          endTime: extractedTime.endTime?.toISOString(),
          confidence: extractedTime.confidence,
          reasoning: extractedTime.reasoning
        });
      } else {
        res.status(400).json({
          error: 'Could not extract time from message',
          message: 'Please provide a clearer time description (e.g., "tomorrow at 2pm" or "October 16 at 3:30pm")'
        });
      }
    } catch (error: any) {
      console.error('Error extracting time:', error);
      res.status(500).json({ error: error.message || 'Failed to extract time' });
    }
  });

  // AI field identification endpoint for "Change Something" workflow
  app.post('/api/ai/identify-field-to-edit', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { message, currentMeeting } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Use Gemini to identify which field the user wants to edit
      const prompt = `
        Based on the user's message: "${message}"

        Current meeting data:
        ${JSON.stringify(currentMeeting, null, 2)}

        Identify which field the user wants to edit. Possible fields are:
        - attendees (if they want to add/remove/change attendees)
        - time (if they want to change the meeting time)
        - purpose (if they want to change the meeting description/purpose)
        - title (if they want to change the meeting title)
        - type (if they want to change meeting type, but this should be rare as it's locked)

        Return a JSON response with:
        {
          "field": "field_name_or_null",
          "confidence": 0.0_to_1.0,
          "reasoning": "explanation_of_choice"
        }

        If unsure, return field as null.
      `;

      const response = await getGeminiResponse([{ role: 'user', content: prompt }]);

      try {
        // Try to parse the response as JSON
        const parsedResponse = JSON.parse(response);
        res.json(parsedResponse);
      } catch (parseError) {
        // If parsing fails, return a default response
        res.json({
          field: null,
          confidence: 0.3,
          reasoning: 'Could not parse AI response'
        });
      }
    } catch (error: any) {
      console.error('Error identifying field to edit:', error);
      res.status(500).json({ error: error.message || 'Failed to identify field to edit' });
    }
  });

  // New endpoint for attendee verification
  app.post('/api/ai/verify-attendees', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { emails } = req.body;

      if (!emails || !Array.isArray(emails)) {
        return res.status(400).json({ error: 'Emails array is required' });
      }

      const verificationResults = await verifyAttendees(emails);
      res.json({ verificationResults });
    } catch (error: any) {
      console.error('Error verifying attendees:', error);
      res.status(500).json({ error: error.message || 'Failed to verify attendees' });
    }
  });

  // Attendee validation endpoint for AttendeeEditor component
  app.post('/api/attendees/validate', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }

      const user = req.user as any;
      const { attendeeValidator } = await import('./attendeeValidator.js');

      const validationResult = await attendeeValidator.validateEmail(email.trim().toLowerCase(), user);
      res.json(validationResult);
    } catch (error: any) {
      console.error('Error validating attendee email:', error);
      res.status(500).json({ error: error.message || 'Failed to validate attendee email' });
    }
  });

  // Batch attendee validation endpoint
  app.post('/api/attendees/validate-batch', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { emails } = req.body;

      if (!emails || !Array.isArray(emails)) {
        return res.status(400).json({ error: 'Emails array is required' });
      }

      const user = req.user as any;
      const { attendeeValidator } = await import('./attendeeValidator.js');

      const validationResults = await attendeeValidator.validateBatch(emails, user);
      res.json(validationResults);
    } catch (error: any) {
      console.error('Error validating attendee emails:', error);
      res.status(500).json({ error: error.message || 'Failed to validate attendee emails' });
    }
  });

  // New endpoint for agenda generation
  app.post('/api/ai/generate-agenda', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { title, purpose, participants, duration, context } = req.body;

      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'Title is required' });
      }

      const agenda = await generateMeetingAgenda(
        title,
        purpose || '',
        participants || [],
        duration || 60,
        context || ''
      );
      res.json({ agenda });
    } catch (error: any) {
      console.error('Error generating meeting agenda:', error);
      res.status(500).json({ error: error.message || 'Failed to generate meeting agenda' });
    }
  });

  // New endpoint for action items generation
  app.post('/api/ai/generate-action-items', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { title, purpose, participants, topics, context } = req.body;

      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'Title is required' });
      }

      const actionItems = await generateActionItems(
        title,
        purpose || '',
        participants || [],
        topics || [],
        context || ''
      );
      res.json({ actionItems });
    } catch (error: any) {
      console.error('Error generating action items:', error);
      res.status(500).json({ error: error.message || 'Failed to generate action items' });
    }
  });

  // Enhanced agenda generation endpoint using AgendaGenerator
  app.post('/api/agenda/generate', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { meetingData, conversationContext, enhancedPurpose } = req.body;

      if (!meetingData) {
        return res.status(400).json({ error: 'Meeting data is required' });
      }

      // Import agenda generator
      const { agendaGenerator } = await import('./agendaGenerator.js');

      const agendaContent = await agendaGenerator.generateAgenda(
        meetingData,
        conversationContext || [],
        enhancedPurpose
      );

      const formattedAgenda = agendaGenerator.formatAgenda(agendaContent);

      res.json({
        agenda: formattedAgenda,
        agendaContent,
        validation: agendaGenerator.validateAgenda(formattedAgenda)
      });
    } catch (error: any) {
      console.error('Error generating agenda:', error);
      res.status(500).json({ error: error.message || 'Failed to generate agenda' });
    }
  });

  // Agenda validation endpoint
  app.post('/api/agenda/validate', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { agenda } = req.body;

      if (!agenda) {
        return res.status(400).json({ error: 'Agenda content is required' });
      }

      // Import agenda generator
      const { agendaGenerator } = await import('./agendaGenerator.js');

      const validation = agendaGenerator.validateAgenda(agenda);

      res.json({ validation });
    } catch (error: any) {
      console.error('Error validating agenda:', error);
      res.status(500).json({ error: error.message || 'Failed to validate agenda' });
    }
  });

  // Template-based agenda generation endpoint
  app.post('/api/agenda/generate-template', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { template, meetingData } = req.body;

      if (!template || !meetingData) {
        return res.status(400).json({ error: 'Template and meeting data are required' });
      }

      // Import agenda template service
      const { agendaTemplateService } = await import('./agendaTemplates.js');

      const templateData = agendaTemplateService.getTemplate(template);
      if (!templateData) {
        return res.status(400).json({ error: 'Invalid template ID' });
      }

      const formattedAgenda = agendaTemplateService.generateAgendaFromTemplate(template, meetingData);

      // Import agenda generator for validation
      const { agendaGenerator } = await import('./agendaGenerator.js');
      const validation = agendaGenerator.validateAgenda(formattedAgenda);

      res.json({
        agenda: formattedAgenda,
        template: templateData,
        validation,
        generatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error generating template agenda:', error);
      res.status(500).json({ error: error.message || 'Failed to generate template agenda' });
    }
  });

  // Get all available agenda templates
  app.get('/api/agenda/templates', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { category, search } = req.query;

      // Import agenda template service
      const { agendaTemplateService } = await import('./agendaTemplates.js');

      let templates;
      if (search) {
        templates = agendaTemplateService.searchTemplates(search as string);
      } else if (category) {
        templates = agendaTemplateService.getTemplatesByCategory(category as any);
      } else {
        templates = agendaTemplateService.getAllTemplates();
      }

      res.json({
        templates,
        totalCount: templates.length,
        categories: ['standup', 'planning', 'review', 'brainstorm', 'decision', 'training', 'retrospective']
      });
    } catch (error: any) {
      console.error('Error getting agenda templates:', error);
      res.status(500).json({ error: error.message || 'Failed to get agenda templates' });
    }
  });

  // Suggest templates based on meeting purpose
  app.post('/api/agenda/suggest-templates', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { purpose, duration } = req.body;

      if (!purpose) {
        return res.status(400).json({ error: 'Meeting purpose is required' });
      }

      // Import agenda template service
      const { agendaTemplateService } = await import('./agendaTemplates.js');

      const suggestions = agendaTemplateService.suggestTemplates(purpose, duration);

      res.json({
        suggestions,
        totalSuggestions: suggestions.length,
        basedOn: {
          purpose: purpose.substring(0, 100) + (purpose.length > 100 ? '...' : ''),
          duration
        }
      });
    } catch (error: any) {
      console.error('Error suggesting templates:', error);
      res.status(500).json({ error: error.message || 'Failed to suggest templates' });
    }
  });

  // Agenda quality analysis endpoint
  app.post('/api/agenda/analyze-quality', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { content, context } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Agenda content is required' });
      }

      // Import agenda quality service
      const { agendaQualityService } = await import('./agendaQualityService.js');

      const qualityReport = agendaQualityService.analyzeQuality(content, context);
      const improvementSuggestions = agendaQualityService.getImprovementSuggestions(content, context);
      const minimumValidation = agendaQualityService.validateMinimumQuality(content, context);

      res.json({
        qualityReport,
        improvementSuggestions,
        minimumValidation,
        analyzedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error analyzing agenda quality:', error);
      res.status(500).json({ error: error.message || 'Failed to analyze agenda quality' });
    }
  });

  // Agenda enhancement endpoint
  app.post('/api/agenda/enhance', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { content, context } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Agenda content is required' });
      }

      // Import agenda quality service
      const { agendaQualityService } = await import('./agendaQualityService.js');

      const enhancedContent = agendaQualityService.enhanceAgenda(content, context);
      const qualityReport = agendaQualityService.analyzeQuality(enhancedContent, context);

      res.json({
        originalContent: content,
        enhancedContent,
        qualityReport,
        improvements: qualityReport.improvements,
        enhancedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error enhancing agenda:', error);
      res.status(500).json({ error: error.message || 'Failed to enhance agenda' });
    }
  });

  // Agenda version management endpoints

  // Get version history for an agenda
  app.get('/api/agenda/versions/:agendaId', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { agendaId } = req.params;
      const { limit = '20', offset = '0' } = req.query;

      // Import agenda version service
      const { agendaVersionService } = await import('./agendaVersionService.js');

      const versions = agendaVersionService.getVersions(agendaId);
      const stats = agendaVersionService.getVersionStats(agendaId);

      // Apply pagination
      const parsedLimit = Math.min(parseInt(limit as string) || 20, 50);
      const parsedOffset = Math.max(parseInt(offset as string) || 0, 0);
      const paginatedVersions = versions.slice(parsedOffset, parsedOffset + parsedLimit);

      res.json({
        versions: paginatedVersions,
        stats,
        pagination: {
          limit: parsedLimit,
          offset: parsedOffset,
          total: versions.length,
          hasMore: parsedOffset + parsedLimit < versions.length
        }
      });
    } catch (error: any) {
      console.error('Error getting agenda versions:', error);
      res.status(500).json({ error: error.message || 'Failed to get agenda versions' });
    }
  });

  // Create a new version
  app.post('/api/agenda/versions/:agendaId', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { agendaId } = req.params;
      const { content, title, changeType, changeDescription, metadata } = req.body;
      const user = req.user as any;

      if (!content || !title) {
        return res.status(400).json({ error: 'Content and title are required' });
      }

      // Import agenda version service
      const { agendaVersionService } = await import('./agendaVersionService.js');

      const newVersion = agendaVersionService.createVersion(
        agendaId,
        content,
        title,
        user.id,
        changeType || 'edited',
        changeDescription,
        metadata
      );

      res.json({
        version: newVersion,
        message: 'Version created successfully'
      });
    } catch (error: any) {
      console.error('Error creating agenda version:', error);
      res.status(500).json({ error: error.message || 'Failed to create agenda version' });
    }
  });

  // Compare two versions
  app.get('/api/agenda/versions/:agendaId/compare', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { agendaId } = req.params;
      const { from, to } = req.query;

      if (!from || !to) {
        return res.status(400).json({ error: 'From and to version numbers are required' });
      }

      const fromVersion = parseInt(from as string);
      const toVersion = parseInt(to as string);

      if (isNaN(fromVersion) || isNaN(toVersion)) {
        return res.status(400).json({ error: 'Invalid version numbers' });
      }

      // Import agenda version service
      const { agendaVersionService } = await import('./agendaVersionService.js');

      const comparison = agendaVersionService.compareVersions(agendaId, fromVersion, toVersion);

      if (!comparison) {
        return res.status(404).json({ error: 'One or both versions not found' });
      }

      res.json({
        comparison,
        comparedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error comparing agenda versions:', error);
      res.status(500).json({ error: error.message || 'Failed to compare agenda versions' });
    }
  });

  // Get latest version
  app.get('/api/agenda/versions/:agendaId/latest', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { agendaId } = req.params;

      // Import agenda version service
      const { agendaVersionService } = await import('./agendaVersionService.js');

      const latestVersion = agendaVersionService.getLatestVersion(agendaId);

      if (!latestVersion) {
        return res.status(404).json({ error: 'No versions found for this agenda' });
      }

      res.json({
        version: latestVersion
      });
    } catch (error: any) {
      console.error('Error getting latest agenda version:', error);
      res.status(500).json({ error: error.message || 'Failed to get latest agenda version' });
    }
  });

  // Collaborative editing endpoints

  // Create a new collaborative session
  app.post('/api/collaborative/sessions', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { agendaId } = req.body;
      const user = req.user as any;

      if (!agendaId) {
        return res.status(400).json({ error: 'Agenda ID is required' });
      }

      // Import collaborative agenda service
      const { collaborativeAgendaService } = await import('./collaborativeAgendaService.js');

      const session = collaborativeAgendaService.createSession(
        agendaId,
        user.id,
        user.email,
        user.name || user.email
      );

      res.json({
        session,
        message: 'Collaborative session created successfully'
      });
    } catch (error: any) {
      console.error('Error creating collaborative session:', error);
      res.status(500).json({ error: error.message || 'Failed to create collaborative session' });
    }
  });

  // Join a collaborative session
  app.post('/api/collaborative/sessions/:sessionId/join', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { sessionId } = req.params;
      const user = req.user as any;

      // Import collaborative agenda service
      const { collaborativeAgendaService } = await import('./collaborativeAgendaService.js');

      const collaborator = collaborativeAgendaService.joinSession(
        sessionId,
        user.id,
        user.email,
        user.name || user.email
      );

      if (!collaborator) {
        return res.status(404).json({ error: 'Session not found or inactive' });
      }

      res.json({
        collaborator,
        message: 'Joined collaborative session successfully'
      });
    } catch (error: any) {
      console.error('Error joining collaborative session:', error);
      res.status(500).json({ error: error.message || 'Failed to join collaborative session' });
    }
  });

  // Leave a collaborative session
  app.post('/api/collaborative/sessions/:sessionId/leave', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { sessionId } = req.params;
      const user = req.user as any;

      // Import collaborative agenda service
      const { collaborativeAgendaService } = await import('./collaborativeAgendaService.js');

      const success = collaborativeAgendaService.leaveSession(sessionId, user.id);

      if (!success) {
        return res.status(404).json({ error: 'Session not found or user not in session' });
      }

      res.json({
        message: 'Left collaborative session successfully'
      });
    } catch (error: any) {
      console.error('Error leaving collaborative session:', error);
      res.status(500).json({ error: error.message || 'Failed to leave collaborative session' });
    }
  });

  // Get session information
  app.get('/api/collaborative/sessions/:sessionId', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { sessionId } = req.params;

      // Import collaborative agenda service
      const { collaborativeAgendaService } = await import('./collaborativeAgendaService.js');

      const stats = collaborativeAgendaService.getSessionStats(sessionId);

      if (!stats) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json(stats);
    } catch (error: any) {
      console.error('Error getting session information:', error);
      res.status(500).json({ error: error.message || 'Failed to get session information' });
    }
  });

  // Record an agenda change
  app.post('/api/collaborative/changes', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { sessionId, agendaId, changeType, position, content, length, previousContent, metadata } = req.body;
      const user = req.user as any;

      if (!sessionId || !agendaId || !changeType || !position) {
        return res.status(400).json({ error: 'Session ID, agenda ID, change type, and position are required' });
      }

      // Import collaborative agenda service
      const { collaborativeAgendaService } = await import('./collaborativeAgendaService.js');

      const change = collaborativeAgendaService.recordChange({
        sessionId,
        agendaId,
        userId: user.id,
        userName: user.name || user.email,
        changeType: changeType as any,
        position,
        content,
        length,
        previousContent,
        metadata
      });

      res.json({
        change,
        message: 'Change recorded successfully'
      });
    } catch (error: any) {
      console.error('Error recording agenda change:', error);
      res.status(500).json({ error: error.message || 'Failed to record agenda change' });
    }
  });

  // Get recent changes for an agenda
  app.get('/api/collaborative/agendas/:agendaId/changes', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { agendaId } = req.params;
      const { limit = '50', since } = req.query;

      // Import collaborative agenda service
      const { collaborativeAgendaService } = await import('./collaborativeAgendaService.js');

      let changes;
      if (since) {
        changes = collaborativeAgendaService.getChangesSince(agendaId, new Date(since as string));
      } else {
        changes = collaborativeAgendaService.getRecentChanges(agendaId, parseInt(limit as string));
      }

      res.json({
        changes,
        totalCount: changes.length,
        agendaId
      });
    } catch (error: any) {
      console.error('Error getting agenda changes:', error);
      res.status(500).json({ error: error.message || 'Failed to get agenda changes' });
    }
  });

  // Update cursor position
  app.post('/api/collaborative/cursor', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { sessionId, line, column } = req.body;
      const user = req.user as any;

      if (!sessionId || line === undefined || column === undefined) {
        return res.status(400).json({ error: 'Session ID, line, and column are required' });
      }

      // Import collaborative agenda service
      const { collaborativeAgendaService } = await import('./collaborativeAgendaService.js');

      const success = collaborativeAgendaService.updateCursor(sessionId, user.id, line, column);

      if (!success) {
        return res.status(404).json({ error: 'Session not found or user not in session' });
      }

      res.json({ message: 'Cursor position updated' });
    } catch (error: any) {
      console.error('Error updating cursor position:', error);
      res.status(500).json({ error: error.message || 'Failed to update cursor position' });
    }
  });

  // Update text selection
  app.post('/api/collaborative/selection', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { sessionId, startLine, startColumn, endLine, endColumn } = req.body;
      const user = req.user as any;

      if (!sessionId || startLine === undefined || startColumn === undefined) {
        return res.status(400).json({ error: 'Session ID, start line, and start column are required' });
      }

      // Import collaborative agenda service
      const { collaborativeAgendaService } = await import('./collaborativeAgendaService.js');

      const success = collaborativeAgendaService.updateSelection(
        sessionId,
        user.id,
        startLine,
        startColumn,
        endLine ?? startLine,
        endColumn ?? startColumn
      );

      if (!success) {
        return res.status(404).json({ error: 'Session not found or user not in session' });
      }

      res.json({ message: 'Text selection updated' });
    } catch (error: any) {
      console.error('Error updating text selection:', error);
      res.status(500).json({ error: error.message || 'Failed to update text selection' });
    }
  });

  // Acquire a lock on an agenda section
  app.post('/api/collaborative/locks', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { sessionId, agendaId, section } = req.body;
      const user = req.user as any;

      if (!sessionId || !agendaId || !section) {
        return res.status(400).json({ error: 'Session ID, agenda ID, and section are required' });
      }

      // Import collaborative agenda service
      const { collaborativeAgendaService } = await import('./collaborativeAgendaService.js');

      const lock = collaborativeAgendaService.acquireLock(sessionId, agendaId, section, user.id);

      if (!lock) {
        return res.status(409).json({ error: 'Section is already locked by another user' });
      }

      res.json({
        lock,
        message: 'Lock acquired successfully'
      });
    } catch (error: any) {
      console.error('Error acquiring lock:', error);
      res.status(500).json({ error: error.message || 'Failed to acquire lock' });
    }
  });

  // Release a lock
  app.delete('/api/collaborative/locks/:lockId', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { lockId } = req.params;

      // Import collaborative agenda service
      const { collaborativeAgendaService } = await import('./collaborativeAgendaService.js');

      const success = collaborativeAgendaService.releaseLock(lockId);

      if (!success) {
        return res.status(404).json({ error: 'Lock not found' });
      }

      res.json({ message: 'Lock released successfully' });
    } catch (error: any) {
      console.error('Error releasing lock:', error);
      res.status(500).json({ error: error.message || 'Failed to release lock' });
    }
  });

  // Calendar integration endpoints

  // Get or create sync settings for user
  app.get('/api/calendar/sync-settings', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;

      // Import calendar agenda sync service
      const { calendarAgendaSyncService } = await import('./calendarAgendaSyncService.js');

      let settings = calendarAgendaSyncService.getSyncSettings(user.id);

      if (!settings) {
        settings = calendarAgendaSyncService.createSyncSettings(user.id, {});
      }

      res.json({ settings });
    } catch (error: any) {
      console.error('Error getting sync settings:', error);
      res.status(500).json({ error: error.message || 'Failed to get sync settings' });
    }
  });

  // Update sync settings
  app.post('/api/calendar/sync-settings', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const updates = req.body;

      // Import calendar agenda sync service
      const { calendarAgendaSyncService } = await import('./calendarAgendaSyncService.js');

      const settings = calendarAgendaSyncService.updateSyncSettings(user.id, updates);

      if (!settings) {
        return res.status(404).json({ error: 'Sync settings not found' });
      }

      res.json({
        settings,
        message: 'Sync settings updated successfully'
      });
    } catch (error: any) {
      console.error('Error updating sync settings:', error);
      res.status(500).json({ error: error.message || 'Failed to update sync settings' });
    }
  });

  // Test calendar connection
  app.post('/api/calendar/test-connection', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;

      // Import calendar agenda sync service
      const { calendarAgendaSyncService } = await import('./calendarAgendaSyncService.js');

      const testResult = await calendarAgendaSyncService.testCalendarConnection(user);

      res.json({
        ...testResult,
        testedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error testing calendar connection:', error);
      res.status(500).json({ error: error.message || 'Failed to test calendar connection' });
    }
  });

  // Get relevant calendar events for agenda sync
  app.get('/api/calendar/relevant-events', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { agendaId } = req.query;

      // Import calendar agenda sync service
      const { calendarAgendaSyncService } = await import('./calendarAgendaSyncService.js');

      const events = await calendarAgendaSyncService.getRelevantCalendarEvents(user, agendaId as string);

      res.json({
        events,
        totalCount: events.length,
        retrievedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error getting relevant calendar events:', error);
      res.status(500).json({ error: error.message || 'Failed to get relevant calendar events' });
    }
  });

  // Sync agenda to calendar
  app.post('/api/calendar/sync-agenda', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { agendaContent, meetingData, calendarEventId } = req.body;
      const user = req.user as any;

      if (!agendaContent || !meetingData) {
        return res.status(400).json({ error: 'Agenda content and meeting data are required' });
      }

      // Import calendar agenda sync service
      const { calendarAgendaSyncService } = await import('./calendarAgendaSyncService.js');

      // Queue the update for sync
      const update = calendarAgendaSyncService.queueAgendaUpdate(
        meetingData.id || `agenda_${Date.now()}`,
        calendarEventId || meetingData.calendarEventId,
        user.id,
        'updated',
        [
          {
            field: 'agenda',
            oldValue: meetingData.previousAgenda || '',
            newValue: agendaContent
          }
        ]
      );

      // Perform the sync
      const syncResult = await calendarAgendaSyncService.syncToCalendar(user, agendaContent, meetingData);

      res.json({
        syncResult,
        update,
        syncedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error syncing agenda to calendar:', error);
      res.status(500).json({ error: error.message || 'Failed to sync agenda to calendar' });
    }
  });

  // Get sync statistics
  app.get('/api/calendar/sync-stats', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;

      // Import calendar agenda sync service
      const { calendarAgendaSyncService } = await import('./calendarAgendaSyncService.js');

      const stats = calendarAgendaSyncService.getSyncStats(user.id);

      res.json({
        ...stats,
        retrievedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error getting sync statistics:', error);
      res.status(500).json({ error: error.message || 'Failed to get sync statistics' });
    }
  });

  // Force sync all pending updates
  app.post('/api/calendar/force-sync', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { agendaContent, meetingData } = req.body;
      const user = req.user as any;

      if (!agendaContent || !meetingData) {
        return res.status(400).json({ error: 'Agenda content and meeting data are required' });
      }

      // Import calendar agenda sync service
      const { calendarAgendaSyncService } = await import('./calendarAgendaSyncService.js');

      const syncResult = await calendarAgendaSyncService.forceSync(user, agendaContent, meetingData);

      res.json({
        syncResult,
        forcedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error force syncing to calendar:', error);
      res.status(500).json({ error: error.message || 'Failed to force sync to calendar' });
    }
  });

  // Clean up old sync updates
  app.post('/api/calendar/cleanup', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { olderThanDays = 30 } = req.body;

      // Import calendar agenda sync service
      const { calendarAgendaSyncService } = await import('./calendarAgendaSyncService.js');

      const removedCount = calendarAgendaSyncService.cleanupOldUpdates(user.id, olderThanDays);

      res.json({
        message: `Cleaned up ${removedCount} old sync updates`,
        removedCount,
        cleanedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error cleaning up sync updates:', error);
      res.status(500).json({ error: error.message || 'Failed to clean up sync updates' });
    }
  });

  // Validate meeting data endpoint (for pre-validation before creation)
  app.post('/api/meetings/validate', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { businessRulesMiddleware } = await import('./middleware/businessRulesMiddleware.js');
      const rulesEngine = businessRulesMiddleware.getRulesEngine();

      const meetingData = req.body;
      const validationResult = rulesEngine.validateMeeting(meetingData);

      res.json({
        isValid: validationResult.isValid,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        rules: rulesEngine.getValidationRules()
      });
    } catch (error: any) {
      console.error('Error validating meeting data:', error);
      res.status(500).json({ error: error.message || 'Failed to validate meeting data' });
    }
  });

  // Workflow management endpoints

  // Get workflow state for a conversation
  app.get('/api/workflow/state/:conversationId?', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { conversationId } = req.params;

      const state = await workflowChatIntegration.getWorkflowState(user.id, conversationId, user);
      res.json(state);
    } catch (error: any) {
      console.error('Error getting workflow state:', error);
      res.status(500).json({ error: error.message || 'Failed to get workflow state' });
    }
  });

  // Reset workflow for a conversation
  app.post('/api/workflow/reset/:conversationId?', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { conversationId } = req.params;

      const resetConversationId = await workflowChatIntegration.resetWorkflow(user.id, conversationId, user);

      res.json({
        success: true,
        message: 'Workflow reset successfully',
        conversationId: resetConversationId
      });
    } catch (error: any) {
      console.error('Error resetting workflow:', error);
      res.status(500).json({ error: error.message || 'Failed to reset workflow' });
    }
  });

  // Update meeting data in workflow
  app.post('/api/workflow/update-meeting/:conversationId?', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { conversationId } = req.params;
      const { meetingData } = req.body;

      if (!meetingData) {
        return res.status(400).json({ error: 'Meeting data is required' });
      }

      await workflowChatIntegration.updateMeetingData(user.id, meetingData, conversationId);
      const state = await workflowChatIntegration.getWorkflowState(user.id, conversationId, user);

      res.json({
        success: true,
        message: 'Meeting data updated successfully',
        conversationId: state.conversationId,
        meetingData: state.workflow.meetingData
      });
    } catch (error: any) {
      console.error('Error updating meeting data:', error);
      res.status(500).json({ error: error.message || 'Failed to update meeting data' });
    }
  });

  // Process workflow step transition
  app.post('/api/workflow/transition/:conversationId?', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { conversationId } = req.params;
      const { step, data, fromStep } = req.body;

      if (!step) {
        return res.status(400).json({ error: 'Workflow step is required' });
      }

      const transitionResult = await workflowChatIntegration.advanceWorkflowStep(
        user.id,
        step,
        data,
        conversationId,
        user
      );

      const state = await workflowChatIntegration.getWorkflowState(user.id, conversationId, user);

      res.json({
        success: transitionResult.success,
        message: transitionResult.message,
        conversationId: state.conversationId,
        workflow: transitionResult.workflow,
        validation: transitionResult.validation
      });
    } catch (error: any) {
      console.error('Error processing workflow transition:', error);
      res.status(500).json({ error: error.message || 'Failed to process workflow transition' });
    }
  });

  // Handle UI block interactions
  app.post('/api/workflow/ui-interaction', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { blockType, action, data, conversationId } = req.body;

      // Validate required parameters
      if (!blockType) {
        return res.status(400).json({ error: 'Block type is required' });
      }

      if (!action) {
        return res.status(400).json({ error: 'Action is required' });
      }

      // Combine action and data into blockData format expected by workflowChatIntegration
      const blockData = {
        action,
        ...data
      };

      const response = await workflowChatIntegration.handleUIBlockInteraction(
        user.id,
        blockType,
        blockData,
        conversationId,
        user
      );

      res.json(response);
    } catch (error: any) {
      console.error('Error handling UI block interaction:', error);
      res.status(500).json({ error: error.message || 'Failed to handle UI block interaction' });
    }
  });

  // Get conversation history with workflow context
  app.get('/api/workflow/history/:conversationId', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { conversationId } = req.params;
      const { 
        limit = '20', 
        offset = '0', 
        includeWorkflowState = 'true',
        messageType,
        fromDate,
        toDate 
      } = req.query;

      // Validate pagination parameters
      const parsedLimit = Math.min(parseInt(limit as string) || 20, 100); // Max 100 messages
      const parsedOffset = Math.max(parseInt(offset as string) || 0, 0);

      // Validate conversation ownership
      const currentState = await workflowChatIntegration.getWorkflowState(user.id, conversationId, user);
      if (!currentState) {
        return res.status(404).json({ error: 'Conversation not found or access denied' });
      }

      const history = await workflowChatIntegration.getConversationHistory(
        user.id,
        conversationId,
        parsedLimit,
        parsedOffset,
        user
      );

      // Apply additional filtering if requested
      let filteredMessages = history.messages;

      // Filter by message type (user/assistant)
      if (messageType && ['user', 'assistant'].includes(messageType as string)) {
        filteredMessages = filteredMessages.filter(msg => msg.role === messageType);
      }

      // Filter by date range
      if (fromDate) {
        const fromDateTime = new Date(fromDate as string);
        if (!isNaN(fromDateTime.getTime())) {
          filteredMessages = filteredMessages.filter(msg => new Date(msg.timestamp) >= fromDateTime);
        }
      }

      if (toDate) {
        const toDateTime = new Date(toDate as string);
        if (!isNaN(toDateTime.getTime())) {
          filteredMessages = filteredMessages.filter(msg => new Date(msg.timestamp) <= toDateTime);
        }
      }

      // Enhanced response with workflow context
      const enhancedHistory = {
        messages: filteredMessages,
        totalCount: history.totalCount,
        filteredCount: filteredMessages.length,
        hasMore: history.hasMore,
        pagination: {
          limit: parsedLimit,
          offset: parsedOffset,
          nextOffset: parsedOffset + parsedLimit,
          hasNext: history.hasMore
        },
        // Include workflow state if requested
        ...(includeWorkflowState === 'true' && {
          workflowState: {
            currentStep: history.workflowState.currentStep,
            progress: history.workflowState.progress,
            isComplete: history.workflowState.isComplete,
            meetingData: history.workflowState.meetingData,
            errors: history.workflowState.errors || [],
            warnings: history.workflowState.warnings || []
          }
        }),
        // Add conversation metadata
        conversationMetadata: {
          id: conversationId,
          messageCount: history.totalCount,
          lastActivity: filteredMessages.length > 0 ? filteredMessages[0].timestamp : null,
          hasWorkflowData: !!history.workflowState.meetingData && Object.keys(history.workflowState.meetingData).length > 0
        }
      };

      res.json(enhancedHistory);
    } catch (error: any) {
      console.error('Error getting conversation history:', error);
      res.status(500).json({ error: error.message || 'Failed to get conversation history' });
    }
  });

  // Validate workflow state consistency
  app.get('/api/workflow/validate/:conversationId?', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { conversationId } = req.params;

      const validation = await workflowChatIntegration.validateWorkflowState(
        user.id,
        conversationId,
        user
      );

      res.json(validation);
    } catch (error: any) {
      console.error('Error validating workflow state:', error);
      res.status(500).json({ error: error.message || 'Failed to validate workflow state' });
    }
  });

  // Advance workflow to next step
  app.post('/api/workflow/advance/:conversationId', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { conversationId } = req.params;
      const { step, data } = req.body;

      // Validate conversation ownership
      const currentState = await workflowChatIntegration.getWorkflowState(user.id, conversationId, user);
      if (!currentState) {
        return res.status(404).json({ error: 'Conversation not found or access denied' });
      }

      // Advance workflow step
      const result = await workflowChatIntegration.advanceWorkflowStep(
        user.id,
        step,
        data,
        conversationId,
        user
      );

      res.json(result);
    } catch (error: any) {
      console.error('Error advancing workflow step:', error);
      res.status(500).json({ error: error.message || 'Failed to advance workflow step' });
    }
  });

  // Enhanced attendee validation endpoint for conversational workflow
  app.post('/api/conversational/attendees/validate', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { email, conversationId } = req.body;
      const user = req.user as any;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }

      const { attendeeValidator } = await import('./attendeeValidator.js');
      const validationResult = await attendeeValidator.validateEmail(email.trim().toLowerCase(), user);

      // Update conversation context with validation result if conversationId provided
      if (conversationId && validationResult.isValid) {
        try {
          const currentState = await workflowChatIntegration.getWorkflowState(user.id, conversationId, user);
          const existingAttendees = currentState.workflow.meetingData?.attendees || [];

          // Add validated attendee if not already present
          const attendeeExists = existingAttendees.some((a: any) => a.email === email.trim().toLowerCase());
          if (!attendeeExists) {
            const newAttendee = {
              email: email.trim().toLowerCase(),
              firstName: validationResult.firstName,
              lastName: validationResult.lastName,
              profilePicture: validationResult.profilePicture,
              isValidated: true,
              isRequired: true,
            };

            await workflowChatIntegration.updateMeetingData(
              user.id,
              { attendees: [...existingAttendees, newAttendee] },
              conversationId
            );
          }
        } catch (contextError) {
          console.warn('Failed to update conversation context with attendee:', contextError);
          // Don't fail the validation, just log the warning
        }
      }

      res.json({
        ...validationResult,
        conversationId,
        contextUpdated: !!conversationId && validationResult.isValid,
      });
    } catch (error: any) {
      console.error('Error validating conversational attendee:', error);
      res.status(500).json({ error: error.message || 'Failed to validate attendee' });
    }
  });

  // Batch attendee validation for conversational workflow
  app.post('/api/conversational/attendees/validate-batch', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { emails, conversationId } = req.body;
      const user = req.user as any;

      if (!emails || !Array.isArray(emails)) {
        return res.status(400).json({ error: 'Emails array is required' });
      }

      const { attendeeValidator } = await import('./attendeeValidator.js');
      const validationResults = await attendeeValidator.validateBatch(emails, user);

      // Update conversation context with all valid attendees if conversationId provided
      if (conversationId) {
        try {
          const validAttendees = validationResults
            .filter(result => result.isValid)
            .map(result => ({
              email: result.email,
              firstName: result.firstName,
              lastName: result.lastName,
              profilePicture: result.profilePicture,
              isValidated: true,
              isRequired: true,
            }));

          if (validAttendees.length > 0) {
            await workflowChatIntegration.updateMeetingData(
              user.id,
              { attendees: validAttendees },
              conversationId
            );
          }
        } catch (contextError) {
          console.warn('Failed to update conversation context with batch attendees:', contextError);
        }
      }

      res.json({
        results: validationResults,
        conversationId,
        contextUpdated: !!conversationId,
        validCount: validationResults.filter(r => r.isValid).length,
        totalCount: validationResults.length,
      });
    } catch (error: any) {
      console.error('Error batch validating conversational attendees:', error);
      res.status(500).json({ error: error.message || 'Failed to validate attendees' });
    }
  });

  // Meeting creation endpoint for conversational workflow
  app.post('/api/conversational/meetings/create', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { conversationId, meetingData } = req.body;
      const user = req.user as any;

      if (!conversationId) {
        return res.status(400).json({ error: 'Conversation ID is required' });
      }

      // Get current workflow state
      const workflowState = await workflowChatIntegration.getWorkflowState(user.id, conversationId, user);
      const finalMeetingData = { ...workflowState.workflow.meetingData, ...meetingData };

      // Enhanced validation using business rules - Requirements: 1.4, 4.4, 5.3
      const { businessRulesMiddleware } = await import('./middleware/businessRulesMiddleware.js');
      const rulesEngine = businessRulesMiddleware.getRulesEngine();
      
      // Basic meeting data validation
      const validationResult = rulesEngine.validateMeeting(finalMeetingData);
      
      // Enhanced workflow sequence validation
      const workflowValidation = rulesEngine.validateWorkflowSequence(
        workflowState.workflow.calendarAccessStatus?.hasAccess || false,
        workflowState.workflow.timeCollectionComplete || false,
        !!workflowState.workflow.availabilityResult,
        finalMeetingData.type,
        workflowState.workflow.attendeeCollectionComplete || false
      );

      // Calendar access validation
      const calendarValidation = rulesEngine.validateCalendarAccess(
        workflowState.workflow.calendarAccessStatus?.hasAccess || false,
        workflowState.workflow.calendarAccessStatus?.needsRefresh || false,
        workflowState.workflow.calendarAccessStatus?.tokenValid !== false
      );

      // Availability check validation
      const availabilityValidation = rulesEngine.validateAvailabilityCheck(
        !!workflowState.workflow.availabilityResult,
        workflowState.workflow.availabilityResult?.conflicts?.length > 0,
        workflowState.workflow.availabilityResult?.isAvailable
      );

      // Combine all validation results
      const allErrors = [
        ...validationResult.errors,
        ...workflowValidation.errors,
        ...calendarValidation.errors
      ];

      const allWarnings = [
        ...validationResult.warnings,
        ...workflowValidation.warnings,
        ...calendarValidation.warnings,
        ...availabilityValidation.warnings
      ];

      if (allErrors.length > 0) {
        return res.status(400).json({
          error: 'Meeting creation validation failed',
          validationErrors: allErrors,
          warnings: allWarnings,
          details: {
            basicValidation: validationResult,
            workflowValidation,
            calendarValidation,
            availabilityValidation
          }
        });
      }

      // Create calendar event
      const eventData = {
        title: finalMeetingData.title,
        startTime: finalMeetingData.startTime,
        endTime: finalMeetingData.endTime,
        description: (finalMeetingData as any).enhancedPurpose || finalMeetingData.agenda || '',
        attendees: finalMeetingData.attendees?.map((a: any) => ({
          email: a.email,
          name: a.firstName ? `${a.firstName} ${a.lastName || ''}`.trim() : undefined,
        })) || [],
        createMeetLink: finalMeetingData.type === 'online',
      };

      const createdEvent = await createCalendarEvent(user, eventData, eventData.createMeetLink ? 'online' : 'physical');

      // Update workflow state to completed
      await workflowChatIntegration.advanceWorkflowStep(
        user.id,
        'creation',
        { ...finalMeetingData, meetingLink: createdEvent.meetingLink },
        conversationId,
        user
      );

      res.json({
        success: true,
        event: createdEvent,
        meetingData: finalMeetingData,
        conversationId,
        message: 'Meeting created successfully!',
        warnings: validationResult.warnings,
      });
    } catch (error: any) {
      console.error('Error creating conversational meeting:', error);
      res.status(500).json({
        error: error.message || 'Failed to create meeting',
        conversationId: req.body.conversationId,
      });
    }
  });

  // Create calendar event with enhanced features and business rules validation
  app.post('/api/calendar/events',
    validateEmailFormats,
    validateTimeConstraints,
    validateMeetingType,
    validateAttendeeRequirements,
    validateMeetingCreation,
    async (req: Request, res: Response) => {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      try {
        const user = req.user as any;

        // Validate request body using Zod schema
        const validationResult = createEventRequestSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            error: 'Invalid request data',
            details: validationResult.error.errors
          });
        }

        const eventData = validationResult.data;

        // Use enhanced purpose if available, otherwise fall back to original description
        const requestBody = req.body as any;
        const description = requestBody.enhancedPurpose || eventData.description || '';

        // Create the calendar event with optional Meet link
        const createdEvent = await createCalendarEvent(
          user,
          { ...eventData, description },
          eventData.createMeetLink ? 'online' : 'physical'
        );

        // Include any validation warnings in the response
        const response: any = {
          success: true,
          event: createdEvent,
          message: 'Meeting created successfully!'
        };

        // Add validation warnings if they exist
        if (req.validationResult?.warnings && req.validationResult.warnings.length > 0) {
          response.warnings = req.validationResult.warnings;
        }

        // Initiate transcript workflow after successful meeting creation
        try {
          const { MeetingWorkflowOrchestrator } = await import('./meetingWorkflowOrchestrator.js');
          const { createConversationContextEngine } = await import('./conversationContext.js');
          const contextEngine = await createConversationContextEngine(user.id);
          const businessRules = new BusinessRulesEngine();
          const attendeeValidator = new AttendeeValidator();

          const workflowOrchestrator = new MeetingWorkflowOrchestrator(
            contextEngine,
            businessRules,
            attendeeValidator,
            user
          );

          // Create meeting data for transcript workflow
          const meetingData = {
            id: createdEvent.id || `meeting-${Date.now()}`,
            title: eventData.title,
            type: (eventData.createMeetLink ? 'online' : 'physical') as 'online' | 'physical',
            startTime: new Date(eventData.startTime),
            endTime: new Date(eventData.endTime),
            attendees: eventData.attendees?.map((a: any) => ({
              email: a.email,
              firstName: a.name?.split(' ')[0],
              lastName: a.name?.split(' ').slice(1).join(' '),
              isValidated: true,
              isRequired: true
            })) || [],
            agenda: description,
            meetingLink: createdEvent.meetingLink ?? undefined,
            status: 'created' as const
          };

          // Initiate transcript workflow asynchronously (don't wait for it)
          workflowOrchestrator.initiateTranscriptWorkflow(
            createdEvent.id || `meeting-${Date.now()}`,
            meetingData,
            user
          ).catch((transcriptError: any) => {
            console.error('Error initiating transcript workflow:', transcriptError);
            // Don't fail the meeting creation for transcript errors
          });

          console.log(`📋 Transcript workflow initiated for meeting: ${createdEvent.id}`);
        } catch (transcriptError) {
          console.error('Error setting up transcript workflow:', transcriptError);
          // Don't fail the meeting creation for transcript setup errors
        }

        res.json(response);
      } catch (error: any) {
        console.error('Error creating calendar event:', error);
        res.status(500).json({ error: error.message || 'Failed to create calendar event' });
      }
    }
  );

  // Email workflow endpoints
  app.post('/api/email/send-agenda', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { meetingId, attendees, meetingData, agendaContent, retryConfig } = req.body;

      if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
        return res.status(400).json({ error: 'Attendees are required' });
      }

      if (!meetingData) {
        return res.status(400).json({ error: 'Meeting data is required' });
      }

      if (!agendaContent) {
        return res.status(400).json({ error: 'Agenda content is required' });
      }

      // Import email workflow orchestrator
      const { emailWorkflowOrchestrator } = await import('./emailWorkflowOrchestrator.js');

      const user = req.user as any;

      const jobId = await emailWorkflowOrchestrator.startEmailSendingWorkflow(
        user,
        meetingId || `meeting_${Date.now()}`,
        attendees,
        meetingData,
        agendaContent,
        retryConfig
      );

      res.json({
        jobId,
        message: 'Email sending workflow started',
        status: 'pending'
      });
    } catch (error: any) {
      console.error('Error starting email workflow:', error);
      res.status(500).json({ error: error.message || 'Failed to start email workflow' });
    }
  });

  app.get('/api/email/status/:jobId', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { jobId } = req.params;

      // Import email workflow orchestrator
      const { emailWorkflowOrchestrator } = await import('./emailWorkflowOrchestrator.js');

      const status = emailWorkflowOrchestrator.getEmailSendingStatus(jobId);

      if (!status) {
        return res.status(404).json({ error: 'Email job not found' });
      }

      res.json(status);
    } catch (error: any) {
      console.error('Error getting email status:', error);
      res.status(500).json({ error: error.message || 'Failed to get email status' });
    }
  });

  app.post('/api/email/retry/:jobId', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { jobId } = req.params;

      // Import email workflow orchestrator
      const { emailWorkflowOrchestrator } = await import('./emailWorkflowOrchestrator.js');

      const user = req.user as any;

      const success = await emailWorkflowOrchestrator.retryEmailSendingJob(user, jobId);

      if (!success) {
        return res.status(400).json({ error: 'Cannot retry job - job not found or max retries exceeded' });
      }

      res.json({
        message: 'Email job retry started',
        jobId,
        status: 'pending'
      });
    } catch (error: any) {
      console.error('Error retrying email job:', error);
      res.status(500).json({ error: error.message || 'Failed to retry email job' });
    }
  });

  app.delete('/api/email/cancel/:jobId', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { jobId } = req.params;

      // Import email workflow orchestrator
      const { emailWorkflowOrchestrator } = await import('./emailWorkflowOrchestrator.js');

      const success = emailWorkflowOrchestrator.cancelEmailSendingJob(jobId);

      if (!success) {
        return res.status(400).json({ error: 'Cannot cancel job - job not found or already completed' });
      }

      res.json({
        message: 'Email job cancelled successfully',
        jobId,
        status: 'cancelled'
      });
    } catch (error: any) {
      console.error('Error cancelling email job:', error);
      res.status(500).json({ error: error.message || 'Failed to cancel email job' });
    }
  });

  // Agenda approval workflow endpoints

  // Update agenda content during approval workflow
  app.post('/api/agenda/update/:conversationId?', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { conversationId } = req.params;
      const { meetingId, agenda } = req.body;

      if (!agenda) {
        return res.status(400).json({ error: 'Agenda content is required' });
      }

      // Validate agenda content
      const { agendaGenerator } = await import('./agendaGenerator.js');
      const validation = agendaGenerator.validateAgenda(agenda);

      // Update meeting data with new agenda
      await workflowChatIntegration.updateMeetingData(
        user.id,
        { agenda },
        conversationId
      );

      res.json({
        success: true,
        message: 'Agenda updated successfully',
        validation,
        meetingId
      });
    } catch (error: any) {
      console.error('Error updating agenda:', error);
      res.status(500).json({ error: error.message || 'Failed to update agenda' });
    }
  });

  // Regenerate agenda during approval workflow
  app.post('/api/agenda/regenerate/:conversationId?', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { conversationId } = req.params;
      const { meetingId, meetingData, conversationContext } = req.body;

      if (!meetingData) {
        return res.status(400).json({ error: 'Meeting data is required for regeneration' });
      }

      // Import agenda generator
      const { agendaGenerator } = await import('./agendaGenerator.js');

      // Regenerate agenda with conversation context
      const agendaContent = await agendaGenerator.generateAgenda(
        meetingData,
        conversationContext || [],
        (meetingData as any).enhancedPurpose
      );

      const formattedAgenda = agendaGenerator.formatAgenda(agendaContent);
      const validation = agendaGenerator.validateAgenda(formattedAgenda);

      // Update meeting data with regenerated agenda
      await workflowChatIntegration.updateMeetingData(
        user.id,
        { agenda: formattedAgenda },
        conversationId
      );

      res.json({
        success: true,
        message: 'Agenda regenerated successfully',
        agenda: formattedAgenda,
        agendaContent,
        validation,
        meetingId
      });
    } catch (error: any) {
      console.error('Error regenerating agenda:', error);
      res.status(500).json({ error: error.message || 'Failed to regenerate agenda' });
    }
  });

  // Approve agenda and advance workflow
  app.post('/api/agenda/approve/:conversationId?', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { conversationId } = req.params;
      const { meetingId, agenda } = req.body;

      if (!agenda) {
        return res.status(400).json({ error: 'Agenda content is required for approval' });
      }

      // Validate agenda before approval
      const { agendaGenerator } = await import('./agendaGenerator.js');
      const validation = agendaGenerator.validateAgenda(agenda);

      if (!validation.isValid) {
        return res.status(400).json({
          error: 'Agenda validation failed',
          validation,
          message: `Please fix the following issues: ${validation.errors.join(', ')}`
        });
      }

      // Update meeting data with approved agenda
      await workflowChatIntegration.updateMeetingData(
        user.id,
        { agenda },
        conversationId
      );

      // Advance workflow to approval step
      const transitionResult = await workflowChatIntegration.advanceWorkflowStep(
        user.id,
        'approval',
        { agenda },
        conversationId
      );

      res.json({
        success: transitionResult.success,
        message: transitionResult.success
          ? 'Agenda approved successfully. Ready for final meeting approval.'
          : transitionResult.message,
        workflow: transitionResult.workflow,
        validation: {
          ...transitionResult.validation,
          agendaValidation: validation
        },
        meetingId
      });
    } catch (error: any) {
      console.error('Error approving agenda:', error);
      res.status(500).json({ error: error.message || 'Failed to approve agenda' });
    }
  });

  // Get current agenda for a conversation
  app.get('/api/agenda/current/:conversationId?', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { conversationId } = req.params;

      const state = await workflowChatIntegration.getWorkflowState(user.id, conversationId);
      const agenda = state.workflow.meetingData.agenda;

      if (!agenda) {
        return res.status(404).json({ error: 'No agenda found for this conversation' });
      }

      // Validate current agenda
      const { agendaGenerator } = await import('./agendaGenerator.js');
      const validation = agendaGenerator.validateAgenda(agenda);

      res.json({
        agenda,
        validation,
        meetingData: state.workflow.meetingData,
        workflowStep: state.workflow.currentStep
      });
    } catch (error: any) {
      console.error('Error getting current agenda:', error);
      res.status(500).json({ error: error.message || 'Failed to get current agenda' });
    }
  });

  // Generate agenda endpoint for streamlined workflow
  app.post('/api/meetings/generate-agenda', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { meetingId, title, purpose, enhancedPurpose, participants, duration, meetingLink } = req.body;

      if (!title || !purpose) {
        return res.status(400).json({ error: 'Title and purpose are required' });
      }

      // Import agenda generator
      const { agendaGenerator } = await import('./agendaGenerator.js');

      // Create meeting data structure for agenda generation
      const meetingData = {
        id: meetingId,
        title,
        description: enhancedPurpose || purpose,
        attendees: participants.map((email: string) => ({
          email,
          isValidated: true,
          isRequired: true,
          firstName: email.split('@')[0]
        })),
        type: 'online' as const,
        status: 'draft' as const,
        startTime: new Date(),
        endTime: new Date(Date.now() + (duration || 60) * 60 * 1000)
      };

      // Generate agenda
      const agendaContent = await agendaGenerator.generateAgenda(
        meetingData,
        [],
        enhancedPurpose
      );
      const formattedAgenda = agendaGenerator.formatAgenda(agendaContent);

      res.json({
        success: true,
        agenda: {
          title,
          duration: duration || 60,
          topics: agendaContent.topics || [],
          actionItems: agendaContent.actionItems || [],
          enhancedPurpose: enhancedPurpose
        }
      });

    } catch (error: any) {
      console.error('Error generating agenda:', error);
      res.status(500).json({ error: error.message || 'Failed to generate agenda' });
    }
  });

  // Helper function to validate AI response completeness - more strict for completeness
  function validateAgendaResponse(response: string, title: string, enhancedPurpose: string): boolean {
    console.log('🔍 Validating agenda response:', {
      length: response.length,
      hasTitle: response.includes(title.substring(0, 20)),
      hasH2: response.includes('<h2>'),
      hasH3: response.includes('<h3>'),
      hasContent: response.includes('<p>') || response.includes('<ul>') || response.includes('<li>'),
      sectionCount: (response.match(/<h3>/g) || []).length,
      hasIntroduction: response.toLowerCase().includes('introduction'),
      hasDiscussion: response.toLowerCase().includes('discussion'),
      hasAction: response.toLowerCase().includes('action')
    });

    // Basic requirements - if these fail, reject
    if (!response || response.length < 400) {
      console.warn('❌ Response too short:', response.length, 'characters');
      return false;
    }

    if (!response.includes('<h2>')) {
      console.warn('❌ Response missing main heading');
      return false;
    }

    if (!response.includes(title.substring(0, 20))) {
      console.warn('❌ Response missing meeting title');
      return false;
    }

    // Require at least 3 sections
    const sectionCount = (response.match(/<h3>/g) || []).length;
    if (sectionCount < 3) {
      console.warn('❌ Response missing required sections:', sectionCount, 'found');
      return false;
    }

    // Check for key sections
    const hasIntroduction = response.toLowerCase().includes('introduction');
    const hasDiscussion = response.toLowerCase().includes('discussion');
    const hasAction = response.toLowerCase().includes('action');
    if (!hasIntroduction || !hasDiscussion || !hasAction) {
      console.warn('❌ Response missing key sections: intro, discussion, action');
      return false;
    }

    // Check for obviously truncated content
    if (response.endsWith('<') || response.endsWith('&') || response.endsWith('<b>') || response.endsWith('<s') || response.endsWith('<')) {
      console.warn('❌ Response appears to be truncated');
      return false;
    }

    // Check for severely mismatched HTML tags
    const openTags = (response.match(/<\w+/g) || []).length;
    const closeTags = (response.match(/<\/\w+/g) || []).length;
    const tagDifference = Math.abs(openTags - closeTags);

    if (tagDifference > 10) { // Stricter tolerance
      console.warn('❌ Response has mismatched HTML tags:', { openTags, closeTags, difference: tagDifference });
      return false;
    }

    // If we get here, the response is good
    console.log('✅ Agenda response accepted (strict validation):', {
      length: response.length,
      sections: sectionCount,
      hasAllSections: hasIntroduction && hasDiscussion && hasAction
    });

    return true;
  }

  // Helper function to validate narrative response completeness - very lenient due to quota limits
  function validateNarrativeResponse(response: string, title: string, enhancedPurpose: string): boolean {
    console.log('🔍 Validating narrative response:', {
      length: response.length,
      wordCount: response.split(' ').length,
      hasTitle: response.toLowerCase().includes(title.split(' ').slice(0, 2).join(' ').toLowerCase()),
      hasPurpose: response.toLowerCase().includes(enhancedPurpose.substring(0, 30).toLowerCase())
    });

    // Basic requirements - if these fail, reject
    if (!response || response.length < 80) {
      console.warn('❌ Narrative response too short:', response.length, 'characters');
      return false;
    }

    // Check if response is properly formatted (should be plain text, no HTML tags)
    if (response.includes('<h2>') || response.includes('<p>') || response.includes('<div>') || response.includes('<html>')) {
      console.warn('❌ Narrative response contains HTML tags, should be plain text');
      return false;
    }

    // Check if response contains the title or purpose keywords
    const titleWords = title.split(' ').slice(0, 2).join(' ').toLowerCase();
    const purposeWords = enhancedPurpose.substring(0, 50).toLowerCase();

    if (!response.toLowerCase().includes(titleWords) && !response.toLowerCase().includes(purposeWords.substring(0, 20))) {
      console.warn('❌ Narrative response missing key meeting information');
      return false;
    }

    // Check for obviously truncated content indicators
    if (response.endsWith('...') && response.length < 150) {
      console.warn('❌ Narrative response appears to be truncated');
      return false;
    }

    // Very relaxed punctuation check - only reject if it ends very abruptly
    const trimmedResponse = response.trim();
    if (trimmedResponse.length > 0 && trimmedResponse.length < 200 && !trimmedResponse.match(/[.!?]$/)) {
      console.warn('⚠️ Narrative response may not end with punctuation, but accepting anyway due to quota limits');
    }

    // Check for minimum word count for narrative content (reduced from 30 to 20)
    const wordCount = response.split(' ').length;
    if (wordCount < 20) {
      console.warn('❌ Narrative response too short for meaningful content:', wordCount, 'words');
      return false;
    }

    console.log('✅ Narrative response accepted (very lenient validation):', {
      length: response.length,
      wordCount: wordCount,
      hasKeyInfo: response.toLowerCase().includes(titleWords) || response.toLowerCase().includes(purposeWords.substring(0, 20))
    });

    return true;
  }

  // Helper function to generate comprehensive fallback agenda content - improved to match AI format
  function generateFallbackAgendaContent(title: string, enhancedPurpose: string, duration: number = 60, meetingLink?: string): string {
    const introTime = Math.ceil((duration || 60) * 0.1);
    const discussionTime = Math.ceil((duration || 60) * 0.6);
    const decisionTime = Math.ceil((duration || 60) * 0.15);
    const actionTime = Math.ceil((duration || 60) * 0.15);

    return `
      <h2>Meeting Agenda: ${title}</h2>
      <p><strong>Duration:</strong> ${duration || 60} minutes</p>

      <h3>1. Professional Introduction (${introTime} minutes)</h3>
      <ul>
        <li>Welcome and context setting</li>
        <li>Meeting objectives overview</li>
        <li>Participant roles and expectations</li>
      </ul>

      <h3>2. Core Discussion Topics (${discussionTime} minutes)</h3>
      <ul>
        <li><strong>Topic Analysis:</strong> Review key objectives and challenges from the meeting purpose</li>
        <li><strong>Problem Identification:</strong> Address specific issues mentioned in the enhanced purpose</li>
        <li><strong>Solution Development:</strong> Brainstorm and evaluate approaches to resolve identified challenges</li>
        <li><strong>Decision Making:</strong> Build consensus on next steps and action plans</li>
      </ul>

      <h3>3. Decision Points & Problem Solving (${decisionTime} minutes)</h3>
      <ul>
        <li>Identify specific decisions that need to be made based on the meeting purpose</li>
        <li>Address any problems or challenges mentioned</li>
        <li>Discuss solutions and approaches</li>
        <li>Build consensus on implementation plans</li>
      </ul>

      <h3>4. Action Items & Accountability (${actionTime} minutes)</h3>
      <ul>
        <li>Specific deliverables and outcomes expected from this meeting</li>
        <li>Responsible parties for follow-up actions</li>
        <li>Timeline for completion with specific deadlines</li>
        <li>Success metrics and KPIs relevant to the meeting purpose</li>
      </ul>

      <h3>5. Meeting Link and Logistics</h3>
      <ul>
        <li><strong>Meeting Link:</strong> ${meetingLink ? `<a href="${meetingLink}">${meetingLink}</a>` : 'TBD'}</li>
        <li>Technical requirements and preparation needed</li>
        <li>Contact information for technical issues</li>
        <li>Any pre-reading or preparation required</li>
      </ul>

      <h3>6. Professional Closing (${Math.ceil((duration || 60) * 0.1)} minutes)</h3>
      <ul>
        <li>Summary of key decisions and action items</li>
        <li>Next steps and follow-up timeline</li>
        <li>Thank you and Q&A</li>
      </ul>

      <p><em>Please come prepared with relevant data and be ready to contribute to the discussion.</em></p>
    `;
  }

  // Helper function to generate simple narrative content when AI is unavailable
  function generateSimpleNarrativeContent(title: string, enhancedPurpose: string, duration: number = 60, meetingLink?: string, participants?: string[]): string {
    const participantCount = participants?.length || 0;

    return `Meeting: ${title}

Purpose: ${enhancedPurpose}

Duration: ${duration} minutes
Participants: ${participantCount} attendees

This meeting brings together key team members to address important aspects of our current projects and processes. Participants will discuss challenges, share insights, and develop actionable solutions.

Expected outcomes include:
• Clear action items and responsibilities
• Timeline for implementation
• Next steps for follow-up

${meetingLink ? `Join the meeting at: ${meetingLink}` : ''}

All participants are encouraged to come prepared and contribute to the discussion.`;
  }

  // Helper function to generate fallback narrative content
  function generateFallbackNarrativeContent(title: string, enhancedPurpose: string, duration?: number, meetingLink?: string, participants?: string[]): string {
    const participantCount = participants?.length || 0;
    const durationText = duration ? `${duration} minutes` : 'the scheduled time';

    return `This meeting, titled "${title}", brings together ${participantCount} key participants to address critical aspects of ${enhancedPurpose.toLowerCase()}. The session is designed to last ${durationText} and represents an important opportunity for collaborative problem-solving and strategic alignment.

The meeting focuses on identifying core challenges and opportunities within our current processes, with particular attention to how we can improve efficiency and outcomes. Participants will engage in detailed discussions about the specific issues at hand, drawing on their expertise and experience to develop actionable solutions.

By bringing together diverse perspectives and areas of expertise, this meeting aims to foster innovative thinking and build consensus around the best path forward. The collaborative environment will encourage open dialogue and creative problem-solving, ensuring that all voices are heard and valuable insights are captured.

Expected outcomes include clear action items, assigned responsibilities, and a shared understanding of next steps. The meeting will also establish mechanisms for tracking progress and maintaining accountability as we move forward with implementation.

${meetingLink ? `Participants should use the provided meeting link (${meetingLink}) to join the session.` : 'Meeting access details will be provided separately.'} All participants are encouraged to come prepared with relevant data, examples, and ideas to contribute to the discussion.`;
  }

  // Enhanced agenda generation for Step 7 workflow
  app.post('/api/meetings/generate-rich-agenda', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { meetingId, title, enhancedPurpose, participants, duration, meetingLink, startTime, endTime } = req.body;

      if (!title || !enhancedPurpose) {
        return res.status(400).json({ error: 'Title and enhanced purpose are required' });
      }

      // Import caching service
      const { cachingService } = await import('./cachingService.js');

      // Create cache key for this agenda generation request
      const meetingData = { id: meetingId, title, enhancedPurpose, attendees: participants, startTime, endTime };
      const cacheKey = cachingService.generateAgendaCacheKey(meetingData);

      // Check cache first
      const cachedAgenda = cachingService.get(cacheKey);
      if (cachedAgenda) {
        console.log('Returning cached agenda for meeting:', title);
        return res.json({
          success: true,
          agenda: cachedAgenda,
          cached: true,
          generatedAt: new Date().toISOString()
        });
      }

      // Generate detailed, comprehensive agenda using AI - optimized for ReactQuill compatibility
      const agendaPrompt = `
        Generate a complete meeting agenda in HTML format for:

        Title: "${title}"
        Purpose: "${enhancedPurpose}"
        Duration: ${duration || 60} minutes
        Attendees: ${participants?.length || 0}

        Structure the agenda with these sections:
        1. Introduction (10% of time) - Welcome, objectives, ground rules
        2. Main Discussion (60% of time) - 3-4 key topics with bullet points, connected to purpose
        3. Decision Making (15% of time) - Identify decisions, discuss solutions
        4. Action Items (10% of time) - Deliverables, responsibilities, deadlines
        5. Logistics (5% of time) - Meeting link: ${meetingLink || 'TBD'}, prep, Q&A

        Requirements:
        - Start with <h2>Meeting Agenda: ${title}</h2>
        - Use <h3> for sections, <p> for text, <ul><li> for bullets
        - Include time allocations in bold
        - Total time must equal ${duration || 60} minutes
        - Make it detailed, professional, and directly related to the purpose
        - Generate the full agenda in one complete response
        - Aim for 500-700 words
      `;

      const messages = [
        {
          role: 'system',
          content: 'You are a professional meeting facilitator and agenda specialist. Create detailed, comprehensive agendas that ensure productive and well-structured meetings. You MUST return ONLY valid HTML FRAGMENT content with NO markdown, NO code blocks, NO backticks, NO ```html, NO <html>, <head>, or <body> tags. Start directly with <h2> and use proper HTML fragment tags throughout. Return pure HTML fragments only.'
        },
        {
          role: 'user',
          content: agendaPrompt
        }
      ];

      const { getGeminiResponse } = await import('./aiInterface.js');

      // Function to validate and retry AI responses
      const generateWithRetry = async (retryCount = 0): Promise<string> => {
        const maxRetries = 3;
        const response = await getGeminiResponse(messages);

        console.log(`📝 AI Response attempt ${retryCount + 1}:`, {
          length: response.length,
          startsWith: response.substring(0, 50),
          endsWith: response.substring(response.length - 50),
          hasHtml: response.includes('<html>'),
          hasH2: response.includes('<h2>'),
          hasClosingTag: response.includes('</')
        });

        // Validate response completeness
        const isComplete = validateAgendaResponse(response, title, enhancedPurpose);
        const isProperLength = response.length > 400; // Minimum expected length for agenda

        if (isComplete && isProperLength) {
          console.log('✅ AI response is complete and valid');
          return response;
        }

        if (retryCount < maxRetries) {
          console.warn(`⚠️ AI response incomplete (attempt ${retryCount + 1}/${maxRetries + 1}), retrying...`);
          console.warn('Response issues:', {
            isComplete,
            isProperLength,
            actualLength: response.length,
            hasTitle: response.includes(title.substring(0, 20))
          });

          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
          return generateWithRetry(retryCount + 1);
        }

        console.error('❌ AI response failed validation after all retries, using fallback');
        return generateFallbackAgendaContent(title, enhancedPurpose, duration, meetingLink);
      };

      const richAgendaHtml = await generateWithRetry();

      // Final validation
      let finalHtmlContent = richAgendaHtml;
      if (!finalHtmlContent || finalHtmlContent.length < 200) {
        console.warn('AI returned very short content, using comprehensive fallback');
        finalHtmlContent = generateFallbackAgendaContent(title, enhancedPurpose, duration, meetingLink);
      }

      // Also generate a plain text version for editing
      const plainTextPrompt = agendaPrompt.replace(/HTML/g, 'plain text').replace(/<[^>]*>/g, '');
      const plainTextMessages = [
        {
          role: 'system',
          content: 'You are a professional meeting facilitator. Create detailed, comprehensive agendas in plain text format with clear structure and actionable content.'
        },
        {
          role: 'user',
          content: plainTextPrompt
        }
      ];

      const richAgendaText = await getGeminiResponse(plainTextMessages);

      const agendaResult = {
        html: finalHtmlContent,
        text: richAgendaText,
        title,
        duration: duration || 60,
        meetingLink,
        enhancedPurpose,
        wordCount: richAgendaText.split(' ').length,
        estimatedReadingTime: Math.ceil(richAgendaText.split(' ').length / 200) // Assume 200 words per minute
      };

      // Cache the successful result
      cachingService.set(cacheKey, agendaResult, 30 * 60 * 1000); // Cache for 30 minutes

      res.json({
        success: true,
        agenda: agendaResult,
        cached: false,
        generatedAt: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Error generating rich agenda:', error);
      res.status(500).json({ error: error.message || 'Failed to generate rich agenda' });
    }
  });

  // Generate narrative description endpoint
  app.post('/api/meetings/generate-narrative-description', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { meetingId, title, enhancedPurpose, participants, duration, meetingLink, startTime, endTime } = req.body;

      if (!title || !enhancedPurpose) {
        return res.status(400).json({ error: 'Title and enhanced purpose are required' });
      }

      // Import caching service
      const { cachingService } = await import('./cachingService.js');

      // Create cache key for this narrative description request
      const meetingData = { id: meetingId, title, enhancedPurpose, attendees: participants, startTime, endTime };
      const cacheKey = `narrative_description_${meetingId}_${title.substring(0, 20)}`;

      // Check cache first
      const cachedDescription = cachingService.get(cacheKey);
      if (cachedDescription) {
        console.log('Returning cached narrative description for meeting:', title);
        return res.json({
          success: true,
          narrativeDescription: cachedDescription,
          cached: true,
          generatedAt: new Date().toISOString()
        });
      }

      // Generate detailed narrative description using AI - optimized for better completion
      const narrativePrompt = `
        Write a professional narrative meeting description for:

        Title: "${title}"
        Purpose: "${enhancedPurpose}"
        Duration: ${duration || 60} minutes
        Attendees: ${participants?.length || 0}

        Write a cohesive narrative paragraph (150-250 words) that explains:
        - Why this meeting is necessary and important
        - What participants will accomplish together
        - How it connects to broader organizational goals
        - Expected outcomes and value for attendees

        Use professional, engaging language. Write in complete sentences and end with appropriate punctuation. Focus on the meeting's purpose and benefits.
      `;

      const messages = [
        {
          role: 'system',
          content: 'You are a professional business writer who specializes in creating clear, engaging, and informative meeting descriptions. Your writing is concise yet comprehensive, with a warm professional tone that motivates readers to participate actively in meetings.'
        },
        {
          role: 'user',
          content: narrativePrompt
        }
      ];

      // Function to generate narrative with improved retry logic
      const generateNarrativeWithRetry = async (retryCount = 0): Promise<string> => {
        const maxRetries = 3;

        try {
          console.log(`📝 Generating narrative description (attempt ${retryCount + 1}/${maxRetries + 1})...`);
          const response = await getGeminiResponse(messages);

          console.log(`📝 Narrative Response attempt ${retryCount + 1}:`, {
            length: response.length,
            wordCount: response.split(' ').length,
            startsWith: response.substring(0, 50),
            endsWith: response.substring(response.length - 50),
            hasProperEnding: /[.!?]$/.test(response)
          });

          // Validate narrative response with improved checks
          const isComplete = validateNarrativeResponse(response, title, enhancedPurpose);
          const isProperLength = response.length > 200 && response.split(' ').length > 60;

          if (isComplete && isProperLength) {
            console.log('✅ Narrative response is complete and valid');
            return response;
          }

          // If response is too short but has content, it might be truncated
          if (response.length > 100 && response.length < 200) {
            console.warn(`⚠️ Narrative response seems truncated (length: ${response.length}), retrying...`);
          } else if (!isComplete) {
            console.warn(`⚠️ Narrative response incomplete (attempt ${retryCount + 1}/${maxRetries + 1}), retrying...`);
          }

          if (retryCount < maxRetries) {
            // Progressive delay with jitter to avoid thundering herd
            const delay = 1000 + (Math.random() * 500) + (retryCount * 500);
            console.log(`⏳ Waiting ${Math.round(delay)}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return generateNarrativeWithRetry(retryCount + 1);
          }

          console.error('❌ Narrative response failed validation after all retries, using fallback');
          const fallbackDuration = duration || 60;
          return generateFallbackNarrativeContent(title, enhancedPurpose, fallbackDuration, meetingLink, participants);

        } catch (error: any) {
          console.error(`❌ Error in narrative generation attempt ${retryCount + 1}:`, error.message);

          if (retryCount < maxRetries) {
            const delay = 1000 + (Math.random() * 500) + (retryCount * 500);
            console.log(`⏳ Retrying after error, waiting ${Math.round(delay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return generateNarrativeWithRetry(retryCount + 1);
          }

          // Use fallback for any error after all retries
          console.error('❌ Narrative generation failed completely, using fallback');
          const fallbackDuration = duration || 60;
          return generateFallbackNarrativeContent(title, enhancedPurpose, fallbackDuration, meetingLink, participants);
        }
      };

      let narrativeDescription: string;

      try {
        console.log('🚀 Starting narrative description generation...');
        narrativeDescription = await generateNarrativeWithRetry();
        console.log('✅ Narrative description generated successfully');

        // Final validation and cleanup
        if (narrativeDescription.length < 150) {
          console.warn('⚠️ Generated narrative too short, using fallback');
          const fallbackDuration = duration || 60;
          narrativeDescription = generateFallbackNarrativeContent(title, enhancedPurpose, fallbackDuration, meetingLink, participants);
        }

        // Clean up any unwanted formatting
        narrativeDescription = narrativeDescription
          .replace(/\*\*/g, '') // Remove bold markdown
          .replace(/\*/g, '')   // Remove italic markdown
          .replace(/`/g, '')    // Remove code markdown
          .trim();

        console.log('📝 Final narrative description:', {
          length: narrativeDescription.length,
          wordCount: narrativeDescription.split(' ').length,
          preview: narrativeDescription.substring(0, 100) + '...'
        });

      } catch (error: any) {
        console.error('❌ Narrative generation failed completely:', error.message);

        // Use appropriate fallback based on error type
        if (error.message.includes('quota') || error.message.includes('rate limit') || error.message.includes('429')) {
          console.warn('🤖 AI quota exceeded, using simple fallback narrative');
          const fallbackDuration = duration || 60;
          narrativeDescription = generateSimpleNarrativeContent(title, enhancedPurpose, fallbackDuration, meetingLink, participants);
        } else if (error.message.includes('timeout') || error.message.includes('network')) {
          console.warn('🌐 Network/AI timeout, using comprehensive fallback');
          const fallbackDuration = duration || 60;
          narrativeDescription = generateFallbackNarrativeContent(title, enhancedPurpose, fallbackDuration, meetingLink, participants);
        } else {
          console.warn('💥 Unexpected error, using comprehensive fallback');
          const fallbackDuration = duration || 60;
          narrativeDescription = generateFallbackNarrativeContent(title, enhancedPurpose, fallbackDuration, meetingLink, participants);
        }
      }

      // Ensure we always have a valid narrative description
      if (!narrativeDescription || narrativeDescription.length < 100) {
        console.error('🚨 Narrative description still too short after all fallbacks, using emergency fallback');
        narrativeDescription = `This meeting titled "${title}" focuses on ${enhancedPurpose.toLowerCase()}. It brings together key participants to discuss important matters and make decisions that will impact our work. The meeting is scheduled for ${duration || 60} minutes and represents an important opportunity for collaboration and alignment. Participants are encouraged to come prepared and contribute to the discussion.`;
      }

    } catch (error: any) {
      console.error('Error generating narrative description:', error);
      res.status(500).json({ error: error.message || 'Failed to generate narrative description' });
    }
  });

  // Send agenda endpoint for streamlined workflow
  app.post('/api/meetings/send-agenda', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { meetingId, formattedAgenda, attendees, title, startTime, endTime, meetingLink } = req.body;
      const user = req.user as any;

      // Validate required fields
      if (!meetingId || !formattedAgenda) {
        return res.status(400).json({ error: 'Meeting ID and formatted agenda HTML are required' });
      }

      if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
        return res.status(400).json({ error: 'At least one attendee email is required' });
      }

      console.log('Processing send-agenda request:', {
        meetingId,
        attendeeCount: attendees.length,
        title: title || 'Meeting',
        hasAgendaContent: !!formattedAgenda
      });

      // Import email workflow orchestrator and attendee validator
      const { emailWorkflowOrchestrator } = await import('./emailWorkflowOrchestrator.js');
      const { attendeeValidator } = await import('./attendeeValidator.js');

      // Validate attendee emails
      console.log('Validating attendee emails...');
      const validatedAttendees = await Promise.all(
        attendees.map(async (email: string) => {
          try {
            const result = await attendeeValidator.validateEmail(email, user);
            console.log(`Email validation for ${email}:`, result.isValid);
            return result;
          } catch (error) {
            console.warn(`Failed to validate email ${email}:`, error);
            // Return basic validation result if validation fails
            return {
              email,
              isValid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
              exists: false,
              isGoogleUser: false
            };
          }
        })
      );

      const validEmailCount = validatedAttendees.filter((a: any) => a.isValid).length;
      if (validEmailCount === 0) {
        return res.status(400).json({ error: 'No valid attendee emails provided' });
      }

      // Create meeting data structure for the email
      const meetingData = {
        id: meetingId,
        title: title || 'Meeting Agenda',
        description: 'Please find the meeting agenda below',
        attendees: validatedAttendees,
        type: 'online' as const,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        meetingLink
      };

      // Create agenda content structure that matches AgendaContent interface
      const agendaContent = {
        title: title || 'Meeting Agenda',
        duration: startTime && endTime
          ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / (1000 * 60))
          : 60,
        topics: [
          {
            title: 'Meeting Overview',
            duration: startTime && endTime
              ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / (1000 * 60))
              : 60,
            description: 'Complete meeting agenda and discussion points'
          }
        ],
        actionItems: [],
        enhancedPurpose: formattedAgenda
      };

      // CRITICAL FIX: Actually start the email sending workflow
      console.log('Starting email workflow for agenda distribution...');
      const jobId = await emailWorkflowOrchestrator.startEmailSendingWorkflow(
        user,
        meetingId,
        validatedAttendees,
        meetingData,
        agendaContent
      );

      console.log('Email sending workflow started successfully:', {
        jobId,
        validEmailCount
      });

      // Return success with job details
      res.json({
        success: true,
        message: 'Agenda will be sent to attendees',
        result: {
          jobId,
          totalRecipients: validEmailCount,
          status: 'processing'
        }
      });

    } catch (error: any) {
      console.error('Error sending agenda emails:', error);
      res.status(500).json({ error: error.message || 'Failed to send agenda emails' });
    }
  });

  // Email job management endpoints
  app.get('/api/email/jobs', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      // Import email workflow orchestrator
      const { emailWorkflowOrchestrator } = await import('./emailWorkflowOrchestrator.js');

      const user = req.user as any;

      const jobs = emailWorkflowOrchestrator.getUserEmailJobs(user.id);
      const statistics = emailWorkflowOrchestrator.getJobStatistics();

      res.json({
        jobs: jobs.map(job => ({
          id: job.id,
          meetingId: job.meetingId,
          status: job.status,
          totalAttendees: job.attendees.length,
          emailsSent: job.results?.totalSent || 0,
          emailsFailed: job.results?.totalFailed || 0,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          errors: job.errors
        })),
        statistics
      });
    } catch (error: any) {
      console.error('Error getting email jobs:', error);
      res.status(500).json({ error: error.message || 'Failed to get email jobs' });
    }
  });

  // Email notification endpoints
  app.get('/api/notifications', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { limit = '20' } = req.query;

      // Import email notification service
      const { emailNotificationService } = await import('./emailNotificationService.js');

      const notifications = emailNotificationService.getUserNotifications(
        user.id,
        parseInt(limit as string)
      );

      const unreadCount = emailNotificationService.getUnreadNotificationCount(user.id);

      res.json({
        notifications,
        unreadCount
      });
    } catch (error: any) {
      console.error('Error getting notifications:', error);
      res.status(500).json({ error: error.message || 'Failed to get notifications' });
    }
  });

  app.post('/api/notifications/:notificationId/read', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { notificationId } = req.params;

      // Import email notification service
      const { emailNotificationService } = await import('./emailNotificationService.js');

      const success = emailNotificationService.markNotificationAsRead(user.id, notificationId);

      if (!success) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      res.json({ message: 'Notification marked as read' });
    } catch (error: any) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ error: error.message || 'Failed to mark notification as read' });
    }
  });

  app.post('/api/notifications/read-all', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = req.user as any;

      // Import email notification service
      const { emailNotificationService } = await import('./emailNotificationService.js');

      const markedCount = emailNotificationService.markAllNotificationsAsRead(user.id);

      res.json({
        message: `Marked ${markedCount} notifications as read`,
        markedCount
      });
    } catch (error: any) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({ error: error.message || 'Failed to mark all notifications as read' });
    }
  });

  // Performance monitoring endpoints
  app.get('/api/performance/stats', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { timeRange = '24' } = req.query;
      const timeRangeHours = parseInt(timeRange as string);

      const stats = performanceMonitor.getPerformanceStats(timeRangeHours);
      const recommendations = performanceMonitor.getOptimizationRecommendations();
      const tokenBudget = performanceMonitor.checkTokenBudget(1); // Check hourly budget
      const trends = performanceMonitor.getTokenUsageTrends(timeRangeHours);
      const expensiveOperations = performanceMonitor.getMostExpensiveOperations(5);

      res.json({
        stats,
        recommendations,
        tokenBudget,
        trends,
        expensiveOperations,
        timeRangeHours
      });
    } catch (error: any) {
      console.error('Error getting performance stats:', error);
      res.status(500).json({ error: error.message || 'Failed to get performance stats' });
    }
  });

  app.get('/api/performance/export', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { timeRange = '24' } = req.query;
      const timeRangeHours = parseInt(timeRange as string);

      const exportData = performanceMonitor.exportMetrics(timeRangeHours);

      res.json({
        exportedAt: new Date().toISOString(),
        timeRangeHours,
        ...exportData
      });
    } catch (error: any) {
      console.error('Error exporting performance data:', error);
      res.status(500).json({ error: error.message || 'Failed to export performance data' });
    }
  });

  app.post('/api/performance/clear-old-metrics', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { olderThanHours = '168' } = req.body; // Default: 1 week
      const hours = parseInt(olderThanHours);

      performanceMonitor.clearOldMetrics(hours);

      res.json({
        message: `Cleared metrics older than ${hours} hours`,
        clearedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error clearing old metrics:', error);
      res.status(500).json({ error: error.message || 'Failed to clear old metrics' });
    }
  });

  // Performance monitoring routes
  app.use('/api/performance', performanceRoutes);
  
  // Configuration health routes
  app.use('/api/config', configHealthRoutes);

  // Error reporting and analytics routes
  app.use('/api/errors', errorReportingRoutes);

  const httpServer = createServer(app);

  return httpServer;
}