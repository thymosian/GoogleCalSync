import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { ChatInterface } from '../ChatInterface';
import { mockFetch, clearAllMocks } from '../../__tests__/setup';

// Mock the conversational meeting service
vi.mock('../../services/conversationalMeetingService', () => ({
  conversationalMeetingService: {
    sendMessage: vi.fn(),
    validateAttendeeEmail: vi.fn(),
    validateAttendeeBatch: vi.fn(),
    processWorkflowStep: vi.fn(),
    generateAgenda: vi.fn(),
    approveAgenda: vi.fn(),
    createMeeting: vi.fn()
  }
}));

// Mock the auth hook
vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://example.com/avatar.jpg'
    },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn()
  })
}));

describe('ChatInterface Integration', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  describe('Basic Chat Functionality', () => {
    it('should render chat interface', () => {
      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      expect(screen.getByPlaceholderText(/type your message/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });

    it('should send a message', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.sendMessage as Mock).mockResolvedValue({
        message: 'I can help you schedule that meeting. What time would work best?',
        uiBlock: null,
        nextStep: 'meeting_details_collection',
        requiresUserInput: true
      });

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      const sendButton = screen.getByRole('button', { name: /send/i });
      
      await user.type(messageInput, 'I need to schedule a meeting');
      await user.click(sendButton);
      
      expect(conversationalMeetingService.sendMessage).toHaveBeenCalledWith(
        'I need to schedule a meeting'
      );
      
      await waitFor(() => {
        expect(screen.getByText('I need to schedule a meeting')).toBeInTheDocument();
        expect(screen.getByText('I can help you schedule that meeting. What time would work best?')).toBeInTheDocument();
      });
    });

    it('should handle Enter key to send message', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.sendMessage as Mock).mockResolvedValue({
        message: 'Got it!',
        uiBlock: null,
        nextStep: 'casual',
        requiresUserInput: false
      });

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      
      await user.type(messageInput, 'Hello{Enter}');
      
      expect(conversationalMeetingService.sendMessage).toHaveBeenCalledWith('Hello');
    });

    it('should prevent sending empty messages', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const sendButton = screen.getByRole('button', { name: /send/i });
      
      await user.click(sendButton);
      
      expect(conversationalMeetingService.sendMessage).not.toHaveBeenCalled();
    });

    it('should show typing indicator while processing', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      // Mock a delayed response
      (conversationalMeetingService.sendMessage as Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          message: 'Response',
          uiBlock: null,
          nextStep: 'casual',
          requiresUserInput: false
        }), 1000))
      );

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      const sendButton = screen.getByRole('button', { name: /send/i });
      
      await user.type(messageInput, 'Test message');
      await user.click(sendButton);
      
      expect(screen.getByText(/typing/i)).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.queryByText(/typing/i)).not.toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });

  describe('Meeting Workflow Integration', () => {
    it('should handle meeting type selection UI block', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.sendMessage as Mock).mockResolvedValue({
        message: 'I need to know what type of meeting this is.',
        uiBlock: {
          type: 'meeting_type_selection',
          data: {
            meetingId: 'meeting-123',
            question: 'Is this a physical or online meeting?'
          }
        },
        nextStep: 'meeting_type_selection',
        requiresUserInput: true
      });

      (conversationalMeetingService.processWorkflowStep as Mock).mockResolvedValue({
        message: 'Great! I\'ll set this up as an online meeting.',
        uiBlock: null,
        nextStep: 'attendee_collection',
        requiresUserInput: false
      });

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      await user.type(messageInput, 'Schedule a meeting');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      await waitFor(() => {
        expect(screen.getByText('Is this a physical or online meeting?')).toBeInTheDocument();
      });
      
      const onlineButton = screen.getByRole('button', { name: /online meeting/i });
      await user.click(onlineButton);
      
      expect(conversationalMeetingService.processWorkflowStep).toHaveBeenCalledWith(
        'meeting_type_selection',
        'attendee_collection',
        { type: 'online', meetingId: 'meeting-123' }
      );
      
      await waitFor(() => {
        expect(screen.getByText('Great! I\'ll set this up as an online meeting.')).toBeInTheDocument();
      });
    });

    it('should handle attendee management UI block', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.sendMessage as Mock).mockResolvedValue({
        message: 'Please add the attendees for this online meeting.',
        uiBlock: {
          type: 'attendee_management',
          data: {
            meetingId: 'meeting-123',
            attendees: [],
            meetingType: 'online',
            isRequired: true
          }
        },
        nextStep: 'attendee_collection',
        requiresUserInput: true
      });

      (conversationalMeetingService.validateAttendeeEmail as Mock).mockResolvedValue({
        email: 'john@example.com',
        isValid: true,
        exists: true,
        firstName: 'John',
        lastName: 'Doe',
        isGoogleUser: true
      });

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      await user.type(messageInput, 'Add attendees');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      await waitFor(() => {
        expect(screen.getByText('Please add the attendees for this online meeting.')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter email address')).toBeInTheDocument();
      });
      
      const emailInput = screen.getByPlaceholderText('Enter email address');
      await user.type(emailInput, 'john@example.com');
      await user.click(screen.getByRole('button', { name: /add attendee/i }));
      
      await waitFor(() => {
        expect(conversationalMeetingService.validateAttendeeEmail).toHaveBeenCalledWith('john@example.com');
      });
      
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('should handle agenda approval UI block', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      const mockAgenda = '# Team Meeting\n\n## Topics\n1. Updates\n2. Planning\n3. Action Items';
      
      (conversationalMeetingService.sendMessage as Mock).mockResolvedValue({
        message: 'I\'ve generated an agenda for your meeting. Please review it.',
        uiBlock: {
          type: 'agenda_approval',
          data: {
            meetingId: 'meeting-123',
            initialAgenda: mockAgenda,
            meetingTitle: 'Team Meeting',
            duration: 60,
            isApprovalMode: true
          }
        },
        nextStep: 'agenda_approval',
        requiresUserInput: true
      });

      (conversationalMeetingService.approveAgenda as Mock).mockResolvedValue({
        message: 'Agenda approved! Now let\'s finalize the meeting.',
        uiBlock: null,
        nextStep: 'approval',
        requiresUserInput: false
      });

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      await user.type(messageInput, 'Generate agenda');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      await waitFor(() => {
        expect(screen.getByText('I\'ve generated an agenda for your meeting. Please review it.')).toBeInTheDocument();
        expect(screen.getByText('Team Meeting')).toBeInTheDocument();
      });
      
      const approveButton = screen.getByRole('button', { name: /approve agenda/i });
      await user.click(approveButton);
      
      expect(conversationalMeetingService.approveAgenda).toHaveBeenCalledWith(
        'meeting-123',
        mockAgenda
      );
      
      await waitFor(() => {
        expect(screen.getByText('Agenda approved! Now let\'s finalize the meeting.')).toBeInTheDocument();
      });
    });

    it('should handle meeting approval UI block', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.sendMessage as Mock).mockResolvedValue({
        message: 'Please review the complete meeting details.',
        uiBlock: {
          type: 'meeting_approval',
          data: {
            meetingId: 'meeting-123',
            title: 'Team Standup',
            type: 'online',
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
            agenda: '# Team Standup\n\n## Topics\n1. Updates\n2. Blockers'
          }
        },
        nextStep: 'approval',
        requiresUserInput: true
      });

      (conversationalMeetingService.createMeeting as Mock).mockResolvedValue({
        message: '🎉 Meeting created successfully!\n\n**Team Standup**\nJanuary 15, 2024 at 10:00 AM\n🔗 Meeting Link: https://meet.google.com/test-link',
        uiBlock: null,
        nextStep: 'completed',
        requiresUserInput: false
      });

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      await user.type(messageInput, 'Review meeting');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      await waitFor(() => {
        expect(screen.getByText('Please review the complete meeting details.')).toBeInTheDocument();
        expect(screen.getByText('Team Standup')).toBeInTheDocument();
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
      
      const createButton = screen.getByRole('button', { name: /create meeting/i });
      await user.click(createButton);
      
      expect(conversationalMeetingService.createMeeting).toHaveBeenCalledWith('meeting-123');
      
      await waitFor(() => {
        expect(screen.getByText(/Meeting created successfully/)).toBeInTheDocument();
        expect(screen.getByText(/https:\/\/meet\.google\.com\/test-link/)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.sendMessage as Mock).mockRejectedValue(
        new Error('Service temporarily unavailable')
      );

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      await user.type(messageInput, 'Test message');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/sorry, something went wrong/i)).toBeInTheDocument();
        expect(screen.getByText(/service temporarily unavailable/i)).toBeInTheDocument();
      });
    });

    it('should handle network errors', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.sendMessage as Mock).mockRejectedValue(
        new Error('Network error')
      );

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      await user.type(messageInput, 'Test message');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/connection error/i)).toBeInTheDocument();
      });
    });

    it('should allow retry after error', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      // First call fails
      (conversationalMeetingService.sendMessage as Mock)
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({
          message: 'Success!',
          uiBlock: null,
          nextStep: 'casual',
          requiresUserInput: false
        });

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      await user.type(messageInput, 'Test message');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      });
      
      const retryButton = screen.getByRole('button', { name: /retry/i });
      await user.click(retryButton);
      
      await waitFor(() => {
        expect(screen.getByText('Success!')).toBeInTheDocument();
      });
    });
  });

  describe('Message History and Persistence', () => {
    it('should load previous messages on mount', async () => {
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.sendMessage as Mock).mockImplementation(() => 
        Promise.resolve({
          message: 'Welcome back!',
          uiBlock: null,
          nextStep: 'casual',
          requiresUserInput: false,
          messageHistory: [
            {
              id: 'msg-1',
              role: 'user',
              content: 'Previous message',
              timestamp: new Date('2024-01-15T09:00:00Z')
            },
            {
              id: 'msg-2',
              role: 'assistant',
              content: 'Previous response',
              timestamp: new Date('2024-01-15T09:01:00Z')
            }
          ]
        })
      );

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      await waitFor(() => {
        expect(screen.getByText('Previous message')).toBeInTheDocument();
        expect(screen.getByText('Previous response')).toBeInTheDocument();
      });
    });

    it('should scroll to bottom when new messages arrive', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.sendMessage as Mock).mockResolvedValue({
        message: 'New message',
        uiBlock: null,
        nextStep: 'casual',
        requiresUserInput: false
      });

      const scrollIntoViewSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      await user.type(messageInput, 'Test');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      await waitFor(() => {
        expect(scrollIntoViewSpy).toHaveBeenCalled();
      });
    });

    it('should show message timestamps', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.sendMessage as Mock).mockResolvedValue({
        message: 'Response with timestamp',
        uiBlock: null,
        nextStep: 'casual',
        requiresUserInput: false
      });

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      await user.type(messageInput, 'Test message');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      await waitFor(() => {
        // Should show relative time like "just now" or "2 minutes ago"
        expect(screen.getByText(/just now|ago/)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      expect(screen.getByRole('textbox', { name: /message input/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
      expect(screen.getByRole('log', { name: /chat messages/i })).toBeInTheDocument();
    });

    it('should announce new messages to screen readers', async () => {
      const user = userEvent.setup();
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      (conversationalMeetingService.sendMessage as Mock).mockResolvedValue({
        message: 'New response message',
        uiBlock: null,
        nextStep: 'casual',
        requiresUserInput: false
      });

      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      await user.type(messageInput, 'Test');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      await waitFor(() => {
        const liveRegion = screen.getByRole('status');
        expect(liveRegion).toHaveTextContent('New response message');
      });
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      // Tab should focus the message input
      await user.tab();
      expect(screen.getByPlaceholderText(/type your message/i)).toHaveFocus();
      
      // Tab should focus the send button
      await user.tab();
      expect(screen.getByRole('button', { name: /send/i })).toHaveFocus();
    });
  });

  describe('Performance and Optimization', () => {
    it('should debounce typing indicators', async () => {
      const user = userEvent.setup();
      render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      
      // Rapid typing should not trigger multiple typing events
      await user.type(messageInput, 'Quick typing test');
      
      // Should show typing indicator
      expect(screen.queryByText(/typing/i)).not.toBeInTheDocument(); // User typing, not assistant
    });

    it('should handle large message history efficiently', async () => {
      const { conversationalMeetingService } = await import('../../services/conversationalMeetingService');
      
      const largeHistory = Array.from({ length: 100 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: new Date(Date.now() - (100 - i) * 60000)
      }));
      
      (conversationalMeetingService.sendMessage as Mock).mockResolvedValue({
        message: 'Response',
        uiBlock: null,
        nextStep: 'casual',
        requiresUserInput: false,
        messageHistory: largeHistory
      });

      const { container } = render(<ChatInterface messages={[]} onSendMessage={vi.fn()} />);
      
      await waitFor(() => {
        expect(screen.getByText('Message 99')).toBeInTheDocument();
      });
      
      // Should render without performance issues
      expect(container.querySelectorAll('[data-testid="chat-message"]')).toHaveLength(100);
    });
  });
});