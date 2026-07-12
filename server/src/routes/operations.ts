import { Router, Request, Response } from 'express';
import { authenticate, requireHackathonAccess } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/permissions';
import { getOpsDashboard, getRoomCards, getExceptions, getLiveRoomData } from '../services/venue/operations.service';
import { checkCapacity, assignTeamsToRoom, moveTeamToRoom, unassignTeams, previewAutoAssign, applyAutoAssign } from '../services/venue/room.service';
import { logActivity } from '../services/reliability/activityLog.service';
import { io } from '../index';
import { emitToHackathon } from '../lib/socket';
import { prisma } from '../lib/prisma';

export const operationsRouter = Router({ mergeParams: true });
operationsRouter.use(authenticate);
operationsRouter.use(requireHackathonAccess);

operationsRouter.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const metrics = await getOpsDashboard(req.params.hackathonId!);
    res.json(metrics);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

operationsRouter.get('/rooms', async (req: Request, res: Response) => {
  try {
    const cards = await getRoomCards(req.params.hackathonId!);
    res.json(cards);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

operationsRouter.get('/rooms/:roomId', async (req: Request, res: Response) => {
  try {
    const data = await getLiveRoomData(req.params.hackathonId!, req.params.roomId!);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

operationsRouter.get('/exceptions', async (req: Request, res: Response) => {
  try {
    const exceptions = await getExceptions(req.params.hackathonId!);
    res.json(exceptions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

operationsRouter.post('/rooms/:roomId/check-capacity', async (req: Request, res: Response) => {
  try {
    const { teamIds } = req.body;
    if (!Array.isArray(teamIds) || teamIds.length === 0) {
      return res.status(400).json({ error: 'teamIds array required' });
    }
    const check = await checkCapacity(req.params.hackathonId!, req.params.roomId!, teamIds);
    res.json(check);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/rooms/:roomId/assign', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { teamIds, overrideReason } = req.body;
    if (!Array.isArray(teamIds) || teamIds.length === 0) {
      return res.status(400).json({ error: 'teamIds array required' });
    }
    const userId = (req as any).user!.id;
    const result = await assignTeamsToRoom(req.params.hackathonId!, req.params.roomId!, teamIds, userId, overrideReason);
    await logActivity({
      action: `${result.assigned} teams assigned to room`,
      hackathonId: req.params.hackathonId!,
      actorId: userId,
      entityType: 'Room',
      entityId: req.params.roomId!,
      metadata: { teamIds, override: !!overrideReason },
    }).catch(() => {});
    const room = await prisma.room.findUnique({ where: { id: req.params.roomId! } });
    if (room) {
      emitToHackathon(io, req.params.hackathonId!, 'room:occupancy', { roomId: room.id, roomName: room.name });
    }
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/teams/:teamId/move', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { targetRoomId, overrideReason } = req.body;
    if (!targetRoomId) return res.status(400).json({ error: 'targetRoomId required' });
    const userId = (req as any).user!.id;
    await moveTeamToRoom(req.params.hackathonId!, req.params.teamId!, targetRoomId, userId, overrideReason);
    await logActivity({
      action: `Team moved to room`,
      hackathonId: req.params.hackathonId!,
      actorId: userId,
      entityType: 'Team',
      entityId: req.params.teamId!,
      metadata: { targetRoomId, override: !!overrideReason },
    }).catch(() => {});
    emitToHackathon(io, req.params.hackathonId!, 'team:room-moved', { teamId: req.params.teamId!, targetRoomId });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/teams/unassign', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { teamIds } = req.body;
    if (!Array.isArray(teamIds) || teamIds.length === 0) {
      return res.status(400).json({ error: 'teamIds array required' });
    }
    const result = await unassignTeams(req.params.hackathonId!, teamIds);
    await logActivity({
      action: `${result.unassigned} teams unassigned from rooms`,
      hackathonId: req.params.hackathonId!,
      actorId: (req as any).user!.id,
      entityType: 'Team',
      metadata: { teamIds },
    }).catch(() => {});
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

operationsRouter.get('/auto-assign-preview', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const preview = await previewAutoAssign(req.params.hackathonId!);
    res.json(preview);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

operationsRouter.post('/auto-assign', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    const result = await applyAutoAssign(req.params.hackathonId!, userId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

operationsRouter.get('/capacity-overrides', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const overrides = await prisma.capacityOverride.findMany({
      where: { hackathonId: req.params.hackathonId! },
      include: { room: { select: { name: true } }, actor: { select: { name: true } }, team: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(overrides);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
