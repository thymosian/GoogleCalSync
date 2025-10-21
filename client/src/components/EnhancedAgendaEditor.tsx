import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Video, Users, Calendar, CheckCircle, AlertCircle, Loader2, Edit, Eye, Send, ArrowLeft } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/queryClient';
import { lazy, Suspense } from 'react';
import { AgendaPreview } from './AgendaPreview';
import { EmailSendingStatus } from './EmailSendingStatus';

// Lazily import React Quill to avoid SSR issues
const ReactQuill = lazy(() => import('react-quill'));
import 'react-quill/dist/quill.snow.css';

// Add CSS to prevent conflicts
const quillStyles = `
  .ql-container {
    font-family: inherit;
  }
  .ql-editor {
    min-height: 200px;
    font-size: 14px;
    line-height: 1.5;
  }
  .ql-toolbar {
    border-top: 1px solid #e5e7eb;
    border-left: 1px solid #e5e7eb;
    border-right: 1px solid #e5e7eb;
    border-bottom: none;
  }
  .ql-container {
    border-bottom: 1px solid #e5e7eb;
    border-left: 1px solid #e5e7eb;
    border-right: 1px solid #e5e7eb;
  }
`;

interface EnhancedAgendaEditorProps {
  meetingData: any;
  onSave: (htmlAgenda: string) => void;
  onCancel: () => void;
  isSending: boolean;
}

type EditorStep = 'edit' | 'preview' | 'loading';

