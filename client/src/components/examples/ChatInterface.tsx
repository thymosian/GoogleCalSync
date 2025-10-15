import { ChatInterface } from '../ChatInterface';
import { useState } from 'react';

//todo: remove mock functionality  
const mockMessages = [
  {
    id: '1',
    role: 'user' as const,
    content: 'Can you schedule a meeting with the design team for next Tuesday?',
    timestamp: new Date(Date.now() - 10 * 60 * 1000)
  },
  {
    id: '2', 
    role: 'assistant' as const,
    content: 'I\'d be happy to help you schedule a meeting with the design team! I found a few available time slots on Tuesday:\n\n• 10:00 AM - 11:00 AM\n• 2:00 PM - 3:00 PM  \n• 4:00 PM - 5:00 PM\n\nWhich time works best for you? Also, should I include a meeting link and send calendar invites to the team?',
    timestamp: new Date(Date.now() - 9 * 60 * 1000)
  },
  {
    id: '3',
    role: 'user' as const, 
    content: '2:00 PM works great. Please include a Google Meet link and invite sarah@company.com and mike@company.com',
    timestamp: new Date(Date.now() - 5 * 60 * 1000)
  }
];

export default function ChatInterfaceExample() {
  const [messages, setMessages] = useState(mockMessages);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = (message: string) => {
    const newMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: message,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);
    setIsLoading(true);
    
    // Simulate AI response
    setTimeout(() => {
      const aiResponse = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: 'Perfect! I\'ve scheduled your meeting for Tuesday at 2:00 PM with the design team. A Google Meet link has been created and calendar invites have been sent to sarah@company.com and mike@company.com. The meeting is titled "Design Team Sync" - would you like me to generate an agenda as well?',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsLoading(false);
    }, 2000);
  };

  return (
    <div className="h-[600px] w-[500px]">
      <ChatInterface
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        userName="Alex"
      />
    </div>
  );
}