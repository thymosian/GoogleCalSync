# Integration Guide - End-to-End Meeting Scheduling

## Quick Start: Using the New Components

### 1. Email Sending Status Component

**Location**: `client/src/components/EmailSendingStatus.tsx`

**Basic Usage**:
```tsx
import { EmailSendingStatus } from '@/components/EmailSendingStatus';

// In your component
const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'completed' | 'failed'>('idle');
const [progress, setProgress] = useState(0);

return (
  <EmailSendingStatus
    status={emailStatus}
    progress={progress}
    sent={2}
    total={5}
    failed={0}
    errors={[]}
    onRetry={() => handleRetry()}
  />
);
```

**Props**:
```typescript
status: 'idle' | 'sending' | 'completed' | 'failed' | 'partial'
progress?: number // 0-100
sent?: number // emails sent successfully
total?: number // total recipients
failed?: number // emails that failed
errors?: string[] // error messages
onRetry?: () => void // retry handler for failed sends
```

### 2. Enhanced Agenda Editor

**Location**: `client/src/components/AgendaEditor.tsx`

**Usage with Email Sending**:
```tsx
import { AgendaEditor } from '@/components/AgendaEditor';

const [isSending, setIsSending] = useState(false);
const [attendees, setAttendees] = useState<string[]>([]);

const handleSendEmails = async (agenda: string, recipients: string[]) => {
  setIsSending(true);
  try {
    const response = await fetch('/api/email/send-agenda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agendaContent: agenda,
        attendees: recipients,
        meetingId: meetingId
      })
    });
    // Handle response
  } finally {
    setIsSending(false);
  }
};

return (
  <AgendaEditor
    initialContent={agendaContent}
    onContentChange={setContent}
    onApprove={handleApprove}
    onRegenerate={handleRegenerate}
    onSendEmails={handleSendEmails}
    attendees={attendees}
    isSending={isSending}
    disabled={false}
  />
);
```

### 3. Email Template Service

**Location**: `server/emailTemplateService.ts`

**Backend Usage**:
```typescript
import { emailTemplateService } from './emailTemplateService.js';
import { MeetingData } from '../shared/schema.js';

// Generate HTML email
const meetingData: Partial<MeetingData> = {
  title: 'Quarterly Planning Meeting',
  startTime: new Date('2025-12-15T14:00:00'),
  endTime: new Date('2025-12-15T15:00:00'),
  type: 'online',
  meetingLink: 'https://meet.google.com/abc-def-ghi',
  attendees: ['john@example.com', 'jane@example.com']
};

const agenda = `
## Quarterly Planning Meeting

### 1. Q4 Review (15 min)
- Performance highlights
- Challenges faced
- Budget status

### 2. Q1 Planning (30 min)
- Goals and objectives
- Resource allocation
- Timeline review

### 3. Action Items (15 min)
- Assigned tasks
- Deadlines
- Follow-up meetings
`;

const htmlEmail = emailTemplateService.generateAgendaEmailTemplate(
  agenda,
  meetingData,
  'recipient@example.com'
);

const plainText = emailTemplateService.generateAgendaEmailPlainText(
  agenda,
  meetingData
);
```

### 4. Email Notification Service

**Location**: `server/emailNotificationService.ts`

**Usage**:
```typescript
import { emailNotificationService } from './emailNotificationService.js';

// Generate email content
const emailContent = emailNotificationService.createAgendaEmailContent(
  agenda,
  meetingData,
  'attendee@example.com'
);

// Get HTML and plain text versions
console.log(emailContent.html);  // Full HTML email
console.log(emailContent.plainText); // Plain text fallback
```

### 5. Time Extraction

**Location**: `server/mistralTimeExtractor.ts`

**Enhanced Patterns**:
```typescript
import { extractTimeFromNaturalLanguage } from './mistralTimeExtractor.js';

// Example patterns that now work:
const patterns = [
  "schedule a meeting next week Tuesday at 3pm",
  "let's meet in 2 hours",
  "setup something for this week Friday",
  "how about in 3 days at 4pm",
  "next week Monday at 9:30 am"
];

for (const pattern of patterns) {
  const result = await extractTimeFromNaturalLanguage(
    pattern,
    {
      currentDate: new Date().toISOString(),
      currentTime: new Date().toLocaleTimeString(),
      timezone: 'America/New_York'
    }
  );
  
  console.log(result);
  // {
  //   startTime: ISO timestamp,
  //   endTime: ISO timestamp,
  //   confidence: 0.85,
  //   reasoning: "Parsed 'next week Tuesday' with time 3:00 PM"
  // }
}
```

### 6. Chat Interface with Block Completion

**Location**: `client/src/components/ChatInterface.tsx`

**Features**:
- Automatically tracks completed UI blocks
- Fades previous blocks when moving forward
- Prevents accidental re-interaction with completed steps

**UI Flow**:
```
Step 1: Meeting Link Choice
[Fades after selection]
↓
Step 2: Attendee Editor  
[Fades after completion]
↓
Step 3: Title Selection
[Fades after selection]
↓
Step 4: Event Review
[Fades after approval]
↓
Step 5: Agenda Editor with Send Button
```

### 7. Calendar Sidebar

