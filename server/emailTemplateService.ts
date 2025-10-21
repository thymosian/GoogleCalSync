import { MeetingData } from '../shared/schema.js';

export interface EmailTemplateConfig {
  brandColor?: string;
  companyName?: string;
  supportEmail?: string;
}

export class EmailTemplateService {
  private config: EmailTemplateConfig;

  constructor(config: EmailTemplateConfig = {}) {
    this.config = {
      brandColor: '#4F46E5',
      companyName: 'GoogleCalSync',
      supportEmail: 'support@googlecalsync.com',
      ...config
    };
  }

  /**
   * Generate HTML email template for meeting agenda
   */
  generateAgendaEmailTemplate(
    agenda: string,
    meetingData: Partial<MeetingData>,
    recipientEmail?: string
  ): string {
    const startTime = meetingData.startTime ? new Date(meetingData.startTime) : new Date();
    const endTime = meetingData.endTime ? new Date(meetingData.endTime) : new Date(startTime.getTime() + 60 * 60 * 1000);
    
    const formattedDate = startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const formattedStartTime = startTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    const formattedEndTime = endTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    const agendaHtml = this.formatAgendaForHtml(agenda);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Meeting Agenda: ${meetingData.title || 'Upcoming Meeting'}</title>
        <style>
          /* Email styles */
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f9f9f9;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, ${this.config.brandColor} 0%, ${this.adjustColor(this.config.brandColor!, 20)} 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .header p {
            margin: 5px 0 0;
            opacity: 0.9;
            font-size: 14px;
          }
          .content {
            padding: 30px;
          }
          .meeting-details {
            background-color: #f5f7ff;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 25px;
            border-left: 4px solid ${this.config.brandColor};
          }
          .meeting-details-row {
            display: flex;
            padding: 8px 0;
            border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          }
          .meeting-details-row:last-child {
            border-bottom: none;
          }
          .meeting-details-label {
            font-weight: 600;
            width: 120px;
            color: #4F46E5;
            flex-shrink: 0;
          }
          .meeting-details-value {
            color: #333;
            flex: 1;
          }
          .agenda-section {
            background-color: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 20px;
            margin-top: 20px;
          }
          .agenda-section h2 {
            margin-top: 0;
            color: ${this.config.brandColor};
            font-size: 18px;
            border-bottom: 2px solid ${this.config.brandColor};
            padding-bottom: 10px;
          }
          .agenda-content {
            margin-top: 15px;
            line-height: 1.8;
          }
          .agenda-content h3 {
            color: #4F46E5;
            font-size: 14px;
            margin-top: 15px;
            margin-bottom: 5px;
          }
          .agenda-content ul,
          .agenda-content ol {
            margin: 10px 0;
            padding-left: 20px;
          }
          .agenda-content li {
            margin: 5px 0;
          }
          .cta-section {
            margin-top: 25px;
            text-align: center;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
          }
          .button {
            display: inline-block;
            background-color: ${this.config.brandColor};
            color: white;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 4px;
            font-weight: 500;
            transition: background-color 0.3s;
          }
          .button:hover {
            background-color: ${this.adjustColor(this.config.brandColor!, -10)};
          }
          .footer {
            background-color: #f9fafb;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #6b7280;
            border-top: 1px solid #e5e7eb;
          }
          .footer a {
            color: ${this.config.brandColor};
            text-decoration: none;
          }
          .footer a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${meetingData.title || 'Meeting Agenda'}</h1>
            <p>Meeting Information & Agenda</p>
          </div>
          
          <div class="content">
            <div class="meeting-details">
              <div class="meeting-details-row">
                <span class="meeting-details-label">📅 Date:</span>
                <span class="meeting-details-value">${formattedDate}</span>
              </div>
              <div class="meeting-details-row">
                <span class="meeting-details-label">🕐 Time:</span>
                <span class="meeting-details-value">${formattedStartTime} - ${formattedEndTime}</span>
              </div>
              ${meetingData.type ? `
              <div class="meeting-details-row">
                <span class="meeting-details-label">📍 Type:</span>
                <span class="meeting-details-value">${meetingData.type === 'online' ? 'Online Meeting' : 'Physical Meeting'}</span>
              </div>
              ` : ''}
              ${meetingData.location ? `
              <div class="meeting-details-row">
                <span class="meeting-details-label">📌 Location:</span>
                <span class="meeting-details-value">${meetingData.location}</span>
              </div>
              ` : ''}
              ${meetingData.meetingLink ? `
              <div class="meeting-details-row">
                <span class="meeting-details-label">🔗 Link:</span>
                <span class="meeting-details-value"><a href="${meetingData.meetingLink}" style="color: ${this.config.brandColor}; text-decoration: none;">${meetingData.meetingLink}</a></span>
              </div>
              ` : ''}
            </div>

            <div class="agenda-section">
              <h2>📋 Meeting Agenda</h2>
              <div class="agenda-content">
                ${agendaHtml}
              </div>
            </div>

            <div class="cta-section">
              <p style="margin-bottom: 15px; color: #666;">Please review the agenda before the meeting and come prepared to discuss the items listed above.</p>
            </div>
          </div>

          <div class="footer">
            <p style="margin: 0 0 10px;">This email was sent by ${this.config.companyName}</p>
            <p style="margin: 0;">For support, contact <a href="mailto:${this.config.supportEmail}">${this.config.supportEmail}</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate plain text version of agenda email
   */
  generateAgendaEmailPlainText(
    agenda: string,
    meetingData: Partial<MeetingData>
  ): string {
    const startTime = meetingData.startTime ? new Date(meetingData.startTime) : new Date();
    const endTime = meetingData.endTime ? new Date(meetingData.endTime) : new Date(startTime.getTime() + 60 * 60 * 1000);
    
    const formattedDate = startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const formattedStartTime = startTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    const formattedEndTime = endTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    let text = `${meetingData.title || 'Meeting Agenda'}\n`;
    text += `${'='.repeat(50)}\n\n`;
    
    text += `Meeting Information:\n`;
    text += `${'-'.repeat(50)}\n`;
    text += `Date: ${formattedDate}\n`;
    text += `Time: ${formattedStartTime} - ${formattedEndTime}\n`;
    
    if (meetingData.type) {
      text += `Type: ${meetingData.type === 'online' ? 'Online Meeting' : 'Physical Meeting'}\n`;
    }
    
    if (meetingData.location) {
      text += `Location: ${meetingData.location}\n`;
    }
    
    if (meetingData.meetingLink) {
      text += `Meeting Link: ${meetingData.meetingLink}\n`;
    }
    
    text += `\n\nAgenda:\n`;
    text += `${'-'.repeat(50)}\n`;
    text += `${agenda}\n`;
    
    text += `\n${'='.repeat(50)}\n`;
    text += `Please review the agenda before the meeting and come prepared to discuss.\n`;
    text += `\nGenerated by ${this.config.companyName}`;
    
    return text;
  }

  /**
   * Format agenda markdown to HTML
   */
  private formatAgendaForHtml(agenda: string): string {
    let html = agenda;
    
    // Convert markdown bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Convert markdown italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Convert headers
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
    
    // Convert lists
    const lines = html.split('\n');
    let inList = false;
    const processedLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Unordered lists
      if (line.match(/^[-*+] /)) {
        if (!inList) {
          processedLines.push('<ul>');
          inList = true;
        }
        processedLines.push(`<li>${line.replace(/^[-*+] /, '')}</li>`);
      }
      // Ordered lists
      else if (line.match(/^\d+\. /)) {
        if (!inList) {
          processedLines.push('<ol>');
          inList = true;
        }
        processedLines.push(`<li>${line.replace(/^\d+\. /, '')}</li>`);
      }
      else {
        if (inList) {
          processedLines.push(inList ? '</ul>' : '</ol>');
          inList = false;
        }
        if (line.trim()) {
          processedLines.push(`<p>${line}</p>`);
        }
      }
    }
    
    if (inList) {
      processedLines.push('</ul>');
    }
    
    // Convert line breaks
    html = processedLines.join('\n');
    html = html.replace(/\n/g, '<br>');
    
    return html;
  }

  /**
   * Adjust color brightness
   */
  private adjustColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255))
      .toString(16).slice(1);
  }
}

// Export singleton instance
export const emailTemplateService = new EmailTemplateService();