import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, User, Sparkles, MessageCircle, Clock, 
  ArrowUp, MoreHorizontal, Copy, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { EnhancedChatMessage as ChatMessage } from '../../../shared/schema';
import { ConversationalMeetingUIBlock } from './ConversationalMeetingUIBlocks';
import { AttendeeData } from '../../../shared/schema';

interface EnhancedChatInterfaceProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  userName?: string;
  userAvatar?: string;
  onOpenAIPanel?: () => void;
  onSendMessage?: (message: string) => void;
  compact?: boolean;
  activeUIBlock?: any;
  // Conversational UI block handlers
  onTypeSelect?: (type: 'physical' | 'online', meetingId: string, location?: string) => void;
  onAttendeesUpdate?: (attendees: AttendeeData[], meetingId: string) => void;
  onContinue?: (meetingId: string) => void;
  onApprove?: (meetingId: string) => void;
  onEdit?: (field: string, meetingId: string) => void;
  onAgendaUpdate?: (agenda: string, meetingId: string) => void;
  onAgendaApprove?: (agenda: string, meetingId: string) => void;
  onAgendaRegenerate?: (meetingId: string) => void;
}

export function EnhancedChatInterface({
  messages,
  isLoading = false,
  userName,
  userAvatar,
  onOpenAIPanel,
  onSendMessage,
  compact = false,
  activeUIBlock,
  onTypeSelect,
  onAttendeesUpdate,
  onContinue,
  onApprove,
  onEdit,
  onAgendaUpdate,
  onAgendaApprove,
  onAgendaRegenerate
}: EnhancedChatInterfaceProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputMessage, setInputMessage] = useState('');

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const formatMessageTime = (date: Date) => {
    const now = new Date();
    const messageDate = new Date(date);
    
    if (now.toDateString() === messageDate.toDateString()) {
      return format(messageDate, 'HH:mm');
    } else {
      return format(messageDate, 'MMM d, HH:mm');
    }
  };

  const handleSendMessage = () => {
    if (inputMessage.trim() && onSendMessage) {
      onSendMessage(inputMessage.trim());
      setInputMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const MessageBubble = ({ message, isUser }: { message: ChatMessage; isUser: boolean }) => (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={`flex gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        <Avatar className={`${compact ? 'h-8 w-8' : 'h-10 w-10'} ring-2 ring-border`}>
          {isUser ? (
            <AvatarImage src={userAvatar} />
          ) : (
            <div className="w-full h-full muted-gradient-primary flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
          )}
          <AvatarFallback className={isUser ? 'bg-muted' : 'muted-gradient-primary text-primary-foreground'}>
            {isUser ? (userName?.charAt(0) || 'U') : 'AI'}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[80%] ${isUser ? 'text-right' : 'text-left'}`}>
        <div className="flex items-center gap-2 mb-2">
          {!isUser && (
            <div className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-accent" />
              <span className="text-xs font-medium text-accent">CalAI Assistant</span>
            </div>
          )}
          <span className="text-xs text-muted-foreground font-mono">
            {formatMessageTime(message.timestamp)}
          </span>
        </div>

        <Card className={`${
          isUser 
            ? 'bg-primary text-primary-foreground border-primary/20' 
            : 'glass-effect border-border/20'
        } card-transition overflow-hidden`}>
          <CardContent className={compact ? "p-3" : "p-4"}>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <p className="mb-0 whitespace-pre-wrap leading-relaxed">
                {message.content}
              </p>
            </div>

            {/* UI Blocks for conversational flow */}
            {message.uiBlock && !isUser && (
              <div className="mt-4 pt-4 border-t border-border/20">
                <ConversationalMeetingUIBlock
                  uiBlock={message.uiBlock}
                  onTypeSelect={onTypeSelect}
                  onAttendeesUpdate={onAttendeesUpdate}
                  onContinue={onContinue}
                  onApprove={onApprove}
                  onEdit={onEdit}
                  onAgendaUpdate={onAgendaUpdate}
                  onAgendaApprove={onAgendaApprove}
                  onAgendaRegenerate={onAgendaRegenerate}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Message Actions */}
        <div className={`flex items-center gap-2 mt-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(message.content)}
            className="h-6 px-2 text-xs opacity-60 hover:opacity-100"
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs opacity-60 hover:opacity-100"
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      {!compact && (
        <div className="p-6 border-b border-border/20 glass-effect">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 muted-gradient-primary rounded-2xl flex items-center justify-center premium-shadow-subtle">
                <MessageCircle className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h2 className="font-serif font-bold text-xl text-foreground">
                  Chat with CalAI
                </h2>
                <p className="text-sm text-muted-foreground font-mono">
                  Your intelligent scheduling assistant
                </p>
              </div>
            </div>

            {messages.length > 0 && (
              <Badge variant="secondary" className="font-mono">
                {messages.length} messages
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <ScrollArea ref={scrollAreaRef} className={`flex-1 ${compact ? 'p-3' : 'p-6'}`}>
        <div className="space-y-8">
          {messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-16"
            >
              <div className="w-20 h-20 muted-gradient-primary rounded-full flex items-center justify-center mx-auto mb-6 premium-shadow-subtle">
                <Bot className="h-10 w-10 text-primary-foreground" />
              </div>
              <h3 className="font-serif font-semibold text-lg text-foreground mb-2">
                Welcome to CalAI
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                I'm here to help you manage your calendar, schedule meetings, and optimize your time.
                Click the assistant button below to get started!
              </p>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isUser={message.role === 'user'}
                />
              ))}
            </AnimatePresence>
          )}

          {/* Loading indicator */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4"
            >
              <div className="flex-shrink-0">
                <Avatar className="h-10 w-10 ring-2 ring-border">
                  <div className="w-full h-full muted-gradient-primary flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    >
                      <Bot className="h-5 w-5 text-primary-foreground" />
                    </motion.div>
                  </div>
                </Avatar>
              </div>
              <div className="flex-1 max-w-[80%]">
                <div className="flex items-center gap-1 mb-2">
                  <Sparkles className="h-3 w-3 text-accent" />
                  <span className="text-xs font-medium text-accent">CalAI is thinking...</span>
                </div>
                <Card className="glass-effect border-border/20">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="w-2 h-2 bg-accent rounded-full"
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              delay: i * 0.2
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-muted-foreground">Processing your request</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-border/20">
        {compact ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="flex-1 px-3 py-2 bg-muted/50 border border-border/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
              disabled={isLoading}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              size="sm"
              className="px-3"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <motion.div
              className="flex justify-center"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                onClick={onOpenAIPanel}
                className="muted-gradient-primary text-primary-foreground px-8 py-4 rounded-full font-semibold flex items-center gap-3 premium-shadow-elevated hover-lift-subtle btn-bounce"
                size="lg"
              >
                <Bot className="h-5 w-5" />
                Ask CalAI Assistant
                <motion.div
                  animate={{ y: [-2, 2, -2] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ArrowUp className="h-4 w-4" />
                </motion.div>
              </Button>
            </motion.div>
            
            <p className="text-center text-xs text-muted-foreground mt-3 font-mono">
              Click to open the AI assistant panel with quick actions and custom requests
            </p>
          </>
        )}
      </div>
    </div>
  );
}