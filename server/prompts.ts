// Enhanced AI prompts and rules for meeting creation workflow

export const MEETING_CREATION_PROMPTS = {
  // System prompt for the AI assistant with enhanced meeting creation capabilities
  SYSTEM_PROMPT: `You are CalAI, an AI calendar assistant. Be concise, professional, and helpful.

Guidelines:
- Keep responses under 2 sentences maximum
- Use natural, conversational language
- Be direct and actionable
- Avoid jargon and complex explanations
- Focus on the user's immediate needs
- When asking questions, be specific and brief
- Never make up information or hallucinate
- Always verify facts before stating them
- If uncertain, ask for clarification`,

  // Enhanced meeting intent extraction prompt with context awareness and token efficiency
  MEETING_INTENT_EXTRACTION: `Analyze for meeting intent using context.

Context: {context}
Message: "{userMessage}"

JSON only. Conservative confidence:
{
  "intent": "create_meeting"|"schedule_meeting"|"other",
  "confidence": 0.0-1.0,
  "fields": {
    "startTime": "ISO|null",
    "endTime": "ISO|null", 
    "duration": number|null,
    "purpose": "string|null",
    "participants": ["email"],
    "suggestedTitle": "string|null"
  },
  "missing": ["field_names"]
}

Rules:
- "create_meeting": explicit creation request
- "schedule_meeting": scheduling discussion
- "other": general queries
- Use context to fill missing fields
- Higher confidence with context support`,

  // Token-efficient title generation prompt
  TITLE_GENERATION: `3 meeting titles. JSON only.

Purpose: "{purpose}"
People: {participants}
Context: "{context}"

{
  "suggestions": ["Title1", "Title2", "Title3"],
  "context": "brief"
}

Rules: <6 words, specific, action-focused, no "meeting"/"discussion"`,

  // Compressed attendee verification prompt
  ATTENDEE_VERIFICATION: `Verify emails: {emails}

JSON array only:
[{"email":"user@domain.com","valid":true/false,"trusted":true/false}]

Valid: correct format only
Trusted: known domains only`,

  // Compressed agenda generation prompt
  AGENDA_GENERATION: `Agenda for "{title}" - {duration}min

Purpose: {purpose}
People: {participants}
Context: {context}

Format:
1. Topic (Xmin)
2. Topic (Xmin)
3. Topic (Xmin)
Total: {duration}min

Concise, actionable items only.`,

  // Compressed action items prompt
  ACTION_ITEMS_GENERATION: `3 action items for "{title}". JSON only.

Purpose: {purpose}
People: {participants}
Topics: {topics}
Context: {context}

[{"task":"<10 words","assignee":"email","deadline":"timeframe","priority":"high|medium|low"}]

Clear, actionable, realistic deadlines.`,

  // Enhanced conversational response prompt with calendar access awareness
  CONVERSATIONAL_RESPONSE: `You are CalAI, an AI calendar assistant. Respond naturally based on calendar access status and workflow state.

Calendar Access: {calendarAccess}
Workflow State: {workflowState}
History: {history}
Message: "{message}"

Guidelines:
- Be concise and helpful
- Don't ask for calendar access if user already has it
- Prioritize time collection before attendee collection
- Reference availability checking when appropriate
- Ask specific questions when needed
- Keep responses under 3 sentences
- Use workflow-aware responses based on current step`,

  // Enhanced meeting intent extraction with calendar access context
  ENHANCED_MEETING_INTENT_EXTRACTION: `Analyze for meeting intent with calendar access and workflow context.

Calendar Access Status: {calendarAccessStatus}
Time Collection Complete: {timeCollectionComplete}
Availability Checked: {availabilityChecked}
Context: {context}
Message: "{userMessage}"

JSON only. Consider workflow state:
{
  "intent": "create_meeting"|"schedule_meeting"|"modify_time"|"add_attendees"|"other",
  "confidence": 0.0-1.0,
  "workflowAction": "verify_calendar"|"collect_time"|"check_availability"|"collect_attendees"|"finalize"|"none",
  "fields": {
    "startTime": "ISO|null",
    "endTime": "ISO|null", 
    "duration": number|null,
    "purpose": "string|null",
    "participants": ["email"],
    "suggestedTitle": "string|null"
  },
  "missing": ["field_names"],
  "nextStep": "calendar_verification"|"time_collection"|"availability_check"|"attendee_collection"|"creation"
}

Rules:
- Don't suggest calendar access if already verified
- Prioritize time collection over attendee collection
- Consider availability checking after time is set
- Use workflow context to determine next appropriate step`,

  // Enhanced calendar access verification prompts
  CALENDAR_ACCESS_PROMPTS: {
    ACCESS_VERIFIED: `Great! I can see you have calendar access. No need to grant permissions again.`,
    
    ACCESS_CHECKING: `Let me verify your calendar access first...`,
    
    ACCESS_FAILED: `I'm having trouble accessing your calendar. Let's get that sorted out so I can check your availability.`,
    
    TOKEN_EXPIRED: `Your calendar access has expired. Please re-authenticate to continue with scheduling.`,
    
    TOKEN_REFRESH_NEEDED: `I need to refresh your calendar access. This will happen automatically.`,
    
    NO_ACCESS_FOUND: `I don't see calendar access yet. You'll need to connect your Google Calendar first.`,
    
    VERIFICATION_SUCCESS: `Perfect! Your calendar is connected and I can check your availability.`,
    
    VERIFICATION_ERROR: `There was an issue verifying calendar access: {error}. Let's try reconnecting.`
  },

  // Time-priority conversation prompts
  TIME_PRIORITY_PROMPTS: {
    TIME_COLLECTION_START: `Let's start with the meeting time. When would you like to schedule this?`,
    
    TIME_BEFORE_ATTENDEES: `I need the meeting time first before we can add attendees. When works best for you?`,
    
    TIME_CLARIFICATION_NEEDED: `Could you specify the exact time and date? For example: "Tomorrow at 2 PM" or "Friday at 10:30 AM".`,
    
    DATE_AMBIGUOUS: `Which date did you mean? Please specify the exact day, like "next Tuesday" or "March 15th".`,
    
    TIME_CONFIRMATION: `Got it! So that's {time} on {date}. Let me check your calendar availability.`,
    
    TIME_ESTABLISHED_NEXT: `Perfect! Now that we have {time} confirmed, let's move to the next step.`,
    
    TIME_REQUIRED_FOR_AVAILABILITY: `I need a specific time to check your calendar availability. What time works for you?`,
    
    TIME_COLLECTION_PRIORITY: `Before we discuss attendees or other details, let's nail down the timing. When should this meeting happen?`
  },

  // Calendar availability and conflict resolution prompts
  AVAILABILITY_PROMPTS: {
    CHECKING_AVAILABILITY: `Checking your calendar for {time}...`,
    
    AVAILABILITY_CONFIRMED: `Great news! You're available at {time}.`,
    
    CONFLICT_DETECTED: `I found a conflict at {time}. You have: {conflictDetails}`,
    
    SUGGESTING_ALTERNATIVES: `Here are some alternative times that work: {alternatives}`,
    
    NO_ALTERNATIVES_FOUND: `I couldn't find good alternatives nearby. Could you suggest a different time range?`,
    
    CONFLICT_RESOLUTION_NEEDED: `There's a scheduling conflict. Would you like to see alternative times or choose a different slot?`,
    
    AVAILABILITY_CHECK_FAILED: `I couldn't check your calendar right now, but we can proceed and verify availability later.`,
    
    MULTIPLE_CONFLICTS: `I found several conflicts around that time. Let me suggest some clear slots: {alternatives}`,
    
    ALTERNATIVE_SELECTED: `Perfect! {selectedTime} looks clear on your calendar.`,
    
    AVAILABILITY_RECHECK: `Let me double-check availability for {time}...`
  },

  // Attendee requirement explanation prompts (enhanced)
  ATTENDEE_REQUIREMENT_PROMPTS: {
    ONLINE_MEETING_EXPLANATION: `Since this is an online meeting, we need to add attendees to generate the meeting link and send invitations. Online meetings require at least one attendee to create the virtual meeting room.`,
    
    ATTENDEE_UI_INTRODUCTION: `I'll show you the attendee management interface where you can add and verify email addresses. You can add multiple attendees and the system will validate each email address.`,
    
    TIME_FIRST_EXPLANATION: `Perfect! Now that we have the meeting time confirmed and your calendar availability checked, let's add the attendees for your online meeting.`,
    
    AVAILABILITY_CONFIRMED_TRANSITION: `Great! Your calendar is available at the requested time. Since this is an online meeting, the next step is to add attendees so we can generate the meeting link and send invitations.`,
    
    TIME_AND_AVAILABILITY_CONFIRMED: `Excellent! I've confirmed that {time} is available on your calendar. Now that we have the meeting time established and availability verified, let's add the attendees for your online meeting.`,
    
    ATTENDEE_COLLECTION_REQUIRED: `For online meetings, attendees are required to generate the meeting link and send calendar invitations. This ensures everyone receives the proper meeting details and access information.`,
    
    ATTENDEE_AFTER_TIME_PRIORITY: `Now that we have the time sorted ({time}), let's add the attendees. Since this is an online meeting, we need at least one attendee.`,
    
    TIME_ESTABLISHED_ATTENDEE_NEXT: `Time confirmed for {time}! Since this is an online meeting, I'll bring up the attendee editor so you can add participants.`
  },

  // Workflow step explanation prompts
  WORKFLOW_STEP_PROMPTS: {
    WORKFLOW_INTRODUCTION: `I'll help you create this meeting step by step. First, let's establish the time, then check availability, and finally add attendees.`,
    
    STEP_TRANSITION_TIME: `Step 1: Setting the meeting time. When would you like to schedule this?`,
    
    STEP_TRANSITION_AVAILABILITY: `Step 2: Checking your calendar availability for {time}...`,
    
    STEP_TRANSITION_ATTENDEES: `Step 3: Adding attendees. Since this is an online meeting, we need to add participants.`,
    
    STEP_TRANSITION_DETAILS: `Step 4: Finalizing meeting details and creating the event.`,
    
    WORKFLOW_PROGRESS: `Progress: {currentStep} of {totalSteps} - {stepDescription}`,
    
    STEP_COMPLETION: `✓ {stepName} complete. Moving to {nextStep}.`,
    
    WORKFLOW_REQUIREMENTS: `For this meeting, I need: {requirements}. Let's start with {firstRequirement}.`,
    
    STEP_VALIDATION_FAILED: `I need to complete {requiredStep} before we can move to {nextStep}.`,
    
    WORKFLOW_RESET_NEEDED: `Let me restart the workflow to make sure we get everything right.`
  },

  // New: Conversation summarization for token efficiency
  CONVERSATION_SUMMARIZATION: `Summarize key meeting info from conversation.

{messages}

Format:
Intent: [meeting/casual/other]
Details: [who, when, what]
Status: [draft/planning/ready]
Next: [action needed]

Max 80 words. Essential info only.`,

  // New: Context compression for long conversations
  CONTEXT_COMPRESSION: `Compress context. Keep meeting essentials.

Context: {fullContext}
Meeting: {meetingData}

Output:
M: [title, time, people]
Recent: [key points]
Status: [state]

Max 100 tokens.`,

  // New: Multi-turn intent analysis
  MULTI_TURN_INTENT: `Analyze intent across conversation turns.

Conversation: {conversation}
Current message: "{message}"

JSON only:
{
  "overallIntent": "create_meeting|schedule_meeting|modify_meeting|other",
  "turnIntent": "continue|clarify|confirm|new_topic",
  "confidence": 0.0-1.0,
  "contextSupport": 0.0-1.0
}

Use conversation flow to determine intent progression.`,

  // Enhanced agenda generation prompt
  ENHANCED_AGENDA_GENERATION: `Generate a professional meeting agenda.

Meeting: "{title}"
Type: {meetingType}
Duration: {duration} minutes
Attendees: {attendeeCount}
Context: {context}

Create structured agenda with:
1. Time-allocated topics
2. Clear objectives
3. Action items section

Format as numbered list with time allocations. Be concise and actionable.`,

  // Agenda quality validation
  AGENDA_VALIDATION: `Validate meeting agenda quality.

Agenda: {agenda}
Duration: {duration} minutes

Check for:
- Appropriate time allocation
- Clear topic structure
- Action items inclusion
- Professional formatting

JSON response:
{
  "score": 0-100,
  "issues": ["issue1", "issue2"],
  "suggestions": ["suggestion1", "suggestion2"]
}`
};

