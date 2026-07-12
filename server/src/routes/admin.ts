import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { hashPassword } from '../services/password.service';
import { logger } from '../lib/logger';

export const adminRouter = Router({ mergeParams: true });
adminRouter.use(authenticate);

const ADMIN_SAFE_SELECT = {
  id: true, name: true, email: true, phone: true, role: true,
  isActive: true, lastLoginAt: true, lastActivityAt: true,
  assignedRooms: true, createdAt: true,
};

adminRouter.get('/', requireSuperAdmin, async (_req: AuthRequest, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'SUB_ADMIN' },
      select: {
        ...ADMIN_SAFE_SELECT,
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

const createSubAdminSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional().or(z.literal('')),
  hackathonId: z.string().optional(),
  assignedRooms: z.string().optional(),
});

adminRouter.post('/', requireSuperAdmin, async (req: AuthRequest, res) => {
  const parsed = createSubAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
  }

  const { name, email, phone, hackathonId, assignedRooms } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        phone: phone || undefined,
        role: 'SUB_ADMIN',
        assignedRooms: assignedRooms || undefined,
        ...(hackathonId ? {
          assignments: {
            create: { hackathonId },
          },
        } : {}),
      },
      select: ADMIN_SAFE_SELECT,
    });

    await prisma.activityLog.create({
      data: {
        action: `Sub Admin "${name}" created by ${req.user!.name}`,
        hackathonId: hackathonId || 'unknown',
        actorId: req.user!.id,
      },
    });

    logger.info(`[ADMIN] Sub Admin created: ${normalizedEmail} (${name}) by ${req.user!.name}`);

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      message: 'Sub Admin created. They must set a password to log in.',
    });
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
    password: z.string().min(10).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
  }

  const targetUser = await prisma.user.findUnique({ where: { id: req.params.adminId } });
  if (!targetUser) return res.status(404).json({ error: 'Admin not found' });
  if (targetUser.role === 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Cannot modify a Super Admin through this endpoint' });
  }

  try {
    const updateData: any = {};

    if (parsed.data.name) updateData.name = parsed.data.name;
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email ? parsed.data.email.toLowerCase().trim() : null;
    if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone || null;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
    if (parsed.data.assignedRooms !== undefined) updateData.assignedRooms = parsed.data.assignedRooms;
    if (parsed.data.password) updateData.passwordHash = hashPassword(parsed.data.password);

    if (parsed.data.hackathonId !== undefined) {
      await prisma.coordinatorAssignment.deleteMany({ where: { userId: req.params.adminId } });
      if (parsed.data.hackathonId) {
        await prisma.coordinatorAssignment.create({
          data: { hackathonId: parsed.data.hackathonId, userId: req.params.adminId },
        });
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.params.adminId },
      data: updateData,
      select: ADMIN_SAFE_SELECT,
    });

    if (parsed.data.isActive !== undefined) {
      const logAction = parsed.data.isActive
        ? `Sub Admin "${targetUser.name}" enabled by ${req.user!.name}`
        : `Sub Admin "${targetUser.name}" disabled by ${req.user!.name}`;
      await prisma.activityLog.create({
        data: { action: logAction, hackathonId: 'unknown', actorId: req.user!.id },
      }).catch(() => {});
    }

    res.json(updated);
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A user with this email or phone already exists' });
    }
    res.status(500).json({ error: 'Failed to update admin' });
  }
});

adminRouter.delete('/:adminId', requireSuperAdmin, async (req: AuthRequest, res) => {
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

    logger.info(`[ADMIN] Sub Admin deleted: ${user.email} (${user.name}) by ${req.user!.name}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete admin' });
  }
});

adminRouter.post('/:adminId/set-password', requireSuperAdmin, async (req: AuthRequest, res) => {
  const schema = z.object({ password: z.string().min(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Password must be at least 10 characters' });
  }

  const targetUser = await prisma.user.findUnique({ where: { id: req.params.adminId } });
  if (!targetUser) return res.status(404).json({ error: 'Admin not found' });
  if (targetUser.role === 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Cannot set password for Super Admin through this endpoint' });
  }

  try {
    const passwordHash = hashPassword(parsed.data.password);
    await prisma.user.update({
      where: { id: req.params.adminId },
      data: { passwordHash, passwordChangedAt: new Date() },
    });

    logger.info(`[ADMIN] Password set for Sub Admin: ${targetUser.email} by ${req.user!.name}`);
    res.json({ success: true, message: 'Password has been set for this Sub Admin.' });
  } catch {
    res.status(500).json({ error: 'Failed to set password' });
  }
});
