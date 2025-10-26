import React from 'react';

interface AgendaPreviewProps {
  agendaContent: string;
  meetingData: any;
}

export function AgendaPreview({ agendaContent, meetingData }: AgendaPreviewProps) {
  // Format date and time to match email template
  const formatDate = (date: Date | string | undefined): string => {
    if (!date) return 'TBD';

    const dateObj = typeof date === 'string' ? new Date(date) : date;

    if (isNaN(dateObj.getTime())) {
      return 'TBD';
    }

    return dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (date: Date | string | undefined): string => {
    if (!date) return 'TBD';

    const dateObj = typeof date === 'string' ? new Date(date) : date;

    if (isNaN(dateObj.getTime())) {
      return 'TBD';
    }

    return dateObj.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });
  };

  const formattedDate = formatDate(meetingData.startTime);
  const formattedTime = formatTime(meetingData.startTime);
  const meetingType = meetingData.type === 'online' ? 'Online Meeting' : 'In-Person Meeting';

  // Format agenda content to match the exact email template format
  const formatAgendaForEmail = (agenda: string): string => {
    let formatted = '';

    // Add agenda topics with improved styling (matching gmailService.ts)
    if (agenda && agenda.trim().length > 0) {
      formatted += '<div style="margin-bottom: 1.5rem;">';
      formatted += '<h3 style="margin: 0 0 1rem 0; color: #111827; font-weight: 600; font-size: 1.125rem;">Agenda Topics</h3>';
      formatted += '<ol style="list-style-position: inside; padding-left: 0; margin: 0;">';

      // Split agenda into topics (assuming each line or section is a topic)
      const topics = agenda.split('\n').filter(line => line.trim().length > 0);

      topics.forEach((topic, index) => {
        const cleanTopic = topic.replace(/^[-\*\+]\s*/, '').replace(/^\d+\.\s*/, '');
        if (cleanTopic.trim()) {
          formatted += `<li style="margin-bottom: 1rem; padding: 0.75rem; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 0.375rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);">
            <div style="font-weight: 600; font-size: 1.125rem; color: #111827; margin-bottom: 0.5rem;">${cleanTopic}</div>
            <div style="display: inline-block; background-color: #e5e7eb; color: #4b5563; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; margin-right: 0.5rem;">15 min</div>
          </li>`;
        }
      });

      formatted += '</ol>';
      formatted += '</div>';
    }

    return formatted;
  };

  const formattedAgendaContent = formatAgendaForEmail(agendaContent);

  return (
    <div style={{
      fontFamily: 'Arial, sans-serif',
      lineHeight: '1.6',
      color: '#333',
      maxWidth: '600px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: '#f5f5f5',
        padding: '20px',
        borderRadius: '5px',
        marginBottom: '20px'
      }}>
        <h1 style={{
          color: '#4285f4',
          fontSize: '24px',
          margin: '0'
        }}>
          {meetingData.title}
        </h1>
        <p style={{ margin: '10px 0 0 0' }}>Hello there,</p>
        <p style={{ margin: '10px 0 0 0' }}>
          I hope this email finds you well. I'm writing to share the agenda for our upcoming meeting.
        </p>
      </div>

      {/* Meeting Details */}
      <div style={{
        backgroundColor: '#f9f9f9',
        padding: '15px',
        borderLeft: '4px solid #4285f4',
        marginBottom: '20px'
      }}>
        <h2 style={{
          color: '#4285f4',
          fontSize: '20px',
          margin: '0 0 15px 0'
        }}>
          📅 Meeting Details
        </h2>
        <p style={{ margin: '5px 0' }}><strong>Date:</strong> {formattedDate}</p>
        <p style={{ margin: '5px 0' }}><strong>Time:</strong> {formattedTime}</p>
        <p style={{ margin: '5px 0' }}><strong>Duration:</strong> 60 minutes</p>
        <p style={{ margin: '5px 0' }}><strong>Type:</strong> {meetingType}</p>
        {meetingData.meetingLink && (
          <>
            <p style={{ margin: '5px 0' }}>
              <strong>Meeting Link:</strong>{' '}
              <a href={meetingData.meetingLink} style={{
                color: '#4285f4',
                textDecoration: 'none'
              }}>
                {meetingData.meetingLink}
              </a>
            </p>
            <a href={meetingData.meetingLink} style={{
              display: 'inline-block',
              backgroundColor: '#4285f4',
              color: 'white',
              padding: '10px 20px',
              textDecoration: 'none',
              borderRadius: '4px',
              marginTop: '10px'
            }}>
              Join Meeting
            </a>
          </>
        )}
      </div>

      {/* Agenda Section */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{
          color: '#4285f4',
          fontSize: '20px',
          margin: '0 0 15px 0'
        }}>
          📋 Meeting Agenda
        </h2>
        <div dangerouslySetInnerHTML={{ __html: formattedAgendaContent }} />
      </div>

      {/* Preparation Section */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{
          color: '#5f6368',
          fontSize: '16px',
          margin: '0 0 10px 0'
        }}>
          📝 Please come prepared to:
        </h3>
        <ul style={{ paddingLeft: '20px', margin: '0' }}>
          <li style={{ marginBottom: '5px' }}>Review the agenda items above</li>
          <li style={{ marginBottom: '5px' }}>Bring any relevant materials or updates</li>
          <li style={{ marginBottom: '5px' }}>Be ready to participate in discussions</li>
        </ul>
      </div>

      {/* Footer */}
      <div style={{
        fontSize: '0.9em',
        color: '#666',
        marginTop: '30px',
        paddingTop: '10px',
        borderTop: '1px solid #eee'
      }}>
        <p style={{ margin: '5px 0' }}>
          If you have any questions or need to discuss anything before the meeting, please don't hesitate to reach out.
        </p>
        <p style={{ margin: '5px 0' }}>
          Looking forward to our productive discussion!
        </p>
        <p style={{ margin: '5px 0' }}>
          Best regards,<br />
          Meeting Organizer
        </p>
      </div>
    </div>
  );
}