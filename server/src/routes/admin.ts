import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';

export const adminRouter = Router({ mergeParams: true });
adminRouter.use(authenticate);

adminRouter.get('/', requireSuperAdmin, async (_req: AuthRequest, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'SUB_ADMIN' },
      include: {
        assignments: {
          include: { hackathon: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(admins.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      phone: a.phone,
      role: a.role,
      isActive: a.isActive,
      lastLoginAt: a.lastLoginAt?.toISOString() || null,
      lastActivityAt: a.lastActivityAt?.toISOString() || null,
      assignedRooms: a.assignedRooms,
      createdAt: a.createdAt.toISOString(),
      assignments: a.assignments.map((as) => ({
        hackathonId: as.hackathonId,
        hackathon: as.hackathon,
      })),
    })));
  } catch {
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
});

adminRouter.post('/', requireSuperAdmin, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    hackathonId: z.string().optional(),
    assignedRooms: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
  }

  const { name, email, phone, hackathonId, assignedRooms } = parsed.data;

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email: email || undefined,
        phone: phone || undefined,
        role: 'SUB_ADMIN',
        assignedRooms: assignedRooms || undefined,
        ...(hackathonId ? {
          assignments: {
            create: { hackathonId },
          },
        } : {}),
      },
    });

    await prisma.activityLog.create({
      data: {
        action: `Sub Admin "${name}" created by ${req.user!.name}`,
        hackathonId: hackathonId || 'unknown',
        actorId: req.user!.id,
      },
    });

    res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A user with this email or phone already exists' });
    }
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

adminRouter.patch('/:adminId', requireSuperAdmin, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    isActive: z.boolean().optional(),
    assignedRooms: z.string().optional().or(z.null()),
    hackathonId: z.string().optional().or(z.null()),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
  }
  const user = await prisma.user.findUnique({ where: { id: req.params.adminId } });
  if (!user) return res.status(404).json({ error: 'Admin not found' });
  if (user.role === 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Cannot delete a Super Admin' });
  }

  try {
    await prisma.coordinatorAssignment.deleteMany({ where: { userId: req.params.adminId } });
    await prisma.user.delete({ where: { id: req.params.adminId } });

    await prisma.activityLog.create({
      data: {
        action: `Sub Admin "${user.name}" deleted by ${req.user!.name}`,
        hackathonId: 'unknown',
        actorId: req.user!.id,
      },
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete admin' });
  }
});
