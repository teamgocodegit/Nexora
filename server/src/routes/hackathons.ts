import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, requireSuperAdmin, requireHackathonAccess, AuthRequest } from '../middleware/auth';
import { logActivity } from '../services/reliability/activityLog.service';

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

hackathonsRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const h = await prisma.hackathon.findUnique({ where: { id: req.params.id }, include: hackathonInclude });
    if (!h) return res.status(404).json({ error: 'Not found' });

    if (req.user?.role !== 'SUPER_ADMIN') {
      const assignment = await prisma.coordinatorAssignment.findUnique({
        where: { hackathonId_userId: { hackathonId: h.id, userId: req.user!.id } },
      });
      if (!assignment) return res.status(403).json({ error: 'You do not have access to this hackathon' });
    }

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

hackathonsRouter.patch('/:id', requireAdmin, async (req: AuthRequest, res) => {
  const { name, description, venue, startDate, endDate, status, maxTeams, mode } = req.body;
  try {
    const h = await prisma.hackathon.update({ where: { id: req.params.id }, data: { ...(name && { name }), ...(description !== undefined && { description }), ...(venue !== undefined && { venue }), ...(startDate && { startDate: new Date(startDate) }), ...(endDate && { endDate: new Date(endDate) }), ...(status && { status }), ...(maxTeams !== undefined && { maxTeams }), ...(mode && { mode }) }, include: hackathonInclude });
    res.json(h);
  } catch { res.status(500).json({ error: 'Failed to update hackathon' }); }
});

hackathonsRouter.delete('/:id', requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { confirm } = req.body || {};
    const hackathon = await prisma.hackathon.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { teams: true, rooms: true, registrations: true, certificates: true } } },
    });
    if (!hackathon) return res.status(404).json({ error: 'Hackathon not found' });

    const confirmStr = `HACKATHON-${hackathon.name.toUpperCase().replace(/\s+/g, '-').slice(0, 40)}`;
    if (confirm !== confirmStr) {
      return res.status(400).json({
        error: 'Type-to-confirm required',
        expected: confirmStr,
        impact: {
          teams: hackathon._count.teams,
          rooms: hackathon._count.rooms,
          registrations: hackathon._count.registrations,
          certificates: hackathon._count.certificates,
        },
      });
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.team.updateMany({ where: { hackathonId: req.params.id, deletedAt: null }, data: { deletedAt: now, deletedById: req.user!.id, deletionReason: 'Hackathon deleted' } }),
      prisma.participant.updateMany({ where: { team: { hackathonId: req.params.id }, deletedAt: null }, data: { deletedAt: now, deletedById: req.user!.id, deletionReason: 'Hackathon deleted' } }),
      prisma.hackathon.update({ where: { id: req.params.id }, data: { archivedAt: now, archivedById: req.user!.id } }),
    ]);

    await logActivity({
      action: `Hackathon deleted with type-to-confirm`,
      hackathonId: req.params.id,
      actorId: req.user!.id,
      entityType: 'Hackathon',
      entityId: req.params.id,
    });

    res.json({ success: true, note: 'Hackathon archived. All teams and participants soft-deleted.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete hackathon' });
  }
});
