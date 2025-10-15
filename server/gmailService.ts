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

      // Generate email content
      const emailContent = this.generateEmailContent(templateData);
      
      // Create email message
      const emailMessage = this.createEmailMessage(
        user.email ?? '',
        attendee.email,
        `Meeting Agenda: ${templateData.meetingTitle}`,
        emailContent
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
   * Generate personalized email content
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

    let emailBody = `Hi ${recipientFirstName},\n\n`;
    
    emailBody += `I hope this email finds you well. I'm writing to share the agenda for our upcoming meeting.\n\n`;
    
    // Meeting details section
    emailBody += `📅 **Meeting Details:**\n`;
    emailBody += `• **Title:** ${meetingTitle}\n`;
    emailBody += `• **Date:** ${meetingDate}\n`;
    emailBody += `• **Time:** ${meetingTime}\n`;
    emailBody += `• **Duration:** ${meetingDuration}\n`;
    emailBody += `• **Type:** ${meetingType === 'online' ? 'Online Meeting' : 'In-Person Meeting'}\n`;
    
    if (meetingType === 'online' && meetingLink) {
      emailBody += `• **Meeting Link:** ${meetingLink}\n`;
    } else if (meetingType === 'physical' && meetingLocation) {
      emailBody += `• **Location:** ${meetingLocation}\n`;
    }
    
    emailBody += `\n`;
    
    // Agenda section
    emailBody += `📋 **Meeting Agenda:**\n\n`;
    emailBody += agendaContent;
    emailBody += `\n`;
    
    // Preparation notes
    emailBody += `📝 **Please come prepared to:**\n`;
    emailBody += `• Review the agenda items above\n`;
    emailBody += `• Bring any relevant materials or updates\n`;
    emailBody += `• Be ready to participate in discussions\n\n`;
    
    // Closing
    emailBody += `If you have any questions or need to discuss anything before the meeting, please don't hesitate to reach out.\n\n`;
    emailBody += `Looking forward to our productive discussion!\n\n`;
    emailBody += `Best regards,\n`;
    emailBody += `${organizerName}`;

    return emailBody;
  }

  /**
   * Format agenda content for email
   */
  private formatAgendaForEmail(agendaContent: AgendaContent): string {
    let formatted = '';
    
    // Add agenda topics
    if (agendaContent.topics.length > 0) {
      agendaContent.topics.forEach((topic, index) => {
        formatted += `${index + 1}. **${topic.title}** (${topic.duration} min)\n`;
        if (topic.description) {
          formatted += `   ${topic.description}\n`;
        }
        if (topic.presenter) {
          formatted += `   *Presenter: ${topic.presenter}*\n`;
        }
        formatted += '\n';
      });
    }
    
    // Add action items if any
    if (agendaContent.actionItems.length > 0) {
      formatted += `**Action Items to Discuss:**\n`;
      agendaContent.actionItems.forEach((item, index) => {
        formatted += `${index + 1}. ${item.task}`;
        if (item.assignee) {
          formatted += ` (${item.assignee})`;
        }
        if (item.deadline) {
          formatted += ` - Due: ${item.deadline}`;
        }
        formatted += ` [${item.priority.toUpperCase()}]\n`;
      });
    }
    
    return formatted;
  }

  /**
   * Create base64 encoded email message for Gmail API
   */
  private createEmailMessage(
    from: string,
    to: string,
    subject: string,
    body: string
  ): string {
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

  /**
   * Format date for email display
   */
  private formatDate(date: Date): string {
    if (!date) return 'TBD';
    
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Format time for email display
   */
  private formatTime(date: Date): string {
    if (!date) return 'TBD';
    
    return date.toLocaleTimeString('en-US', {
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