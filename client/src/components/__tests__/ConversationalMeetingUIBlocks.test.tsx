import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  MeetingTypeSelection,
  AttendeeManagement,
  MeetingApproval,
  AgendaApproval
} from '../ConversationalMeetingUIBlocks';
import type { AttendeeData } from '../../../../shared/schema';

describe('ConversationalMeetingUIBlocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MeetingTypeSelection', () => {
    const mockOnTypeSelect = vi.fn();
    
    const defaultProps = {
      data: {
        meetingId: 'meeting-123',
        question: 'Is this a physical or online meeting?'
      },
      onTypeSelect: mockOnTypeSelect
    };

    it('should render meeting type selection options', () => {
      render(<MeetingTypeSelection {...defaultProps} />);
      
      expect(screen.getByText('Is this a physical or online meeting?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /online meeting/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /physical meeting/i })).toBeInTheDocument();
    });

    it('should select online meeting type', async () => {
      const user = userEvent.setup();
      render(<MeetingTypeSelection {...defaultProps} />);
      
      const onlineButton = screen.getByRole('button', { name: /online meeting/i });
      await user.click(onlineButton);
      
      expect(mockOnTypeSelect).toHaveBeenCalledWith('online', 'meeting-123');
    });

    it('should show location input for physical meeting', async () => {
      const user = userEvent.setup();
      render(<MeetingTypeSelection {...defaultProps} />);
      
      const physicalButton = screen.getByRole('button', { name: /physical meeting/i });
      await user.click(physicalButton);
      
      expect(screen.getByPlaceholderText(/enter meeting location/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /confirm location/i })).toBeInTheDocument();
    });

    it('should validate location input for physical meetings', async () => {
      const user = userEvent.setup();
      render(<MeetingTypeSelection {...defaultProps} />);
      
      const physicalButton = screen.getByRole('button', { name: /physical meeting/i });
      await user.click(physicalButton);
      
      const confirmButton = screen.getByRole('button', { name: /confirm location/i });
      await user.click(confirmButton);
      
      expect(screen.getByText(/location is required/i)).toBeInTheDocument();
      expect(mockOnTypeSelect).not.toHaveBeenCalled();
    });

    it('should submit physical meeting with valid location', async () => {
      const user = userEvent.setup();
      render(<MeetingTypeSelection {...defaultProps} />);
      
      const physicalButton = screen.getByRole('button', { name: /physical meeting/i });
      await user.click(physicalButton);
      
      const locationInput = screen.getByPlaceholderText(/enter meeting location/i);
      await user.type(locationInput, 'Conference Room A');
      
      const confirmButton = screen.getByRole('button', { name: /confirm location/i });
      await user.click(confirmButton);
      
      expect(mockOnTypeSelect).toHaveBeenCalledWith('physical', 'meeting-123', 'Conference Room A');
    });

    it('should show current selection when provided', () => {
      const propsWithSelection = {
        ...defaultProps,
        data: {
          ...defaultProps.data,
          currentType: 'online' as const
        }
      };
      
      render(<MeetingTypeSelection {...propsWithSelection} />);
      
      const onlineButton = screen.getByRole('button', { name: /online meeting/i });
      expect(onlineButton).toHaveClass('selected'); // Assuming selected styling
    });

    it('should validate minimum location length', async () => {
      const user = userEvent.setup();
      render(<MeetingTypeSelection {...defaultProps} />);
      
      const physicalButton = screen.getByRole('button', { name: /physical meeting/i });
      await user.click(physicalButton);
      
      const locationInput = screen.getByPlaceholderText(/enter meeting location/i);
      await user.type(locationInput, 'AB'); // Too short
      
      const confirmButton = screen.getByRole('button', { name: /confirm location/i });
      await user.click(confirmButton);
      
      expect(screen.getByText(/please provide a more specific location/i)).toBeInTheDocument();
    });
  });

  describe('AttendeeManagement', () => {
    const mockOnAttendeesUpdate = vi.fn();
    
    const mockAttendees: AttendeeData[] = [
      {
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        isValidated: true,
        isRequired: true
      },
      {
        email: 'jane@example.com',
        firstName: 'Jane',
        isValidated: true,
        isRequired: true
      }
    ];

    const defaultProps = {
      data: {
        meetingId: 'meeting-123',
        attendees: mockAttendees,
        meetingType: 'online' as const,
        isRequired: true
      },
      onAttendeesUpdate: mockOnAttendeesUpdate,
      onContinue: vi.fn()
    };

    it('should render attendee management interface', () => {
      render(<AttendeeManagement {...defaultProps} />);
      
      expect(screen.getByText(/manage attendees/i)).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane')).toBeInTheDocument();
    });

    it('should show requirement message for online meetings', () => {
      render(<AttendeeManagement {...defaultProps} />);
      
      expect(screen.getByText(/online meetings require at least one attendee/i)).toBeInTheDocument();
    });

    it('should not show requirement message for physical meetings', () => {
      const physicalProps = {
        ...defaultProps,
        data: {
          ...defaultProps.data,
          meetingType: 'physical' as const,
          isRequired: false
        }
      };
      
      render(<AttendeeManagement {...physicalProps} />);
      
      expect(screen.queryByText(/online meetings require at least one attendee/i)).not.toBeInTheDocument();
    });

    it('should update attendees when changes are made', async () => {
      const user = userEvent.setup();
      render(<AttendeeManagement {...defaultProps} />);
      
      // Simulate adding a new attendee through the AttendeeEditor
      const emailInput = screen.getByPlaceholderText(/enter email address/i);
      await user.type(emailInput, 'new@example.com');
      
      const addButton = screen.getByRole('button', { name: /add attendee/i });
      await user.click(addButton);
      
      // Should trigger the update callback
      await waitFor(() => {
        expect(mockOnAttendeesUpdate).toHaveBeenCalled();
      });
    });

    it('should show validation status for attendees', () => {
      const mixedAttendees = [
        { ...mockAttendees[0], isValidated: true },
        { email: 'pending@example.com', isValidated: false, isRequired: true }
      ];
      
      const propsWithMixed = {
        ...defaultProps,
        data: {
          ...defaultProps.data,
          attendees: mixedAttendees
        }
      };
      
      render(<AttendeeManagement {...propsWithMixed} />);
      
      expect(screen.getByText('Verified')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });

  describe('MeetingApproval', () => {
    const mockOnApprove = vi.fn();
    const mockOnEdit = vi.fn();
    
    const defaultProps = {
      data: {
        meetingId: 'meeting-123',
        title: 'Team Standup',
        type: 'online' as const,
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        attendees: [
          {
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
            isValidated: true,
            isRequired: true
          }
        ],
        agenda: '# Team Standup\n\n## Topics\n1. Updates\n2. Blockers\n3. Next steps'
      },
      onApprove: mockOnApprove,
      onEdit: mockOnEdit
    };

    it('should render meeting approval summary', () => {
      render(<MeetingApproval {...defaultProps} />);
      
      expect(screen.getByText('Review Meeting Details')).toBeInTheDocument();
      expect(screen.getByText('Team Standup')).toBeInTheDocument();
      expect(screen.getByText('Online Meeting')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('should show meeting time and duration', () => {
      render(<MeetingApproval {...defaultProps} />);
      
      expect(screen.getByText(/january 15, 2024/i)).toBeInTheDocument();
      expect(screen.getByText(/10:00 am - 11:00 am/i)).toBeInTheDocument();
      expect(screen.getByText(/60 minutes/i)).toBeInTheDocument();
    });

    it('should show location for physical meetings', () => {
      const physicalProps = {
        ...defaultProps,
        data: {
          ...defaultProps.data,
          type: 'physical' as const,
          location: 'Conference Room A'
        }
      };
      
      render(<MeetingApproval {...physicalProps} />);
      
      expect(screen.getByText('Physical Meeting')).toBeInTheDocument();
      expect(screen.getByText('Conference Room A')).toBeInTheDocument();
    });

    it('should show agenda preview', () => {
      render(<MeetingApproval {...defaultProps} />);
      
      expect(screen.getByText('Team Standup')).toBeInTheDocument();
      expect(screen.getByText('Updates')).toBeInTheDocument();
      expect(screen.getByText('Blockers')).toBeInTheDocument();
    });

    it('should approve meeting', async () => {
      const user = userEvent.setup();
      render(<MeetingApproval {...defaultProps} />);
      
      const approveButton = screen.getByRole('button', { name: /create meeting/i });
      await user.click(approveButton);
      
      expect(mockOnApprove).toHaveBeenCalledWith('meeting-123');
    });

    it('should allow editing meeting details', async () => {
      const user = userEvent.setup();
      render(<MeetingApproval {...defaultProps} />);
      
      const editButton = screen.getByRole('button', { name: /edit details/i });
      await user.click(editButton);
      
      expect(mockOnEdit).toHaveBeenCalledWith('meeting-123');
    });

    it('should show attendee count', () => {
      const multipleAttendeesProps = {
        ...defaultProps,
        data: {
          ...defaultProps.data,
          attendees: [
            ...defaultProps.data.attendees,
            {
              email: 'jane@example.com',
              firstName: 'Jane',
              isValidated: true,
              isRequired: true
            }
          ]
        }
      };
      
      render(<MeetingApproval {...multipleAttendeesProps} />);
      
      expect(screen.getByText('2 attendees')).toBeInTheDocument();
    });

    it('should handle missing optional fields gracefully', () => {
      const minimalProps = {
        ...defaultProps,
        data: {
          meetingId: 'meeting-123',
          title: 'Simple Meeting',
          type: 'online' as const,
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
          attendees: []
        }
      };
      
      render(<MeetingApproval {...minimalProps} />);
      
      expect(screen.getByText('Simple Meeting')).toBeInTheDocument();
      expect(screen.getByText('No attendees')).toBeInTheDocument();
      expect(screen.queryByText('Agenda')).not.toBeInTheDocument();
    });
  });

  describe('AgendaApproval', () => {
    const mockOnApprove = vi.fn();
    const mockOnEdit = vi.fn();
    const mockOnRegenerate = vi.fn();
    
    const defaultProps = {
      data: {
        meetingId: 'meeting-123',
        initialAgenda: '# Meeting Agenda\n\n## Topics\n1. Introduction\n2. Discussion\n3. Action Items',
        meetingTitle: 'Team Meeting',
        duration: 60,
        isApprovalMode: true
      },
      onAgendaUpdate: vi.fn(),
      onAgendaApprove: mockOnApprove,
      onAgendaRegenerate: mockOnRegenerate
    };

    it('should render agenda approval interface', () => {
      render(<AgendaApproval {...defaultProps} />);
      
      expect(screen.getByText('Review Meeting Agenda')).toBeInTheDocument();
      expect(screen.getByText('Team Meeting')).toBeInTheDocument();
      expect(screen.getByText('60 minutes')).toBeInTheDocument();
    });

    it('should show agenda content in preview mode', () => {
      render(<AgendaApproval {...defaultProps} />);
      
      expect(screen.getByText('Meeting Agenda')).toBeInTheDocument();
      expect(screen.getByText('Introduction')).toBeInTheDocument();
      expect(screen.getByText('Discussion')).toBeInTheDocument();
      expect(screen.getByText('Action Items')).toBeInTheDocument();
    });

    it('should approve agenda', async () => {
      const user = userEvent.setup();
      render(<AgendaApproval {...defaultProps} />);
      
      const approveButton = screen.getByRole('button', { name: /approve agenda/i });
      await user.click(approveButton);
      
      expect(mockOnApprove).toHaveBeenCalledWith(
        'meeting-123',
        defaultProps.data.initialAgenda
      );
    });

    it('should allow editing agenda', async () => {
      const user = userEvent.setup();
      render(<AgendaApproval {...defaultProps} />);
      
      const editButton = screen.getByRole('button', { name: /edit agenda/i });
      await user.click(editButton);
      
      expect(mockOnEdit).toHaveBeenCalledWith('meeting-123');
    });

    it('should regenerate agenda', async () => {
      const user = userEvent.setup();
      render(<AgendaApproval {...defaultProps} />);
      
      const regenerateButton = screen.getByRole('button', { name: /regenerate/i });
      await user.click(regenerateButton);
      
      expect(mockOnRegenerate).toHaveBeenCalledWith('meeting-123');
    });

    it('should show validation errors when present', () => {
      const propsWithValidation = {
        ...defaultProps,
        data: {
          ...defaultProps.data,
          validation: {
            isValid: false,
            errors: ['Agenda is too short', 'Missing action items'],
            warnings: ['Consider adding time estimates']
          }
        }
      };
      
      render(<AgendaApproval {...propsWithValidation} />);
      
      expect(screen.getByText('Agenda is too short')).toBeInTheDocument();
      expect(screen.getByText('Missing action items')).toBeInTheDocument();
      expect(screen.getByText('Consider adding time estimates')).toBeInTheDocument();
    });

    it('should disable approve button when validation fails', () => {
      const propsWithValidation = {
        ...defaultProps,
        data: {
          ...defaultProps.data,
          validation: {
            isValid: false,
            errors: ['Agenda is invalid'],
            warnings: []
          }
        }
      };
      
      render(<AgendaApproval {...propsWithValidation} />);
      
      const approveButton = screen.getByRole('button', { name: /approve agenda/i });
      expect(approveButton).toBeDisabled();
    });

    it('should show agenda statistics', () => {
      const longAgenda = `# Comprehensive Agenda

## Section 1 (20 min)
Content for section 1

## Section 2 (25 min)
Content for section 2

## Section 3 (15 min)
Content for section 3

## Action Items
1. Task 1
2. Task 2
3. Task 3`;

      const propsWithLongAgenda = {
        ...defaultProps,
        data: {
          ...defaultProps.data,
          initialAgenda: longAgenda
        }
      };
      
      render(<AgendaApproval {...propsWithLongAgenda} />);
      
      expect(screen.getByText(/3 sections/i)).toBeInTheDocument();
      expect(screen.getByText(/3 action items/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility and Keyboard Navigation', () => {
    it('should support keyboard navigation in MeetingTypeSelection', async () => {
      const user = userEvent.setup();
      const mockOnTypeSelect = vi.fn();
      
      render(<MeetingTypeSelection 
        data={{ meetingId: 'test', question: 'Test question' }}
        onTypeSelect={mockOnTypeSelect}
      />);
      
      // Tab to first button
      await user.tab();
      expect(screen.getByRole('button', { name: /online meeting/i })).toHaveFocus();
      
      // Tab to second button
      await user.tab();
      expect(screen.getByRole('button', { name: /physical meeting/i })).toHaveFocus();
      
      // Press Enter to select
      await user.keyboard('{Enter}');
      
      // Should show location input
      expect(screen.getByPlaceholderText(/enter meeting location/i)).toBeInTheDocument();
    });

    it('should have proper ARIA labels', () => {
      const mockOnTypeSelect = vi.fn();
      
      render(<MeetingTypeSelection 
        data={{ meetingId: 'test', question: 'Test question' }}
        onTypeSelect={mockOnTypeSelect}
      />);
      
      expect(screen.getByRole('button', { name: /online meeting/i })).toHaveAttribute('aria-label');
      expect(screen.getByRole('button', { name: /physical meeting/i })).toHaveAttribute('aria-label');
    });

    it('should announce validation errors to screen readers', async () => {
      const user = userEvent.setup();
      const mockOnTypeSelect = vi.fn();
      
      render(<MeetingTypeSelection 
        data={{ meetingId: 'test', question: 'Test question' }}
        onTypeSelect={mockOnTypeSelect}
      />);
      
      // Select physical meeting
      await user.click(screen.getByRole('button', { name: /physical meeting/i }));
      
      // Try to confirm without location
      await user.click(screen.getByRole('button', { name: /confirm location/i }));
      
      const errorMessage = screen.getByRole('alert');
      expect(errorMessage).toHaveTextContent(/location is required/i);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing data gracefully', () => {
      const mockOnTypeSelect = vi.fn();
      
      render(<MeetingTypeSelection 
        data={{ meetingId: '', question: '' }}
        onTypeSelect={mockOnTypeSelect}
      />);
      
      // Should still render without crashing
      expect(screen.getByRole('button', { name: /online meeting/i })).toBeInTheDocument();
    });

    it('should handle very long meeting titles', () => {
      const mockOnApprove = vi.fn();
      const mockOnEdit = vi.fn();
      
      const longTitleProps = {
        data: {
          meetingId: 'test',
          title: 'This is a very long meeting title that might cause layout issues if not handled properly',
          type: 'online' as const,
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
          attendees: []
        },
        onApprove: mockOnApprove,
        onEdit: mockOnEdit
      };
      
      render(<MeetingApproval {...longTitleProps} />);
      
      expect(screen.getByText(/This is a very long meeting title/)).toBeInTheDocument();
    });

    it('should handle invalid date formats', () => {
      const mockOnApprove = vi.fn();
      const mockOnEdit = vi.fn();
      
      const invalidDateProps = {
        data: {
          meetingId: 'test',
          title: 'Test Meeting',
          type: 'online' as const,
          startTime: 'invalid-date',
          endTime: 'invalid-date',
          attendees: []
        },
        onApprove: mockOnApprove,
        onEdit: mockOnEdit
      };
      
      render(<MeetingApproval {...invalidDateProps} />);
      
      // Should handle invalid dates gracefully
      expect(screen.getByText('Test Meeting')).toBeInTheDocument();
    });
  });
});