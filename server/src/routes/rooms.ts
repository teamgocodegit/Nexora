import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireHackathonAccess, AuthRequest } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/permissions';
import { io } from '../index';
import { softDeleteRoom } from '../services/reliability/softDelete.service';
import { logActivity } from '../services/reliability/activityLog.service';
import { emitToHackathon } from '../lib/socket';
import { logger } from '../lib/logger';
import {
  createRoomSchema,
  updateRoomSchema,
  getRoomOccupancy,
  getBulkOccupancy,
  recalculateRoomStatus,
  archiveRoom,
  restoreArchivedRoom,
  reorderRooms,
  assignTeamsToRoom,
} from '../services/venue/room.service';

export const roomsRouter = Router({ mergeParams: true });
roomsRouter.use(authenticate);
roomsRouter.use(requireHackathonAccess);

roomsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { hackathonId: req.params.hackathonId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const occupancyMap = await getBulkOccupancy(req.params.hackathonId);

    const roomsWithOccupancy = rooms.map((room) => {
      const occ = occupancyMap.get(room.name) || { teamCount: 0, peopleCount: 0 };
      return { ...room, currentTeams: occ.teamCount, currentPeople: occ.peopleCount };
    });

    res.json(roomsWithOccupancy);
  } catch {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

roomsRouter.post('/', requireSuperAdmin, async (req: AuthRequest, res) => {
  const parsed = createRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
  }

  try {
    const existing = await prisma.room.findFirst({
      where: { hackathonId: req.params.hackathonId, name: parsed.data.name, deletedAt: null },
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
        entityType: 'Room',
        entityId: room.id,
      },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));

    emitToHackathon(io, req.params.hackathonId, 'room:created', room);
    res.status(201).json(room);
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A room with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create room' });
  }
});

roomsRouter.patch('/:roomId', requireSuperAdmin, async (req: AuthRequest, res) => {
  const parsed = updateRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
  }

  try {
    const room = await prisma.room.update({
      where: { id: req.params.roomId },
      data: parsed.data as any,
    });

    if (parsed.data.status === 'ARCHIVED' || parsed.data.status === 'CLOSED') {
      await prisma.activityLog.create({
        data: {
          action: `Room "${room.name}" status changed to ${parsed.data.status}`,
          hackathonId: req.params.hackathonId,
          actorId: req.user!.id,
          entityType: 'Room',
          entityId: room.id,
        },
      }).catch((e) => logger.error(`[ActivityLog] ${e}`));
    }

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
    overrideReason: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'teamIds required' });
  }

  try {
    const result = await assignTeamsToRoom(
      req.params.hackathonId,
      req.params.roomId,
      parsed.data.teamIds,
      req.user!.id,
      parsed.data.overrideReason,
    );

    const room = await prisma.room.findUnique({ where: { id: req.params.roomId } });
    emitToHackathon(io, req.params.hackathonId, 'teams:room-assigned', { roomId: room?.id, roomName: room?.name });
    emitToHackathon(io, req.params.hackathonId, 'room:occupancy', { roomId: room?.id, roomName: room?.name });

    res.json({ success: true, assigned: result.assigned });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

roomsRouter.post('/reorder', requireSuperAdmin, async (req: AuthRequest, res) => {
  const schema = z.object({ orderedIds: z.array(z.string()) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'orderedIds array required' });

  try {
    await reorderRooms(req.params.hackathonId, parsed.data.orderedIds);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

roomsRouter.post('/:roomId/archive', requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    await archiveRoom(req.params.roomId, req.params.hackathonId, req.user!.id);
    emitToHackathon(io, req.params.hackathonId, 'room:updated', { id: req.params.roomId, status: 'ARCHIVED' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

roomsRouter.post('/:roomId/restore-archive', requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    await restoreArchivedRoom(req.params.roomId, req.params.hackathonId, req.user!.id);
    emitToHackathon(io, req.params.hackathonId, 'room:updated', { id: req.params.roomId, status: 'ACTIVE' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

roomsRouter.patch('/:roomId/status', requireSuperAdmin, async (req: AuthRequest, res) => {
  const schema = z.object({
    status: z.enum(['ACTIVE', 'FULL', 'CLOSED', 'ARCHIVED']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid status' });

  try {
    const room = await prisma.room.update({
      where: { id: req.params.roomId },
      data: { status: parsed.data.status as any },
    });
    await prisma.activityLog.create({
      data: {
        action: `Room "${room.name}" status set to ${parsed.data.status}`,
        hackathonId: req.params.hackathonId,
        actorId: req.user!.id,
        entityType: 'Room',
        entityId: room.id,
      },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));
    emitToHackathon(io, req.params.hackathonId, 'room:updated', room);
    res.json(room);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
