import axios from 'axios';
import { MeetingExtraction, TitleSuggestion } from '../shared/schema.js';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';

export interface MistralMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const SYSTEM_PROMPT = `You are an intelligent AI calendar assistant with advanced meeting creation capabilities. You help users manage their calendar, schedule meetings, create agendas, and organize tasks.

When responding to meeting-related requests, you are capable of:
1. Detecting when users want to create or schedule meetings
2. Extracting meeting details from natural conversation
3. Generating intelligent meeting titles based on context
4. Providing helpful guidance through the meeting creation process

Always be conversational, helpful, and proactive in gathering the information needed to create successful meetings.`;

export async function getMistralResponse(messages: MistralMessage[]): Promise<string> {
  try {
    const response = await axios.post(
      MISTRAL_API_URL,
      {
        model: 'mistral-tiny',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT
          },
          ...messages
        ],
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${MISTRAL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error: any) {
    console.error('Error calling Mistral API:', error.response?.data || error.message);
    throw new Error('Failed to get response from AI assistant');
  }
}

export async function extractMeetingIntent(userMessage: string, conversationContext: string = ''): Promise<MeetingExtraction> {
  const extractionPrompt = `Analyze the following user message and conversation context to determine if the user wants to create or schedule a meeting. Extract relevant meeting details and identify what information is missing.

Current user message: "${userMessage}"
Conversation context: "${conversationContext}"

You MUST respond with ONLY a valid JSON object in this exact format:
{
  "intent": "create_meeting" | "schedule_meeting" | "other",
  "confidence": number between 0 and 1,
  "fields": {
    "startTime": "ISO 8601 string or null if not specified",
    "endTime": "ISO 8601 string or null if not specified", 
    "duration": number in minutes or null,
    "purpose": "meeting purpose/topic or null",
    "participants": ["array", "of", "participant", "names/emails"],
    "suggestedTitle": "AI-generated title based on context or null"
  },
  "missing": ["array of required fields that are missing: startTime, endTime, duration, participants"]
}

Examples of meeting intent:
- "Let's schedule a meeting" → create_meeting
- "Can we meet tomorrow at 2pm?" → schedule_meeting  
- "Set up a call with John about the project" → create_meeting
- "What's my calendar like?" → other

Be intelligent about extracting times, participants, and purpose from natural language.`;

  try {
    const response = await axios.post(
      MISTRAL_API_URL,
      {
        model: 'mistral-tiny',
        messages: [
          {
            role: 'system',
            content: 'You are a precise meeting extraction specialist. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: extractionPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 300
      },
      {
        headers: {
          'Authorization': `Bearer ${MISTRAL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content.trim();
    
    try {
      return JSON.parse(content) as MeetingExtraction;
    } catch (parseError) {
      console.error('Failed to parse meeting extraction JSON:', content);
      // Return default "other" intent if parsing fails
      return {
        intent: 'other',
        confidence: 0,
        fields: {
          participants: []
        },
        missing: []
      } as MeetingExtraction;
    }
  } catch (error: any) {
    console.error('Error extracting meeting intent:', error.response?.data || error.message);
    throw new Error('Failed to extract meeting intent');
  }
}

export async function generateMeetingTitles(purpose: string, participants: string[], context: string = ''): Promise<TitleSuggestion> {
  const titlePrompt = `Generate 3 concise, professional meeting titles based on the following information:

Purpose/Topic: "${purpose}"
Participants: ${participants.join(', ')}
Additional Context: "${context}"

The titles should be:
- Professional and clear
- 3-8 words long
- Descriptive of the meeting purpose
- Appropriate for calendar entries

You MUST respond with ONLY a valid JSON object in this exact format:
{
  "suggestions": ["Title Option 1", "Title Option 2", "Title Option 3"],
  "context": "brief explanation of the meeting context"
}

Examples:
- Purpose: "project review" → ["Project Status Review", "Weekly Project Check-in", "Project Progress Discussion"]
- Purpose: "budget planning" → ["Q4 Budget Planning", "Budget Review Meeting", "Financial Planning Session"]`;

  try {
    const response = await axios.post(
      MISTRAL_API_URL,
      {
        model: 'mistral-tiny',
        messages: [
          {
            role: 'system',
            content: 'You are a professional meeting title generator. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: titlePrompt
          }
        ],
        temperature: 0.5,
        max_tokens: 200
      },
      {
        headers: {
          'Authorization': `Bearer ${MISTRAL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content.trim();
    
    try {
      return JSON.parse(content) as TitleSuggestion;
    } catch (parseError) {
      console.error('Failed to parse title suggestions JSON:', content);
      // Return default suggestions if parsing fails
      return {
        suggestions: ["Team Meeting", "Discussion Session", "Project Sync"],
        context: "General meeting"
      } as TitleSuggestion;
    }
  } catch (error: any) {
    console.error('Error generating meeting titles:', error.response?.data || error.message);
    throw new Error('Failed to generate meeting titles');
  }
}