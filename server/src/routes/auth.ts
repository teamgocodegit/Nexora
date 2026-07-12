import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, authenticateAndFetch, signToken, AuthRequest } from '../middleware/auth';
import { hashPassword, verifyPassword, validatePasswordPolicy } from '../services/password.service';
import { logger } from '../lib/logger';

export const authRouter = Router();

const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

function getClientIp(req: any): string {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid email or password.' });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  try {
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || !user.passwordHash) {
      logger.warn(`[AUTH] Failed login attempt for unknown email: ${normalizedEmail} from ${getClientIp(req)}`);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      logger.warn(`[AUTH] Failed login attempt for disabled account: ${normalizedEmail} from ${getClientIp(req)}`);
      return res.status(403).json({ error: 'Account is deactivated. Contact your Super Admin.' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMs = user.lockedUntil.getTime() - Date.now();
      logger.warn(`[AUTH] Locked account login attempt: ${normalizedEmail} from ${getClientIp(req)}`);
      return res.status(429).json({
        error: 'Account temporarily locked due to too many failed attempts. Try again in a few minutes.',
        retryAfterMs: remainingMs,
      });
    }

    const passwordValid = verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      const newAttempts = user.failedLoginAttempts + 1;
      const updateData: any = { failedLoginAttempts: newAttempts };

      if (newAttempts >= LOCK_THRESHOLD) {
        updateData.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
        logger.warn(`[AUTH] Account locked after ${newAttempts} failed attempts: ${normalizedEmail} from ${getClientIp(req)}`);
      }

      await prisma.user.update({ where: { id: user.id }, data: updateData });
      logger.warn(`[AUTH] Failed login attempt ${newAttempts}/${LOCK_THRESHOLD}: ${normalizedEmail} from ${getClientIp(req)}`);

      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const tokenPayload = { id: user.id, role: user.role };
    const token = signToken(tokenPayload, '24h');

    logger.info(`[AUTH] Successful login: ${normalizedEmail} (${user.role}) from ${getClientIp(req)}`);

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
    });
  } catch (err: any) {
    logger.error(`[AUTH] Login error: ${err.message}`);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

authRouter.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        isActive: true, lastLoginAt: true, createdAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    return res.json(user);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

authRouter.patch('/me', authenticate, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(parsed.data.name && { name: parsed.data.name }),
      },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });
    return res.json(updated);
  } catch {
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

authRouter.post('/change-password', authenticate, async (req: AuthRequest, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !user.passwordHash) {
      return res.status(400).json({ error: 'Password change is not available for this account' });
    }

    if (!verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
      return res.status(403).json({ error: 'Current password is incorrect' });
    }

    validatePasswordPolicy(parsed.data.newPassword);

    const newHash = hashPassword(parsed.data.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, passwordChangedAt: new Date() },
    });

    logger.info(`[AUTH] Password changed for user: ${user.email} (${user.id})`);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to change password' });
  }
});
