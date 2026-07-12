import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, requireHackathonAccess, AuthRequest } from '../middleware/auth';
import { inviteAcceptLimiter } from '../middleware/rateLimiter';
import { logger } from '../lib/logger';

export const inviteRouter = Router();

/* ─── POST /invites ─── Create invite link ─── */
inviteRouter.post('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const schema = z.object({
    hackathonId: z.string(),
    expiresInDays: z.number().min(1).max(30).optional().default(7),
    requireApproval: z.boolean().optional().default(false),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
  }

  const { hackathonId, expiresInDays, requireApproval } = parsed.data;

  if (req.user?.role !== 'SUPER_ADMIN') {
    const assignment = await prisma.coordinatorAssignment.findUnique({
      where: { hackathonId_userId: { hackathonId, userId: req.user!.id } },
    });
    if (!assignment) {
      return res.status(403).json({ error: 'You do not have access to this hackathon' });
    }
  }

  try {
    const hackathon = await prisma.hackathon.findUnique({ where: { id: hackathonId } });
    if (!hackathon) return res.status(404).json({ error: 'Hackathon not found' });

    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 3600000);

    const invite = await prisma.inviteLink.create({
      data: {
        hackathonId,
        createdById: req.user!.id,
        expiresAt,
        approved: !requireApproval,
      },
    });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const inviteUrl = `${clientUrl}/join/${invite.token}`;
    const message = `Hi! ${req.user!.name} has invited you to coordinate "${hackathon.name}" on Nexora.\n\nJoin as coordinator: ${inviteUrl}\n\nThis link expires in ${expiresInDays} day${expiresInDays !== 1 ? 's' : ''}.`;

    logger.info(`[Invite] Created by ${req.user!.id} for hackathon ${hackathonId}`);

    return res.json({
      token: invite.token,
      url: inviteUrl,
      expiresAt: invite.expiresAt,
      message,
    });
  } catch (err: any) {
    logger.error(`[Invite create error] ${err}`);
    return res.status(500).json({ error: 'Failed to create invite link' });
  }
});

/* ─── GET /invites/:token ─── Preview invite ─── */
inviteRouter.get('/:token', async (req, res) => {
  try {
    const invite = await prisma.inviteLink.findUnique({
      where: { token: req.params.token },
      include: {
        hackathon: {
          select: {
            id: true,
            name: true,
            description: true,
            venue: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        },
        createdBy: { select: { name: true } },
      },
    });

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found or already used' });
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(410).json({ error: 'This invite link has expired' });
    }

    if (invite.usedAt) {
      return res.status(409).json({ error: 'This invite has already been used' });
    }

    return res.json({
      hackathon: invite.hackathon,
      createdBy: invite.createdBy.name,
      expiresAt: invite.expiresAt,
      requiresApproval: !invite.approved,
    });
  } catch (err: any) {
    logger.error(`[Invite preview error] ${err}`);
    return res.status(500).json({ error: 'Failed to fetch invite details' });
  }
});

/* ─── POST /invites/:token/accept ─── Accept invite ─── */
inviteRouter.post('/:token/accept', inviteAcceptLimiter, authenticate, async (req: AuthRequest, res) => {
  try {
    const invite = await prisma.inviteLink.findUnique({
      where: { token: req.params.token },
      include: { hackathon: true },
    });

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(410).json({ error: 'This invite link has expired' });
    }
    if (invite.usedAt) {
      return res.status(409).json({ error: 'This invite has already been used' });
    }

    // Upsert coordinator assignment
    await prisma.coordinatorAssignment.upsert({
      where: {
        hackathonId_userId: {
          hackathonId: invite.hackathonId,
          userId: req.user!.id,
        },
      },
      update: {},
      create: {
        hackathonId: invite.hackathonId,
        userId: req.user!.id,
      },
    });

    // Mark invite as used
    await prisma.inviteLink.update({
      where: { id: invite.id },
      data: {
        usedAt: new Date(),
        usedBy: req.user!.id,
      },
    });

    // Log activity
    prisma.activityLog.create({
      data: {
        action: `${req.user!.name} joined as coordinator via invite link`,
        hackathonId: invite.hackathonId,
        actorId: req.user!.id,
      },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));

    logger.info(`[Invite] ${req.user!.id} accepted invite for hackathon ${invite.hackathonId}`);

    return res.json({
      success: true,
      hackathon: invite.hackathon,
      message: `You've joined ${invite.hackathon.name} as a coordinator!`,
    });
  } catch (err: any) {
    logger.error(`[Invite accept error] ${err}`);
    return res.status(500).json({ error: 'Failed to accept invite' });
  }
});

/* ─── GET /invites — List all active invites (admin only) ─── */
inviteRouter.get('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const hackathonId = req.query.hackathonId as string | undefined;
    const invites = await prisma.inviteLink.findMany({
      where: {
        ...(hackathonId && { hackathonId }),
        usedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        hackathon: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(invites);
  } catch (err: any) {
    logger.error(`[Invite list error] ${err}`);
    return res.status(500).json({ error: 'Failed to list invites' });
  }
});

/* ─── DELETE /invites/:id — Revoke invite ─── */
inviteRouter.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    await prisma.inviteLink.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to revoke invite' });
  }
});
