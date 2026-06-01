export interface Conversation {
  id: string;
  tg_id: number;
  bot_link: string;
  status: 'active' | 'completed' | 'escalated';
  started_at: Date;
  updated_at: Date;
  ended_at?: Date;
}

export interface Message {
  id: number;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  message_type: 'text' | 'voice' | 'image';
  audio_file_id?: string;
  transcription?: string;
  tool_calls?: string;
  created_at: Date;
}

export interface Lead {
  id: number;
  conversation_id: string;
  tg_id: number;
  bot_link: string;
  username?: string;
  telegram_link?: string;
  summary: string;
  contacts?: string;
  telegram_message_id?: number;
  sent_at: Date;
}

export interface STTProvider {
  name: string;
  transcribe(audioBuffer: Buffer, language?: string): Promise<{text: string, confidence: number}>;
}

export interface AgentConfig {
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  maxConversationTurns: number;
  inactivityTimeoutMinutes: number;
}

export interface BotConfig {
  id: number;
  token: string;
  bot_link?: string;
  bot_name?: string;
  bot_description?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SystemPrompt {
  id: number;
  prompt_text: string;
  version: number;
  is_active: boolean;
  created_at: Date;
  created_by?: number;
}

export interface FirstMessage {
  id: number;
  message_text: string;
  is_active: boolean;
  updated_at: Date;
  updated_by?: number;
}

export interface AdminToken {
  id: number;
  token: string;
  tg_id: number;
  used: boolean;
  expires_at: Date;
  created_at: Date;
}