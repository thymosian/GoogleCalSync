import React, { useState, useEffect, useRef } from 'react';
import { 
  Bold, 
  Italic, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  List, 
  ListOrdered, 
  Eye, 
  Edit3,
  Save,
  RotateCcw,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Mail,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface RichTextTools {
  bold: boolean;
  italic: boolean;
  alignment: 'left' | 'center' | 'right';
  bulletPoints: boolean;
  numberedList: boolean;
}

export interface AgendaEditorProps {
  initialContent: string;
  onContentChange: (content: string) => void;
  onApprove?: (finalContent: string) => void;
  onRegenerate?: () => void;
  onSendEmails?: (agenda: string, attendees: string[]) => void;
  editingTools?: Partial<RichTextTools>;
  className?: string;
  disabled?: boolean;
  showPreview?: boolean;
  maxLength?: number;
  attendees?: string[];
  isSending?: boolean;
  sendingStatus?: {
    sent: number;
    total: number;
    errors: number;
  };
}

export function AgendaEditor({
  initialContent,
  onContentChange,
  onApprove,
  onRegenerate,
  onSendEmails,
  editingTools = {},
  className,
  disabled = false,
  showPreview = true,
  maxLength = 2000,
  attendees = [],
  isSending = false,
  sendingStatus
}: AgendaEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [activeTools, setActiveTools] = useState<RichTextTools>({
    bold: false,
    italic: false,
    alignment: 'left',
    bulletPoints: false,
    numberedList: false,
    ...editingTools
  });
  const [currentTab, setCurrentTab] = useState<'edit' | 'preview'>('preview');
  const [hasChanges, setHasChanges] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }>({ isValid: true, errors: [], warnings: [] });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update content when initialContent changes
  useEffect(() => {
    setContent(initialContent);
    setHasChanges(false);
  }, [initialContent]);

  // Validate content and notify parent of changes
  useEffect(() => {
    const validation = validateAgenda(content);
    setValidationResult(validation);
    onContentChange(content);
    setHasChanges(content !== initialContent);
  }, [content, initialContent, onContentChange]);

  // Validate agenda content
  const validateAgenda = (agenda: string): typeof validationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check minimum length
    if (agenda.length < 50) {
      errors.push('Agenda is too short. Please add more details.');
    }
    
    // Check for basic structure
    if (!agenda.includes('1.') && !agenda.includes('•') && !agenda.includes('-')) {
      warnings.push('Agenda should include numbered or bulleted items.');
    }
    
    // Check for time allocations
    if (!agenda.match(/\d+\s*min/i)) {
      warnings.push('Consider adding time allocations for agenda items.');
    }
    
    // Check length (not too long)
    if (agenda.length > maxLength) {
      errors.push(`Agenda is too long (${agenda.length}/${maxLength} characters).`);
    }
    
    // Check for action items section
    if (!agenda.toLowerCase().includes('action') && !agenda.toLowerCase().includes('next steps')) {
      warnings.push('Consider adding an action items or next steps section.');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  };

  // Handle text formatting
  const applyFormatting = (format: keyof RichTextTools) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    if (!selectedText) return;

    let formattedText = selectedText;
    let newContent = content;

    switch (format) {
      case 'bold':
        formattedText = activeTools.bold ? selectedText.replace(/\*\*(.*?)\*\*/g, '$1') : `**${selectedText}**`;
        setActiveTools(prev => ({ ...prev, bold: !prev.bold }));
        break;
      case 'italic':
        formattedText = activeTools.italic ? selectedText.replace(/\*(.*?)\*/g, '$1') : `*${selectedText}*`;
        setActiveTools(prev => ({ ...prev, italic: !prev.italic }));
        break;
      case 'bulletPoints':
        const bulletLines = selectedText.split('\n').map(line => 
          line.trim() ? (line.startsWith('• ') ? line : `• ${line}`) : line
        );
        formattedText = bulletLines.join('\n');
        setActiveTools(prev => ({ ...prev, bulletPoints: true, numberedList: false }));
        break;
      case 'numberedList':
        const numberedLines = selectedText.split('\n').map((line, index) => 
          line.trim() ? (line.match(/^\d+\./) ? line : `${index + 1}. ${line}`) : line
        );
        formattedText = numberedLines.join('\n');
        setActiveTools(prev => ({ ...prev, numberedList: true, bulletPoints: false }));
        break;
    }

    newContent = content.substring(0, start) + formattedText + content.substring(end);
    setContent(newContent);

    // Restore selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + formattedText.length);
    }, 0);
  };

  // Handle alignment (applies to current line or selection)
  const applyAlignment = (alignment: 'left' | 'center' | 'right') => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    // Find the start and end of the current line(s)
    const beforeCursor = content.substring(0, start);
    const afterCursor = content.substring(end);
    const lineStart = beforeCursor.lastIndexOf('\n') + 1;
    const lineEnd = afterCursor.indexOf('\n');
    const lineEndPos = lineEnd === -1 ? content.length : end + lineEnd;
    
    const selectedLines = content.substring(lineStart, lineEndPos);
    const lines = selectedLines.split('\n');
    
    const alignedLines = lines.map(line => {
      // Remove existing alignment markers
      const cleanLine = line.replace(/^(\s*)(←|→|↔)\s*/, '$1');
      
      switch (alignment) {
        case 'center':
          return cleanLine.trim() ? `↔ ${cleanLine.trim()}` : cleanLine;
        case 'right':
          return cleanLine.trim() ? `→ ${cleanLine.trim()}` : cleanLine;
        case 'left':
        default:
          return cleanLine;
      }
    });
    
    const newContent = content.substring(0, lineStart) + alignedLines.join('\n') + content.substring(lineEndPos);
    setContent(newContent);
    setActiveTools(prev => ({ ...prev, alignment }));
  };

  // Insert template sections
  const insertTemplate = (template: 'time-block' | 'action-item' | 'discussion') => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const cursorPos = textarea.selectionStart;
    
    let templateText = '';
    switch (template) {
      case 'time-block':
        templateText = '\n\n## Topic Name (15 min)\n- Discussion points\n- Key decisions needed\n';
        break;
      case 'action-item':
        templateText = '\n\n### Action Items\n- [ ] Task description (Assignee, Due date)\n- [ ] Follow-up item\n';
        break;
      case 'discussion':
        templateText = '\n\n## Discussion Topic\n**Objective:** What we want to achieve\n**Key Questions:**\n- Question 1\n- Question 2\n';
        break;
    }
    
    const newContent = content.substring(0, cursorPos) + templateText + content.substring(cursorPos);
    setContent(newContent);
    
    // Position cursor at the end of inserted template
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos + templateText.length, cursorPos + templateText.length);
    }, 0);
  };

  // Render markdown-like preview
  const renderPreview = (text: string): string => {
    // First, split into lines and process lists properly
    const lines = text.split('\n');
    let result = '';
    let inBulletList = false;
    let inNumberedList = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim().startsWith('• ')) {
        if (!inBulletList) {
          result += '<ul>';
          inBulletList = true;
          inNumberedList = false;
        }
        result += '<li>' + line.substring(2) + '</li>';
      } else if (line.trim().match(/^\d+\.\s+/)) {
        if (!inNumberedList) {
          result += '<ol>';
          inNumberedList = true;
          inBulletList = false;
        }
        const match = line.match(/^\d+\.\s+(.*)/);
        result += '<li>' + (match ? match[1] : line) + '</li>';
      } else {
        if (inBulletList) {
          result += '</ul>';
          inBulletList = false;
        }
        if (inNumberedList) {
          result += '</ol>';
          inNumberedList = false;
        }
        result += line + '<br>';
      }
    }

    // Close any open lists
    if (inBulletList) result += '</ul>';
    if (inNumberedList) result += '</ol>';

    // Apply other formatting
    return result
      // Bold text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic text
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Alignment markers
      .replace(/^↔\s*(.*$)/gm, '<div style="text-align: center">$1</div>')
      .replace(/^→\s*(.*$)/gm, '<div style="text-align: right">$1</div>')
      // Headers
      .replace(/^### (.*$)/gm, '<h3 style="font-size: 1.1em; font-weight: 600; margin: 1em 0 0.5em 0">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 style="font-size: 1.2em; font-weight: 600; margin: 1.2em 0 0.6em 0">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 style="font-size: 1.3em; font-weight: 700; margin: 1.5em 0 0.7em 0">$1</h1>')
      // Checkboxes
      .replace(/^- \[ \] (.*$)/gm, '<div style="margin: 0.5em 0"><input type="checkbox" disabled style="margin-right: 0.5em">$1</div>')
      .replace(/^- \[x\] (.*$)/gm, '<div style="margin: 0.5em 0"><input type="checkbox" checked disabled style="margin-right: 0.5em">$1</div>');
  };

  const handleSave = () => {
    if (onApprove && validationResult.isValid) {
      onApprove(content);
    }
  };

  const handleReset = () => {
    setContent(initialContent);
    setHasChanges(false);
  };

  return (
    <Card className={cn("w-full max-w-4xl", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Meeting Agenda Editor
            {hasChanges && (
              <Badge variant="secondary" className="ml-2">
                Modified
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {content.length}/{maxLength}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Validation Messages */}
        {validationResult.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <ul className="list-disc list-inside space-y-1">
                {validationResult.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        
        {validationResult.warnings.length > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <ul className="list-disc list-inside space-y-1">
                {validationResult.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Editor Tabs */}
        <Tabs value={currentTab} onValueChange={(value) => setCurrentTab(value as 'edit' | 'preview')}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="edit" className="flex items-center gap-2">
                <Edit3 className="h-4 w-4" />
                Edit
              </TabsTrigger>
              {showPreview && (
                <TabsTrigger value="preview" className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Preview
                </TabsTrigger>
              )}
            </TabsList>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {onRegenerate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRegenerate}
                  disabled={disabled}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Regenerate
                </Button>
              )}
              {hasChanges && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  disabled={disabled}
                >
                  Reset
                </Button>
              )}
              {onApprove && (
                <Button
                  onClick={handleSave}
                  disabled={disabled || !validationResult.isValid}
                  className="bg-green-500 hover:bg-green-600"
                >
                  <Save className="h-4 w-4 mr-1" />
                  Approve Agenda
                </Button>
              )}
            </div>
          </div>

          <TabsContent value="edit" className="space-y-4">
            {/* Formatting Toolbar */}
            <div className="flex flex-wrap items-center gap-2 p-2 bg-muted/50 rounded-lg border">
              {/* Text Formatting */}
              <div className="flex items-center gap-1">
                <Button
                  variant={activeTools.bold ? "default" : "ghost"}
                  size="sm"
                  onClick={() => applyFormatting('bold')}
                  disabled={disabled}
                  className="h-8 w-8 p-0"
                >
                  <Bold className="h-4 w-4" />
                </Button>
                <Button
                  variant={activeTools.italic ? "default" : "ghost"}
                  size="sm"
                  onClick={() => applyFormatting('italic')}
                  disabled={disabled}
                  className="h-8 w-8 p-0"
                >
                  <Italic className="h-4 w-4" />
                </Button>
              </div>

              <div className="w-px h-6 bg-border" />

              {/* Alignment */}
              <div className="flex items-center gap-1">
                <Button
                  variant={activeTools.alignment === 'left' ? "default" : "ghost"}
                  size="sm"
                  onClick={() => applyAlignment('left')}
                  disabled={disabled}
                  className="h-8 w-8 p-0"
                >
                  <AlignLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant={activeTools.alignment === 'center' ? "default" : "ghost"}
                  size="sm"
                  onClick={() => applyAlignment('center')}
                  disabled={disabled}
                  className="h-8 w-8 p-0"
                >
                  <AlignCenter className="h-4 w-4" />
                </Button>
                <Button
                  variant={activeTools.alignment === 'right' ? "default" : "ghost"}
                  size="sm"
                  onClick={() => applyAlignment('right')}
                  disabled={disabled}
                  className="h-8 w-8 p-0"
                >
                  <AlignRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="w-px h-6 bg-border" />

              {/* Lists */}
              <div className="flex items-center gap-1">
                <Button
                  variant={activeTools.bulletPoints ? "default" : "ghost"}
                  size="sm"
                  onClick={() => applyFormatting('bulletPoints')}
                  disabled={disabled}
                  className="h-8 w-8 p-0"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={activeTools.numberedList ? "default" : "ghost"}
                  size="sm"
                  onClick={() => applyFormatting('numberedList')}
                  disabled={disabled}
                  className="h-8 w-8 p-0"
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </div>

              <div className="w-px h-6 bg-border" />

              {/* Templates */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertTemplate('time-block')}
                  disabled={disabled}
                  className="text-xs px-2 h-8"
                >
                  Time Block
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertTemplate('action-item')}
                  disabled={disabled}
                  className="text-xs px-2 h-8"
                >
                  Action Items
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertTemplate('discussion')}
                  disabled={disabled}
                  className="text-xs px-2 h-8"
                >
                  Discussion
                </Button>
              </div>
            </div>

            {/* Text Editor */}
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter your meeting agenda here..."
              disabled={disabled}
              className="min-h-[400px] font-mono text-sm resize-none"
              maxLength={maxLength}
            />
          </TabsContent>

          {showPreview && (
            <TabsContent value="preview">
              <Card className="min-h-[400px] max-h-[600px] p-6 bg-white overflow-y-auto">
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: renderPreview(content) || '<p class="text-muted-foreground">No content to preview</p>'
                  }}
                />
              </Card>
            </TabsContent>
          )}
        </Tabs>

        {/* Help Text */}
        <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 p-3 rounded-lg">
          <p><strong>Formatting Tips:</strong></p>
          <p>• Use **bold** and *italic* for emphasis</p>
          <p>• Start lines with • for bullet points or 1. for numbered lists</p>
          <p>• Use # for headers (# Main, ## Sub, ### Detail)</p>
          <p>• Use - [ ] for checkboxes and - [x] for completed items</p>
          <p>• Add time allocations like "(15 min)" for better planning</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 pt-4 border-t">
          {onApprove && (
            <Button
              onClick={handleSave}
              disabled={disabled || !validationResult.isValid}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve Agenda
            </Button>
          )}

          {onRegenerate && (
            <Button
              variant="outline"
              onClick={onRegenerate}
              disabled={disabled || isSending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Regenerate
            </Button>
          )}

          {onSendEmails && attendees.length > 0 && (
            <Button
              onClick={() => onSendEmails(content, attendees)}
              disabled={disabled || isSending || !validationResult.isValid}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending ({sendingStatus?.sent || 0}/{sendingStatus?.total || 0})
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send to {attendees.length} Attendee{attendees.length > 1 ? 's' : ''}
                </>
              )}
            </Button>
          )}

          {hasChanges && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={disabled}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}