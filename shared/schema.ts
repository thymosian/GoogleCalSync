import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, json, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  googleId: text("google_id").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  picture: text("picture"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
});

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  googleEventId: text("google_event_id").unique(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  meetingLink: text("meeting_link"),
  attendees: json("attendees").$type<string[]>().default([]),
  agenda: text("agenda"),
  transcriptGenerated: boolean("transcript_generated").default(false),
});

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id),
  title: text("title").notNull(),
  description: text("description"),
  assignee: text("assignee").notNull(),
  deadline: timestamp("deadline"),
  status: text("status").notNull().default("pending"), // pending, in_progress, completed
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: text("role").notNull(), // user, assistant
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertEventSchema = createInsertSchema(events).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, timestamp: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;

// Enhanced chat message types for UI blocks
export const attendeeSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  verified: z.boolean().default(false),
});

export const meetingExtractionSchema = z.object({
  intent: z.enum(['create_meeting', 'schedule_meeting', 'other']),
  confidence: z.number().min(0).max(1),
  fields: z.object({
    startTime: z.string().optional(), // ISO 8601 string
    endTime: z.string().optional(),
    duration: z.number().optional(), // minutes
    purpose: z.string().optional(),
    participants: z.array(z.string()).default([]),
    suggestedTitle: z.string().optional(),
  }),
  missing: z.array(z.enum(['startTime', 'endTime', 'duration', 'participants'])).default([]),
});

export const titleSuggestionSchema = z.object({
  suggestions: z.array(z.string()).length(3),
  context: z.string(),
});

export const uiBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('meeting_link_choice'),
    data: z.object({
      question: z.string(),
      meetingId: z.string(),
    }),
  }),
  z.object({
    type: z.literal('attendee_editor'),
    data: z.object({
      attendees: z.array(attendeeSchema),
      meetingId: z.string(),
    }),
  }),
  z.object({
    type: z.literal('title_suggestions'),
    data: z.object({
      suggestions: z.array(z.string()),
      currentTitle: z.string().optional(),
      meetingId: z.string(),
    }),
  }),
  z.object({
    type: z.literal('event_review'),
    data: z.object({
      title: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      attendees: z.array(attendeeSchema),
      includeMeetLink: z.boolean(),
      meetingId: z.string(),
    }),
  }),
]);

export const enhancedChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.date(),
  uiBlock: uiBlockSchema.optional(),
  metadata: z.object({
    extraction: meetingExtractionSchema.optional(),
    meetingId: z.string().optional(),
  }).optional(),
});

// Types for enhanced features
export type Attendee = z.infer<typeof attendeeSchema>;
export type MeetingExtraction = z.infer<typeof meetingExtractionSchema>;
export type TitleSuggestion = z.infer<typeof titleSuggestionSchema>;
export type UIBlock = z.infer<typeof uiBlockSchema>;
export type EnhancedChatMessage = z.infer<typeof enhancedChatMessageSchema>;

// Event creation request schema
export const createEventRequestSchema = z.object({
  title: z.string(),
  startTime: z.string(), // ISO 8601
  endTime: z.string(), // ISO 8601
  description: z.string().optional(),
  attendees: z.array(attendeeSchema),
  createMeetLink: z.boolean().default(false),
});

export type CreateEventRequest = z.infer<typeof createEventRequestSchema>;
