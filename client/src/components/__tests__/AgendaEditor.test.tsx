import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgendaEditor, type AgendaEditorProps } from '../AgendaEditor';

describe('AgendaEditor', () => {
  const mockOnContentChange = vi.fn();
  const mockOnApprove = vi.fn();
  const mockOnRegenerate = vi.fn();

  const defaultProps: AgendaEditorProps = {
    initialContent: '# Meeting Agenda\n\n## Topics\n1. Introduction\n2. Discussion\n3. Action Items',
    onContentChange: mockOnContentChange,
    onApprove: mockOnApprove,
    onRegenerate: mockOnRegenerate
  };

  const longAgendaContent = `# Comprehensive Meeting Agenda

## Meeting Details
- **Duration:** 90 minutes
- **Type:** Online Meeting

## Agenda Items

### 1. Welcome & Introductions (10 min)
Brief introductions from all participants and meeting overview.

### 2. Project Status Updates (30 min)
- Development team updates
- Design team progress
- Marketing initiatives

### 3. Technical Discussion (25 min)
Deep dive into technical challenges and solutions.

### 4. Budget Review (15 min)
Quarterly budget analysis and projections.

### 5. Action Items & Next Steps (10 min)
Define clear action items and responsibilities.

## Action Items
1. Complete project milestone review [HIGH]
2. Update documentation [MEDIUM]
3. Schedule follow-up meetings [LOW]

## Notes
Additional notes and observations from the meeting.`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with initial content', () => {
      render(<AgendaEditor {...defaultProps} />);

      expect(screen.getByDisplayValue(/meeting agenda/i)).toBeInTheDocument();
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it('should render in edit mode by default', () => {
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue(defaultProps.initialContent);
    });

    it('should show character count', () => {
      render(<AgendaEditor {...defaultProps} maxLength={1000} />);

      const charCount = defaultProps.initialContent.length;
      expect(screen.getByText(`${charCount} / 1000`)).toBeInTheDocument();
    });

    it('should be disabled when disabled prop is true', () => {
      render(<AgendaEditor {...defaultProps} disabled={true} />);

      expect(screen.getByRole('textbox')).toBeDisabled();
      expect(screen.getByRole('button', { name: /approve agenda/i })).toBeDisabled();
    });

    it('should show rich text formatting toolbar', () => {
      render(<AgendaEditor {...defaultProps} />);

      expect(screen.getByRole('button', { name: /bold/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /italic/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /align left/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /bullet list/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /numbered list/i })).toBeInTheDocument();
    });
  });

  describe('Content Editing', () => {
    it('should update content on text change', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');

      await user.clear(textarea);
      await user.type(textarea, 'New agenda content');

      expect(mockOnContentChange).toHaveBeenCalledWith('New agenda content');
    });

    it('should handle large content changes', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');

      await user.clear(textarea);
      await user.type(textarea, longAgendaContent);

      expect(mockOnContentChange).toHaveBeenLastCalledWith(longAgendaContent);
    });

    it('should enforce maximum length', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} maxLength={50} />);

      const textarea = screen.getByRole('textbox');
      const longText = 'This is a very long text that exceeds the maximum length limit';

      await user.clear(textarea);
      await user.type(textarea, longText);

      // Should truncate to max length
      expect(mockOnContentChange).toHaveBeenLastCalledWith(longText.substring(0, 50));
      expect(screen.getByText('50 / 50')).toBeInTheDocument();
    });

    it('should show warning when approaching character limit', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} maxLength={100} />);

      const textarea = screen.getByRole('textbox');
      const nearLimitText = 'a'.repeat(95);

      await user.clear(textarea);
      await user.type(textarea, nearLimitText);

      expect(screen.getByText('95 / 100')).toBeInTheDocument();
      // Should show warning styling when near limit
    });
  });

  describe('Rich Text Formatting', () => {
    it('should apply bold formatting', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      const boldButton = screen.getByRole('button', { name: /bold/i });

      // Select some text
      await user.click(textarea);
      await user.keyboard('{Control>}a{/Control}');

      // Apply bold formatting
      await user.click(boldButton);

      // Should wrap selected text with markdown bold syntax
      expect(mockOnContentChange).toHaveBeenCalledWith(
        expect.stringContaining('**')
      );
    });

    it('should apply italic formatting', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      const italicButton = screen.getByRole('button', { name: /italic/i });

      await user.click(textarea);
      await user.keyboard('{Control>}a{/Control}');
      await user.click(italicButton);

      expect(mockOnContentChange).toHaveBeenCalledWith(
        expect.stringContaining('*')
      );
    });

    it('should insert bullet list', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      const bulletButton = screen.getByRole('button', { name: /bullet list/i });

      await user.click(textarea);
      await user.keyboard('{Control>}a{/Control}');
      await user.click(bulletButton);

      expect(mockOnContentChange).toHaveBeenCalledWith(
        expect.stringContaining('- ')
      );
    });

    it('should insert numbered list', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      const numberedButton = screen.getByRole('button', { name: /numbered list/i });

      await user.click(textarea);
      await user.keyboard('{Control>}a{/Control}');
      await user.click(numberedButton);

      expect(mockOnContentChange).toHaveBeenCalledWith(
        expect.stringContaining('1. ')
      );
    });

    it('should handle text alignment', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      const alignCenterButton = screen.getByRole('button', { name: /align center/i });

      await user.click(textarea);
      await user.keyboard('{Control>}a{/Control}');
      await user.click(alignCenterButton);

      // Should add center alignment markdown or HTML
      expect(mockOnContentChange).toHaveBeenCalled();
    });
  });

  describe('Preview Mode', () => {
    it('should switch to preview mode', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const previewTab = screen.getByText('Preview');
      await user.click(previewTab);

      // Should show rendered markdown content
      expect(screen.getByText('Meeting Agenda')).toBeInTheDocument();
      expect(screen.getByText('Topics')).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('should render markdown content correctly in preview', async () => {
      const user = userEvent.setup();
      const markdownContent = '# Title\n\n**Bold text**\n\n*Italic text*\n\n- Bullet item\n\n1. Numbered item';

      render(<AgendaEditor {...defaultProps} initialContent={markdownContent} />);

      const previewTab = screen.getByText('Preview');
      await user.click(previewTab);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title');
      expect(screen.getByText('Bold text')).toBeInTheDocument();
      expect(screen.getByText('Italic text')).toBeInTheDocument();
    });

    it('should switch back to edit mode', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      // Go to preview
      await user.click(screen.getByText('Preview'));
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

      // Go back to edit
      await user.click(screen.getByText('Edit'));
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  describe('Agenda Actions', () => {
    it('should approve agenda', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const approveButton = screen.getByRole('button', { name: /approve agenda/i });
      await user.click(approveButton);

      expect(mockOnApprove).toHaveBeenCalledWith(defaultProps.initialContent);
    });

    it('should regenerate agenda', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const regenerateButton = screen.getByRole('button', { name: /regenerate/i });
      await user.click(regenerateButton);

      expect(mockOnRegenerate).toHaveBeenCalled();
    });

    it('should save changes', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, ' - Additional item');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // Should show save confirmation
      await waitFor(() => {
        expect(screen.getByText(/saved/i)).toBeInTheDocument();
      });
    });

    it('should reset to original content', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');

      // Make changes
      await user.clear(textarea);
      await user.type(textarea, 'Modified content');

      // Reset
      const resetButton = screen.getByRole('button', { name: /reset/i });
      await user.click(resetButton);

      expect(mockOnContentChange).toHaveBeenLastCalledWith(defaultProps.initialContent);
    });
  });

  describe('Validation and Error Handling', () => {
    it('should validate agenda content', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');

      // Clear content to create invalid state
      await user.clear(textarea);

      const approveButton = screen.getByRole('button', { name: /approve agenda/i });
      await user.click(approveButton);

      // Should show validation error
      expect(screen.getByText(/agenda cannot be empty/i)).toBeInTheDocument();
      expect(mockOnApprove).not.toHaveBeenCalled();
    });

    it('should show validation warnings for short content', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');

      await user.clear(textarea);
      await user.type(textarea, 'Short');

      // Should show warning for very short agenda
      expect(screen.getByText(/agenda seems quite brief/i)).toBeInTheDocument();
    });

    it('should validate agenda structure', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');

      await user.clear(textarea);
      await user.type(textarea, 'No structure just plain text');

      // Should suggest adding structure
      expect(screen.getByText(/consider adding headers/i)).toBeInTheDocument();
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should support Ctrl+B for bold', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');

      await user.click(textarea);
      await user.keyboard('{Control>}a{/Control}');
      await user.keyboard('{Control>}b{/Control}');

      expect(mockOnContentChange).toHaveBeenCalledWith(
        expect.stringContaining('**')
      );
    });

    it('should support Ctrl+I for italic', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');

      await user.click(textarea);
      await user.keyboard('{Control>}a{/Control}');
      await user.keyboard('{Control>}i{/Control}');

      expect(mockOnContentChange).toHaveBeenCalledWith(
        expect.stringContaining('*')
      );
    });

    it('should support Ctrl+S for save', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');

      await user.click(textarea);
      await user.keyboard('{Control>}s{/Control}');

      // Should trigger save action
      await waitFor(() => {
        expect(screen.getByText(/saved/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<AgendaEditor {...defaultProps} />);

      expect(screen.getByRole('textbox', { name: /agenda content/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /approve agenda/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /regenerate agenda/i })).toBeInTheDocument();
    });

    it('should announce validation errors to screen readers', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');

      await user.clear(textarea);

      const approveButton = screen.getByRole('button', { name: /approve agenda/i });
      await user.click(approveButton);

      const errorMessage = screen.getByRole('alert');
      expect(errorMessage).toHaveTextContent(/agenda cannot be empty/i);
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      // Tab through interactive elements
      await user.tab();
      expect(screen.getByText('Edit')).toHaveFocus();

      await user.tab();
      expect(screen.getByText('Preview')).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: /bold/i })).toHaveFocus();
    });
  });

  describe('Auto-save and Draft Management', () => {
    it('should auto-save changes after delay', async () => {
      const user = userEvent.setup();
      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');

      await user.type(textarea, ' - New item');

      // Should show auto-save indicator
      await waitFor(() => {
        expect(screen.getByText(/auto-saving/i)).toBeInTheDocument();
      }, { timeout: 3000 });

      await waitFor(() => {
        expect(screen.getByText(/auto-saved/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should handle auto-save failures', async () => {
      const user = userEvent.setup();

      // Mock a save failure
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      render(<AgendaEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, ' - New item');

      // Should handle save failure gracefully
      await waitFor(() => {
        expect(screen.queryByText(/auto-save failed/i)).toBeInTheDocument();
      }, { timeout: 5000 });

      consoleSpy.mockRestore();
    });
  });
});