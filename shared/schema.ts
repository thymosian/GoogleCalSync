import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, json, boolean, integer, decimal } from "drizzle-orm/pg-core";
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
  conversationId: varchar("conversation_id"),
  intent: varchar("intent"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  extractedFields: json("extracted_fields"),
});

export const conversationContexts = pgTable("conversation_contexts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  currentMode: varchar("current_mode").notNull().default("casual"),
  meetingData: json("meeting_data"),
  compressionLevel: integer("compression_level").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const meetingDrafts = pgTable("meeting_drafts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  conversationId: varchar("conversation_id").references(() => conversationContexts.id),
  title: varchar("title"),
  meetingType: varchar("meeting_type"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  location: varchar("location"),
  attendees: json("attendees"),
  agenda: text("agenda"),
  status: varchar("status").default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users);
export const insertEventSchema = createInsertSchema(events);
export const insertTaskSchema = createInsertSchema(tasks);
export const insertChatMessageSchema = createInsertSchema(chatMessages);
export const insertConversationContextSchema = createInsertSchema(conversationContexts);
export const insertMeetingDraftSchema = createInsertSchema(meetingDrafts);

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ConversationContext = typeof conversationContexts.$inferSelect;
export type InsertConversationContext = z.infer<typeof insertConversationContextSchema>;
export type MeetingDraft = typeof meetingDrafts.$inferSelect;
export type InsertMeetingDraft = z.infer<typeof insertMeetingDraftSchema>;

// Enhanced chat message types for UI blocks
export const attendeeSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  verified: z.boolean().default(false),
});

