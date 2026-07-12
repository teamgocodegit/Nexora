import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma';
import { authenticate, requireSuperAdmin, requireHackathonAccess, AuthRequest } from '../middleware/auth';
import { createResendProvider } from '../services/email/resend.provider';
import { renderTemplate, extractVariables, BUILTIN_TEMPLATES, sanitizeHtml } from '../services/email/template.service';
import { resolveAudience, buildTemplateContext, launchCampaign } from '../services/email/campaign.service';
import { logger } from '../lib/logger';

export const emailRouter = Router({ mergeParams: true });
emailRouter.use(authenticate);
emailRouter.use(requireHackathonAccess);
emailRouter.use(requireSuperAdmin);

const emailActionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many email actions. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /campaigns - List all campaigns
emailRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const campaigns = await prisma.emailCampaign.findMany({
      where: { hackathonId: req.params.hackathonId },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { recipients: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(campaigns);
  } catch {
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// GET /campaigns/:id - Get single campaign with recipients
emailRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, hackathonId: req.params.hackathonId },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const statusFilter = req.query.status as string | undefined;

    const whereRecipients: Record<string, unknown> = { campaignId: campaign.id };
    if (statusFilter && ['PENDING', 'PROCESSING', 'SENT', 'RETRYING', 'FAILED', 'CANCELLED'].includes(statusFilter)) {
      whereRecipients.status = statusFilter;
    }

    const [recipients, totalRecipients] = await Promise.all([
      prisma.emailRecipient.findMany({
        where: whereRecipients,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.emailRecipient.count({ where: whereRecipients }),
    ]);

    res.json({ campaign, recipients, totalRecipients, page, limit });
  } catch {
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// POST /draft - Create draft campaign
emailRouter.post('/draft', async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1),
    subject: z.string().min(1),
    messageBody: z.string().min(1),
    bodyFormat: z.enum(['html', 'text']).optional(),
    audienceType: z.string().min(1),
    audienceFilter: z.any().optional(),
    scheduledAt: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });

  const sanitizedBody = sanitizeHtml(parsed.data.messageBody);
  const sanitizedSubject = parsed.data.subject.replace(/<[^>]*>/g, '');

  try {
    const campaign = await prisma.emailCampaign.create({
      data: {
        hackathonId: req.params.hackathonId,
        createdById: req.user!.id,
        name: parsed.data.name,
        subject: sanitizedSubject,
        messageBody: sanitizedBody,
        bodyFormat: parsed.data.bodyFormat || 'html',
        audienceType: parsed.data.audienceType,
        audienceFilter: parsed.data.audienceFilter ? JSON.parse(JSON.stringify(parsed.data.audienceFilter)) : undefined,
        status: parsed.data.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
      },
    });

    await prisma.activityLog.create({
      data: {
        action: `Email campaign "${campaign.name}" created as ${campaign.status}`,
        hackathonId: req.params.hackathonId,
        actorId: req.user!.id,
        metadata: { campaignId: campaign.id, status: campaign.status },
      },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));

    res.status(201).json(campaign);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// POST /:id/send-now - Launch campaign immediately
emailRouter.post('/:id/send-now', emailActionLimiter, async (req: AuthRequest, res) => {
  try {
    const result = await launchCampaign(req.params.hackathonId, req.params.id, req.user!.id);

    await prisma.activityLog.create({
      data: {
        action: `Email campaign launched: ${result.totalRecipients} recipients`,
        hackathonId: req.params.hackathonId,
        actorId: req.user!.id,
        metadata: { campaignId: req.params.id, totalRecipients: result.totalRecipients },
      },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /:id/cancel - Cancel campaign
emailRouter.post('/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, hackathonId: req.params.hackathonId },
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(campaign.status)) {
      return res.status(400).json({ error: `Cannot cancel campaign with status: ${campaign.status}` });
    }

    const alreadySent = await prisma.emailRecipient.count({
      where: { campaignId: campaign.id, status: 'SENT' },
    });

    await prisma.emailRecipient.updateMany({
      where: { campaignId: campaign.id, status: { in: ['PENDING', 'PROCESSING', 'RETRYING'] } },
      data: { status: 'CANCELLED' },
    });

    const cancelledCount = await prisma.emailRecipient.count({
      where: { campaignId: campaign.id, status: 'CANCELLED' },
    });

    await prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: {
        status: 'CANCELLED',
        cancelledCount,
        sentCount: alreadySent,
        pendingCount: 0,
        processingCount: 0,
        completedAt: new Date(),
      },
    });

    await prisma.activityLog.create({
      data: {
        action: `Email campaign "${campaign.name}" cancelled. ${alreadySent} already sent, ${cancelledCount} cancelled.`,
        hackathonId: req.params.hackathonId,
        actorId: req.user!.id,
        metadata: { campaignId: campaign.id, alreadySent, cancelledCount },
      },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));

    res.json({ success: true, alreadySent, cancelledCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /test - Send test email
emailRouter.post('/test', emailActionLimiter, async (req: AuthRequest, res) => {
  const schema = z.object({
    subject: z.string().min(1),
    messageBody: z.string().min(1),
    testEmail: z.string().email(),
    testName: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });

  const sanitizedBody = sanitizeHtml(parsed.data.messageBody);
  const sanitizedSubject = parsed.data.subject.replace(/<[^>]*>/g, '');

  try {
    const html = renderTemplate(sanitizedBody, {
      participantName: parsed.data.testName || 'Test User',
      teamName: 'Test Team',
      teamId: 'NEX-TEST-001',
      leaderName: 'Test Leader',
      leaderEmail: parsed.data.testEmail,
      hackathonName: (await prisma.hackathon.findUnique({ where: { id: req.params.hackathonId } }))?.name || 'Test Hackathon',
      hackathonVenue: 'Test Venue',
      roomName: 'Test Room',
      eventDate: new Date().toLocaleDateString(),
      eventTime: new Date().toLocaleTimeString(),
      registrationId: 'TEST-REG-001',
      certificateUrl: 'https://example.com/cert',
    });

    const provider = createResendProvider();
    const result = await provider.send({
      to: parsed.data.testEmail,
      subject: `[TEST] ${sanitizedSubject}`,
      html,
    });

    if (!result.success) {
      return res.status(502).json({ error: result.error || 'Provider rejected test email' });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /preview/:id - Preview campaign with sample recipient
emailRouter.get('/preview/:id', async (req: AuthRequest, res) => {
  try {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, hackathonId: req.params.hackathonId },
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const hackathon = await prisma.hackathon.findUnique({ where: { id: req.params.hackathonId } });
    if (!hackathon) return res.status(404).json({ error: 'Hackathon not found' });

    const audience = await resolveAudience(
      req.params.hackathonId,
      campaign.audienceType as any,
      (campaign.audienceFilter || undefined) as Record<string, unknown> | undefined
    );

    const sampleRecipient = audience.recipients[0];
    if (!sampleRecipient) {
      return res.json({
        campaign,
        renderedSubject: campaign.subject,
        renderedBody: campaign.messageBody,
        sampleRecipient: null,
        variables: extractVariables(campaign.subject + campaign.messageBody),
        audience,
      });
    }

    const context = buildTemplateContext(
      hackathon,
      sampleRecipient.teamName || 'Team',
      null,
      null,
      sampleRecipient.name,
      sampleRecipient.name,
      sampleRecipient.email,
    );

    const renderedSubject = renderTemplate(campaign.subject, context);
    const renderedBody = renderTemplate(campaign.messageBody, context);

    res.json({
      campaign,
      renderedSubject,
      renderedBody,
      sampleRecipient,
      variables: extractVariables(campaign.subject + campaign.messageBody),
      audience,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /audience/count - Count audience without creating campaign
emailRouter.get('/audience/count', async (req: AuthRequest, res) => {
  const schema = z.object({
    audienceType: z.string().min(1),
    room: z.string().optional(),
    teamIds: z.array(z.string()).optional(),
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid audience parameters' });

  try {
    const audience = await resolveAudience(
      req.params.hackathonId,
      parsed.data.audienceType as any,
      { room: parsed.data.room, teamIds: parsed.data.teamIds },
    );
    res.json(audience);
  } catch {
    res.status(500).json({ error: 'Failed to resolve audience' });
  }
});

// GET /templates - List built-in templates
emailRouter.get('/templates/list', async (_req: AuthRequest, res) => {
  res.json(BUILTIN_TEMPLATES);
});

// GET /rooms - List rooms for audience filtering
emailRouter.get('/rooms/list', async (req: AuthRequest, res) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { hackathonId: req.params.hackathonId, deletedAt: null },
      select: { id: true, name: true },
    });
    res.json(rooms);
  } catch {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// PATCH /:id - Update draft campaign
emailRouter.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, hackathonId: req.params.hackathonId },
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!['DRAFT', 'SCHEDULED'].includes(campaign.status)) {
      return res.status(400).json({ error: `Cannot update campaign with status: ${campaign.status}` });
    }

    const schema = z.object({
      name: z.string().min(1).optional(),
      subject: z.string().min(1).optional(),
      messageBody: z.string().min(1).optional(),
      audienceType: z.string().optional(),
      audienceFilter: z.any().optional(),
      scheduledAt: z.string().nullable().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

    const data: Record<string, unknown> = { ...parsed.data };
    if (data.audienceFilter) {
      data.audienceFilter = JSON.parse(JSON.stringify(data.audienceFilter));
    }
    if (typeof data.messageBody === 'string') {
      data.messageBody = sanitizeHtml(data.messageBody as string);
    }
    if (typeof data.subject === 'string') {
      data.subject = (data.subject as string).replace(/<[^>]*>/g, '');
    }
    if (data.scheduledAt !== undefined) {
      data.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt as string) : null;
      data.status = data.scheduledAt ? 'SCHEDULED' : 'DRAFT';
    }

    const updated = await prisma.emailCampaign.update({
      where: { id: campaign.id },
      data,
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// DELETE /:id - Delete a draft or scheduled campaign
emailRouter.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, hackathonId: req.params.hackathonId },
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (!['DRAFT', 'SCHEDULED', 'FAILED', 'CANCELLED'].includes(campaign.status)) {
      return res.status(400).json({ error: `Cannot delete campaign with status: ${campaign.status}. Cancel it first.` });
    }

    await prisma.emailRecipient.deleteMany({ where: { campaignId: campaign.id } });
    await prisma.emailCampaign.delete({ where: { id: campaign.id } });

    await prisma.activityLog.create({
      data: {
        action: `Email campaign "${campaign.name}" deleted`,
        hackathonId: req.params.hackathonId,
        actorId: req.user!.id,
        metadata: { campaignId: campaign.id },
      },
    }).catch((e) => logger.error(`[ActivityLog] ${e}`));

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});
