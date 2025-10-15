# Manual Testing Guide - Conversational Meeting Scheduler

## Overview
This guide provides comprehensive test scenarios to manually verify every feature of the conversational meeting scheduler. Test each scenario by logging into the app and following the prompts.

## Prerequisites
- App running locally or deployed
- Google account logged in
- Access to Gmail and Google Calendar
- Valid Gmail addresses for testing attendee validation

## Test Categories

### 1. Conversation Flow & Intent Detection

#### Test 1.1: Natural Conversation to Meeting Detection
**Objective**: Test AI's ability to detect meeting intent from casual conversation

**Test Prompts**:
```
1. "Hey, I was thinking we should get together next week to discuss the project"
2. "Can we set up some time to review the quarterly results?"
3. "I need to schedule a call with the team about the new features"
4. "Let's meet tomorrow at 2pm to go over the proposal"
5. "We should have a standup meeting every Monday morning"
```

**Expected Behavior**:
- AI should detect scheduling intent
- Transition from casual to meeting collection mode
- Ask clarifying questions about missing details
- Maintain conversation context

#### Test 1.2: Context Persistence Across Multiple Messages
**Objective**: Verify conversation context is maintained across turns

**Test Scenario**:
```
User: "I want to schedule a meeting"
AI: [Asks for details]
User: "It's about the marketing campaign"
AI: [Asks for time]
User: "Next Tuesday at 3pm"
AI: [Asks for duration]
User: "Make it 1 hour"
AI: [Asks for meeting type]
```

**Expected Behavior**:
- Each response builds on previous information
- No repeated questions for already provided info
- Context summary maintained throughout

#### Test 1.3: Conversation Mode Switching
**Objective**: Test graceful transitions between casual and scheduling modes

**Test Prompts**:
```
1. Start with: "How's the weather today?"
2. Then: "Actually, can we schedule a meeting for tomorrow?"
3. Then: "Never mind, let's talk about something else"
4. Then: "Wait, I do need that meeting after all"
```

**Expected Behavior**:
- Smooth transitions between modes
- Context preserved when returning to scheduling
- No confusion or lost information

### 2. Meeting Type Detection & Business Rules

#### Test 2.1: Meeting Type Selection
**Objective**: Test physical vs online meeting detection and validation

**Test Scenarios**:

**Physical Meeting**:
```
"I want to schedule an in-person meeting in the conference room"
```
**Expected**: Should ask for location details, not require attendees

**Online Meeting**:
```
"Let's set up a Zoom call for the team"
```
**Expected**: Should require attendees, offer to generate meeting link

**Ambiguous Meeting**:
```
"I need to schedule a meeting with the team"
```
**Expected**: Should ask "Is this a physical or online meeting?"

#### Test 2.2: Business Rules Enforcement
**Objective**: Verify hardcoded business rules are enforced

**Test Cases**:

**Online Meeting Without Attendees**:
```
1. "Schedule an online meeting for tomorrow"
2. When asked about attendees, say "No attendees needed"
```
**Expected**: Should refuse and explain online meetings require attendees

**Physical Meeting Without Location**:
```
1. "Schedule a physical meeting for next week"
2. When asked about location, say "No specific location"
```
**Expected**: Should refuse and require location information

### 3. Attendee Management & Validation

#### Test 3.1: Real-time Email Validation
**Objective**: Test Gmail validation using Google People API

**Test Emails** (use real Gmail addresses you have access to):
```
Valid Gmail: your.email@gmail.com
Invalid format: notanemail
Non-existent: fakeemail12345@gmail.com
Non-Gmail: someone@yahoo.com
```

**Test Process**:
1. Start online meeting creation
2. Add each email type one by one
3. Observe validation feedback

**Expected Behavior**:
- Valid Gmail: Shows green checkmark + first name
- Invalid format: Shows format error immediately
- Non-existent: Shows "email not found" after API check
- Non-Gmail: Shows warning about external email

#### Test 3.2: Multiple Attendee Management
**Objective**: Test adding, removing, and managing multiple attendees

