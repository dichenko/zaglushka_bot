import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { 
  getActiveSystemPrompt, 
  createSystemPrompt,
  getActiveFirstMessage,
  updateFirstMessage,
  getActiveBots,
  createBot,
  updateBot,
  deleteBot,
  getConversations,
  getMessagesByConversation
} from '../../db.js';
import { config, logger } from '../../config.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(requireAuth);

// ==========================================
// System Prompt API
// ==========================================

router.get('/prompt', async (req, res) => {
  try {
    const prompt = await getActiveSystemPrompt();
    
    res.json({
      success: true,
      prompt: prompt || '',
      version: 1,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ error }, 'Failed to load system prompt');
    res.status(500).json({ success: false, error: 'Failed to load prompt' });
  }
});

router.post('/prompt', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Prompt cannot be empty' });
    }
    
    const adminTgId = req.session.adminTgId;
    await createSystemPrompt(prompt, adminTgId);
    
    logger.info({ adminTgId }, 'System prompt updated');
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to save system prompt');
    res.status(500).json({ success: false, error: 'Failed to save prompt' });
  }
});

// ==========================================
// First Message API
// ==========================================

router.get('/first-message', async (req, res) => {
  try {
    const message = await getActiveFirstMessage();
    
    res.json({
      success: true,
      message: message || '',
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ error }, 'Failed to load first message');
    res.status(500).json({ success: false, error: 'Failed to load message' });
  }
});

router.post('/first-message', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty' });
    }
    
    const adminTgId = req.session.adminTgId;
    await updateFirstMessage(message, adminTgId);
    
    logger.info({ adminTgId }, 'First message updated');
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to save first message');
    res.status(500).json({ success: false, error: 'Failed to save message' });
  }
});

// ==========================================
// Bots API
// ==========================================

router.get('/bots', async (req, res) => {
  try {
    const bots = await getActiveBots();
    
    res.json({
      success: true,
      bots
    });
  } catch (error) {
    logger.error({ error }, 'Failed to load bots');
    res.status(500).json({ success: false, error: 'Failed to load bots' });
  }
});

router.post('/bots', async (req, res) => {
  try {
    const { token, botName, botDescription, firstMessage } = req.body;
    
    if (!token || token.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }
    
    await createBot({
      token,
      bot_name: botName,
      bot_description: botDescription,
      first_message: firstMessage,
    });
    
    logger.info({ adminTgId: req.session.adminTgId }, 'New bot created');
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ error }, 'Failed to create bot');
    
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ success: false, error: 'Bot token already exists' });
    }
    
    res.status(500).json({ success: false, error: 'Failed to create bot' });
  }
});

router.delete('/bots/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid bot ID' });
    }
    
    await deleteBot(id);
    
    logger.info({ adminTgId: req.session.adminTgId, botId: id }, 'Bot deleted');
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to delete bot');
    res.status(500).json({ success: false, error: 'Failed to delete bot' });
  }
});

router.put('/bots/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid bot ID' });
    }

    const { token, botName, botDescription, firstMessage } = req.body;

    await updateBot(id, {
      token: token || undefined,
      bot_name: botName,
      bot_description: botDescription,
      first_message: firstMessage,
    });

    logger.info({ adminTgId: req.session.adminTgId, botId: id }, 'Bot updated');
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ error }, 'Failed to update bot');
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Bot token already exists' });
    }
    res.status(500).json({ success: false, error: 'Failed to update bot' });
  }
});

// ==========================================
// Conversations API
// ==========================================

router.get('/conversations', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    
    const filters: any = {
      limit,
      offset
    };
    
    if (req.query.tgId) {
      filters.tgId = parseInt(req.query.tgId as string);
    }
    
    if (req.query.dateFrom) {
      filters.dateFrom = new Date(req.query.dateFrom as string);
    }
    
    if (req.query.dateTo) {
      filters.dateTo = new Date(req.query.dateTo as string);
    }
    
    const { data, total } = await getConversations(filters);
    
    res.json({
      success: true,
      conversations: data,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    logger.error({ error }, 'Failed to load conversations');
    res.status(500).json({ success: false, error: 'Failed to load conversations' });
  }
});

router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const conversationId = req.params.id;
    
    const messages = await getMessagesByConversation(conversationId);
    
    res.json({
      success: true,
      messages
    });
  } catch (error) {
    logger.error({ error }, 'Failed to load messages');
    res.status(500).json({ success: false, error: 'Failed to load messages' });
  }
});

export default router;
