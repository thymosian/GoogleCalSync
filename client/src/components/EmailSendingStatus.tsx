import React from 'react';
import { Mail, CheckCircle, AlertCircle, Loader2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface EmailSendingStatusProps {
  status: 'idle' | 'sending' | 'completed' | 'failed' | 'partial';
  progress?: number;
  sent?: number;
  total?: number;
  failed?: number;
  errors?: string[];
  onRetry?: () => void;
}

export function EmailSendingStatus({
  status,
  progress = 0,
  sent = 0,
  total = 0,
  failed = 0,
  errors = [],
  onRetry
}: EmailSendingStatusProps) {
  if (status === 'idle') {
    return null;
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'sending':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'partial':
        return <AlertCircle className="h-5 w-5 text-amber-500" />;
      default:
        return <Mail className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'sending':
        return 'Sending Agenda Emails...';
      case 'completed':
        return 'Agenda Emails Sent Successfully';
      case 'failed':
        return 'Failed to Send Emails';
      case 'partial':
        return 'Some Emails Failed to Send';
      default:
        return 'Email Status';
    }
  };

  const getStatusDescription = () => {
    switch (status) {
      case 'sending':
        return `Sending to ${total} attendee${total !== 1 ? 's' : ''}... (${progress}% complete)`;
      case 'completed':
        return `All ${total} attendee${total !== 1 ? 's' : ''} have been notified about the agenda.`;
      case 'failed':
        return `Failed to send emails to ${total} attendee${total !== 1 ? 's' : ''}. Please try again.`;
      case 'partial':
        return `Successfully sent to ${sent} of ${total} attendees. ${failed} email${failed !== 1 ? 's' : ''} failed.`;
      default:
        return '';
    }
  };

  return (
    <Card className="w-full max-w-md border-2 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {getStatusIcon()}
          {getStatusTitle()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {getStatusDescription()}
        </p>

        {status === 'sending' && (
          <>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              {sent} of {total} emails sent
            </p>
          </>
        )}

        {(status === 'partial' || status === 'failed') && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground space-y-1">
              {failed > 0 && (
                <p className="flex justify-between">
                  <span>Failed emails:</span>
                  <span className="font-semibold text-red-500">{failed}</span>
                </p>
              )}
              {sent > 0 && (
                <p className="flex justify-between">
                  <span>Sent emails:</span>
                  <span className="font-semibold text-green-500">{sent}</span>
                </p>
              )}
            </div>

            {errors && errors.length > 0 && (
              <div className="mt-3 p-2 bg-red-50 rounded border border-red-200">
                <p className="text-xs font-semibold text-red-700 mb-1">Errors:</p>
                <ul className="text-xs text-red-600 space-y-1">
                  {errors.slice(0, 3).map((error, idx) => (
                    <li key={idx} className="break-words">
                      • {error}
                    </li>
                  ))}
                  {errors.length > 3 && (
                    <li className="text-red-600">• ... and {errors.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}

            {onRetry && status === 'failed' && (
              <button
                onClick={onRetry}
                className="w-full mt-3 px-3 py-2 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
              >
                Retry Sending
              </button>
            )}
          </div>
        )}

        {status === 'completed' && (
          <div className="flex justify-center">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              ✓ All attendees notified
            </Badge>
          </div>
        )}

        {status === 'sending' && (
          <div className="text-xs text-muted-foreground text-center italic">
            Please wait while we send the agenda to all attendees...
          </div>
        )}
      </CardContent>
    </Card>
  );
}