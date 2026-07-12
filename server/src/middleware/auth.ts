import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { requireSuperAdmin, requireSubAdmin, requirePermission, requireRole } from './permissions';
import type { Permission } from './permissions';

const JWT_SECRET = process.env.JWT_SECRET!;

const JWT_ALGORITHM = 'HS256';
const ALLOWED_ALGORITHMS = ['HS256'];

export interface TokenPayload {
  sub: string;
  role: string;
  iat: number;
  exp: number;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    role: string;
  };
}

export function signToken(payload: { id: string; role: string }, expiresIn: string = '24h'): string {
  return jwt.sign(
    { sub: payload.id, role: payload.role },
    JWT_SECRET,
    { algorithm: JWT_ALGORITHM, expiresIn },
  );
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let decoded: TokenPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET, { algorithms: ALLOWED_ALGORITHMS }) as TokenPayload;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userId = decoded.sub;
  if (!userId) {
    return res.status(401).json({ error: 'Invalid token payload' });
  }

  req.user = { id: userId, name: '', role: decoded.role };
  next();
};

export const authenticateAndFetch = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let decoded: TokenPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET, { algorithms: ALLOWED_ALGORITHMS }) as TokenPayload;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userId = decoded.sub;
  if (!userId) {
    return res.status(401).json({ error: 'Invalid token payload' });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, role: true, isActive: true },
  });

  if (!user) {
    return res.status(401).json({ error: 'User no longer exists' });
  }

  if (!user.isActive) {
    return res.status(403).json({ error: 'Account is deactivated' });
  }

  if (user.role !== decoded.role) {
    return res.status(403).json({ error: 'Role has changed. Please log in again.' });
  }

  req.user = { id: user.id, name: user.name, email: user.email || undefined, phone: user.phone || undefined, role: user.role };
  next();
};

export async function requireHackathonAccess(req: AuthRequest, res: Response, next: NextFunction) {
  const hackathonId = req.params.hackathonId;
  if (!hackathonId) {
    return res.status(400).json({ error: 'Hackathon ID required' });
  }

  if (req.user?.role === 'SUPER_ADMIN') {
    return next();
  }

  const assignment = await prisma.coordinatorAssignment.findUnique({
    where: {
      hackathonId_userId: {
        hackathonId,
        userId: req.user!.id,
      },
    },
  });

  if (!assignment) {
    return res.status(403).json({ error: 'You do not have access to this hackathon' });
  }

  next();
}

export const requireAdmin = requireSuperAdmin;

export { requireSuperAdmin, requireSubAdmin, requirePermission, requireRole };
export type { Permission };
