import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { fetchUpcomingEvents, deleteCalendarEvent, createCalendarEvent } from "./googleCalendar";
import { getGeminiResponse, extractMeetingIntent, generateMeetingTitles, verifyAttendees, generateMeetingAgenda, generateActionItems, type MistralMessage, getContextualResponse } from "./aiInterface.js";
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
        'https://www.googleapis.com/auth/contacts.readonly'
      ],
      accessType: 'offline',
      prompt: 'consent'
    })(req, res, next);
  });

  app.get('/api/auth/google/callback',
    passport.authenticate('google', {
      failureRedirect: '/',
      failureMessage: true
    }),
    (req: Request, res: Response) => {
      console.log('OAuth callback successful, user:', req.user);

      // Set session duration based on remember me preference
      const rememberMe = req.session.rememberMe;
      if (rememberMe) {
        // 30 days for remember me
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        console.log('Extended session duration for remember me');
      } else {
        // 24 hours for regular login
        req.session.cookie.maxAge = 24 * 60 * 60 * 1000;
        console.log('Standard session duration');
      }

      // Clean up the temporary remember me flag
      delete req.session.rememberMe;

      // Successful authentication, redirect to dashboard
      res.redirect('/');
    }
  );

  // Add error handling for OAuth failures
  app.get('/api/auth/error', (req: Request, res: Response) => {
    console.log('OAuth error:', req.flash());
    res.status(401).json({ error: 'Authentication failed', details: req.flash() });
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

      const titleSuggestion = await generateMeetingTitles(
        purpose,
        participants || [],
        context || ''
      );
      res.json({ titleSuggestion });
    } catch (error: any) {
      console.error('Error generating meeting titles:', error);
      res.status(500).json({ error: error.message || 'Failed to generate meeting titles' });
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
      const { meetingData, conversationContext } = req.body;

      if (!meetingData) {
        return res.status(400).json({ error: 'Meeting data is required' });
      }

      // Import agenda generator
      const { agendaGenerator } = await import('./agendaGenerator.js');

      const agendaContent = await agendaGenerator.generateAgenda(
        meetingData,
        conversationContext || []
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

      const validTemplates = ['standup', 'planning', 'review', 'brainstorm'];
      if (!validTemplates.includes(template)) {
        return res.status(400).json({ error: 'Invalid template type' });
      }

      // Import agenda generator
      const { agendaGenerator } = await import('./agendaGenerator.js');

      const agendaContent = await agendaGenerator.generateTemplateAgenda(
        template as 'standup' | 'planning' | 'review' | 'brainstorm',
        meetingData
      );

      const formattedAgenda = agendaGenerator.formatAgenda(agendaContent);

      res.json({
        agenda: formattedAgenda,
        agendaContent,
        validation: agendaGenerator.validateAgenda(formattedAgenda)
      });
    } catch (error: any) {
      console.error('Error generating template agenda:', error);
      res.status(500).json({ error: error.message || 'Failed to generate template agenda' });
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
        description: finalMeetingData.agenda || '',
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

        // Create the calendar event with optional Meet link
        const createdEvent = await createCalendarEvent(
          user,
          eventData,
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
        conversationContext || []
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