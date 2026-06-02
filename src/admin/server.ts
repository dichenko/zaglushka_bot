import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, logger } from '../config.js';
import { requireAuth } from './middleware/auth.js';
import { processAdminLogin } from './auth.js';
import apiRouter from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startAdminServer(): Promise<import('http').Server> {
  const app = express();

  // Trust reverse proxy (Caddy) for secure cookies
  app.set('trust proxy', 1);

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Session configuration
  app.use(session({
    secret: config.adminSessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: config.adminSessionMaxAge,
      sameSite: 'lax',
    }
  }));

  // Debug: log all requests with session/cookie info
  app.use((req, _res, next) => {
    logger.info({
      sessionID: req.sessionID,
      isAuth: req.session.isAuthenticated,
      adminTgId: req.session.adminTgId,
      cookie: req.headers.cookie,
      protocol: req.protocol,
      secure: req.secure,
      hostname: req.hostname,
      url: req.url,
      method: req.method,
    }, 'Request debug');
    next();
  });

  // View engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Static files
  app.use('/admin/static', express.static(path.join(__dirname, 'public')));

  // Login route (no auth required)
  app.get('/admin/login', async (req, res) => {
    const token = req.query.token as string;

    logger.info({
      hasToken: !!token,
      token: token?.substring(0, 8) + '...',
      sessionID: req.sessionID,
      'x-forwarded-proto': req.headers['x-forwarded-proto'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
    }, 'Login route hit');
    
    if (!token) {
      return res.render('login', { error: 'No token provided' });
    }

    const tgId = await processAdminLogin(token);
    
    if (!tgId) {
      return res.render('login', { error: 'Invalid or expired token' });
    }

    // Create session
    req.session.adminTgId = tgId;
    req.session.isAuthenticated = true;

    // Force save before redirect
    req.session.save((err) => {
      if (err) {
        logger.error({ err }, 'Session save failed');
        return res.render('login', { error: 'Session error. Please try again.' });
      }
      logger.info({ tgId, sessionID: req.sessionID }, 'Admin logged in, redirecting');
      res.redirect('/admin/prompt');
    });
  });

  // Logout route
  app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/admin/login');
    });
  });

  // Protected routes
  app.get('/admin/prompt', requireAuth, (req, res) => {
    res.render('prompt', { title: 'System Prompt' });
  });

  app.get('/admin/first-message', requireAuth, (req, res) => {
    res.render('first-message', { title: 'First Message' });
  });

  app.get('/admin/bots', requireAuth, (req, res) => {
    res.render('bots', { title: 'Telegram Bots' });
  });

  app.get('/admin/conversations', requireAuth, (req, res) => {
    res.render('conversations', { title: 'Conversation History' });
  });

  // API routes
  app.use('/api/admin', apiRouter);

  // Start server
  const server = app.listen(config.adminPort, () => {
    logger.info({ port: config.adminPort }, 'Admin panel started');
  });

  return server;
}