**Test Scenario**:
```
1. Add 3 valid Gmail addresses
2. Try to add a duplicate
3. Remove one attendee
4. Add another new attendee
5. Try to add invalid email
```

**Expected Behavior**:
- Duplicate prevention
- Smooth addition/removal
- Validation for each new email
- List updates in real-time

#### Test 3.3: Attendee Editor UI
**Objective**: Test the specialized attendee editor interface

**Test Actions**:
1. Click in attendee input field
2. Type partial email and observe autocomplete
3. Use keyboard navigation (Tab, Enter, Escape)
4. Test copy/paste of email addresses
5. Test mobile responsiveness (if applicable)

### 4. Meeting Approval Workflow

#### Test 4.1: Meeting Summary Review
**Objective**: Test meeting information review before creation

**Test Scenario**:
Create a complete meeting with:
- Title: "Project Review Meeting"
- Type: Online
- Date/Time: Tomorrow 2:00 PM - 3:00 PM
- Attendees: 2-3 valid Gmail addresses

**Expected Display**:
- All meeting details clearly shown
- Attendee names (not just emails)
- Meeting type and duration
- Edit options for each field

#### Test 4.2: Meeting Modification
**Objective**: Test editing meeting details during approval

**Test Actions**:
1. Create meeting with initial details
2. Click "Edit" on title - change it
3. Click "Edit" on time - modify time
4. Click "Edit" on attendees - add/remove someone
5. Approve final meeting

**Expected Behavior**:
- Inline editing works smoothly
- Changes reflected immediately
- Final approval creates meeting with updated info

#### Test 4.3: Meeting Creation Integration
**Objective**: Verify Google Calendar integration works

**Test Process**:
1. Complete meeting approval
2. Check Google Calendar for created event
3. Verify meeting link generated (for online meetings)
4. Confirm attendees received calendar invites

### 5. Agenda Generation & Editing

#### Test 5.1: AI-Powered Agenda Generation
**Objective**: Test agenda creation from conversation context

**Test Conversations**:
```
Scenario 1: "Let's meet to discuss Q4 budget planning, review last quarter's performance, and plan the marketing strategy for next year"

Scenario 2: "We need a standup to go over current sprint progress, blockers, and plan next week's tasks"

Scenario 3: "Schedule a client meeting to present the new design mockups and get feedback on the user experience"
```

**Expected Behavior**:
- Agenda reflects conversation topics
- Logical structure and flow
- Appropriate time estimates
- Professional formatting

#### Test 5.2: Rich Text Agenda Editing
**Objective**: Test agenda editor functionality

**Test Actions**:
1. Generate agenda from conversation
2. Use bold formatting on headings
3. Add bullet points for action items
4. Change text alignment
5. Add/remove agenda sections
6. Test undo/redo functionality

#### Test 5.3: Agenda Approval Workflow
**Objective**: Test agenda review and finalization

**Test Process**:
1. Review generated agenda
2. Make edits using rich text tools
3. Preview final agenda
4. Approve agenda for distribution

### 6. Email Distribution & Gmail Integration

#### Test 6.1: Agenda Email Sending
**Objective**: Test Gmail integration for agenda distribution

**Test Scenario**:
1. Complete meeting with agenda
2. Approve agenda for sending
3. Confirm email sending to all attendees
4. Check sent emails in Gmail
5. Verify attendees receive personalized emails

**Expected Email Content**:
- Personalized greeting with first names
- Meeting details (time, location/link)
- Formatted agenda content
- Professional email signature

#### Test 6.2: Email Error Handling
**Objective**: Test error scenarios in email sending

**Test Cases**:
1. Include one invalid email in attendee list
2. Test with Gmail API temporarily unavailable
3. Test with large attendee list (10+ people)

**Expected Behavior**:
- Clear error messages for failed sends
- Retry options for failed emails
- Success confirmation for sent emails
- Partial success handling

### 7. Performance & Token Optimization

#### Test 7.1: Long Conversation Handling
**Objective**: Test context compression with extended conversations

**Test Process**:
1. Have a very long conversation (20+ messages)
2. Include multiple topic changes
3. Eventually get to meeting scheduling
4. Verify AI maintains relevant context
5. Check response times remain reasonable

