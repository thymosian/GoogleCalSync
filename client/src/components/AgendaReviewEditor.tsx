import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Video, Users, Calendar, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface AgendaReviewEditorProps {
  meetingData: any;
  initialAgenda: string;
  onSave: (htmlAgenda: string) => void;
  onCancel: () => void;
  isSending: boolean;
}

const AgendaReviewEditor: React.FC<AgendaReviewEditorProps> = ({
  meetingData,
  initialAgenda,
  onSave,
  onCancel,
  isSending
}) => {
  const [editedAgenda, setEditedAgenda] = useState(initialAgenda);

  const handleSave = () => {
    onSave(editedAgenda);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto shadow-xl border-0 bg-gradient-to-br from-emerald-50/50 to-green-50/50 dark:from-emerald-900/10 dark:to-green-900/10 backdrop-blur-sm rounded-2xl overflow-hidden">
      <CardHeader className="pb-6 bg-gradient-to-r from-emerald-500/5 to-green-500/5">
        <CardTitle className="flex items-center gap-3 text-xl">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg flex items-center justify-center">
            <CheckCircle className="h-4 w-4 text-white" />
          </div>
          <span className="text-emerald-800 dark:text-emerald-200">Review Meeting Agenda</span>
        </CardTitle>
        <div className="text-sm text-emerald-600 dark:text-emerald-400 ml-11 font-medium">
          {meetingData.title} - {meetingData.startTime ? new Date(meetingData.startTime).toLocaleString() : 'Time TBD'}
        </div>
      </CardHeader>

      <CardContent className="space-y-8 p-8">
        {/* Meeting Details Summary */}
        <div className="grid gap-6 p-6 bg-gradient-to-br from-white/60 to-emerald-50/30 dark:from-white/5 dark:to-emerald-900/20 rounded-2xl border border-emerald-200/50 dark:border-emerald-700/30">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center">
              {meetingData.type === 'online' ? (
                <Video className="h-5 w-5 text-white" />
              ) : (
                <Users className="h-5 w-5 text-white" />
              )}
            </div>
            <div>
              <p className="font-bold text-emerald-800 dark:text-emerald-200 capitalize">{meetingData.type} Meeting</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                {meetingData.type === 'online' ? 'Virtual meeting with Google Meet' : 'In-person meeting'}
              </p>
            </div>
          </div>

          {meetingData.attendees && meetingData.attendees.length > 0 && (
            <div>
              <p className="font-bold mb-3 text-emerald-800 dark:text-emerald-200">Attendees ({meetingData.attendees.length})</p>
              <div className="flex flex-wrap gap-2">
                {meetingData.attendees.map((attendee: any, index: number) => (
                  <Badge key={index} className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700 rounded-lg px-3 py-1">
                    {attendee.firstName || attendee.email}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-emerald-200 to-transparent dark:via-emerald-700" />

        {/* Agenda Editor */}
        <div className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="agenda-editor" className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
              Meeting Agenda
            </Label>
            <p className="text-sm text-emerald-600 dark:text-emerald-400 leading-relaxed">
              Review and edit the generated agenda before sending to attendees.
            </p>
          </div>

          <Textarea
            id="agenda-editor"
            value={editedAgenda}
            onChange={(e) => setEditedAgenda(e.target.value)}
            placeholder="Enter meeting agenda..."
            className="min-h-[300px] font-mono text-sm bg-white/70 dark:bg-white/5 border-emerald-200 dark:border-emerald-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none p-4"
            disabled={isSending}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 pt-6 border-t border-emerald-200/50 dark:border-emerald-700/50">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isSending}
            className="px-6 py-3 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSending || !editedAgenda.trim()}
            className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white px-8 py-3 rounded-xl font-semibold shadow-lg hover:shadow-emerald-500/25 transition-all duration-300 ring-2 ring-emerald-500/20 hover:ring-emerald-500/40"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-3 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-3" />
                Confirm & Send to Attendees
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AgendaReviewEditor;