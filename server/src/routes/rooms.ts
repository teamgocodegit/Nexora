import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { io } from '../index';
import { softDeleteRoom } from '../services/reliability/softDelete.service';
import { logActivity } from '../services/reliability/activityLog.service';
import { emitToHackathon } from '../lib/socket';
import { logger } from '../lib/logger';

export const roomsRouter = Router({ mergeParams: true });
roomsRouter.use(authenticate);

const createSchema = z.object({
  name: z.string().min(1, 'Room name is required'),
  building: z.string().optional(),
  floor: z.string().optional(),
  capacity: z.number().min(1).default(30),
});

roomsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { hackathonId: req.params.hackathonId },
      orderBy: { createdAt: 'asc' },
    });

    const teamCounts = await prisma.team.groupBy({
      by: ['room'],
      where: { hackathonId: req.params.hackathonId, room: { not: null } },
      _count: true,
    });

    const countMap = new Map(teamCounts.map((t) => [t.room, t._count]));

    const roomsWithOccupancy = rooms.map((room) => {
      const assigned = countMap.get(room.name) || 0;
      let status = room.status;
      if (status === 'AVAILABLE' || status === 'NEAR_CAPACITY' || status === 'FULL') {
        if (assigned >= room.capacity) status = 'FULL';
        else if (assigned >= room.capacity * 0.8) status = 'NEAR_CAPACITY';
        else status = 'AVAILABLE';
      }
      return { ...room, currentOccupancy: assigned, status };
    });

    res.json(roomsWithOccupancy);
  } catch {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

roomsRouter.post('/', requireSuperAdmin, async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
  }

  try {
    const existing = await prisma.room.findFirst({
      where: { hackathonId: req.params.hackathonId, name: parsed.data.name },
    });
    if (existing) {
      return res.status(409).json({ error: 'A room with this name already exists' });
    }

    const room = await prisma.room.create({
      data: {
        ...parsed.data,
        hackathonId: req.params.hackathonId,
      },
    });

    await prisma.activityLog.create({
      data: {
        action: `Room "${room.name}" created`,
        hackathonId: req.params.hackathonId,
        actorId: req.user!.id,
      },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));

    res.status(201).json(room);
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A room with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create room' });
  }
});

roomsRouter.patch('/:roomId', requireSuperAdmin, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    building: z.string().optional().nullable(),
    floor: z.string().optional().nullable(),
    capacity: z.number().min(1).optional(),
    status: z.enum(['AVAILABLE', 'NEAR_CAPACITY', 'FULL', 'CLOSED']).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  try {
    const room = await prisma.room.update({
      where: { id: req.params.roomId },
      data: parsed.data,
    });

    emitToHackathon(io, req.params.hackathonId, 'room:updated', room);
    res.json(room);
  } catch {
    res.status(500).json({ error: 'Failed to update room' });
  }
});

roomsRouter.delete('/:roomId', requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { reason } = req.body || {};
    const result = await softDeleteRoom(req.params.roomId, req.params.hackathonId, req.user!.id, reason);

    await logActivity({
      action: `Room soft-deleted. ${result.teamsReassigned} teams reassigned.`,
      hackathonId: req.params.hackathonId,
      actorId: req.user!.id,
      entityType: 'Room',
      entityId: req.params.roomId,
      metadata: { teamsReassigned: result.teamsReassigned, reason: reason || null },
    });

    emitToHackathon(io, req.params.hackathonId, 'room:deleted', { id: req.params.roomId });
    res.json({ success: true, teamsReassigned: result.teamsReassigned });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to delete room' });
  }
});

roomsRouter.post('/:roomId/assign-teams', requireSuperAdmin, async (req: AuthRequest, res) => {
  const schema = z.object({
    teamIds: z.array(z.string()).min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'teamIds required' });
  }

  try {
    const room = await prisma.room.findUnique({ where: { id: req.params.roomId } });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const currentCount = await prisma.team.count({
      where: { hackathonId: req.params.hackathonId, room: room.name },
    });

    if (currentCount + parsed.data.teamIds.length > room.capacity) {
      return res.status(400).json({
        error: `Cannot assign ${parsed.data.teamIds.length} teams. Room capacity is ${room.capacity}, ${currentCount} already assigned.`,
      });
    }

    await prisma.team.updateMany({
      where: { id: { in: parsed.data.teamIds }, hackathonId: req.params.hackathonId },
      data: { room: room.name },
    });

    await prisma.activityLog.create({
      data: {
        action: `${parsed.data.teamIds.length} teams assigned to room "${room.name}"`,
        hackathonId: req.params.hackathonId,
        actorId: req.user!.id,
      },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));

    emitToHackathon(io, req.params.hackathonId, 'teams:room-assigned', { roomId: room.id, roomName: room.name });

    res.json({ success: true, assigned: parsed.data.teamIds.length });
  } catch {
    res.status(500).json({ error: 'Failed to assign teams to room' });
  }
});