// Rules for the meeting creation workflow
export const MEETING_CREATION_RULES = {
  // Email validation rules
  EMAIL_VALIDATION: {
    // Regex pattern for email validation
    PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    
    // Trusted domains that are automatically verified
    TRUSTED_DOMAINS: [
      'gmail.com',
      'google.com',
      'outlook.com',
      'hotmail.com',
      'yahoo.com'
    ],
    
    // Validation requirements
    REQUIREMENTS: {
      MIN_LENGTH: 5,
      MAX_LENGTH: 254,
      REQUIRE_AT: true,
      REQUIRE_DOT: true
    }
  },
  
  // Meeting title rules
  TITLE_RULES: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 100,
    AUTO_GENERATE: true, // AI should generate titles, not users
    ALLOWED_CHARACTERS: /^[a-zA-Z0-9\s\-_',.&:()!?]+$/, // Restrict special characters
    PROHIBITED_WORDS: [ // Words that shouldn't appear in professional titles
      'meeting',
      'call',
      'session',
      'discussion'
    ]
  },
  
  // Time validation rules
  TIME_RULES: {
    MIN_DURATION: 15, // minutes
    MAX_DURATION: 480, // 8 hours
    BUSINESS_HOURS_START: 8, // 8 AM
    BUSINESS_HOURS_END: 18, // 6 PM
    ALLOW_WEEKENDS: false,
    MIN_NOTICE: 30 // minutes before scheduling
  },
  
  // Attendee rules
  ATTENDEE_RULES: {
    MAX_ATTENDEES: 50,
    MIN_ATTENDEES: 1,
    REQUIRE_UNIQUE: true,
    AUTO_VERIFY_TRUSTED: true
  },
  
  // Confidence thresholds for AI actions
  CONFIDENCE_THRESHOLDS: {
    MEETING_INTENT: 0.7, // Minimum confidence to detect meeting intent
    FIELD_EXTRACTION: 0.6, // Minimum confidence for field extraction
    TITLE_GENERATION: 0.8 // Minimum confidence for title suggestions
  }
};

