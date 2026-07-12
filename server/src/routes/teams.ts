import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TeamStatus, Team } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate, requireSuperAdmin, requireHackathonAccess, requirePermission } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import type { Permission } from '../middleware/permissions';
import { io } from '../index';
import { emitToHackathon } from '../lib/socket';
import { getMetrics } from '../services/metricsService';
import { logger } from '../lib/logger';
import { softDeleteTeam } from '../services/reliability/softDelete.service';
import { logActivity } from '../services/reliability/activityLog.service';

export const teamsRouter = Router({ mergeParams: true });
teamsRouter.use(authenticate);
teamsRouter.use(requireHackathonAccess);

type Params = {
  hackathonId: string;
  id?: string;
};

const teamInclude = {
  participants: true,
  coordinator: {
    include: {
      user: { select: { id: true, name: true } },
    },
  },
  problemStatement: { select: { id: true, title: true } },
};

const mapTeam = (t: Team & { coordinator?: { userId: string; user?: { name: string } | null } | null }) => ({
  ...t,
  coordinator: t.coordinator
    ? {
        id: t.coordinator.userId,
        name: t.coordinator.user?.name ?? 'Unknown',
      }
    : null,
});

const VALID_STATUSES: TeamStatus[] = [
  'REGISTERED', 'CHECKED_IN', 'ACTIVE', 'SUBMITTED', 'DISQUALIFIED',
];

teamsRouter.get(
  '/',
  requirePermission('team:view', 'team:search'),
  async (req: Request<Params> & AuthRequest, res: Response) => {
    try {
      const { status, search, coordinatorId } = req.query;

      const isCoordinator = req.user?.role === 'SUB_ADMIN';
      let coordFilter: Record<string, any> = {};

      if (isCoordinator) {
        const a = await prisma.coordinatorAssignment.findFirst({
          where: {
            hackathonId: req.params.hackathonId,
            userId: req.user!.id,
          },
        });
        coordFilter = a ? { coordinatorId: a.id } : { id: '__NONE__' };
      }

      if (coordinatorId && typeof coordinatorId === 'string') {
        coordFilter = { coordinatorId };
      }

      const teams = await prisma.team.findMany({
        where: {
          hackathonId: req.params.hackathonId,
          deletedAt: null,
          ...(status && VALID_STATUSES.includes(status as TeamStatus)
            ? { status: status as TeamStatus }
            : {}),
          ...(search && typeof search === 'string'
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { room: { contains: search, mode: 'insensitive' } },
                  {
                    participants: {
                      some: {
                        name: { contains: search, mode: 'insensitive' },
                      },
                    },
                  },
                ],
              }
            : {}),
          ...coordFilter,
        },
        include: teamInclude,
        orderBy: { updatedAt: 'desc' },
      });

      res.json(teams.map(mapTeam));
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch teams', details: err.message });
    }
  }
);

teamsRouter.get(
  '/checked-in',
  requirePermission('team:view'),
  async (req: Request<Params> & AuthRequest, res: Response) => {
    try {
      const teams = await prisma.team.findMany({
        where: {
          hackathonId: req.params.hackathonId,
          deletedAt: null,
          status: 'CHECKED_IN',
        },
        include: teamInclude,
        orderBy: { checkInTime: 'desc' },
      });
      res.json(teams.map(mapTeam));
    } catch {
      res.status(500).json({ error: 'Failed to fetch checked-in teams' });
    }
  }
);

teamsRouter.get(
  '/:id',
  requirePermission('team:view'),
  async (req: Request<Params> & AuthRequest, res: Response) => {
    try {
      const team = await prisma.team.findFirst({
        where: { id: req.params.id, hackathonId: req.params.hackathonId, deletedAt: null },
        include: teamInclude,
      });
      if (!team) return res.status(404).json({ error: 'Team not found' });
      res.json(mapTeam(team));
    } catch {
      res.status(500).json({ error: 'Failed to fetch team' });
    }
  }
);