export function EnhancedAgendaEditor({
  meetingData,
  onSave,
  onCancel,
  isSending
}: EnhancedAgendaEditorProps) {
  const [step, setStep] = useState<EditorStep>('loading');
  const [agendaContent, setAgendaContent] = useState('');
  const [originalAgenda, setOriginalAgenda] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [useFallbackEditor, setUseFallbackEditor] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [lastSavedDraft, setLastSavedDraft] = useState<string>('');
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);
  const [usePlainTextFallback, setUsePlainTextFallback] = useState(false);
  const [narrativeGenerationFailed, setNarrativeGenerationFailed] = useState(false);
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [emailJobId, setEmailJobId] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'completed' | 'failed' | 'partial'>('idle');
  const [emailSendingSuccess, setEmailSendingSuccess] = useState(false);
  const [contentDisplayError, setContentDisplayError] = useState(false);
  const [forceRefreshKey, setForceRefreshKey] = useState(0);

  // React Quill modules configuration - optimized for agenda content
  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'color': [] }, { 'background': [] }],
      ['link'],
      ['clean']
    ],
    clipboard: {
      // Preserve HTML structure when pasting
      matchVisual: false,
    }
  };

  const formats = [
    'header', 'bold', 'italic', 'underline', 'strike',
    'list', 'bullet', 'color', 'background', 'link'
  ];

  // Helper function to clean HTML content for ReactQuill compatibility - improved for content preservation
  const cleanHtmlForReactQuill = (htmlContent: string): string => {
    if (!htmlContent) return '';

    console.log('🔍 Original AI content length:', htmlContent.length);
    console.log('🔍 Original AI content preview:', htmlContent.substring(0, 300) + '...');

    let cleaned = htmlContent.trim();

    // Handle markdown code blocks first
    if (cleaned.startsWith('```html')) {
      console.log('📝 Found markdown code block, extracting HTML...');
      cleaned = cleaned.replace(/^```html\s*/, '').replace(/```\s*$/, '');
    } else if (cleaned.startsWith('```')) {
      console.log('📝 Found generic code block, extracting content...');
      cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    // Handle cases where content is wrapped in code blocks but doesn't start with ```
    if (cleaned.includes('```html') && !cleaned.startsWith('<')) {
      console.log('📝 Found inline markdown code block, extracting...');
      const match = cleaned.match(/```html\s*([\s\S]*?)\s*```/);
      if (match) {
        cleaned = match[1];
      }
    }

    // Remove full HTML document tags if present - be more specific
    cleaned = cleaned.replace(/<\/?html\s*[^>]*>/gi, '');
    cleaned = cleaned.replace(/<\/?head\s*[^>]*>/gi, '');
    cleaned = cleaned.replace(/<\/?body\s*[^>]*>/gi, '');

    // Remove any DOCTYPE declarations
    cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');

    // Remove script and style tags (not needed for ReactQuill)
    cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Clean up any remaining markdown-style formatting that might be in the content
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    cleaned = cleaned.replace(/\*(.*?)\*/g, '<em>$1</em>');
    cleaned = cleaned.replace(/`(.*?)`/g, '<code>$1</code>');

    // Fix bullet points that might be using markdown syntax - but preserve existing HTML lists
    if (!cleaned.includes('<li>')) {
      cleaned = cleaned.replace(/^\s*-\s+/gm, '• ');
      cleaned = cleaned.replace(/^\s*\*\s+/gm, '• ');
      cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, (match) => {
        const num = match.trim().replace('.', '');
        return `${num}. `;
      });
    }

    // Ensure content starts with a proper block element - improved logic
    const trimmedContent = cleaned.trim();
    if (!trimmedContent.match(/^<h[1-6]|<p|<div|<ul|<ol|<li/)) {
      console.log('📝 Content does not start with block element, wrapping in div...');
      // If content doesn't start with a block element, wrap it in a div for better ReactQuill compatibility
      cleaned = `<div>${trimmedContent}</div>`;
    }

    // Ensure proper HTML structure and fix any unclosed tags - improved validation
    console.log('✅ Final cleaned content length:', cleaned.length);
    console.log('✅ Final cleaned content preview:', cleaned.substring(0, 300) + '...');

    // Additional validation to ensure we have substantial content
    if (cleaned.length < 200) {
      console.warn('⚠️ Cleaned content is very short, may indicate processing issue:', cleaned.length);
    }

    // Check for required sections
    const hasTitle = cleaned.includes('<h2>');
    const hasSections = cleaned.includes('<h3>');
    const hasContent = cleaned.includes('<p>') || cleaned.includes('<ul>') || cleaned.includes('<ol>');

    console.log('📊 Content analysis:', { hasTitle, hasSections, hasContent, totalLength: cleaned.length });

    return cleaned;
  };

  // Helper function to convert HTML to plain text for fallback display
  const htmlToPlainText = (htmlContent: string): string => {
    if (!htmlContent) return '';

    // Create a temporary div element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    // Simple text extraction (you could enhance this with more sophisticated parsing)
    let plainText = tempDiv.textContent || tempDiv.innerText || '';

    // Clean up extra whitespace
    plainText = plainText.replace(/\s+/g, ' ').trim();

    // Add basic formatting for readability
    plainText = plainText
      .replace(/\n\s*\n/g, '\n\n') // Multiple newlines become double newlines
      .replace(/•/g, '• ') // Ensure space after bullet points
      .trim();

    return plainText;
  };

  // Helper function to determine if we should use plain text fallback
  const shouldUsePlainTextFallback = (htmlContent: string): boolean => {
    if (!htmlContent) return true;

    const cleaned = cleanHtmlForReactQuill(htmlContent);

    // Use plain text if content is too short, contains too many HTML issues, or doesn't look like proper agenda content
    if (cleaned.length < 100) return true;
    if (cleaned.includes('<html>') || cleaned.includes('<body>')) return true;
    if (!cleaned.includes('<h2>') && !cleaned.includes('<h3>')) return true;

    return false;
  };

  // Generate rich agenda when component mounts
  useEffect(() => {
    console.log('EnhancedAgendaEditor mounted with meetingData:', meetingData);
    console.log('Enhanced purpose available:', !!meetingData.enhancedPurpose);
    console.log('Meeting link available:', !!meetingData.meetingLink);

    // Load any existing draft first
    loadDraft();

    if (meetingData.enhancedPurpose && meetingData.meetingLink) {
      console.log('Generating rich agenda...');

      // Generate agenda first, then narrative description - fully sequential
      const generateBoth = async () => {
        try {
          console.log('🚀 Starting sequential agenda generation...');

          // Generate the rich agenda first and get the content directly
          const generatedAgendaContent = await generateRichAgenda();
          console.log('✅ Rich agenda generation completed');

          // Use the returned content directly instead of relying on state
          if (generatedAgendaContent && generatedAgendaContent.length > 100) {
            console.log('🚀 Starting narrative description generation...');
            try {
              await generateNarrativeDescription();
              console.log('✅ Narrative description generation completed');
            } catch (error) {
              console.error('❌ Error generating narrative description:', error);
              // Set flag to show user that narrative enhancement failed
              setNarrativeGenerationFailed(true);
              console.log('Narrative enhancement failed - user will be notified');
            }
          } else {
            console.warn('⚠️ Agenda content not sufficient for narrative generation');
            setNarrativeGenerationFailed(true);
          }

        } catch (error) {
          console.error('❌ Error in generateBoth:', error);
        }
      };

      generateBoth();
    } else {
      console.log('Using fallback agenda...');
      // Reset narrative failure flag when using fallback
      setNarrativeGenerationFailed(false);
      // Fallback for basic agenda if enhanced purpose is not available
      const fallbackAgenda = cleanHtmlForReactQuill(generateFallbackAgenda());
      setAgendaContent(fallbackAgenda);
      setOriginalAgenda(fallbackAgenda);
      setStep('edit');
    }
  }, [meetingData]);

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
      }
    };
  }, [autoSaveTimer]);

  // Detect content display issues in ReactQuill
  useEffect(() => {
    if (agendaContent && agendaContent.length > 200 && !usePlainTextFallback && step === 'edit') {
      const timer = setTimeout(() => {
        if (detectContentDisplayIssues()) {
          console.warn('⚠️ Content display issue detected, ReactQuill may not be showing content properly');
        }
      }, 1000); // Wait 1 second for ReactQuill to render

      return () => clearTimeout(timer);
    }
  }, [agendaContent, usePlainTextFallback, step]);

  const generateRichAgenda = async (isRetry = false): Promise<string | null> => {
    console.log('generateRichAgenda called', isRetry ? `(retry ${retryCount + 1})` : '');
    setIsGenerating(true);
    setGenerationError(null);
    setStep('loading');

    // Progress simulation for better UX
    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => Math.min(prev + Math.random() * 15, 90));
    }, 200);

    try {
      console.log('Making API request to /api/meetings/generate-rich-agenda');

      // Create abort controller for timeout handling with longer timeout for complex content
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout for agenda generation

      // Check request size and potentially simplify if too large
      const requestData = {
        meetingId: meetingData.id,
        title: meetingData.title,
        enhancedPurpose: meetingData.enhancedPurpose,
        participants: meetingData.attendees?.map((a: any) => a.email) || [],
        duration: meetingData.startTime && meetingData.endTime ?
          Math.round((new Date(meetingData.endTime).getTime() - new Date(meetingData.startTime).getTime()) / (1000 * 60)) : 60,
        meetingLink: meetingData.meetingLink,
        startTime: meetingData.startTime,
        endTime: meetingData.endTime
      };

      console.log('📤 Request data size:', {
        titleLength: requestData.title.length,
        purposeLength: requestData.enhancedPurpose.length,
        participantsCount: requestData.participants.length,
        totalSize: JSON.stringify(requestData).length
      });

      // If request is very large, truncate the purpose to reduce token usage
      let finalRequestData = requestData;
      const totalSize = JSON.stringify(requestData).length;
      if (totalSize > 8000) { // ~8KB limit
        console.warn('⚠️ Request size is large, truncating purpose for better reliability');
        finalRequestData = {
          ...requestData,
          enhancedPurpose: requestData.enhancedPurpose.substring(0, 500) + '...'
        };
      }

      const response = await apiRequest('POST', '/api/meetings/generate-rich-agenda', finalRequestData);

      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      setGenerationProgress(100);

      console.log('API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Agenda data received:', data);

        // Validate response data
        if (!data.agenda?.html) {
          throw new Error('Invalid response: missing agenda content');
        }

        console.log('✅ Agenda generation successful!');
        console.log('📄 Agenda content length:', data.agenda.html.length);
        console.log('📄 Word count:', data.agenda.text?.split(' ').length || 'N/A');
        console.log('📄 Contains enhanced purpose:', data.agenda.html.includes(meetingData.enhancedPurpose?.substring(0, 50) || ''));
        console.log('📄 First 200 chars:', data.agenda.html.substring(0, 200));

        // Debug: Check the actual response structure
        console.log('📄 Full response structure:', JSON.stringify(data, null, 2));

        // Debug: Check for HTML document tags
        console.log('📄 Contains <html> tag:', data.agenda.html.includes('<html>'));
        console.log('📄 Contains <head> tag:', data.agenda.html.includes('<head>'));
        console.log('📄 Contains <body> tag:', data.agenda.html.includes('<body>'));
        console.log('📄 Contains ```html markdown:', data.agenda.html.includes('```html'));
        console.log('📄 Contains ``` markdown:', data.agenda.html.includes('```'));

        // Additional debugging for content issues
        console.log('📄 HTML content preview:', data.agenda.html.substring(0, 500));
        console.log('📄 Is HTML content valid?', data.agenda.html.includes('<') && data.agenda.html.includes('>'));
        console.log('📄 Response success field:', data.success);
        console.log('📄 Response cached field:', data.cached);

        // Validate that we have proper HTML content
        let finalContent = data.agenda.html;

        // If the content doesn't look like proper HTML, use a fallback
        if (!finalContent || finalContent.length < 100 || !finalContent.includes('<') || !finalContent.includes('>')) {
          console.warn('API returned invalid HTML content, using fallback');
          finalContent = generateFallbackAgenda();
        }

        console.log('📄 Final content to set:', finalContent.substring(0, 200));
        console.log('📄 Final content length:', finalContent.length);

        // Clean HTML content for ReactQuill compatibility
        const cleanedContent = cleanHtmlForReactQuill(finalContent);

        // Check if we should use plain text fallback
        const shouldUsePlainText = shouldUsePlainTextFallback(cleanedContent);

        if (shouldUsePlainText) {
          console.log('📝 Using plain text fallback due to HTML issues');
          const plainTextContent = htmlToPlainText(cleanedContent);
          setAgendaContent(plainTextContent);
          setUsePlainTextFallback(true);
          // Return the original HTML content for narrative generation
          setOriginalAgenda(finalContent);
        } else {
          console.log('✅ Using cleaned HTML content');
          setAgendaContent(cleanedContent);
          setUsePlainTextFallback(false);
          // Return the original HTML content for narrative generation
          setOriginalAgenda(finalContent);
        }

        setRetryCount(0); // Reset retry count on success
        setNarrativeGenerationFailed(false); // Reset narrative failure flag on successful agenda generation

        // Auto-save draft
        saveDraft(finalContent);

        // Transition to edit mode so user can review and modify the agenda
        setStep('edit');

        console.log('Agenda generated successfully, transitioning to edit mode');
        console.log('Generated agenda length:', finalContent.length);

        // Return the final content for use in narrative generation
        return finalContent;
      } else {
        console.error('API response not ok:', response.status, response.statusText);
        const errorText = await response.text();
        throw new Error(`Failed to generate agenda: ${response.status} - ${errorText}`);
      }
    } catch (error: any) {
      clearInterval(progressInterval);
      console.error('Error generating rich agenda:', error);

      // Handle different error types
      if (error.name === 'AbortError') {
        setGenerationError('Request timed out. Please try again.');
      } else if (error.message.includes('fetch')) {
        setGenerationError('Network error. Please check your connection and try again.');
      } else if (error.message.includes('500')) {
        setGenerationError('Server error. Please try again in a moment.');
      } else if (error.name === 'AbortError') {
        setGenerationError('Request timed out. The AI is taking longer than expected. You can retry or use the fallback editor.');
      } else if (error.message.includes('fetch') || error.message.includes('network')) {
        setGenerationError('Network error. Please check your connection and try again.');
      } else {
        setGenerationError(error.message || 'Failed to generate agenda. Please try again.');
      }

      // Log additional debugging info for incomplete responses
      console.error('Agenda generation error details:', {
        error: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 500)
      });

      // Try fallback agenda if not a retry or if retry count is low
      if (!isRetry && retryCount < 2) {
        console.log('Attempting fallback agenda generation...');
        setNarrativeGenerationFailed(false); // Reset narrative failure flag
        const fallbackAgenda = cleanHtmlForReactQuill(generateFallbackAgenda());
        setAgendaContent(fallbackAgenda);
        setOriginalAgenda(fallbackAgenda);
        setStep('edit');
        return fallbackAgenda; // Return fallback content
      } else {
        // Show error state and allow manual retry
        setStep('edit');
        return null;
      }
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const generateNarrativeDescription = async () => {
    console.log('generateNarrativeDescription called');
    setIsGeneratingNarrative(true);

    try {
      console.log('Making API request to /api/meetings/generate-narrative-description');

      // Create abort controller for timeout handling with longer timeout for complex content
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout for agenda generation

      const response = await apiRequest('POST', '/api/meetings/generate-narrative-description', {
        meetingId: meetingData.id,
        title: meetingData.title,
        enhancedPurpose: meetingData.enhancedPurpose,
        participants: meetingData.attendees?.map((a: any) => a.email) || [],
        duration: meetingData.startTime && meetingData.endTime ?
          Math.round((new Date(meetingData.endTime).getTime() - new Date(meetingData.startTime).getTime()) / (1000 * 60)) : 60,
        meetingLink: meetingData.meetingLink,
        startTime: meetingData.startTime,
        endTime: meetingData.endTime
      });

      clearTimeout(timeoutId);

      console.log('API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Narrative description received:', data);

        // Validate response data
        if (!data.narrativeDescription) {
          throw new Error('Invalid response: missing narrative description content');
        }

        console.log('✅ Narrative description generation successful!');
        console.log('📄 Description content length:', data.narrativeDescription.length);

        // Format the narrative description as HTML
        const formattedDescription = formatNarrativeDescription(data.narrativeDescription);

        // Wait a bit for state to update, then get current agenda content
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get the current agenda content (it should be set by generateRichAgenda by now)
        setTimeout(() => {
          console.log('Current agenda content when adding narrative:', agendaContent);
          console.log('Agenda content length:', agendaContent.length);

          if (agendaContent && agendaContent.length > 50) { // Make sure we have real content
            const updatedContent = prependNarrativeToAgenda(formattedDescription, agendaContent);
            const cleanedContent = cleanHtmlForReactQuill(updatedContent);
            console.log('Setting updated content with narrative, length:', cleanedContent.length);
            setAgendaContent(cleanedContent);
          } else {
            console.warn('Agenda content not ready yet, will retry...');
            // Retry after another delay
            setTimeout(() => {
              if (agendaContent && agendaContent.length > 50) {
                const updatedContent = prependNarrativeToAgenda(formattedDescription, agendaContent);
                const cleanedContent = cleanHtmlForReactQuill(updatedContent);
                setAgendaContent(cleanedContent);
              } else {
                console.error('Failed to add narrative - agenda content still not available');
                // Don't fail completely, just log the issue
                console.log('Continuing with agenda content only (no narrative added)');
              }
            }, 500);
          }
        }, 0);

        return formattedDescription;
      } else {
        console.error('API response not ok:', response.status, response.statusText);
        const errorText = await response.text();
        throw new Error(`Failed to generate narrative description: ${response.status} - ${errorText}`);
      }
    } catch (error: any) {
      console.error('Error generating narrative description:', error);
      return null;
    } finally {
      setIsGeneratingNarrative(false);
    }
  };

  const generateFallbackAgenda = () => {
    return `
      <h2>Meeting Agenda: ${meetingData.title}</h2>
      <p><strong>Duration:</strong> ${meetingData.startTime && meetingData.endTime ?
        Math.round((new Date(meetingData.endTime).getTime() - new Date(meetingData.startTime).getTime()) / (1000 * 60)) : 60} minutes</p>

      <h3>Meeting Purpose</h3>
      <p>${meetingData.enhancedPurpose || meetingData.purpose}</p>

      <h3>Discussion Topics</h3>
      <ol>
        <li><strong>Main Discussion</strong><br>
          Review the key points and objectives for this meeting. Discuss any challenges and opportunities.
        </li>
        <li><strong>Action Items</strong><br>
          Identify specific tasks and responsibilities. Set clear deadlines and success criteria.
        </li>
        <li><strong>Next Steps</strong><br>
          Plan follow-up actions and schedule any required follow-up meetings.
        </li>
      </ol>

      ${meetingData.meetingLink ? `
        <h3>Join Meeting</h3>
        <p><a href="${meetingData.meetingLink}" style="color: #4F46E5; text-decoration: none; font-weight: bold;">${meetingData.meetingLink}</a></p>
      ` : ''}

      <p><em>Please come prepared and ready to contribute to the discussion.</em></p>
    `;
  };

  // Helper function to format the narrative description as HTML
  const formatNarrativeDescription = (description: string): string => {
    // Split the description into paragraphs
    const paragraphs = description.split('\n\n');

    // Format as HTML with proper styling
    let html = '<div class="narrative-description" style="margin-bottom: 20px; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #4F46E5; border-radius: 4px;">';

    // Add a subtle heading
    html += '<h3 style="margin-top: 0; color: #4F46E5; font-size: 16px; font-weight: 600;">Meeting Overview</h3>';

    // Add each paragraph
    paragraphs.forEach(paragraph => {
      if (paragraph.trim()) {
        html += `<p style="margin-bottom: 10px; line-height: 1.5;">${paragraph.trim()}</p>`;
      }
    });

    html += '</div>';
    return html;
  };

  // Helper function to prepend the narrative description to the agenda
  const prependNarrativeToAgenda = (narrativeHtml: string, agendaHtml: string): string => {
    // Check if the agenda already has a narrative description
    if (agendaHtml.includes('class="narrative-description"')) {
      // Replace the existing narrative description
      return agendaHtml.replace(/<div class="narrative-description"[\s\S]*?<\/div>/, narrativeHtml);
    }

    // Otherwise, prepend the narrative to the agenda
    return narrativeHtml + agendaHtml;
  };

  const handleContentChange = (content: string) => {
    setAgendaContent(content);
    setHasUnsavedChanges(content !== originalAgenda);

    // Auto-save draft after 2 seconds of inactivity
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }

    const timer = setTimeout(() => {
      saveDraft(content);
    }, 2000);

    setAutoSaveTimer(timer);
  };

  const saveDraft = (content: string) => {
    try {
      localStorage.setItem(`agenda_draft_${meetingData.id}`, content);
      setLastSavedDraft(content);
      console.log('Draft saved to localStorage');
    } catch (error) {
      console.warn('Failed to save draft:', error);
    }
  };

  const loadDraft = () => {
    try {
      const savedDraft = localStorage.getItem(`agenda_draft_${meetingData.id}`);
      if (savedDraft && !agendaContent) {
        console.log('Loading saved draft');
        setAgendaContent(savedDraft);
        setOriginalAgenda(savedDraft);
      }
    } catch (error) {
      console.warn('Failed to load draft:', error);
    }
  };

  const retryGeneration = async () => {
    if (retryCount >= 3) {
      setGenerationError('Maximum retry attempts reached. Please try again later or use a template.');
      return;
    }

    setRetryCount(prev => prev + 1);
    setGenerationError(null);
    setNarrativeGenerationFailed(false); // Reset narrative failure flag

    // Progressive delay based on retry count (exponential backoff)
    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Max 10 seconds
    setGenerationProgress(0);

    console.log(`Retrying agenda generation in ${delay}ms (attempt ${retryCount + 1}/3)`);

    setTimeout(() => {
      generateRichAgenda(true);
    }, delay);
  };

  const resetAndRetry = () => {
    setRetryCount(0);
    setGenerationError(null);
    setNarrativeGenerationFailed(false); // Reset narrative failure flag
    setContentDisplayError(false); // Reset content display error
    // Clear current content before retrying
    setAgendaContent('');
    setOriginalAgenda('');
    generateRichAgenda(false);
  };

  // Function to force refresh ReactQuill content display
  const forceRefreshContent = () => {
    console.log('🔄 Force refreshing ReactQuill content display...');
    setForceRefreshKey(prev => prev + 1);
    setContentDisplayError(false);
  };

  // Function to detect if content is not displaying properly
  const detectContentDisplayIssues = () => {
    if (agendaContent && agendaContent.length > 200 && !usePlainTextFallback) {
      // Check if ReactQuill is showing content properly by looking at the DOM
      const quillEditor = document.querySelector('.ql-editor');
      if (quillEditor && quillEditor.textContent?.trim().length === 0) {
        console.warn('⚠️ ReactQuill editor appears empty despite having content');
        setContentDisplayError(true);
        return true;
      }
    }
    return false;
  };

  const handlePreview = () => {
    setStep('preview');
  };

  const handleEdit = () => {
    setStep('edit');
  };

  const handleSend = async () => {
    // Prevent multiple simultaneous email sending attempts
    if (isSendingEmails) {
      console.log('Email sending already in progress, ignoring duplicate request');
      return;
    }

    // Validate that agenda content exists and is not empty
    if (!agendaContent || agendaContent.trim() === '' || agendaContent === '<p><br></p>') {
      alert('Please generate or edit an agenda before sending.');
      console.error('Attempted to send empty agenda content');
      return;
    }

    // Validate that we have attendees
    const attendees = meetingData.attendees?.map((a: any) => a.email) || [];
    if (attendees.length === 0) {
      alert('No attendees found. Please add attendees before sending the agenda.');
      console.error('Attempted to send agenda without attendees');
      return;
    }

    console.log('🚀 Starting email sending process...');
    console.log('📧 Sending agenda with content length:', agendaContent.length);
    console.log('📧 Content mode:', usePlainTextFallback ? 'Plain Text' : 'HTML');
    console.log('📧 First 200 chars:', agendaContent.substring(0, 200));
    console.log('📧 Recipients:', attendees.length, 'attendees');

    setIsSendingEmails(true);
    setEmailStatus('sending');

    try {
      // Make API call to send agenda emails
      const response = await apiRequest('POST', '/api/meetings/send-agenda', {
        meetingId: meetingData.id,
        formattedAgenda: agendaContent,
        attendees: attendees,
        title: meetingData.title,
        startTime: meetingData.startTime,
        endTime: meetingData.endTime,
        meetingLink: meetingData.meetingLink
      });

      console.log('📧 Email sending API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Email sending initiated successfully:', data);

        // Set the job ID for status tracking
        if (data.result?.jobId) {
          setEmailJobId(data.result.jobId);
          console.log('📧 Email job ID:', data.result.jobId);

          // Start polling for status updates
          pollEmailStatus(data.result.jobId);
        }

        // Show initial success message
        const recipientCount = data.result?.totalRecipients || attendees.length;
        console.log(`📧 Email sending started for ${recipientCount} recipients`);

        // Show immediate feedback to user
        alert(`📧 Sending agenda to ${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}. You'll be notified when complete.`);

      } else {
        console.error('❌ Email sending failed:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);

        // Try to parse error response as JSON for better error handling
        let errorMessage = `Failed to send agenda: ${response.status}`;
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // If not JSON, use the raw error text
          if (errorText) {
            errorMessage = errorText.length > 100 ? errorText.substring(0, 100) + '...' : errorText;
          }
        }

        throw new Error(errorMessage);
      }

    } catch (error: any) {
      console.error('❌ Error sending agenda emails:', error);
      setEmailStatus('failed');
      setIsSendingEmails(false); // Reset sending state on error

      // Show user-friendly error message
      if (error.message.includes('401') || error.message.includes('Not authenticated')) {
        alert('❌ Authentication failed. Please log in again.');
      } else if (error.message.includes('400') || error.message.includes('required')) {
        alert('❌ Invalid data provided. Please check your agenda content and attendees, then try again.');
      } else if (error.message.includes('500')) {
        alert('❌ Server error. Please try again in a moment.');
      } else if (error.message.includes('quota') || error.message.includes('rate limit') || error.message.includes('429')) {
        alert('❌ Email service quota exceeded. Please try again later.');
      } else if (error.message.includes('access token') || error.message.includes('token')) {
        alert('❌ Gmail access token issue. Please reconnect your Google account.');
      } else {
        alert(`❌ Failed to send emails: ${error.message}`);
      }
    }
  };

  // Function to poll email status
  const pollEmailStatus = async (jobId: string, retryCount = 0) => {
    const maxRetries = 5;

    try {
      const response = await apiRequest('GET', `/api/email/status/${jobId}`);

      if (response.ok) {
        const statusData = await response.json();
        console.log('📧 Email status update:', statusData);

        // Update our status based on the job status
        if (statusData.status === 'completed') {
          setEmailStatus('completed');
          setIsSendingEmails(false);

          // Show success message with detailed information
          const recipientCount = statusData.totalAttendees || 0;
          const sentCount = statusData.emailsSent || recipientCount;
          setTimeout(() => {
            alert(`✅ Agenda sent successfully to ${sentCount} recipient${sentCount !== 1 ? 's' : ''}!`);
          }, 500);

        } else if (statusData.status === 'failed') {
          setEmailStatus('failed');
          setIsSendingEmails(false);

          // Show error message with more details
          setTimeout(() => {
            const failedCount = statusData.emailsFailed || statusData.totalAttendees || 0;
            alert(`❌ Email sending failed for ${failedCount} recipient${failedCount !== 1 ? 's' : ''}. Please try again.`);
          }, 500);

        } else if (statusData.status === 'partially_failed') {
          setEmailStatus('partial');
          setIsSendingEmails(false);

          // Show partial success message with details
          setTimeout(() => {
            const sentCount = statusData.emailsSent || 0;
            const failedCount = statusData.emailsFailed || 0;
            const totalCount = statusData.totalAttendees || 0;
            alert(`⚠️ Agenda sent to ${sentCount} of ${totalCount} recipients. ${failedCount} failed.`);
          }, 500);

        } else {
          // Still in progress, poll again after 2 seconds (with exponential backoff)
          const delay = Math.min(2000 * Math.pow(1.5, retryCount), 10000); // Max 10 seconds
          setTimeout(() => pollEmailStatus(jobId, retryCount + 1), delay);
        }

      } else {
        console.error('Failed to get email status:', response.status, response.statusText);

        // If we get a 404, the job might not exist yet or might have been cleaned up
        if (response.status === 404) {
          if (retryCount < maxRetries) {
            console.log('Job not found, retrying...');
            setTimeout(() => pollEmailStatus(jobId, retryCount + 1), 1000);
          } else {
            setEmailStatus('failed');
            setIsSendingEmails(false);
            setTimeout(() => {
              alert('❌ Email job not found. The email may have been sent or there was an error.');
            }, 500);
          }
        } else {
          // For other errors, retry with backoff
          if (retryCount < maxRetries) {
            const delay = Math.min(2000 * Math.pow(1.5, retryCount), 10000);
            setTimeout(() => pollEmailStatus(jobId, retryCount + 1), delay);
          } else {
            setEmailStatus('failed');
            setIsSendingEmails(false);
            setTimeout(() => {
              alert('❌ Unable to check email status. Please check your email or try sending again.');
            }, 500);
          }
        }
      }

    } catch (error) {
      console.error('Error polling email status:', error);

      // Network or other errors - retry with backoff
      if (retryCount < maxRetries) {
        const delay = Math.min(2000 * Math.pow(1.5, retryCount), 10000);
        setTimeout(() => pollEmailStatus(jobId, retryCount + 1), delay);
      } else {
        setEmailStatus('failed');
        setIsSendingEmails(false);
        setTimeout(() => {
          alert('❌ Network error while checking email status. Please try sending again.');
        }, 500);
      }
    }
  };

  // Function to retry failed email sending
  const retryEmailSending = async () => {
    if (!emailJobId) return;

    setEmailStatus('sending');
    setIsSendingEmails(true);

    try {
      const response = await apiRequest('POST', `/api/email/retry/${emailJobId}`);
      if (response.ok) {
        console.log('🔄 Email retry initiated');
        // Start polling again
        pollEmailStatus(emailJobId);
      } else {
        throw new Error('Failed to retry email sending');
      }
    } catch (error) {
      console.error('Error retrying email sending:', error);
      setEmailStatus('failed');
      setIsSendingEmails(false);
      alert('❌ Failed to retry email sending. Please try again.');
    }
  };



  if (step === 'loading' || isGenerating) {
    return (
      <Card className="w-full max-w-6xl mx-auto">
        <CardContent className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-lg font-medium">
              {generationError ? 'Retrying agenda generation...' : 'Generating your meeting agenda...'}
            </p>
            <p className="text-sm text-muted-foreground">
              {generationError
                ? 'Attempting to generate agenda again...'
                : 'Creating detailed content based on your meeting purpose'
              }
            </p>
            {generationProgress > 0 && (
              <div className="mt-4">
                <div className="w-64 bg-gray-200 rounded-full h-2 mx-auto">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${generationProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {Math.round(generationProgress)}% complete
                </p>
              </div>
            )}
            {generationError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{generationError}</p>
                <div className="flex gap-2 mt-2">
                  <Button
                    onClick={retryGeneration}
                    variant="outline"
                    size="sm"
                    disabled={retryCount >= 3}
                  >
                    {retryCount >= 3 ? 'Max retries reached' : `Retry (${retryCount}/3)`}
                  </Button>
                  {retryCount >= 3 && (
                    <Button
                      onClick={resetAndRetry}
                      variant="outline"
                      size="sm"
                    >
                      Reset & Try Again
                    </Button>
                  )}
                </div>
                {retryCount > 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    Tip: If AI generation keeps failing, try using a template or the fallback editor.
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render different content based on step
  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <style>{quillStyles}</style>
      
      {/* Header - Always visible */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-primary" />
                Step 7: Review & Send Meeting Agenda
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {step === 'edit'
                  ? 'Review and edit your AI-generated agenda, then continue to preview'
                  : 'Review how your email will appear to recipients'}
              </p>
            </div>
            <div className="flex gap-2">
              {step === 'edit' ? (
                <Button onClick={handlePreview} variant="outline">
                  <Eye className="h-4 w-4 mr-2" />
                  Continue to Preview
                </Button>
              ) : (
                <Button onClick={handleEdit} variant="outline">
                  <Edit className="h-4 w-4 mr-2" />
                  Back to Editor
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Editor Step */}
      {step === 'edit' && (
        <Card className="ring-2 ring-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Rich Text Editor
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Edit your agenda with formatting tools. Click "Continue to Preview" when ready.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isGeneratingNarrative && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2 p-2 bg-muted/50 rounded">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Enhancing meeting description...</span>
                </div>
              )}

              {narrativeGenerationFailed && (
                <div className="flex items-center gap-2 text-sm text-amber-600 mb-2 p-2 bg-amber-50 border border-amber-200 rounded">
                  <AlertCircle className="h-3 w-3" />
                  <span>Enhanced meeting description couldn't be generated, but your agenda is ready to use.</span>
                </div>
              )}

              {contentDisplayError && (
                <div className="flex items-center justify-between gap-2 text-sm text-red-600 mb-2 p-2 bg-red-50 border border-red-200 rounded">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-3 w-3" />
                    <span>Content not displaying properly in editor.</span>
                  </div>
                  <Button
                    onClick={forceRefreshContent}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    Refresh Display
                  </Button>
                </div>
              )}

              {isSendingEmails && (
                <div className="mb-4">
                  <EmailSendingStatus
                    status="sending"
                    progress={50}
                    sent={0}
                    total={meetingData.attendees?.length || 0}
                  />
                </div>
              )}

              {(emailStatus === 'completed' || emailStatus === 'failed' || emailStatus === 'partial') && (
                <div className="mb-4">
                  <EmailSendingStatus
                    status={emailStatus}
                    progress={emailStatus === 'completed' ? 100 : 50}
                    sent={emailStatus === 'completed' ? (meetingData.attendees?.length || 0) : 0}
                    total={meetingData.attendees?.length || 0}
                    failed={emailStatus === 'failed' ? (meetingData.attendees?.length || 0) : 0}
                    onRetry={emailStatus === 'failed' ? retryEmailSending : undefined}
                  />
                </div>
              )}

              {/* Mode Toggle */}
              <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Editor Mode:</span>
                  <span className={`text-xs px-2 py-1 rounded ${usePlainTextFallback ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                    {usePlainTextFallback ? 'Plain Text' : 'Rich HTML'}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (isSendingEmails) {
                      alert('Please wait for emails to finish sending before switching modes.');
                      return;
                    }
                    if (usePlainTextFallback) {
                      // Switch to HTML mode
                      const htmlContent = cleanHtmlForReactQuill(originalAgenda || agendaContent);
                      setAgendaContent(htmlContent);
                      setUsePlainTextFallback(false);
                    } else {
                      // Switch to plain text mode
                      const plainTextContent = htmlToPlainText(agendaContent);
                      setAgendaContent(plainTextContent);
                      setUsePlainTextFallback(true);
                    }
                  }}
                  className="text-xs"
                  disabled={isSendingEmails}
                >
                  Switch to {usePlainTextFallback ? 'HTML' : 'Plain Text'}
                </Button>
              </div>
              <Suspense fallback={
                <div className="space-y-4">
                  <div className="flex items-center justify-center py-10 border-2 border-dashed border-gray-300 rounded-lg">
                    <div className="text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p>Loading rich text editor...</p>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      onClick={() => setUseFallbackEditor(true)}
                      className="text-sm"
                    >
                      Use Simple Editor Instead
                    </Button>
                  </div>
                </div>
              }>
                {!useFallbackEditor ? (
                  <>
                    {usePlainTextFallback ? (
                      // Plain text mode - use Textarea
                      <div className="space-y-2">
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm text-blue-700">
                            <strong>Plain Text Mode:</strong> The AI-generated content had formatting issues, so we're showing it as plain text.
                            You can switch to HTML mode using the toggle above, or use the fallback editor below.
                          </p>
                        </div>
                        <Textarea
                          value={agendaContent}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                            if (isSendingEmails) {
                              alert('Please wait for emails to finish sending before editing.');
                              return;
                            }
                            handleContentChange(e.target.value);
                          }}
                          placeholder="Edit your meeting agenda..."
                          className="min-h-[400px] font-mono text-sm"
                          disabled={isSendingEmails}
                        />
                      </div>
                    ) : (
                      // HTML mode - use ReactQuill
                      <>
                        <ReactQuill
                           key={forceRefreshKey}
                           theme="snow"
                           value={agendaContent}
                           onChange={(content) => {
                             console.log('ReactQuill onChange triggered:', {
                               newLength: content.length,
                               oldLength: agendaContent.length,
                               preview: content.substring(0, 100)
                             });
                             if (isSendingEmails) {
                               alert('Please wait for emails to finish sending before editing.');
                               return;
                             }
                             handleContentChange(content);
                           }}
                           modules={modules}
                           formats={formats}
                           placeholder="Edit your meeting agenda..."
                           style={{ minHeight: '400px' }}
                           readOnly={isSendingEmails}
                         />
                         {/* Enhanced debug info for troubleshooting */}
                         <div className="text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded">
                           <div><strong>Debug Info:</strong></div>
                           <div>Content length: {agendaContent.length} | Has HTML: {agendaContent.includes('<').toString()}</div>
                           <div>Mode: {usePlainTextFallback ? 'Plain Text' : 'HTML'}</div>
                           <div>Has title: {agendaContent.includes('<h2>').toString()}</div>
                           <div>Has sections: {agendaContent.includes('<h3').toString()}</div>
                           <div>Preview: {agendaContent.substring(0, 150)}...</div>
                           {agendaContent.length > 0 && (
                             <div>Word count: {agendaContent.replace(/<[^>]*>/g, ' ').split(' ').filter(w => w.length > 0).length}</div>
                           )}
                         </div>
                      </>
                    )}
                  </>
                ) : (
                  <Textarea
                    value={agendaContent}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                      if (isSendingEmails) {
                        alert('Please wait for emails to finish sending before editing.');
                        return;
                      }
                      handleContentChange(e.target.value);
                    }}
                    placeholder="Edit your meeting agenda..."
                    className="min-h-[400px] font-mono text-sm"
                    disabled={isSendingEmails}
                  />
                )}
              </Suspense>
              {hasUnsavedChanges && (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  You have unsaved changes. {lastSavedDraft !== agendaContent ?
                    'Saving draft...' :
                    'Draft saved automatically.'
                  }
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                if (isSendingEmails) {
                  alert('Please wait for emails to finish sending before navigating away.');
                  return;
                }
                onCancel();
              }}
              disabled={isSendingEmails}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Meeting Summary
            </Button>
            <Button
              onClick={() => {
                if (isSendingEmails) {
                  alert('Please wait for emails to finish sending before continuing.');
                  return;
                }
                handlePreview();
              }}
              variant="default"
              disabled={isSendingEmails}
            >
              <Eye className="h-4 w-4 mr-2" />
              Continue to Preview
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Preview Step */}
      {step === 'preview' && (
        <Card className="ring-2 ring-green-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Email Preview
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              This is how your agenda will appear in the email sent to attendees. Review the content and make any final edits in the editor if needed.
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] rounded-lg border p-4 bg-gray-50">
              <AgendaPreview agendaContent={agendaContent} meetingData={meetingData} />
            </ScrollArea>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                if (isSendingEmails) {
                  alert('Please wait for emails to finish sending before navigating away.');
                  return;
                }
                handleEdit();
              }}
              disabled={isSendingEmails}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Editor
            </Button>
            <Button
              onClick={handleSend}
              disabled={isSendingEmails}
              className="bg-green-500 hover:bg-green-600"
            >
              {isSendingEmails ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending Emails...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send to All Attendees
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}