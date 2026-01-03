'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Message, MessageWithId } from '@/types/messages';

const MAX_MESSAGES = 50;

interface MessageContextType {
  messages: MessageWithId[];
  addMessage: ({ message, consoleLog }: { message: Message, consoleLog?: boolean }) => void;
  dismissMessage: (id: string) => void;
  clearMessages: () => void;
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);

export function MessagesProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<MessageWithId[]>([]);

  const addMessage = useCallback((
    { message, consoleLog = true }: { message: Message, consoleLog?: boolean }
  ) => {
    const newMessage: MessageWithId = {
      ...message,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
    };
    setMessages(prev => {
      const updated = [...prev, newMessage];
      // Keep only the last MAX_MESSAGES (remove oldest from the beginning)
      if (updated.length > MAX_MESSAGES) {
        return updated.slice(-MAX_MESSAGES);
      }
      return updated;
    });
    if (consoleLog) {
      switch (message.type) {
        case 'info':
        case 'success':
          console.log(`[${message.type}]: ${message.text}`);
          break;
        case 'error':
          console.error(`[${message.type}]: ${message.text}`);
          break;
        default:
          break;
      }
    }
  }, []);

  const dismissMessage = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return (
    <MessageContext.Provider value={{ messages, addMessage, dismissMessage, clearMessages }}>
      {children}
    </MessageContext.Provider>
  );
}

// Custom hook for easy access
export function useMessages() {
  const context = useContext(MessageContext);
  if (context === undefined) {
    throw new Error('useMessages must be used within a MessageProvider');
  }
  return context;
}
