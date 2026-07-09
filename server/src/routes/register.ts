import { Router } from 'express';
import { z } from 'zod';
import { RegistrationStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { generateRegistrationId } from '../services/teamId.service';
import { logger } from '../lib/logger';

export const publicRegisterRouter = Router();

const memberSchema = z.object({
  name: z.string().min(1, 'Member name is required'),
  email: z.string().email('Valid member email is required'),
  phone: z.string().optional(),
});

const registerSchema = z.object({
  teamName: z.string().min(1, 'Team name is required'),
  college: z.string().optional(),
  city: z.string().optional(),
  leaderName: z.string().min(1, 'Leader name is required'),
  leaderEmail: z.string().email('Valid leader email is required'),
  leaderPhone: z.string().optional(),
  members: z.array(memberSchema).optional().default([]),
  gitHubUrl: z.string().url().optional().or(z.literal('')),
  linkedInUrl: z.string().url().optional().or(z.literal('')),
  portfolioUrl: z.string().url().optional().or(z.literal('')),
  dietary: z.string().optional(),
  accessibility: z.string().optional(),
});

publicRegisterRouter.post('/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
    const hackathon = await prisma.hackathon.findUnique({
      where: { slug },
    });

    if (!hackathon) {
      return res.status(404).json({ error: 'Hackathon not found' });
    }

    if (hackathon.status === 'ENDED') {
      return res.status(400).json({ error: 'Registration is closed. This hackathon has ended.' });
    }

    if (hackathon.registrationDeadline && new Date(hackathon.registrationDeadline) < new Date()) {
      return res.status(400).json({ error: 'Registration deadline has passed.' });
    }

    if (hackathon.registrationOpen && new Date(hackathon.registrationOpen) > new Date()) {
      return res.status(400).json({ error: 'Registration is not yet open.' });
    }

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid registration data',
        details: parsed.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    const { teamName, leaderName, leaderEmail, leaderPhone, members, college, city, gitHubUrl, linkedInUrl, portfolioUrl, dietary, accessibility } = parsed.data;

    const allEmails = [leaderEmail, ...members.map((m) => m.email)];
    const uniqueEmails = new Set(allEmails);
    if (uniqueEmails.size !== allEmails.length) {
      return res.status(400).json({ error: 'Duplicate email addresses detected across team members.' });
    }

    const existingTeam = await prisma.team.findFirst({
      where: { hackathonId: hackathon.id, name: { equals: teamName, mode: 'insensitive' } },
    });
    if (existingTeam) {
      return res.status(409).json({ error: 'A team with this name is already registered.' });
    }

    const existingRegistration = await prisma.registration.findFirst({
      where: { hackathonId: hackathon.id, teamName: { equals: teamName, mode: 'insensitive' } },
    });
    if (existingRegistration) {
      return res.status(409).json({ error: 'A registration with this team name already exists.' });
    }

    const existingByLeaderEmail = await prisma.registration.findFirst({
      where: { hackathonId: hackathon.id, leaderEmail },
    });
    if (existingByLeaderEmail) {
      return res.status(409).json({ error: 'This email address has already been used to register.' });
    }

    if (hackathon.maxTeams) {
      const acceptedCount = await prisma.team.count({
        where: { hackathonId: hackathon.id },
      });
      if (acceptedCount >= hackathon.maxTeams) {
        if (!hackathon.waitlistEnabled) {
          return res.status(400).json({ error: 'The hackathon has reached maximum capacity.' });
        }
      }
    }

    const totalMembers = 1 + members.length;
    if (totalMembers < hackathon.minTeamSize) {
      return res.status(400).json({
        error: `Minimum team size is ${hackathon.minTeamSize}. You need at least ${hackathon.minTeamSize - 1} additional member(s).`,
      });
    }
    if (totalMembers > hackathon.maxTeamSize) {
      return res.status(400).json({
        error: `Maximum team size is ${hackathon.maxTeamSize}. You have ${totalMembers - hackathon.maxTeamSize} extra member(s).`,
      });
    }

    const regCount = await prisma.registration.count({
      where: { hackathonId: hackathon.id },
    });
    const registrationId = generateRegistrationId(slug, regCount + 1);

    let status: 'PENDING_APPROVAL' | 'ACCEPTED' | 'WAITLISTED' | 'REJECTED' = 'PENDING_APPROVAL';

    if (!hackathon.approvalRequired) {
      if (hackathon.maxTeams) {
        const acceptedCount = await prisma.team.count({
          where: { hackathonId: hackathon.id },
        });
        if (acceptedCount < hackathon.maxTeams) {
          status = 'ACCEPTED';
        } else if (hackathon.waitlistEnabled) {
          status = 'WAITLISTED';
        }
      } else {
        status = 'ACCEPTED';
      }
    }

    const registration = await prisma.registration.create({
      data: {
        registrationId,
        hackathonId: hackathon.id,
        teamName,
        status,
        leaderName,
        leaderEmail,
        leaderPhone: leaderPhone || null,
        college: college || null,
        city: city || null,
        memberData: { members: parsed.data.members },
        gitHubUrl: gitHubUrl || null,
        linkedInUrl: linkedInUrl || null,
        portfolioUrl: portfolioUrl || null,
        dietary: dietary || null,
        accessibility: accessibility || null,
      },
    });

    if (status === 'ACCEPTED') {
      await acceptRegistration(registration.id, hackathon.id);
    }

    await prisma.activityLog.create({
      data: {
        action: `Registration "${registrationId}" submitted by ${leaderName} (${teamName})`,
        hackathonId: hackathon.id,
        actorId: hackathon.createdById,
        metadata: { status, teamName, leaderEmail },
      },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));

    res.status(201).json({
      registrationId: registration.registrationId,
      status: registration.status,
      teamName: registration.teamName,
      message: status === 'ACCEPTED'
        ? 'Your team has been accepted! Check your email for details.'
        : status === 'WAITLISTED'
        ? 'The hackathon is currently full. Your team has been added to the waitlist.'
        : 'Registration submitted successfully. You will receive a confirmation email once reviewed.',
    });
  } catch (err: any) {
    logger.error(`[Register] ${err}`);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

async function acceptRegistration(registrationId: string, hackathonId: string) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
  });
  if (!registration) return;

  const teamIdService = await import('../services/teamId.service');
  const tid = await teamIdService.generateTeamId(hackathonId);
  const qrToken = await teamIdService.generateQrToken();

  const members = (registration.memberData as any)?.members || [];
  const allParticipants = [
    { name: registration.leaderName, email: registration.leaderEmail, phone: registration.leaderPhone, isLeader: true },
    ...members.map((m: any) => ({ name: m.name, email: m.email, phone: m.phone, isLeader: false })),
  ];

  await prisma.team.create({
    data: {
      hackathonId,
      name: registration.teamName,
      teamId: tid,
      qrToken,
      participants: {
        create: allParticipants,
      },
    },
  });

  await prisma.registration.update({
    where: { id: registrationId },
    data: { status: 'ACCEPTED' },
  });
}

