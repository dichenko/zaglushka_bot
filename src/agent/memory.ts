import { BaseChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getConversationHistory, saveMessage } from '../db.js';
import { logger } from '../config.js';

/**
 * Custom chat message history for PostgreSQL
 * Loads and saves conversation history from database
 */
export class PostgresChatMessageHistory extends BaseChatMessageHistory {
  lc_namespace = ['postgres', 'chat_history'];

  private conversationId: string;
  private messages: BaseMessage[] = [];

  constructor(conversationId: string) {
    super();
    this.conversationId = conversationId;
  }

  async addUserMessage(message: string): Promise<void> {
    const msg = new HumanMessage(message);
    await this.addMessage(msg);
  }

  async addAIChatMessage(message: string): Promise<void> {
    const msg = new AIMessage(message);
    await this.addMessage(msg);
  }

  /**
   * Load messages from database
   */
  async getMessages(): Promise<BaseMessage[]> {
    if (this.messages.length > 0) {
      return this.messages;
    }

    try {
      const dbMessages = await getConversationHistory(this.conversationId, 50);
      
      this.messages = dbMessages.map(msg => {
        const content = msg.transcription || msg.content;
        
        switch (msg.role) {
          case 'user':
            return new HumanMessage(content);
          case 'assistant':
            return new AIMessage(content);
          case 'system':
            return new SystemMessage(content);
          default:
            return new HumanMessage(content);
        }
      });

      logger.info({ 
        conversationId: this.conversationId, 
        count: this.messages.length 
      }, 'Loaded conversation history from database');

      return this.messages;
    } catch (error) {
      logger.error({ error }, 'Failed to load conversation history');
      return [];
    }
  }

  /**
   * Add a message to memory and save to database
   */
  async addMessage(message: BaseMessage): Promise<void> {
    this.messages.push(message);

    // Determine role and content
    let role: 'user' | 'assistant' | 'system';
    let content = '';

    if (message instanceof HumanMessage) {
      role = 'user';
      content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    } else if (message instanceof AIMessage) {
      role = 'assistant';
      content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    } else if (message instanceof SystemMessage) {
      role = 'system';
      content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    } else {
      role = 'user';
      content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    }

    try {
      await saveMessage(this.conversationId, role, content);
    } catch (error) {
      logger.error({ error }, 'Failed to save message to database');
    }
  }

  /**
   * Add multiple messages
   */
  async addMessages(messages: BaseMessage[]): Promise<void> {
    for (const message of messages) {
      await this.addMessage(message);
    }
  }

  /**
   * Clear all messages from memory
   */
  async clear(): Promise<void> {
    this.messages = [];
  }
}
