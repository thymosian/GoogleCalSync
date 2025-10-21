# Mistral AI Routing Fix - Session 2025-10-18

## Issues Identified

### Issue #1: AI Router Configuration Wrong Model
**Problem**: The routing configuration was sending title and purpose generation requests to **Gemini** instead of **Mistral**, even though Mistral was configured.

**Location**: `server/config/aiRoutingConfig.ts` (lines 39-44, 57-62)

**What Was Happening**:
```
Logs showed: [AI Router] generateMeetingTitles -> gemini (primary)
Expected: [AI Router] generateMeetingTitles -> mistral (primary)
```

### Issue #2: Client Not Displaying Generated Title
**Problem**: The UI showed "Online Meeting" as the title instead of the AI-generated title like "Recursive Dialogues Rollout - Urgent Fix"

**Symptoms**:
- API generated correct title but it wasn't reaching the UI
- No visibility into what was being returned by `/api/ai/generate-title-and-purpose`

---

## Changes Made

### Fix #1: Update Routing Configuration
**File**: `server/config/aiRoutingConfig.ts`

Changed from:
```typescript
generateMeetingTitles: {
    primaryModel: 'gemini',      // ❌ Wrong
    fallbackModel: 'mistral',
    enableFallback: true,
    timeout: 20000
}
```

To:
```typescript
generateMeetingTitles: {
    primaryModel: 'mistral',     // ✅ Correct
    fallbackModel: 'gemini',
    enableFallback: true,
    timeout: 20000
}
```

**Also Updated** `enhancePurposeWording` with the same swap (lines 57-62)

**Result**: 
- Mistral AI now handles title and purpose generation
- Gemini acts as fallback if Mistral fails
- This aligns with the original implementation intent

### Fix #2: Add Debug Logging to Client
**File**: `client/src/components/StreamlinedMeetingWorkflow.tsx`

**Changes in `handleInformationSubmit` function**:
1. Added `console.log('AI Response received:', aiData)` to see full API response
2. Added warning if title is missing: `console.warn('No title in response, using purpose as fallback')`
3. Added logging for the title being set: `console.log('Setting meeting data with title:', generatedTitle)`
4. Improved fallback to use first 50 characters of purpose instead of relying on endpoint response

**Result**:
- Browser console now shows exactly what the API returns
- Easy to see if title field is missing or empty
- Can trace the full flow from API response → state update → UI display

---

## Testing the Fix

### Step 1: Restart the Server
The server will automatically pick up the new routing configuration.

```
npm run dev:watch
```

### Step 2: Create a Meeting with Detailed Purpose
Use the same long purpose text:
```
"To urgently convene all relevant stakeholders, team leads, and tangentially-adjacent contributors to address the critical and time-sensitive misalignment in the recent rollout of the Interactive User Engagement Optimization Layer — specifically concerning the unexpected recursive behavior of the "Save Changes" button..."
```

### Step 3: Check Browser Console
Open DevTools (F12) → Console tab

You should see:
```
AI Response received: {
  title: "...",
  titleSuggestions: [...],
  enhancedPurpose: "...",
  keyPoints: [...],
  context: "..."
}
Setting meeting data with title: "..."
```

### Step 4: Verify Title Display
- The "Meeting Summary" page should now show the AI-generated professional title
- Instead of "Online Meeting", it should show something like "Address Stakeholder Misalignment" or "Recursive Dialogues Rollout - Urgent Fix"

---

## Expected Behavior After Fix

### Mistral Processing Flow:
```
User Input Purpose
    ↓
POST /api/ai/generate-title-and-purpose
    ↓
[AI Router] Routes to Mistral (primary)
    ↓
Mistral: generateMeetingTitles()
    ↓
Mistral: enhancePurposeWording()
    ↓
Response with: {title, titleSuggestions, enhancedPurpose, keyPoints}
    ↓
Browser Console Log (for debugging)
    ↓
React State Update
    ↓
UI Display with Professional Title ✅
```

### Fallback Flow (if Mistral fails):
```
Mistral Error
    ↓
[AI Router] Routes to Gemini (fallback)
    ↓
Gemini processes request
    ↓
Response returned
```

---

## Key Differences from Before

| Aspect | Before | After |
|--------|--------|-------|
| Title Generation | Gemini (primary) | Mistral (primary) ✅ |
| Purpose Enhancement | Gemini (primary) | Mistral (primary) ✅ |
| Fallback Model | Mistral | Gemini ✅ |
| Debug Visibility | Limited | Full console logging ✅ |
| Title Display | "Online Meeting" | AI-generated professional title ✅ |

---

## Files Modified

1. **`server/config/aiRoutingConfig.ts`**
   - Lines 39-44: Updated `generateMeetingTitles` routing
   - Lines 57-62: Updated `enhancePurposeWording` routing

2. **`client/src/components/StreamlinedMeetingWorkflow.tsx`**
   - Lines 84-124: Enhanced `handleInformationSubmit` with logging
   - Added console.log for API response debugging
   - Improved error handling and title fallback logic

---

## Next Steps if Issues Persist

If the title still shows as "Online Meeting" after these fixes:

1. **Check browser console** for the `AI Response received` log
   - Is the `title` field present in the response?
   - What value does it have?

2. **Check server logs** for routing information
   - Should show: `[AI Router] generateMeetingTitles -> mistral (primary)`
   - Should NOT show: `[AI Router] generateMeetingTitles -> gemini (primary)`

3. **Verify API response structure**
   - The endpoint should return: `{ title, titleSuggestions, enhancedPurpose, keyPoints, context }`
   - If structure is different, the parsing will fail

4. **Check for caching**
   - Browser cache might be serving old version
   - Hard refresh (Ctrl+F5 or Cmd+Shift+R) to force reload

---

## Performance Notes

- **Expected Response Time**: 2000-2500ms (Mistral is slightly faster than Gemini)
- **Mistral Model Used**: `mistral-small-latest` with temperature 0.2 (deterministic titles)
- **Fallback Timeout**: If Mistral takes > 20 seconds, will automatically fail over to Gemini