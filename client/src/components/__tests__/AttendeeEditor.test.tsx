import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { AttendeeEditor, type AttendeeEditorProps } from '../AttendeeEditor';
import type { AttendeeData } from '../../../../shared/schema';

// Mock the conversational meeting service
vi.mock('../../services/conversationalMeetingService', () => ({
  conversationalMeetingService: {
    validateAttendeeEmail: vi.fn(),
    validateAttendeeBatch: vi.fn()
  }
}));

describe('AttendeeEditor', () => {
  const mockOnAttendeesChange = vi.fn();
  const mockOnValidation = vi.fn();

  const defaultProps: AttendeeEditorProps = {
    attendees: [],
    onAttendeesChange: mockOnAttendeesChange,
    onValidation: mockOnValidation,
    maxAttendees: 10
  };

  const mockAttendees: AttendeeData[] = [
    {
      email: 'john@example.com',
      firstName: 'John',
      lastName: 'Doe',
      isValidated: true,
      isRequired: true,
      profilePicture: 'https://example.com/john.jpg'
    },
    {
      email: 'jane@example.com',
      firstName: 'Jane',
      isValidated: true,
      isRequired: true
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render empty attendee editor', () => {
      render(<AttendeeEditor {...defaultProps} />);
      
      expect(screen.getByText('Meeting Attendees')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter email address')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add attendee/i })).toBeInTheDocument();
      expect(screen.getByText('0 / 10 attendees')).toBeInTheDocument();
    });

    it('should render with existing attendees', () => {
      render(<AttendeeEditor {...defaultProps} attendees={mockAttendees} />);
      
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
      expect(screen.getByText('Jane')).toBeInTheDocument();
      expect(screen.getByText('jane@example.com')).toBeInTheDocument();
      expect(screen.getByText('2 / 10 attendees')).toBeInTheDocument();
    });

    it('should show attendee avatars when profile pictures are available', () => {
      render(<AttendeeEditor {...defaultProps} attendees={mockAttendees} />);
      
      const johnAvatar = screen.getByRole('img', { name: /john doe/i });
      expect(johnAvatar).toHaveAttribute('src', 'https://example.com/john.jpg');
      
      // Jane should have initials fallback
      expect(screen.getByText('J')).toBeInTheDocument();
    });

    it('should show validation status badges', () => {
      const attendeesWithMixedValidation: AttendeeData[] = [
        { ...mockAttendees[0], isValidated: true },
        { email: 'pending@example.com', isValidated: false, isRequired: true }
      ];

      render(<AttendeeEditor {...defaultProps} attendees={attendeesWithMixedValidation} />);
      
      expect(screen.getByText('Verified')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('should be disabled when disabled prop is true', () => {
      render(<AttendeeEditor {...defaultProps} disabled={true} />);
      
      expect(screen.getByPlaceholderText('Enter email address')).toBeDisabled();
      expect(screen.getByRole('button', { name: /add attendee/i })).toBeDisabled();
    });
  });

  describe('Email Input and Validation', () => {
    it('should validate email format on input', async () => {
      const user = userEvent.setup();
      render(<AttendeeEditor {...defaultProps} />);
      
      const emailInput = screen.getByPlaceholderText('Enter email address');
      
      // Test invalid email
      await user.type(emailInput, 'invalid-email');
      await user.tab(); // Trigger blur event
      
      await waitFor(() => {
        expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
      });
      
      // Test valid email format
      await user.clear(emailInput);
      await user.type(emailInput, 'valid@example.com');
      await user.tab();
      
      await waitFor(() => {
        expect(screen.queryByText(/please enter a valid email address/i)).not.toBeInTheDocument();
      });
    });

    it('should prevent duplicate email addresses', async () => {
      const user = userEvent.setup();
      render(<AttendeeEditor {...defaultProps} attendees={mockAttendees} />);
      
      const emailInput = screen.getByPlaceholderText('Enter email address');
      
      await user.type(emailInput, 'john@example.com');
      await user.click(screen.getByRole('button', { name: /add attendee/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/attendee already added/i)).toBeInTheDocument();
      });
      
      expect(mockOnAttendeesChange).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive duplicate detection', async () => {
      const user = userEvent.setup();
      render(<AttendeeEditor {...defaultProps} attendees={mockAttendees} />);
      
      const emailInput = screen.getByPlaceholderText('Enter email address');
      
      await user.type(emailInput, 'JOHN@EXAMPLE.COM');
      await user.click(screen.getByRole('button', { name: /add attendee/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/attendee already added/i)).toBeInTheDocument();
      });
    });

    it('should enforce maximum attendee limit', async () => {
      const user = userEvent.setup();
      const maxAttendeesProps = { ...defaultProps, maxAttendees: 2, attendees: mockAttendees };
      render(<AttendeeEditor {...maxAttendeesProps} />);
      
      const emailInput = screen.getByPlaceholderText('Enter email address');
      
      await user.type(emailInput, 'new@example.com');
      await user.click(screen.getByRole('button', { name: /add attendee/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/maximum number of attendees reached/i)).toBeInTheDocument();
      });
      
      expect(mockOnAttendeesChange).not.toHaveBeenCalled();
    });
  });

  describe('Real-time Email Validation', () => {
    it('should validate email with external service', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.validateAttendeeEmail as Mock).mockResolvedValue({
        email: 'test@example.com',
        isValid: true,
        exists: true,
        firstName: 'Test',
        lastName: 'User',
        isGoogleUser: true
      });

      render(<AttendeeEditor {...defaultProps} />);
      
      const emailInput = screen.getByPlaceholderText('Enter email address');
      
      await user.type(emailInput, 'test@example.com');
      await user.click(screen.getByRole('button', { name: /add attendee/i }));
      
      // Should show loading state
      expect(screen.getByRole('button', { name: /validating/i })).toBeInTheDocument();
      
      await waitFor(() => {
        expect(conversationalMeetingService.validateAttendeeEmail).toHaveBeenCalledWith('test@example.com');
      });
      
      await waitFor(() => {
        expect(mockOnAttendeesChange).toHaveBeenCalledWith([
          expect.objectContaining({
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            isValidated: true
          })
        ]);
      });
    });

    it('should handle validation failures', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.validateAttendeeEmail as Mock).mockResolvedValue({
        email: 'invalid@example.com',
        isValid: false,
        exists: false,
        isGoogleUser: false
      });

      render(<AttendeeEditor {...defaultProps} />);
      
      const emailInput = screen.getByPlaceholderText('Enter email address');
      
      await user.type(emailInput, 'invalid@example.com');
      await user.click(screen.getByRole('button', { name: /add attendee/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/email address could not be validated/i)).toBeInTheDocument();
      });
      
      expect(mockOnAttendeesChange).not.toHaveBeenCalled();
    });

    it('should handle validation service errors', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.validateAttendeeEmail as Mock).mockRejectedValue(
        new Error('Service unavailable')
      );

      render(<AttendeeEditor {...defaultProps} />);
      
      const emailInput = screen.getByPlaceholderText('Enter email address');
      
      await user.type(emailInput, 'test@example.com');
      await user.click(screen.getByRole('button', { name: /add attendee/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/validation service temporarily unavailable/i)).toBeInTheDocument();
      });
    });
  });

  describe('Attendee Management', () => {
    it('should remove attendees', async () => {
      const user = userEvent.setup();
      render(<AttendeeEditor {...defaultProps} attendees={mockAttendees} />);
      
      const removeButtons = screen.getAllByRole('button', { name: /remove attendee/i });
      
      await user.click(removeButtons[0]);
      
      expect(mockOnAttendeesChange).toHaveBeenCalledWith([mockAttendees[1]]);
    });

    it('should not allow removing required attendees when disabled', () => {
      const requiredAttendees = mockAttendees.map(a => ({ ...a, isRequired: true }));
      render(<AttendeeEditor {...defaultProps} attendees={requiredAttendees} disabled={true} />);
      
      const removeButtons = screen.queryAllByRole('button', { name: /remove attendee/i });
      
      removeButtons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });

    it('should show attendee count correctly', () => {
      render(<AttendeeEditor {...defaultProps} attendees={mockAttendees} maxAttendees={5} />);
      
      expect(screen.getByText('2 / 5 attendees')).toBeInTheDocument();
    });

    it('should highlight when approaching maximum attendees', () => {
      const nearMaxAttendees = Array.from({ length: 9 }, (_, i) => ({
        email: `user${i}@example.com`,
        isValidated: true,
        isRequired: true
      }));

      render(<AttendeeEditor {...defaultProps} attendees={nearMaxAttendees} maxAttendees={10} />);
      
      expect(screen.getByText('9 / 10 attendees')).toBeInTheDocument();
      // Should show warning styling when near limit
    });
  });

  describe('Keyboard Navigation and Accessibility', () => {
    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<AttendeeEditor {...defaultProps} />);
      
      const emailInput = screen.getByPlaceholderText('Enter email address');
      
      await user.type(emailInput, 'test@example.com');
      await user.keyboard('{Enter}');
      
      // Enter key should trigger add attendee
      expect(screen.getByRole('button', { name: /validating/i })).toBeInTheDocument();
    });

    it('should have proper ARIA labels', () => {
      render(<AttendeeEditor {...defaultProps} attendees={mockAttendees} />);
      
      expect(screen.getByRole('textbox', { name: /email address/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add attendee/i })).toBeInTheDocument();
      
      const removeButtons = screen.getAllByRole('button', { name: /remove attendee/i });
      expect(removeButtons).toHaveLength(2);
    });

    it('should announce validation status to screen readers', async () => {
      const user = userEvent.setup();
      render(<AttendeeEditor {...defaultProps} />);
      
      const emailInput = screen.getByPlaceholderText('Enter email address');
      
      await user.type(emailInput, 'invalid-email');
      await user.tab();
      
      await waitFor(() => {
        const errorMessage = screen.getByRole('alert');
        expect(errorMessage).toHaveTextContent(/please enter a valid email address/i);
      });
    });
  });

  describe('Batch Operations', () => {
    it('should handle batch email validation', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.validateAttendeeBatch as Mock).mockResolvedValue([
        {
          email: 'user1@example.com',
          isValid: true,
          exists: true,
          firstName: 'User1',
          isGoogleUser: true
        },
        {
          email: 'user2@example.com',
          isValid: true,
          exists: true,
          firstName: 'User2',
          isGoogleUser: true
        }
      ]);

      render(<AttendeeEditor {...defaultProps} />);
      
      const emailInput = screen.getByPlaceholderText('Enter email address');
      
      // Simulate pasting multiple emails
      await user.type(emailInput, 'user1@example.com, user2@example.com');
      await user.click(screen.getByRole('button', { name: /add attendee/i }));
      
      await waitFor(() => {
        expect(conversationalMeetingService.validateAttendeeBatch).toHaveBeenCalledWith([
          'user1@example.com',
          'user2@example.com'
        ]);
      });
      
      await waitFor(() => {
        expect(mockOnAttendeesChange).toHaveBeenCalledWith([
          expect.objectContaining({ email: 'user1@example.com', firstName: 'User1' }),
          expect.objectContaining({ email: 'user2@example.com', firstName: 'User2' })
        ]);
      });
    });

    it('should handle mixed validation results in batch', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.validateAttendeeBatch as Mock).mockResolvedValue([
        {
          email: 'valid@example.com',
          isValid: true,
          exists: true,
          firstName: 'Valid',
          isGoogleUser: true
        },
        {
          email: 'invalid@example.com',
          isValid: false,
          exists: false,
          isGoogleUser: false
        }
      ]);

      render(<AttendeeEditor {...defaultProps} />);
      
      const emailInput = screen.getByPlaceholderText('Enter email address');
      
      await user.type(emailInput, 'valid@example.com, invalid@example.com');
      await user.click(screen.getByRole('button', { name: /add attendee/i }));
      
      await waitFor(() => {
        // Should only add valid attendees
        expect(mockOnAttendeesChange).toHaveBeenCalledWith([
          expect.objectContaining({ email: 'valid@example.com' })
        ]);
      });
      
      await waitFor(() => {
        // Should show error for invalid emails
        expect(screen.getByText(/some email addresses could not be validated/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should clear errors when input changes', async () => {
      const user = userEvent.setup();
      render(<AttendeeEditor {...defaultProps} />);
      
      const emailInput = screen.getByPlaceholderText('Enter email address');
      
      // Create an error
      await user.type(emailInput, 'invalid-email');
      await user.tab();
      
      await waitFor(() => {
        expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
      });
      
      // Clear the error by typing
      await user.clear(emailInput);
      await user.type(emailInput, 'valid@example.com');
      
      await waitFor(() => {
        expect(screen.queryByText(/please enter a valid email address/i)).not.toBeInTheDocument();
      });
    });

    it('should show global errors for service failures', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.validateAttendeeEmail as Mock).mockRejectedValue(
        new Error('Network error')
      );

      render(<AttendeeEditor {...defaultProps} />);
      
      const emailInput = screen.getByPlaceholderText('Enter email address');
      
      await user.type(emailInput, 'test@example.com');
      await user.click(screen.getByRole('button', { name: /add attendee/i }));
      
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/validation service temporarily unavailable/i);
      });
    });
  });
});