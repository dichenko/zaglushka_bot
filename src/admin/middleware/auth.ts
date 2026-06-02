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
  if (!req.session.isAuthenticated || !req.session.adminTgId) {
    logger.warn({ sessionID: req.sessionID, isAuth: req.session.isAuthenticated, tgId: req.session.adminTgId }, 'Unauthorized access attempt');
    res.redirect('/admin/login');
    return;
  }

  // Check if admin is in allowed list (compare as strings: pg returns BIGINT as string)
  const adminTgIds = config.adminTgIds.map(id => id.trim());
  if (!adminTgIds.includes(String(req.session.adminTgId))) {
    logger.warn({ tgId: req.session.adminTgId }, 'Admin not in allowed list');
    req.session.destroy(() => {});
    res.redirect('/admin/login');
    return;
  }

  next();
}