#### Test 7.2: Multiple Concurrent Users
**Objective**: Test system performance under load

**Test Setup**:
1. Open app in multiple browser tabs/windows
2. Start different conversations in each
3. Progress through meeting creation simultaneously
4. Verify no cross-contamination of data

### 8. Error Handling & Edge Cases

#### Test 8.1: AI Service Failures
**Objective**: Test graceful degradation when AI services fail

**Test Scenarios**:
1. Very ambiguous input: "Thing tomorrow maybe"
2. Conflicting information: "Meet at 2pm... no wait, 3pm... actually 2:30"
3. Impossible requests: "Schedule meeting for yesterday"

#### Test 8.2: Google API Failures
**Objective**: Test handling of external service issues

**Test Cases**:
1. Calendar creation with invalid time zones
2. Attendee validation with network issues
3. Email sending with quota exceeded

#### Test 8.3: Data Validation Edge Cases
**Objective**: Test boundary conditions and invalid inputs

**Test Inputs**:
```
- Very long meeting titles (200+ characters)
- Meetings scheduled years in the future
- Meetings with 50+ attendees
- Special characters in meeting details
- Emoji in meeting titles and descriptions
```

## Test Data Preparation

### Sample Gmail Addresses
Prepare these types of test emails:
- Your own Gmail address
- Colleague's Gmail addresses (with permission)
- Test Gmail accounts you control
- Invalid format examples
- Non-Gmail addresses for external testing

### Sample Meeting Scenarios
```
1. Daily Standup (15 min, online, 3-5 attendees)
2. Client Presentation (1 hour, online, 8-10 attendees)
3. Team Building (2 hours, physical, conference room)
4. One-on-One (30 min, online, 1 attendee)
5. All-Hands Meeting (1 hour, physical, 20+ attendees)
```

## Success Criteria Checklist

### Conversation Flow ✓
- [ ] Natural intent detection works
- [ ] Context maintained across turns
- [ ] Smooth mode transitions
- [ ] No repeated questions

### Meeting Management ✓
- [ ] Meeting type detection accurate
- [ ] Business rules enforced consistently
- [ ] All meeting details captured correctly
- [ ] Approval workflow intuitive

### Attendee Validation ✓
- [ ] Real-time email validation works
- [ ] Google People API integration functional
- [ ] Multiple attendee management smooth
- [ ] Error handling for invalid emails

### Agenda Features ✓
- [ ] AI generates relevant agendas
- [ ] Rich text editing works properly
- [ ] Agenda approval workflow clear
- [ ] Final formatting professional

### Email Integration ✓
- [ ] Gmail sending works reliably
- [ ] Personalized emails generated
- [ ] Error handling for failed sends
- [ ] Email content properly formatted

### Performance ✓
- [ ] Response times under 3 seconds
- [ ] Long conversations handled well
- [ ] Multiple users supported
- [ ] Token usage optimized

### Error Handling ✓
- [ ] Graceful AI service failures
- [ ] Clear error messages
- [ ] Recovery options provided
- [ ] No data loss during errors

## Reporting Issues

When you find issues, document:
1. **Steps to reproduce**
2. **Expected behavior**
3. **Actual behavior**
4. **Browser/device info**
5. **Screenshots/recordings**
6. **Console errors (if any)**

## Advanced Testing Scenarios

### Integration Testing
1. **Full End-to-End Flow**: Complete a meeting from casual conversation to calendar creation and agenda distribution
2. **Cross-Platform Testing**: Test on different browsers and devices
3. **Timezone Testing**: Create meetings across different time zones
4. **Accessibility Testing**: Use screen readers and keyboard-only navigation

### Stress Testing
1. **High Volume**: Create multiple meetings rapidly
2. **Large Meetings**: Test with 50+ attendees
3. **Complex Agendas**: Generate very detailed agendas with multiple sections
4. **Long Sessions**: Keep conversation active for extended periods

This comprehensive testing guide covers every aspect of your conversational meeting scheduler. Work through each section systematically to ensure all features work as expected.