// New schema for attendee verification results
export const attendeeVerificationSchema = z.object({
  email: z.string().email(),
  valid: z.boolean(),
  trusted: z.boolean(),
  needsVerification: z.boolean().optional(),
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

// Define attendeeDataSchema before it's used in uiBlockSchema
export const attendeeDataSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  profilePicture: z.string().optional(),
  isValidated: z.boolean().default(false),
  isRequired: z.boolean().default(true),
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
  // New UI blocks for conversational meeting scheduler
  z.object({
    type: z.literal('meeting_type_selection'),
    data: z.object({
      question: z.string(),
      meetingId: z.string(),
      currentType: z.enum(['physical', 'online']).optional(),
      currentLocation: z.string().optional(),
      options: z.array(z.object({
        value: z.enum(['physical', 'online']),
        label: z.string(),
        description: z.string(),
      })).optional(),
    }),
  }),
  z.object({
    type: z.literal('attendee_management'),
    data: z.object({
      meetingId: z.string(),
      attendees: z.array(attendeeDataSchema),
      meetingType: z.enum(['physical', 'online']),
      isRequired: z.boolean(),
      validationMessage: z.string().optional(),
      errorState: z.boolean().optional(),
      validationErrors: z.array(z.string()).optional(),
      invalidEmails: z.array(z.string()).optional(),
    }),
  }),
  z.object({
    type: z.literal('meeting_approval'),
    data: z.object({
      meetingId: z.string(),
      title: z.string(),
      type: z.enum(['physical', 'online']),
      startTime: z.string(),
      endTime: z.string(),
      location: z.string().optional(),
      attendees: z.array(attendeeDataSchema),
      agenda: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('agenda_editor'),
    data: z.object({
      meetingId: z.string(),
      initialAgenda: z.string(),
      meetingTitle: z.string(),
      duration: z.number(),
      isApprovalMode: z.boolean().optional(),
      validation: z.object({
        isValid: z.boolean(),
        errors: z.array(z.string()),
        warnings: z.array(z.string()),
      }).optional(),
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
export type AttendeeVerification = z.infer<typeof attendeeVerificationSchema>;
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

// New schemas for conversational meeting scheduler
export const conversationMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.date(),
  metadata: z.object({
    intent: z.string().optional(),
    confidence: z.number().optional(),
    extractedFields: z.record(z.any()).optional(),
    workflowStep: z.string().optional(),
    requiresUserInput: z.boolean().optional(),
    validationErrors: z.array(z.string()).optional(),
    warnings: z.array(z.string()).optional(),
    workflowState: z.record(z.any()).optional(),
    uiBlockType: z.string().optional(),
    uiBlockData: z.record(z.any()).optional(),
    isSystemMessage: z.boolean().optional(),
  }).optional(),
});

export const meetingDataSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  type: z.enum(['physical', 'online']).optional(),
  startTime: z.date().optional(),
  endTime: z.date().optional(),
  location: z.string().optional(),
  attendees: z.array(z.object({
    email: z.string().email(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    profilePicture: z.string().optional(),
    isValidated: z.boolean().default(false),
    isRequired: z.boolean().default(true),
  })).default([]),
  agenda: z.string().optional(),
  meetingLink: z.string().optional(),
  status: z.enum(['draft', 'pending_approval', 'approved', 'created']).default('draft'),
});

// Calendar access status schema for conversation context
export const calendarAccessStatusSchema = z.object({
  hasAccess: z.boolean(),
  tokenValid: z.boolean(),
  needsRefresh: z.boolean(),
  scopes: z.array(z.string()),
  lastVerified: z.date().optional(),
  error: z.string().optional(),
});

export const conversationContextDataSchema = z.object({
  messages: z.array(conversationMessageSchema).default([]),
  currentMode: z.enum(['casual', 'scheduling', 'approval']).default('casual'),
  meetingData: meetingDataSchema.optional(),
  compressionLevel: z.number().default(0),
  calendarAccessStatus: calendarAccessStatusSchema.optional(),
  availabilityChecked: z.boolean().default(false),
  timeCollectionComplete: z.boolean().default(false),
});

export const meetingFieldsSchema = z.object({
  title: z.string().optional(),
  startTime: z.date().optional(),
  endTime: z.date().optional(),
  duration: z.number().optional(), // minutes
  type: z.enum(['physical', 'online']).optional(),
  location: z.string().optional(),
  attendees: z.array(z.string()).default([]),
  purpose: z.string().optional(),
});

// Types for conversational meeting scheduler
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type MeetingData = z.infer<typeof meetingDataSchema>;
export type ConversationContextData = z.infer<typeof conversationContextDataSchema>;
export type MeetingFields = z.infer<typeof meetingFieldsSchema>;
export type AttendeeData = z.infer<typeof attendeeDataSchema>;
export type CalendarAccessStatus = z.infer<typeof calendarAccessStatusSchema>;

// Re-export workflow types for convenience
export type {
    WorkflowStep,
    WorkflowState,
    WorkflowResponse,
    ConversationalResponse,
    ChatWorkflowResponse,
    UIBlockHandlers,
    UIBlockInteraction,
    ValidationResult,
    WorkflowProgress,
    WorkflowStatus,
    WorkflowMetadata
} from './workflowTypes.js';

// Re-export API types for convenience
export type {
    ConversationalChatRequest,
    UIBlockInteractionRequest,
    WorkflowStateUpdateRequest,
    WorkflowAdvancementRequest,
    MeetingIntentRequest,
    APIErrorResponse,
    UIBlockInteractionResponse,
    WorkflowStateResponse,
    WorkflowAdvancementResponse,
    MeetingIntentResponse,
    ConversationHistoryResponse,
    APIEndpoint,
    WorkflowHTTPStatus,
    WorkflowErrorCode
} from './apiTypes.js';

// Re-export validation schemas
export {
    conversationalChatRequestSchema,
    uiBlockInteractionRequestSchema,
    workflowStateUpdateRequestSchema,
    workflowAdvancementRequestSchema,
    meetingIntentRequestSchema,
    meetingTypeSelectionDataSchema,
    attendeeManagementDataSchema,
    meetingApprovalDataSchema,
    agendaEditorDataSchema,
    workflowStateValidationSchema,
    apiErrorResponseSchema,
    uiBlockInteractionResponseSchema,
    workflowStateResponseSchema,
    workflowAdvancementResponseSchema,
    meetingIntentResponseSchema,
    conversationHistoryResponseSchema,
    conversationIdParamSchema,
    meetingIdParamSchema,
    userIdParamSchema,
    paginationQuerySchema,
    conversationHistoryQuerySchema,
    workflowStateQuerySchema,
    WORKFLOW_API_ENDPOINTS,
    WORKFLOW_HTTP_STATUS,
    WORKFLOW_ERROR_CODES,
    validateRequest,
    validateResponse,
    createValidationMiddleware,
    createParamsValidationMiddleware,
    createQueryValidationMiddleware,
    validateUIBlockInteractionData,
    validateWorkflowStateConsistency,
    createErrorResponse,
    createSuccessResponse
} from './apiTypes.js';

// Re-export validation utilities
export {
    validateUIBlockInteractionRequest,
    validateWorkflowState,
    validateWorkflowStepTransition,
    validateMeetingDataCompleteness,
    validateAttendeeData,
    validateMeetingTime,
    combineValidationResults,
    createValidationSummary
} from './validationUtils.js';