// UI Block interaction rules
export const UI_BLOCK_RULES = {
  // Meeting link choice rules
  MEETING_LINK_CHOICE: {
    TIMEOUT: 30000, // 30 seconds to respond
    DEFAULT_CHOICE: false, // Default to not including meeting link
    SHOW_REMINDER: true
  },
  
  // Attendee editor rules
  ATTENDEE_EDITOR: {
    AUTO_VERIFY_DELAY: 1000, // 1 second delay for verification
    SHOW_VALIDATION: true,
    ALLOW_DUPLICATES: false,
    MAX_INPUT_LENGTH: 254
  },
  
  // Title suggestions rules
  TITLE_SUGGESTIONS: {
    MAX_SUGGESTIONS: 3,
    ALLOW_CUSTOM: true,
    REQUIRE_SELECTION: true
  },
  
  // Event review rules
  EVENT_REVIEW: {
    SHOW_ALL_DETAILS: true,
    ALLOW_EDITING: true,
    CONFIRMATION_REQUIRED: true
  }
};

// Error handling and fallback rules
export const ERROR_HANDLING_RULES = {
  // Retry policies
  RETRY_POLICIES: {
    AI_API_CALLS: {
      MAX_RETRIES: 3,
      BACKOFF_MS: 1000,
      TIMEOUT_MS: 10000
    },
    DATABASE_OPERATIONS: {
      MAX_RETRIES: 2,
      BACKOFF_MS: 500,
      TIMEOUT_MS: 5000
    }
  },
  
  // Fallback responses
  FALLBACK_RESPONSES: {
    AI_FAILURE: "Having trouble right now. Try again?",
    VALIDATION_FAILURE: "Check the details and try again.",
    NETWORK_ERROR: "Connection issue. Check internet and retry.",
    TIMEOUT: "Taking too long. Please try again."
  },
  
  // Logging rules
  LOGGING: {
    LOG_AI_INTERACTIONS: true,
    LOG_ERRORS: true,
    LOG_USER_ACTIONS: true,
    SENSITIVE_DATA_MASKING: true
  }
};