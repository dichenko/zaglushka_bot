import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { config, logger } from '../config.js';
import { loadSystemPrompt } from './system_prompt.js';
import { sendToAdminTool, setBotApi, setUserInfo, saveLeadToDatabase } from './tools/send_to_admin.js';
import { PostgresChatMessageHistory } from './memory.js';
import { saveMessage } from '../db.js';

/**
 * Initialize the LangChain agent
 */
export async function createAgent(botApi: any) {
  // Set bot API for send_to_admin tool
  setBotApi(botApi);

  // Initialize LLM
  const model = new ChatOpenAI({
    modelName: config.llmModel,
    openAIApiKey: config.llmApiKey,
    configuration: {
      baseURL: config.llmBaseUrl,
    },
    temperature: 0.7,
  });

  // Create tools array
  const tools = [sendToAdminTool];

  // Create ReAct agent
  const agent = createReactAgent({
    llm: model,
    tools,
  });

  logger.info('LangChain agent created successfully');
  
  return agent;
}

/**
 * Run agent with conversation
 * @param conversationId - Database conversation ID
 * @param userMessage - User's message text
 * @param userInfo - User information
 * @param botApi - Telegram bot API
 * @returns Agent response
 */
export async function runAgent(
  conversationId: string,
  userMessage: string,
  userInfo: {
    username?: string;
    firstName?: string;
    lastName?: string;
    tgId: number;
    botLink: string;
  },
  botApi: any
): Promise<string> {
  try {
    // Load system prompt
    const systemPrompt = await loadSystemPrompt();

    // Create memory
    const memory = new PostgresChatMessageHistory(conversationId);

    // Load conversation history
    const history = await memory.getMessages();

    // Create agent
    const agent = await createAgent(botApi);

    // Pass real user info to the tool (bypasses LLM for profile data)
    setUserInfo(userInfo);

    // Prepare input messages
    const inputMessages = [
      new SystemMessage(systemPrompt),
      ...history,
      new HumanMessage(userMessage),
    ];

    // Run agent
    const result = await agent.invoke({
      messages: inputMessages,
    });

    // Extract assistant response
    const assistantMessage = result.messages[result.messages.length - 1];
    const responseText = typeof assistantMessage.content === 'string' 
      ? assistantMessage.content 
      : JSON.stringify(assistantMessage.content);

    // Save assistant response to database
    await saveMessage(conversationId, 'assistant', responseText);

    // Check if agent called send_to_admin tool
    if (result.messages.some((msg: any) => 
      msg.additional_kwargs?.tool_calls?.some((tc: any) => tc.function?.name === 'send_to_admin')
    )) {
      // Save lead to database
      await saveLeadToDatabase({
        conversationId,
        tgId: userInfo.tgId,
        botLink: userInfo.botLink,
        summary: userMessage.substring(0, 500),
      });

      logger.info({ conversationId }, 'Lead created via agent tool call');
    }

    logger.info({ conversationId, responseLength: responseText.length }, 'Agent response generated');

    return responseText;
  } catch (error) {
    logger.error({ error, conversationId }, 'Agent execution failed');
    throw new Error('Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
}
