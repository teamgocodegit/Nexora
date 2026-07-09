import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { io } from '../index';
import { emitToHackathon } from '../lib/socket';
import { logger } from '../lib/logger';

export const automationsRouter = Router({ mergeParams: true });
automationsRouter.use(authenticate);

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  triggerType: z.enum(['TIME_BASED', 'EVENT_TRIGGERED']),
  triggerConfig: z.any().optional(),
  recipientGroup: z.string().optional(),
  template: z.string().optional(),
  templateSubject: z.string().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  scheduledTime: z.string().optional(),
});

// GET all
automationsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const automations = await prisma.automation.findMany({
      where: { hackathonId: req.params.hackathonId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(automations);
  } catch {
    res.status(500).json({ error: 'Failed to fetch automations' });
  }
});

// POST create
automationsRouter.post('/', requireSuperAdmin, async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
  try {
    const automation = await prisma.automation.create({
      data: {
        ...parsed.data,
        scheduledTime: parsed.data.scheduledTime ? new Date(parsed.data.scheduledTime) : undefined,
        hackathonId: req.params.hackathonId,
        createdById: req.user!.id,
      },
    });
    emitToHackathon(io, req.params.hackathonId, 'automation:created', automation);
    res.status(201).json(automation);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create automation' });
  }
});

// PATCH update
automationsRouter.patch('/:id', requireSuperAdmin, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    triggerType: z.enum(['TIME_BASED', 'EVENT_TRIGGERED']).optional(),
    triggerConfig: z.any().optional(),
    recipientGroup: z.string().optional().nullable(),
    template: z.string().optional().nullable(),
    templateSubject: z.string().optional().nullable(),
    status: z.enum(['ACTIVE', 'PAUSED', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
    scheduledTime: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  try {
    const automation = await prisma.automation.update({
      where: { id: req.params.id },
      data: {
        ...parsed.data,
        scheduledTime: parsed.data.scheduledTime ? new Date(parsed.data.scheduledTime) : parsed.data.scheduledTime === null ? null : undefined,
      },
    });
    emitToHackathon(io, req.params.hackathonId, 'automation:updated', automation);
    res.json(automation);
  } catch {
    res.status(500).json({ error: 'Failed to update automation' });
  }
});

// DELETE
automationsRouter.delete('/:id', requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    await prisma.automation.delete({ where: { id: req.params.id } });
    emitToHackathon(io, req.params.hackathonId, 'automation:deleted', { id: req.params.id });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete automation' });
  }
});

// Milestones
export const milestonesRouter = Router({ mergeParams: true });
milestonesRouter.use(authenticate);

const milestoneSchema = z.object({
  title: z.string().min(1),
  time: z.string().min(1),
  description: z.string().optional(),
});

milestonesRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const milestones = await prisma.eventMilestone.findMany({
      where: { hackathonId: req.params.hackathonId },
      orderBy: { time: 'asc' },
    });
    res.json(milestones);
  } catch {
    res.status(500).json({ error: 'Failed to fetch milestones' });
  }
});

milestonesRouter.post('/', requireSuperAdmin, async (req: AuthRequest, res) => {
  const parsed = milestoneSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  try {
    const milestone = await prisma.eventMilestone.create({
      data: { ...parsed.data, hackathonId: req.params.hackathonId },
    });
    emitToHackathon(io, req.params.hackathonId, 'milestone:created', milestone);
    res.status(201).json(milestone);
  } catch {
    res.status(500).json({ error: 'Failed to create milestone' });
  }
});

milestonesRouter.patch('/:id', requireSuperAdmin, async (req: AuthRequest, res) => {
  const parsed = milestoneSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  try {
    const milestone = await prisma.eventMilestone.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    emitToHackathon(io, req.params.hackathonId, 'milestone:updated', milestone);
    res.json(milestone);
  } catch {
    res.status(500).json({ error: 'Failed to update milestone' });
  }
});

milestonesRouter.delete('/:id', requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    await prisma.eventMilestone.delete({ where: { id: req.params.id } });
    emitToHackathon(io, req.params.hackathonId, 'milestone:deleted', { id: req.params.id });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete milestone' });
  }
});
