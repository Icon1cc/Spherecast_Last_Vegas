/**
 * Chat-related type definitions for SupplyWise AI.
 */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  date: Date;
  messages: ChatMessage[];
}
