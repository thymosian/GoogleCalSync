import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EnhancedChatInterface } from '@/components/EnhancedChatInterface';

interface AIAssistantToggleProps {
  onAIPrompt?: (prompt: string) => void;
  chatMessages: any[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  activeUIBlock?: any;
  onTypeSelect?: (type: 'physical' | 'online', meetingId: string, location?: string) => void;
  onAttendeesUpdate?: (attendees: any[], meetingId: string) => void;
  onContinue?: (meetingId: string) => void;
  onApprove?: (meetingId: string) => void;
}

export function AIAssistantToggle({
  onAIPrompt,
  chatMessages,
  onSendMessage,
  isLoading,
  activeUIBlock,
  onTypeSelect,
  onAttendeesUpdate,
  onContinue,
  onApprove
}: AIAssistantToggleProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleAssistant = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      {/* Toggle Button */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, type: "spring", bounce: 0.3 }}
        className="fixed bottom-6 right-6 z-50"
      >
        <motion.button
          onClick={toggleAssistant}
          className={`w-14 h-14 rounded-full shadow-lg border border-border/20 transition-all duration-300 flex items-center justify-center ${
            isOpen 
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' 
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          animate={{ 
            rotate: isOpen ? 180 : 0,
            transition: { duration: 0.3 }
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={isOpen ? 'close' : 'bot'}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ duration: 0.2 }}
            >
              {isOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Bot className="h-6 w-6" />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.button>

        {/* Notification Badge */}
        <AnimatePresence>
          {!isOpen && chatMessages.length > 1 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 text-white text-xs rounded-full flex items-center justify-center font-semibold"
            >
              {Math.min(chatMessages.length - 1, 9)}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 400, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 400, scale: 0.8 }}
            transition={{ 
              type: "spring", 
              bounce: 0.2, 
              duration: 0.5 
            }}
            className="fixed bottom-24 right-6 w-96 h-[32rem] z-50"
          >
            <div className="w-full h-full bg-card/95 backdrop-blur-lg rounded-2xl border border-border/20 shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="bg-primary text-primary-foreground p-4 border-b border-border/20">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary-foreground/20 rounded-full flex items-center justify-center">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-sm">CalAI Assistant</h3>
                    <p className="text-xs opacity-80">Always here to help</p>
                  </div>
                </div>
              </div>

              {/* Chat Interface */}
              <div className="h-[calc(100%-5rem)]">
                <EnhancedChatInterface
                  messages={chatMessages}
                  onSendMessage={onSendMessage}
                  isLoading={isLoading}
                  activeUIBlock={activeUIBlock}
                  onTypeSelect={onTypeSelect}
                  onAttendeesUpdate={onAttendeesUpdate}
                  onContinue={onContinue}
                  onApprove={onApprove}
                  compact={true}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}