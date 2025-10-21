import { google } from 'googleapis';
import { User } from '../shared/schema.js';
import { AgendaContent } from './agendaGenerator.js';
import { EmailValidationResult } from './attendeeValidator.js';

// Gmail API scopes required for sending emails
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose'
];

/**
 * Interface for email sending result
 */
export interface EmailSendResult {
  email: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Interface for batch email sending result
 */
export interface BatchEmailResult {
  totalSent: number;
  totalFailed: number;
  results: EmailSendResult[];
  errors: string[];
}

/**
 * Interface for email template data
 */
export interface EmailTemplateData {
  recipientFirstName: string;
  recipientEmail: string;
  meetingTitle: string;
  meetingDate: string;
  meetingTime: string;
  meetingDuration: string;
  meetingType: 'physical' | 'online';
  meetingLocation?: string;
  meetingLink?: string;
  organizerName: string;
  agendaContent: string;
}

/**
 * Gmail service for sending agenda emails
 */
export class GmailService {
  /**
   * Get Gmail API client
   */
  private getGmailClient(accessToken: string) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  /**
   * Send agenda email to a single attendee
   */
  async sendAgendaEmail(
    user: User,
    attendee: EmailValidationResult,
    meetingData: any,
    agendaContent: AgendaContent
  ): Promise<EmailSendResult> {
    try {
      if (!user.accessToken) {
        throw new Error('User access token is missing');
      }

      const gmail = this.getGmailClient(user.accessToken);
      
      // Prepare template data
      const templateData: EmailTemplateData = {
        recipientFirstName: attendee.firstName || 'there',
        recipientEmail: attendee.email,
        meetingTitle: meetingData.title || 'Meeting',
        meetingDate: this.formatDate(meetingData.startTime),
        meetingTime: this.formatTime(meetingData.startTime),
        meetingDuration: `${agendaContent.duration} minutes`,
        meetingType: meetingData.type || 'online',
        meetingLocation: meetingData.location,
        meetingLink: meetingData.meetingLink,
        organizerName: user.name || 'Meeting Organizer',
        agendaContent: this.formatAgendaForEmail(agendaContent)
      };

      // Use enhanced purpose as the main description if available
      if (agendaContent.enhancedPurpose) {
        templateData.agendaContent = agendaContent.enhancedPurpose + '\n\n' + templateData.agendaContent;
      }

      // Generate email content
      const emailContent = this.generateEmailContent(templateData);
      
      // Create email message with HTML support
      const emailMessage = this.createEmailMessage(
        user.email ?? '',
        attendee.email,
        `Meeting Agenda: ${templateData.meetingTitle}`,
        emailContent,
        true // Enable HTML
      );

      // Send email
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: emailMessage
        }
      });

