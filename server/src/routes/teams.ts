import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TeamStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate, requireSuperAdmin, requireRole } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { io } from '../index';
import { emitToHackathon } from '../lib/socket';
import { getMetrics } from '../services/metricsService';

export const teamsRouter = Router({ mergeParams: true });
teamsRouter.use(authenticate);

// 👇 define params type properly
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

const mapTeam = (t: any) => ({
  ...t,
  coordinator: t.coordinator
    ? {
        id: t.coordinator.userId,
        name: t.coordinator.user?.name ?? 'Unknown',
      }
    : null,
});

const VALID_STATUSES: TeamStatus[] = [
  'REGISTERED',
  'CHECKED_IN',
  'ACTIVE',
  'SUBMITTED',
  'DISQUALIFIED',
];

// ✅ GET ALL TEAMS
teamsRouter.get(
  '/',
  async (req: Request<Params> & AuthRequest, res: Response) => {
    try {
      const { status, search, coordinatorId } = req.query;

      const isCoordinator = req.user?.role === 'COORDINATOR' || req.user?.role === 'SUB_ADMIN';
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
                        name: {
                          contains: search,
                          mode: 'insensitive',
                        },
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
      res
        .status(500)
        .json({ error: 'Failed to fetch teams', details: err.message });
    }
  }
);

// ✅ GET ONE TEAM
teamsRouter.get(
  '/:id',
  async (req: Request<Params> & AuthRequest, res: Response) => {
    try {
      const team = await prisma.team.findFirst({
        where: {
          id: req.params.id,
          hackathonId: req.params.hackathonId,
        },
        include: teamInclude,
      });

      if (!team) return res.status(404).json({ error: 'Team not found' });

      res.json(mapTeam(team));
    } catch {
      res.status(500).json({ error: 'Failed to fetch team' });
    }
  }
);

// ✅ UPDATE TEAM
teamsRouter.patch(
  '/:id',
  async (req: Request<Params> & AuthRequest, res: Response) => {
    const {
      status,
      room,
      tableNumber,
      notes,
      coordinatorId,
      projectName,
      projectUrl,
      leaderPhone,
      problemStatementId,
    } = req.body;

    try {
      const team = await prisma.team.update({
        where: { id: req.params.id },
        data: {
          ...(status && VALID_STATUSES.includes(status) && { status }),
          ...(room !== undefined && { room: room || null }),
          ...(tableNumber !== undefined && {
            tableNumber: tableNumber || null,
          }),
          ...(notes !== undefined && { notes: notes || null }),
          ...(coordinatorId !== undefined && {
            coordinatorId: coordinatorId || null,
          }),
          ...(projectName !== undefined && {
            projectName: projectName || null,
          }),
          ...(projectUrl !== undefined && {
            projectUrl: projectUrl || null,
          }),
          ...(leaderPhone !== undefined && {
            leaderPhone: leaderPhone || null,
          }),
          ...(problemStatementId !== undefined && {
            problemStatementId: problemStatementId || null,
          }),
        },
        include: teamInclude,
      });

      prisma.activityLog
        .create({
          data: {
            action: `Team "${team.name}" updated`,
            hackathonId: req.params.hackathonId,
            actorId: req.user!.id,
            teamId: team.id,
            teamName: team.name,
            metadata: req.body,
          },
        })
        .catch(() => {});

      const mapped = mapTeam(team);

      emitToHackathon(
        io,
        req.params.hackathonId,
        'team:updated',
        mapped
      );

      getMetrics(req.params.hackathonId)
        .then((m) =>
          emitToHackathon(io, req.params.hackathonId, 'metrics:updated', m)
        )
        .catch(() => {});

      res.json(mapped);
    } catch (err: any) {
      res
        .status(500)
        .json({ error: 'Failed to update team', details: err.message });
    }
  }
);

// ✅ CHECK-IN
teamsRouter.post(
  '/:id/checkin',
  async (req: Request<Params> & AuthRequest, res: Response) => {
    try {
      const team = await prisma.team.update({
        where: { id: req.params.id },
        data: { status: 'CHECKED_IN', checkInTime: new Date() },
        include: teamInclude,
      });

      prisma.activityLog
        .create({
          data: {
            action: `Team "${team.name}" checked in`,
            hackathonId: req.params.hackathonId,
            actorId: req.user!.id,
            teamId: team.id,
            teamName: team.name,
          },
        })
        .catch(() => {});

      const mapped = mapTeam(team);

      emitToHackathon(
        io,
        req.params.hackathonId,
        'team:checkin',
        { team: mapped, timestamp: new Date() }
      );

      emitToHackathon(
        io,
        req.params.hackathonId,
        'team:updated',
        mapped
      );

      res.json(mapped);
    } catch (err: any) {
      res
        .status(500)
        .json({ error: 'Failed to check in', details: err.message });
    }
  }
);

// ✅ CREATE TEAM
teamsRouter.post(
  '/',
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
      return res
        .status(400)
        .json({ error: 'Invalid input', details: parsed.error.errors });
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
        return res
          .status(409)
          .json({ error: 'Team name already exists' });
      }
      res.status(500).json({ error: 'Failed to create team' });
    }
  }
);

// ✅ DELETE (Super Admin only)
teamsRouter.delete('/:id', requireSuperAdmin, async (req: Request<Params> & AuthRequest, res: Response) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (team) {
      prisma.activityLog.create({
        data: {
          action: `Team "${team.name}" deleted by ${req.user!.name}`,
          hackathonId: req.params.hackathonId,
          actorId: req.user!.id,
          teamId: team.id,
          teamName: team.name,
        },
      }).catch(() => {});
    }
    await prisma.team.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete team' });
  }
});
