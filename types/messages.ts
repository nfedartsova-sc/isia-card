export type MessageType = 'success' | 'error' | 'info';

export type MessageLevel = 'app' | 'debug';

export interface Message {
  type: MessageType;
  text: string;
  level: MessageLevel;
}

export interface MessageWithId extends Message {
  id: string;
  timestamp: number;
}
