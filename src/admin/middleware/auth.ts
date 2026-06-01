import { Request, Response, NextFunction } from 'express';
import { config, logger } from '../../config.js';

export interface SessionData {
  adminTgId?: number;
  isAuthenticated?: boolean;
}

declare module 'express-session' {
  interface SessionData {
    adminTgId?: number;
    isAuthenticated?: boolean;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  logger.info({
    sessionID: req.sessionID,
    isAuthenticated: req.session.isAuthenticated,
    adminTgId: req.session.adminTgId,
    cookie: req.headers.cookie,
  }, 'Auth check');

  if (!req.session.isAuthenticated || !req.session.adminTgId) {
    logger.warn({ sessionID: req.sessionID, isAuth: req.session.isAuthenticated, tgId: req.session.adminTgId }, 'Unauthorized access attempt');
    res.redirect('/admin/login');
    return;
  }

  // Check if admin is in allowed list
  const adminTgIds = config.adminTgIds.map(id => parseInt(id));
  if (!adminTgIds.includes(req.session.adminTgId)) {
    logger.warn({ tgId: req.session.adminTgId }, 'Admin not in allowed list');
    req.session.destroy(() => {});
    res.redirect('/admin/login');
    return;
  }

  next();
}
