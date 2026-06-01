import { getActiveSystemPrompt } from '../db.js';
import { logger } from '../config.js';

// Default prompt if database is unavailable
const DEFAULT_PROMPT = `Вы - дружелюбный ассистент Telegram-бота. Ваша задача:
1. Приветствовать пользователя
2. Узнать, что его интересует
3. Помочь с вопросами
4. Если пользователь хочет оставить заявку или задать вопрос администраторам:
   - Собрать контактные данные (если есть)
   - Сформулировать резюме диалога
   - Использовать инструмент send_to_admin для отправки заявки

Вы общаетесь на языке пользователя (русский, узбекский, английский).

Когда отправляете заявку администраторам, включите:
- Резюме диалога и потребности пользователя
- Контактные данные (если предоставлены)
- Username пользователя в Telegram
- Ссылку на профиль Telegram`;

// Cache for system prompt
let cachedPrompt: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Load system prompt from database with caching
 * @returns System prompt text
 */
export async function loadSystemPrompt(): Promise<string> {
  const now = Date.now();
  
  // Return cached prompt if still valid
  if (cachedPrompt && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedPrompt;
  }
  
  try {
    const prompt = await getActiveSystemPrompt();
    
    if (prompt) {
      cachedPrompt = prompt;
      cacheTimestamp = now;
      logger.info('System prompt loaded from database');
      return prompt;
    }
    
    logger.warn('No active system prompt found, using default');
    return DEFAULT_PROMPT;
  } catch (error) {
    logger.error({ error }, 'Failed to load system prompt from database, using default');
    return DEFAULT_PROMPT;
  }
}

/**
 * Invalidate the prompt cache (called after admin updates prompt)
 */
export function invalidatePromptCache(): void {
  cachedPrompt = null;
  cacheTimestamp = 0;
  logger.info('System prompt cache invalidated');
}
