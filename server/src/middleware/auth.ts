import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requireSuperAdmin, requireSubAdmin, requirePermission, requireRole } from './permissions';
import type { Permission } from './permissions';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthRequest extends Request {
  user?: { id: string; email?: string; phone?: string; role: string; name: string; };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthRequest['user'];
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
};

export const requireAdmin = requireSuperAdmin;

export { requireSuperAdmin, requireSubAdmin, requirePermission, requireRole };
export type { Permission };