export const adminRegistrationRouter = Router({ mergeParams: true });
adminRegistrationRouter.use(authenticate);

adminRegistrationRouter.get('/', requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { status, search } = req.query;
    const registrations = await prisma.registration.findMany({
      where: {
        hackathonId: req.params.hackathonId,
        ...(status && status !== 'ALL' ? { status: status as RegistrationStatus } : {}),
        ...(search && typeof search === 'string'
          ? {
              OR: [
                { teamName: { contains: search, mode: 'insensitive' } },
                { leaderName: { contains: search, mode: 'insensitive' } },
                { leaderEmail: { contains: search, mode: 'insensitive' } },
                { registrationId: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(registrations);
  } catch {
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

adminRegistrationRouter.get('/stats', requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const hackathonId = req.params.hackathonId;
    const [total, pending, accepted, waitlisted, rejected, capacity] = await Promise.all([
      prisma.registration.count({ where: { hackathonId } }),
      prisma.registration.count({ where: { hackathonId, status: 'PENDING_APPROVAL' } }),
      prisma.registration.count({ where: { hackathonId, status: 'ACCEPTED' } }),
      prisma.registration.count({ where: { hackathonId, status: 'WAITLISTED' } }),
      prisma.registration.count({ where: { hackathonId, status: 'REJECTED' } }),
      prisma.team.count({ where: { hackathonId } }),
    ]);
    const hackathon = await prisma.hackathon.findUnique({
      where: { id: hackathonId },
      select: { maxTeams: true },
    });
    res.json({
      total,
      pending,
      accepted,
      waitlisted,
      rejected,
      capacity: hackathon?.maxTeams || null,
      acceptedTeams: capacity,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch registration stats' });
  }
});

const statusUpdateSchema = z.object({
  status: z.enum(['PENDING_APPROVAL', 'ACCEPTED', 'WAITLISTED', 'REJECTED']),
});

adminRegistrationRouter.patch('/:registrationId/status', requireSuperAdmin, async (req: AuthRequest, res) => {
  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const { status } = parsed.data;
  const hackathonId = req.params.hackathonId;

  try {
    const registration = await prisma.registration.findFirst({
      where: { id: req.params.registrationId, hackathonId },
    });
    if (!registration) return res.status(404).json({ error: 'Registration not found' });

    if (status === 'ACCEPTED' && registration.status !== 'ACCEPTED') {
      await acceptRegistration(registration.id, hackathonId);
    } else {
      await prisma.registration.update({
        where: { id: registration.id },
        data: { status },
      });
    }

    await prisma.activityLog.create({
      data: {
        action: `Registration "${registration.registrationId}" (${registration.teamName}) status changed to ${status}`,
        hackathonId,
        actorId: req.user!.id,
        metadata: { previousStatus: registration.status, newStatus: status },
      },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));

    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update registration status' });
  }
});

adminRegistrationRouter.post('/bulk-status', requireSuperAdmin, async (req: AuthRequest, res) => {
  const schema = z.object({
    ids: z.array(z.string()).min(1),
    status: z.enum(['PENDING_APPROVAL', 'ACCEPTED', 'WAITLISTED', 'REJECTED']),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const { ids, status } = parsed.data;
  const hackathonId = req.params.hackathonId;

  try {
    let updated = 0;
    for (const id of ids) {
      const reg = await prisma.registration.findFirst({ where: { id, hackathonId } });
      if (!reg) continue;

      if (status === 'ACCEPTED' && reg.status !== 'ACCEPTED') {
        await acceptRegistration(reg.id, hackathonId);
      } else {
        await prisma.registration.update({ where: { id: reg.id }, data: { status } });
      }
      updated++;
    }

    await prisma.activityLog.create({
      data: {
        action: `Bulk status update: ${updated} registrations set to ${status}`,
        hackathonId,
        actorId: req.user!.id,
        metadata: { count: updated, status },
      },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));

    res.json({ success: true, updated });
  } catch {
    res.status(500).json({ error: 'Failed to bulk update registrations' });
  }
});

adminRegistrationRouter.get('/:registrationId', requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const registration = await prisma.registration.findFirst({
      where: { id: req.params.registrationId, hackathonId: req.params.hackathonId },
    });
    if (!registration) return res.status(404).json({ error: 'Registration not found' });
    res.json(registration);
  } catch {
    res.status(500).json({ error: 'Failed to fetch registration' });
  }
});