**Location**: `client/src/components/CalendarSidebar.tsx`

**Improvements**:
- All events shown without limit
- Scrollable with fixed header
- Better space utilization
- Grouped by date

**CSS Changes**:
```tsx
<div className="h-full flex flex-col">
  {/* Fixed header */}
  <div className="flex-shrink-0 sticky top-0">
    {/* Header content */}
  </div>
  
  {/* Scrollable content */}
  <div className="flex-1 overflow-y-auto">
    {/* Events list */}
  </div>
</div>
```

## API Endpoints

### Send Agenda Emails
```
POST /api/email/send-agenda
Content-Type: application/json

{
  "meetingId": "meeting-123",
  "agendaContent": "## Meeting Agenda\n\n1. Item 1\n2. Item 2",
  "attendees": ["john@example.com", "jane@example.com"],
  "meetingData": {
    "title": "Team Sync",
    "startTime": "2025-12-15T14:00:00Z",
    "endTime": "2025-12-15T15:00:00Z",
    "type": "online",
    "meetingLink": "https://meet.google.com/abc"
  }
}

Response:
{
  "jobId": "email-job-456",
  "status": "in_progress",
  "message": "Email sending started"
}
```

### Check Email Status
```
GET /api/email/status/email-job-456

Response:
{
  "jobId": "email-job-456",
  "status": "in_progress",
  "progress": 60,
  "totalAttendees": 5,
  "emailsSent": 3,
  "emailsFailed": 0,
  "estimatedTimeRemaining": 5000
}
```

### Retry Failed Emails
```
POST /api/email/retry/email-job-456

Response:
{
  "jobId": "email-job-456",
  "status": "in_progress",
  "message": "Retry started"
}
```

## Workflow States

### Complete Workflow State Machine
```
intent_detection
  ↓
calendar_access_verification
  ↓
meeting_type_selection
  ↓
time_date_collection
  ↓
availability_check
  ↓
conflict_resolution
  ↓
attendee_collection
  ↓
meeting_details_collection
  ↓
validation
  ↓
agenda_generation
  ↓
agenda_approval ← User can edit/regenerate
  ↓
approval
  ↓
creation
  ↓
agenda_sending (NEW)
  ↓
email_notification (NEW)
  ↓
completed
```

## Error Handling

### Email Sending Errors
```tsx
// Displayed in EmailSendingStatus component
errors: [
  'john@example.com: Invalid email address',
  'jane@example.com: Delivery failed',
  'bob@example.com: User not found'
]

// User can retry failed sends
onRetry={() => {
  // Retry mechanism implemented in backend
}}
```

### Time Extraction Confidence
```typescript
// Only use extracted times if confidence > 0.7
if (extractionResult.confidence > 0.7) {
  // Use extracted time
} else {
  // Ask user to specify time
}
```

## Data Models

### Email Sending Job
```typescript
interface EmailSendingJob {
  id: string;
  userId: string;
  meetingId: string;
  attendees: EmailValidationResult[];
  meetingData: any;
  agendaContent: AgendaContent;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'partially_failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  results?: BatchEmailResult;
  retryCount: number;
  maxRetries: number;
  errors: string[];
}
```

### Meeting Data
```typescript
interface MeetingData {
  title: string;
  startTime: Date;
  endTime: Date;
  type: 'online' | 'physical';
  location?: string;
  meetingLink?: string;
  attendees: Attendee[];
  agenda?: string;
  status: 'draft' | 'scheduled' | 'completed';
}
```

## Best Practices

### 1. Validate Before Sending
- Check agenda quality (length > 50 characters)
- Verify all attendees have valid emails
- Ensure meeting details are complete

### 2. Handle Errors Gracefully
- Show clear error messages to users
- Provide retry mechanism
- Log errors for debugging

### 3. Provide User Feedback
- Show real-time progress during sending
- Display completion status clearly
- Offer alternative actions (retry, edit, etc.)

### 4. Optimize Performance
- Use pagination for large attendee lists
- Batch email sends when possible
- Cache generated templates

### 5. Security
- Validate all user input
- Use authenticated endpoints
- Store email credentials securely
- Log all email activities

## Troubleshooting

### Issue: Emails not sending
**Solution**: 
1. Check email endpoint is authenticated
2. Verify attendee email addresses
3. Check Gmail API credentials
4. Review server logs for errors

### Issue: Time extraction not working
**Solution**:
1. Verify Mistral API key is configured
2. Check time format matches patterns
3. Provide explicit timezone information
4. Use clear, natural language

### Issue: UI blocks not fading
**Solution**:
1. Ensure Tailwind CSS is properly configured
2. Check opacity and pointer-events classes
3. Verify React state updates trigger re-render
4. Check browser console for errors

## Next Steps

1. **Test the workflow end-to-end**
   - Create a test meeting
   - Edit agenda
   - Send to test attendees

2. **Monitor email deliverability**
   - Check Gmail API quotas
   - Review email bounce rates
   - Monitor delivery latency

3. **Gather user feedback**
   - Email template design
   - UI/UX flow
   - Additional features needed

4. **Plan future enhancements**
   - SendGrid integration
   - Email analytics
   - Template customization
   - Scheduling options
