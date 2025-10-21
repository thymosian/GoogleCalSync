import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Send, X, Sparkles, Lightbulb, Calendar, 
  MessageCircle, Clock, Users, Zap, ArrowUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AIAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
}

const quickPrompts = [
  {
    category: "Meeting",
    icon: Calendar,
    prompts: [
      "Schedule a team standup for tomorrow at 9 AM",
      "Find free time for a 1-hour client meeting this week",
      "Create a quarterly review meeting with stakeholders",
      "Set up a recurring weekly sync with my manager"
    ]
  },
  {
    category: "Planning",
    icon: Clock,
    prompts: [
      "What's my schedule for today?",
      "Show me all meetings with Sarah this month",
      "Find gaps in my schedule for deep work",
      "When is my next free 2-hour block?"
    ]
  },
  {
    category: "Smart Actions",
    icon: Zap,
    prompts: [
      "Generate an agenda for tomorrow's product review",
      "Reschedule conflicting meetings automatically",
      "Suggest optimal meeting times for the team",
      "Create a project timeline with milestones"
    ]
  }
];

export function AIAssistantPanel({
  isOpen,
  onClose,
  onSendMessage,
  isLoading = false
}: AIAssistantPanelProps) {
  const [message, setMessage] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = () => {
    if (message.trim() && !isLoading) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handlePromptClick = (prompt: string) => {
    setMessage(prompt);
    textareaRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: '100%', scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: '100%', scale: 0.95 }}
            transition={{ 
              type: "spring", 
              stiffness: 400, 
              damping: 30,
              mass: 0.8
            }}
            className="fixed bottom-6 left-1/2 transform -translate-x-1/2 w-full max-w-4xl mx-auto z-50 ai-panel-enter"
          >
            <div className="glass-effect rounded-3xl border border-border/20 premium-shadow-elevated overflow-hidden">
              {/* Header */}
              <div className="p-6 border-b border-border/20 bg-gradient-to-r from-background to-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 muted-gradient-primary rounded-2xl flex items-center justify-center premium-shadow-subtle">
                      <Bot className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-serif font-bold text-xl text-foreground">
                          AI Assistant
                        </h2>
                        <Sparkles className="h-4 w-4 text-accent animate-pulse" />
                      </div>
                      <p className="text-sm text-muted-foreground font-mono">
                        Your intelligent calendar companion
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="rounded-full hover:bg-muted/50"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Quick Prompts */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-accent" />
                    <h3 className="font-semibold text-foreground">Quick Actions</h3>
                  </div>

                  {/* Category Tabs */}
                  <div className="flex gap-2 bg-muted rounded-xl p-2">
                    {quickPrompts.map((category, index) => (
                      <button
                        key={category.category}
                        onClick={() => setSelectedCategory(index)}
                        className={`flex-1 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          selectedCategory === index
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <category.icon className="h-4 w-4" />
                        {category.category}
                      </button>
                    ))}
                  </div>

                  {/* Prompts Grid */}
                  <motion.div
                    key={selectedCategory}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-2 gap-3"
                  >
                    {quickPrompts[selectedCategory].prompts.map((prompt, index) => (
                      <motion.button
                        key={prompt}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => handlePromptClick(prompt)}
                        className="text-left p-4 bg-card border border-border/20 rounded-xl hover:border-accent/30 hover:bg-accent/5 transition-all group"
                      >
                        <p className="text-sm text-foreground group-hover:text-accent-foreground">
                          {prompt}
                        </p>
                      </motion.button>
                    ))}
                  </motion.div>
                </div>

                {/* Message Input */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-accent" />
                    <h3 className="font-semibold text-foreground">Custom Request</h3>
                  </div>

                  <div className="relative">
                    <Textarea
                      ref={textareaRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Ask me anything about your calendar, scheduling, or meeting management..."
                      className="resize-none pr-12 min-h-[100px] border-border/20 focus:border-accent/50 glass-effect"
                      disabled={isLoading}
                    />
                    
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={!message.trim() || isLoading}
                      className="absolute bottom-3 right-3 rounded-full muted-gradient-primary text-primary-foreground hover-lift-subtle btn-bounce"
                    >
                      {isLoading ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <Bot className="h-4 w-4" />
                        </motion.div>
                      ) : (
                        <ArrowUp className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Press Enter to send, Shift+Enter for new line</span>
                    <Badge variant="secondary" className="font-mono">
                      {message.length}/500
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}