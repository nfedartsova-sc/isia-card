'use client'

import { useEffect } from 'react';
import { MessageWithId } from '@/types/messages';
import { useMessages } from '@/contexts/MessageContext';

import './styles.scss';

const NOTIFICATION_AUTO_DISMISS_MS = 5000;

// Notification toast for app-level messages
const NotificationToast = ({ 
  message, 
  onClose 
}: { 
  message: MessageWithId; 
  onClose: () => void;
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, NOTIFICATION_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`notification-toast notification-${message.type}`}>
      <span className="notification-text">{message.text}</span>
      <button 
        className="notification-close" 
        onClick={onClose}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  );
};

// Debug message list item
const DebugMessageItem = ({ message }: { message: MessageWithId }) => {
  const timestamp = new Date(message.timestamp).toLocaleTimeString();
  return (
    <li className={`debug-message debug-${message.type}`}>
      <span className="debug-timestamp">[{timestamp}]</span>
      <span className="debug-type">[{message.type.toUpperCase()}]</span>
      <span className="debug-text">{message.text}</span>
    </li>
  );
};

type MessagesDisplayProps = {
  displayDebugMessages: boolean;
}

const MessagesDisplay: React.FC<MessagesDisplayProps> = (
  { displayDebugMessages = true }: MessagesDisplayProps
) => {
  const { messages, dismissMessage } = useMessages();
  
  const appMessages = messages.filter(m => m.level === 'app');
  const debugMessages = messages.filter(m => m.level === 'debug');

  return (
    <>
      {appMessages.length > 0 && (
        <div className="notifications-container">
          {appMessages.map((msg) => (
            <NotificationToast
              key={msg.id}
              message={msg}
              onClose={() => dismissMessage(msg.id)}
            />
          ))}
        </div>
      )}

      {displayDebugMessages && debugMessages.length > 0 && (
        <div className="debug-messages-container">
          <div className="debug-header">Debug Messages</div>
          <ul className="debug-messages-list">
            {[...debugMessages].reverse().map((msg) => (
              <DebugMessageItem key={msg.id} message={msg} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
};

export default MessagesDisplay;
