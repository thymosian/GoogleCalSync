# Agenda Send-to-Attendees Fix

## Problem
The `/api/meetings/send-agenda` endpoint was returning a 400 error:
```
"Meeting ID and formatted agenda HTML are required"
```

## Root Cause Analysis
The issue was a **parameter name mismatch**:
- **Client was sending**: `agendaHtml`
- **Server was expecting**: `formattedAgenda`

The server's validation check on line 2047 was failing because it couldn't find the `formattedAgenda` property.

## Changes Made

### 1. **Client-Side Fix** (`OnboardingMeetingSetup.tsx`)

#### Parameter Name Fix (Line 234)
```diff
const response = await apiRequest('POST', '/api/meetings/send-agenda', {
  meetingId: meetingData.id,
- agendaHtml,
+ formattedAgenda: agendaHtml,  // Changed parameter name
  attendees: meetingData.attendees.map(a => a.email),
  // ... other fields
});
```

#### Added Validation (Lines 206-229)
Before sending the request, now validates:
- ✅ Meeting ID exists
- ✅ Agenda HTML content is not empty
- ✅ At least one attendee is specified
- ✅ Logs debug info for troubleshooting

**Console logs will show:**
```
Sending agenda with data: {
  meetingId: "meeting-1234567890",
  agendaHtmlLength: 1243,
  attendeeCount: 3
}
```

### 2. **Rich Text Editor Fix** (`EnhancedAgendaEditor.tsx`)

#### Added Content Validation (Lines 186-197)
The `handleSend()` function now validates:
- ✅ Agenda content is not empty
- ✅ Prevents sending blank/whitespace-only content
- ✅ Prevents sending ReactQuill default empty state

**User feedback:**
- If agenda is empty, shows: "Please generate or edit an agenda before sending."
- Logs the first 200 characters for debugging

### 3. **Server-Side Improvements** (`routes.ts`)

#### Enhanced Validation (Lines 2044-2054)
Now validates:
- ✅ `meetingId` and `formattedAgenda` are present
- ✅ `attendees` array exists and has at least one recipient
- ✅ Provides specific error messages for each failure case

#### Better Data Handling (Lines 2067-2076)
- ✅ Accepts and stores attendee data from request
- ✅ Captures meeting metadata (title, time, link)
- ✅ Uses proper data for email job creation

#### Improved Response (Lines 2097-2105)
Returns helpful information:
```json
{
  "success": true,
  "message": "Agenda will be sent to attendees",
  "result": {
    "jobId": "agenda_1234567890",
    "totalRecipients": 3,
    "status": "processing"
  }
}
```

## Testing Steps

### 1. **Complete the Meeting Setup Workflow**
- Go through the onboarding steps
- Ensure all attendees are added
- Set meeting time and details

### 2. **Check Console Logs**
Open browser DevTools (F12) → Console tab and verify:
```
✓ "Sending agenda with data: { meetingId: ..., agendaHtmlLength: ..., attendeeCount: ... }"
✓ No validation error messages
```

### 3. **Verify Request/Response**
In DevTools → Network tab, check the POST to `/api/meetings/send-agenda`:
- ✅ Request includes: `formattedAgenda`, `meetingId`, `attendees`
- ✅ Response status: 200 OK
- ✅ Response includes: `success: true`, `jobId`

### 4. **Verify Server Logs**
Check server console for:
```
Processing send-agenda request: {
  meetingId: "meeting-...",
  attendeeCount: 3,
  title: "Your Meeting Title",
  hasAgendaContent: true
}

Email job created: {
  jobId: "agenda_1234567890",
  attendeeCount: 3
}
```

## Success Indicators

✅ **No 400 error** on agenda send  
✅ **"Meeting Created!" step** displays correctly  
✅ **Completion step** shows meeting link  
✅ **Console shows no validation errors**  
✅ **Network request succeeds with 200 status**

## Debugging Tips

If you still encounter issues:

1. **Empty agenda content?**
   - Check: Is the agenda generation step completing?
   - Look for: "Generating your meeting agenda..." loading state

2. **Missing attendees?**
   - Verify: Did you add attendees in step 3?
   - Error should show: "At least one attendee email is required"

3. **Missing meeting ID?**
   - This shouldn't happen, but if it does, refresh and restart
   - The ID is generated when component mounts

4. **Check Network Requests:**
   - Open DevTools → Network
   - Filter by: `/api/meetings/send-agenda`
   - Verify request body has all required fields

## Related Files
- `client/src/components/OnboardingMeetingSetup.tsx` - Lines 203-260
- `client/src/components/EnhancedAgendaEditor.tsx` - Lines 186-197
- `server/routes.ts` - Lines 2038-2110