      return {
        email: attendee.email,
        success: true,
        messageId: response.data.id || undefined
      };

    } catch (error) {
      console.error(`Error sending agenda email to ${attendee.email}:`, error);
      return {
        email: attendee.email,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send agenda emails to multiple attendees (batch)
   */
  async sendBatchAgendaEmails(
    user: User,
    attendees: EmailValidationResult[],
    meetingData: any,
    agendaContent: AgendaContent
  ): Promise<BatchEmailResult> {
    const results: EmailSendResult[] = [];
    const errors: string[] = [];
    let totalSent = 0;
    let totalFailed = 0;

    // Send emails with delay to avoid rate limiting
    for (const attendee of attendees) {
      try {
        const result = await this.sendAgendaEmail(user, attendee, meetingData, agendaContent);
        results.push(result);
        
        if (result.success) {
          totalSent++;
        } else {
          totalFailed++;
          if (result.error) {
            errors.push(`${attendee.email}: ${result.error}`);
          }
        }

        // Add small delay between emails to avoid rate limiting
        if (attendees.length > 1) {
          await this.delay(500); // 500ms delay
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const failedResult: EmailSendResult = {
          email: attendee.email,
          success: false,
          error: errorMessage
        };
        
        results.push(failedResult);
        totalFailed++;
        errors.push(`${attendee.email}: ${errorMessage}`);
      }
    }

    return {
      totalSent,
      totalFailed,
      results,
      errors
    };
  }

  /**
   * Strip HTML tags for plain text version
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, "'")
      .replace(/\n\s*\n/g, '\n\n'); // Remove extra blank lines
  }

  /**
   * Generate personalized email content with HTML formatting
   */
  private generateEmailContent(data: EmailTemplateData): string {
    const {
      recipientFirstName,
      meetingTitle,
      meetingDate,
      meetingTime,
      meetingDuration,
      meetingType,
      meetingLocation,
      meetingLink,
      organizerName,
      agendaContent
    } = data;

    // Create HTML email with CSS styling
    let emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
        }
        .header {
          background-color: #f5f5f5;
          padding: 20px;
          border-radius: 5px;
          margin-bottom: 20px;
        }
        .meeting-details {
          background-color: #f9f9f9;
          padding: 15px;
          border-left: 4px solid #4285f4;
          margin-bottom: 20px;
        }
        .agenda-section {
          margin-bottom: 20px;
        }
        .agenda-item {
          margin-bottom: 10px;
        }
        .action-items {
          background-color: #fffde7;
          padding: 15px;
          border-left: 4px solid #fbc02d;
          margin-bottom: 20px;
        }
        .footer {
          font-size: 0.9em;
          color: #666;
          margin-top: 30px;
          padding-top: 10px;
          border-top: 1px solid #eee;
        }
        h1 {
          color: #4285f4;
          font-size: 24px;
        }
        h2 {
          color: #4285f4;
          font-size: 20px;
        }
        h3 {
          color: #5f6368;
          font-size: 16px;
        }
        .button {
          display: inline-block;
          background-color: #4285f4;
          color: white;
          padding: 10px 20px;
          text-decoration: none;
          border-radius: 4px;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${meetingTitle}</h1>
        <p>Hello ${recipientFirstName},</p>
        <p>I hope this email finds you well. I'm writing to share the agenda for our upcoming meeting.</p>
      </div>

      <div class="meeting-details">
        <h2>📅 Meeting Details</h2>
        <p><strong>Date:</strong> ${meetingDate}</p>
        <p><strong>Time:</strong> ${meetingTime}</p>
        <p><strong>Duration:</strong> ${meetingDuration}</p>
        <p><strong>Type:</strong> ${meetingType === 'online' ? 'Online Meeting' : 'In-Person Meeting'}</p>
        ${meetingType === 'online' && meetingLink ?
          `<p><strong>Meeting Link:</strong> <a href="${meetingLink}">${meetingLink}</a></p>
           <a href="${meetingLink}" class="button">Join Meeting</a>` : ''}
        ${meetingType === 'physical' && meetingLocation ?
          `<p><strong>Location:</strong> ${meetingLocation}</p>` : ''}
      </div>

      <div class="agenda-section">
        <h2>📋 Meeting Agenda</h2>
        ${agendaContent}
      </div>

      <div class="preparation">
        <h3>📝 Please come prepared to:</h3>
        <ul>
          <li>Review the agenda items above</li>
          <li>Bring any relevant materials or updates</li>
          <li>Be ready to participate in discussions</li>
        </ul>
      </div>

      <div class="footer">
        <p>If you have any questions or need to discuss anything before the meeting, please don't hesitate to reach out.</p>
        <p>Looking forward to our productive discussion!</p>
        <p>Best regards,<br>${organizerName}</p>
      </div>
    </body>
    </html>
    `;

    return emailHtml;
  }

  /**
    * Format agenda content for email with HTML and enhanced Tailwind-inspired styling
    */
   private formatAgendaForEmail(agendaContent: AgendaContent): string {
     let formatted = '';

     // Enhanced purpose is already added in sendAgendaEmail method, don't duplicate it here

     // Add agenda topics with improved styling
     if (agendaContent.topics.length > 0) {
       formatted += '<div style="margin-bottom: 1.5rem;">';
       formatted += '<h3 style="margin: 0 0 1rem 0; color: #111827; font-weight: 600; font-size: 1.125rem;">Agenda Topics</h3>';
       formatted += '<ol style="list-style-position: inside; padding-left: 0; margin: 0;">';
       agendaContent.topics.forEach((topic, index) => {
         formatted += `<li style="margin-bottom: 1rem; padding: 0.75rem; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 0.375rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);">
           <div style="font-weight: 600; font-size: 1.125rem; color: #111827; margin-bottom: 0.5rem;">${topic.title}</div>
           <div style="display: inline-block; background-color: #e5e7eb; color: #4b5563; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; margin-right: 0.5rem;">${topic.duration} min</div>`;
         if (topic.description) {
           formatted += `<p style="margin: 0.5rem 0 0 0; color: #4b5563; line-height: 1.5;">${topic.description}</p>`;
         }
         if (topic.presenter) {
           formatted += `<p style="margin: 0.5rem 0 0 0; font-style: italic; color: #6b7280;">Presenter: ${topic.presenter}</p>`;
         }
         formatted += '</li>';
       });
       formatted += '</ol>';
       formatted += '</div>';
     }

    // Add action items with improved styling
    if (agendaContent.actionItems.length > 0) {
      formatted += '<div style="background-color: #fffbeb; padding: 1rem; border-left: 4px solid #f59e0b; margin-top: 1.5rem; border-radius: 0.375rem;">';
      formatted += '<h3 style="margin-top: 0; color: #b45309; font-weight: 600; font-size: 1.125rem; margin-bottom: 1rem;">Action Items to Discuss</h3>';
      formatted += '<ul style="list-style-type: none; padding-left: 0; margin: 0;">';
      agendaContent.actionItems.forEach((item) => {
        const priorityColors = {
          high: { bg: '#fee2e2', text: '#b91c1c' },
          medium: { bg: '#fef3c7', text: '#92400e' },
          low: { bg: '#ecfdf5', text: '#065f46' }
        };
        const colors = priorityColors[item.priority as keyof typeof priorityColors] || priorityColors.medium;
        
        formatted += `<li style="margin-bottom: 0.75rem; padding: 0.75rem; background-color: #ffffff; border: 1px solid #fcd34d; border-radius: 0.375rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);">
          <div style="font-weight: 600; color: #111827; margin-bottom: 0.5rem;">${item.task}</div>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; font-size: 0.875rem;">`;
        
        if (item.assignee) {
          formatted += `<span style="display: inline-block; background-color: #e5e7eb; color: #4b5563; padding: 0.25rem 0.5rem; border-radius: 0.25rem;">Assigned to: ${item.assignee}</span>`;
        }
        if (item.deadline) {
          formatted += `<span style="display: inline-block; background-color: #e5e7eb; color: #4b5563; padding: 0.25rem 0.5rem; border-radius: 0.25rem;">Due: ${item.deadline}</span>`;
        }
        formatted += `<span style="display: inline-block; background-color: ${colors.bg}; color: ${colors.text}; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-weight: 500;">${item.priority.toUpperCase()}</span>`;
        formatted += '</div></li>';
      });
      formatted += '</ul>';
      formatted += '</div>';
    }

    return formatted;
  }

  /**
   * Create base64 encoded email message for Gmail API with HTML support
   */
  private createEmailMessage(
    from: string,
    to: string,
    subject: string,
    body: string,
    isHtml: boolean = true
  ): string {
    // Generate a boundary for multipart message
    const boundary = `boundary_${Date.now().toString(16)}`;

    if (isHtml) {
      const emailLines = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary=${boundary}`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        // Plain text version (strip HTML)
        this.stripHtml(body),
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        // HTML version
        body,
        '',
        `--${boundary}--`
      ];
      const email = emailLines.join('\r\n');
      return Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } else {
      const emailLines = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset=utf-8`,
        '',
        body
      ];

      const email = emailLines.join('\r\n');
      return Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
  }

  /**
    * Format date for email display
    */
   private formatDate(date: Date | string | undefined): string {
     if (!date) return 'TBD';

     const dateObj = typeof date === 'string' ? new Date(date) : date;

     // Check if the date is valid
     if (isNaN(dateObj.getTime())) {
       return 'TBD';
     }

     return dateObj.toLocaleDateString('en-US', {
       weekday: 'long',
       year: 'numeric',
       month: 'long',
       day: 'numeric'
     });
   }

   /**
    * Format time for email display
    */
   private formatTime(date: Date | string | undefined): string {
     if (!date) return 'TBD';

     const dateObj = typeof date === 'string' ? new Date(date) : date;

     // Check if the date is valid
     if (isNaN(dateObj.getTime())) {
       return 'TBD';
     }

     return dateObj.toLocaleTimeString('en-US', {
       hour: 'numeric',
       minute: '2-digit',
       hour12: true,
       timeZoneName: 'short'
     });
   }

  /**
   * Add delay between operations
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate email template data
   */
  validateEmailData(data: EmailTemplateData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!data.recipientEmail || !this.isValidEmail(data.recipientEmail)) {
      errors.push('Invalid recipient email address');
    }
    
    if (!data.meetingTitle || data.meetingTitle.trim().length === 0) {
      errors.push('Meeting title is required');
    }
    
    if (!data.organizerName || data.organizerName.trim().length === 0) {
      errors.push('Organizer name is required');
    }
    
    if (!data.agendaContent || data.agendaContent.trim().length === 0) {
      errors.push('Agenda content is required');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Basic email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Get email sending status for tracking
   */
  async getEmailStatus(user: User, messageId: string): Promise<{ status: string; error?: string }> {
    try {
      if (!user.accessToken) {
        throw new Error('User access token is missing');
      }

      const gmail = this.getGmailClient(user.accessToken);
      
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId
      });

      return {
        status: response.data.labelIds?.includes('SENT') ? 'sent' : 'pending'
      };

    } catch (error) {
      console.error('Error checking email status:', error);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance
export const gmailService = new GmailService();