teamsRouter.patch(
  '/:id',
  requirePermission('team:edit'),
  async (req: Request<Params> & AuthRequest, res: Response) => {
    const { status, room, tableNumber, notes, coordinatorId, projectName, projectUrl, leaderPhone, problemStatementId } = req.body;

    try {
      const team = await prisma.team.update({
        where: { id: req.params.id },
        data: {
          ...(status && VALID_STATUSES.includes(status) && { status }),
          ...(room !== undefined && { room: room || null }),
          ...(tableNumber !== undefined && { tableNumber: tableNumber || null }),
          ...(notes !== undefined && { notes: notes || null }),
          ...(coordinatorId !== undefined && { coordinatorId: coordinatorId || null }),
          ...(projectName !== undefined && { projectName: projectName || null }),
          ...(projectUrl !== undefined && { projectUrl: projectUrl || null }),
          ...(leaderPhone !== undefined && { leaderPhone: leaderPhone || null }),
          ...(problemStatementId !== undefined && { problemStatementId: problemStatementId || null }),
        },
        include: teamInclude,
      });

      prisma.activityLog.create({
        data: {
          action: `Team "${team.name}" updated`,
          hackathonId: req.params.hackathonId,
          actorId: req.user!.id,
          teamId: team.id,
          teamName: team.name,
          metadata: req.body,
        },
      }).catch((e) => logger.error(`[ActivityLog] ${e}`));

      const mapped = mapTeam(team);
      emitToHackathon(io, req.params.hackathonId, 'team:updated', mapped);
      getMetrics(req.params.hackathonId)
        .then((m) => emitToHackathon(io, req.params.hackathonId, 'metrics:updated', m))
        .catch((e) => logger.error(`[Metrics] ${e}`));

      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update team', details: err.message });
    }
  }
);

teamsRouter.post(
  '/:id/checkin',
  requirePermission('team:checkin'),
  async (req: Request<Params> & AuthRequest, res: Response) => {
    try {
      const team = await prisma.team.update({
        where: { id: req.params.id },
        data: { status: 'CHECKED_IN', checkInTime: new Date(), checkInBy: req.user?.name || req.user!.id },
        include: teamInclude,
      });

      prisma.activityLog.create({
        data: {
          action: `Team "${team.name}" checked in`,
          hackathonId: req.params.hackathonId,
          actorId: req.user!.id,
          teamId: team.id,
          teamName: team.name,
        },
      }).catch((e) => logger.error(`[ActivityLog] ${e}`));

      const mapped = mapTeam(team);
      emitToHackathon(io, req.params.hackathonId, 'team:checkin', { team: mapped, timestamp: new Date() });
      emitToHackathon(io, req.params.hackathonId, 'team:updated', mapped);

      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to check in', details: err.message });
    }
  }
);

teamsRouter.post(
  '/',
  requirePermission('team:create'),
  async (req: Request<Params> & AuthRequest, res: Response) => {
    const schema = z.object({
      name: z.string().min(1),
      leaderPhone: z.string().optional(),
      room: z.string().optional(),
      participants: z
        .array(
          z.object({
            name: z.string(),
            email: z.string().optional(),
            phone: z.string().optional(),
            isLeader: z.boolean().default(false),
          })
        )
        .optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
    }

    try {
      const team = await prisma.team.create({
        data: {
          name: parsed.data.name,
          hackathonId: req.params.hackathonId,
          leaderPhone: parsed.data.leaderPhone,
          room: parsed.data.room,
          participants: parsed.data.participants
            ? { create: parsed.data.participants }
            : undefined,
        },
        include: teamInclude,
      });

      res.status(201).json(mapTeam(team));
    } catch (err: any) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'Team name already exists' });
      }
      res.status(500).json({ error: 'Failed to create team' });
    }
  }
);

teamsRouter.post(
  '/:id/undo-checkin',
  requirePermission('team:checkin'),
  async (req: Request<Params> & AuthRequest, res: Response) => {
    try {
      const team = await prisma.team.update({
        where: { id: req.params.id },
        data: { status: 'REGISTERED', checkInTime: null, checkInBy: null },
        include: teamInclude,
      });

      prisma.activityLog.create({
        data: {
          action: `Team "${team.name}" check-in undone`,
          hackathonId: req.params.hackathonId,
          actorId: req.user!.id,
          teamId: team.id,
          teamName: team.name,
        },
      }).catch((e) => logger.error(`[ActivityLog] ${e}`));

      const mapped = mapTeam(team);
      emitToHackathon(io, req.params.hackathonId, 'team:updated', mapped);
      getMetrics(req.params.hackathonId)
        .then((m) => emitToHackathon(io, req.params.hackathonId, 'metrics:updated', m))
        .catch((e) => logger.error(`[Metrics] ${e}`));

      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to undo check-in', details: err.message });
    }
  }
);

teamsRouter.delete('/:id', requirePermission('team:delete'), async (req: Request<Params> & AuthRequest, res: Response) => {
  try {
    const teamId = req.params.id!;
    const { reason } = req.body || {};
    await softDeleteTeam(teamId, req.params.hackathonId!, req.user!.id, reason);
    await logActivity({
      action: `Team soft-deleted`,
      hackathonId: req.params.hackathonId!,
      actorId: req.user!.id,
      entityType: 'Team',
      entityId: teamId,
      teamId,
      metadata: { reason: reason || null },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to delete team' });
  }
});
