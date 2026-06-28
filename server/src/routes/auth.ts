import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'nexora-secret-change-in-prod-min-32-chars!!';

/* ─── POST /auth/login ─── */
authRouter.post('/login', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Valid email is required'),
    role: z.enum(['SUPER_ADMIN', 'SUB_ADMIN', 'COORDINATOR']),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
  }

  const { name, email, role } = parsed.data;
  const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const user = { id, name, email, role };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '30d' });

  return res.json({ token, user });
});

/* ─── GET /auth/me ─── */
authRouter.get('/me', authenticate, async (req: AuthRequest, res) => {
  return res.json(req.user);
});

/* ─── PATCH /auth/me ─── */
authRouter.patch('/me', authenticate, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const user = {
    ...req.user,
    ...(parsed.data.name && { name: parsed.data.name }),
  };

  return res.json(user);
});
