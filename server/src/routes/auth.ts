import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

authRouter.post('/login', async (req, res) => {
  const schema = z.object({
    email: z.string().email('Valid email is required'),
    name: z.string().min(1, 'Name is required').optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
  }

  const { email, name } = parsed.data;

  try {
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials. No account found with this email.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated. Contact your Super Admin.' });
    }

    if (name && name !== user.name) {
      user = await prisma.user.update({ where: { id: user.id }, data: { name } });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokenPayload = { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '30d' });

    return res.json({ token, user: tokenPayload });
  } catch (err: any) {
    return res.status(500).json({ error: 'Login failed' });
  }
});

authRouter.get('/me', authenticate, async (req: AuthRequest, res) => {
  return res.json(req.user);
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
