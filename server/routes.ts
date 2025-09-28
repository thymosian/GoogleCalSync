import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { fetchUpcomingEvents, deleteCalendarEvent, createCalendarEvent } from "./googleCalendar";
import { getMistralResponse, extractMeetingIntent, generateMeetingTitles, type MistralMessage } from "./mistral";
import { createEventRequestSchema } from "../shared/schema.js";

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication routes
  app.get('/api/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar'],
    accessType: 'offline',
    prompt: 'consent'
  }));
  
  app.get('/api/auth/google/callback', 
    passport.authenticate('google', { 
      failureRedirect: '/',
      failureMessage: true 
    }),
    (req: Request, res: Response) => {
      console.log('OAuth callback successful, user:', req.user);
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

  // Mistral AI chat endpoint
  app.post('/api/chat', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { messages }: { messages: MistralMessage[] } = req.body;
      
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid messages format' });
      }

      const response = await getMistralResponse(messages);
      res.json({ response });
    } catch (error: any) {
      console.error('Error getting AI response:', error);
      res.status(500).json({ error: error.message || 'Failed to get AI response' });
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

      const extraction = await extractMeetingIntent(message, context || '');
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

  // Create calendar event with enhanced features
  app.post('/api/calendar/events', async (req: Request, res: Response) => {
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
        eventData.createMeetLink
      );

      // Store event in our database if needed
      try {
        await storage.createEvent({
          googleEventId: createdEvent.googleEventId!,
          userId: user.id,
          title: eventData.title,
          description: eventData.description || '',
          startTime: new Date(eventData.startTime),
          endTime: new Date(eventData.endTime),
          meetingLink: createdEvent.meetingLink || '',
          attendees: eventData.attendees.map(a => a.email),
        });
      } catch (dbError) {
        // Log database error but don't fail the request
        console.error('Error storing event in database:', dbError);
      }

      res.json({ 
        success: true, 
        event: createdEvent,
        message: 'Meeting created successfully!' 
      });
    } catch (error: any) {
      console.error('Error creating calendar event:', error);
      res.status(500).json({ error: error.message || 'Failed to create calendar event' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}