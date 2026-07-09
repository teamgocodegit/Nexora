import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

export const hackathonsRouter = Router();
hackathonsRouter.use(authenticate);

const createSchema = z.object({
  name: z.string().min(2), description: z.string().optional(), venue: z.string().optional(),
  startDate: z.string(), endDate: z.string(), maxTeams: z.number().optional(), mode: z.enum(['PREDEFINED', 'ON_SPOT']).optional(),
});
const hackathonInclude = { _count: { select: { teams: true } } } as const;

hackathonsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const isAdmin = req.user?.role === 'SUPER_ADMIN';
    const hackathons = isAdmin
      ? await prisma.hackathon.findMany({ include: hackathonInclude, orderBy: { createdAt: 'desc' } })
      : await prisma.hackathon.findMany({ where: { assignments: { some: { userId: req.user!.id } } }, include: hackathonInclude, orderBy: { createdAt: 'desc' } });
    res.json(hackathons);
  } catch (err: any) { res.status(500).json({ error: 'Failed to fetch hackathons', details: err.message }); }
});

hackathonsRouter.get('/slug/:slug', async (req, res) => {
  try {
    const h = await prisma.hackathon.findUnique({
      where: { slug: req.params.slug },
      select: {
        id: true, name: true, description: true, venue: true,
        startDate: true, endDate: true,
        minTeamSize: true, maxTeamSize: true,
      },
    });
    if (!h) return res.status(404).json({ error: 'Not found' });
    res.json(h);
  } catch { res.status(500).json({ error: 'Failed to fetch hackathon' }); }
});

hackathonsRouter.get('/:id', async (req, res) => {
  try {
    const h = await prisma.hackathon.findUnique({ where: { id: req.params.id }, include: hackathonInclude });
    if (!h) return res.status(404).json({ error: 'Not found' });
    res.json(h);
  } catch { res.status(500).json({ error: 'Failed to fetch hackathon' }); }
});

hackathonsRouter.post('/', requireAdmin, async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
  try {
    const h = await prisma.hackathon.create({ data: { ...parsed.data, startDate: new Date(parsed.data.startDate), endDate: new Date(parsed.data.endDate), createdById: req.user!.id }, include: hackathonInclude });
    res.status(201).json(h);
  } catch (err: any) { res.status(500).json({ error: 'Failed to create hackathon', details: err.message }); }
});

hackathonsRouter.patch('/:id', requireAdmin, async (req, res) => {
  const { name, description, venue, startDate, endDate, status, maxTeams, mode } = req.body;
  try {
    const h = await prisma.hackathon.update({ where: { id: req.params.id }, data: { ...(name && { name }), ...(description !== undefined && { description }), ...(venue !== undefined && { venue }), ...(startDate && { startDate: new Date(startDate) }), ...(endDate && { endDate: new Date(endDate) }), ...(status && { status }), ...(maxTeams !== undefined && { maxTeams }), ...(mode && { mode }) }, include: hackathonInclude });
    res.json(h);
  } catch { res.status(500).json({ error: 'Failed to update hackathon' }); }
});

hackathonsRouter.delete('/:id', requireAdmin, async (req, res) => {
  try { await prisma.hackathon.delete({ where: { id: req.params.id } }); res.json({ success: true }); }
  catch { res.status(500).json({ error: 'Failed to delete hackathon' }); }
});
