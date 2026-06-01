import { createAdminToken, validateAdminToken, isAdmin } from '../db.js';
import { config, logger } from '../config.js';

/**
 * Generate admin login link
 * @param tgId - Telegram user ID
 * @returns Login URL with token
 */
export async function generateAdminLoginLink(tgId: number): Promise<string> {
  // Check if user is admin
  const adminTgIds = config.adminTgIds.map(id => parseInt(id));
  if (!adminTgIds.includes(tgId)) {
    throw new Error('User is not in admin list');
  }

  const token = await createAdminToken(tgId);
  const loginUrl = `${config.adminBaseUrl}/admin/login?token=${token}`;
  
  logger.info({ tgId, token }, 'Generated admin login link');
  return loginUrl;
}

/**
 * Validate token and create session
 * @param token - Admin token
 * @returns Telegram ID if valid, null otherwise
 */
export async function processAdminLogin(token: string): Promise<number | null> {
  const tgId = await validateAdminToken(token);
  
  if (!tgId) {
    logger.warn({ token }, 'Invalid or expired admin token');
    return null;
  }

  logger.info({ tgId }, 'Admin token validated successfully');
  return tgId;
}
