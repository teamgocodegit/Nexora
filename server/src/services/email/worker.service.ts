import { prisma } from '../../lib/prisma';
import { createResendProvider } from './resend.provider';
import type { EmailProvider } from './provider';
import { renderTemplate, type TemplateContext } from './template.service';
import { logger } from '../../lib/logger';
import { emitToHackathon } from '../../lib/socket';
import { io } from '../../index';

const BATCH_SIZE = parseInt(process.env.EMAIL_BATCH_SIZE || '20', 10);
const WORKER_INTERVAL = parseInt(process.env.EMAIL_WORKER_INTERVAL || '3000', 10);
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 60000;

let provider: EmailProvider | null = null;
let workerTimer: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

function getProvider(): EmailProvider {
  if (!provider) {
    provider = createResendProvider();
  }
  return provider;
}

function classifyError(error: string): 'temporary' | 'permanent' {
  const lower = error.toLowerCase();
  const temporaryPatterns = [
    'rate limit', 'timeout', 'too many requests', 'service unavailable',
    'temporarily', 'try again', 'connection', 'network', 'econnrefused',
    'econnreset', 'etimedout', '5', 'internal server error',
  ];
  for (const pattern of temporaryPatterns) {
    if (lower.includes(pattern)) return 'temporary';
  }
  return 'permanent';
}

async function processRecipient(
  recipient: {
    id: string;
    email: string;
    recipientName: string | null;
    personalizedSubject: string | null;
    campaign: {
      id: string;
      hackathonId: string;
      subject: string;
      messageBody: string;
    };
  }
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const subject = recipient.personalizedSubject || recipient.campaign.subject;
  const html = renderTemplate(recipient.campaign.messageBody, {
    participantName: recipient.recipientName || 'Participant',
    teamName: '',
    teamId: '',
    leaderName: '',
    leaderEmail: '',
    hackathonName: '',
    hackathonVenue: '',
    roomName: '',
    eventDate: '',
    eventTime: '',
    registrationId: '',
    certificateUrl: '',
  });

  const result = await getProvider().send({
    to: recipient.email,
    subject,
    html,
  });

  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];

  if (result.success) {
    updates.push({
      id: recipient.id,
      data: {
        status: 'SENT',
        sentAt: new Date(),
        providerMessageId: result.providerMessageId,
        attemptCount: { increment: 1 },
      },
    });
  } else if (classifyError(result.error || '') === 'temporary') {
    const attemptCount = await prisma.emailRecipient.findUnique({
      where: { id: recipient.id },
      select: { attemptCount: true },
    }).then((r) => r?.attemptCount || 0);

    if (attemptCount >= MAX_RETRIES) {
      updates.push({
        id: recipient.id,
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          lastError: result.error,
          attemptCount: { increment: 1 },
        },
      });
    } else {
      const nextRetryAt = new Date(Date.now() + RETRY_DELAY_BASE * Math.pow(2, attemptCount));
      updates.push({
        id: recipient.id,
        data: {
          status: 'RETRYING',
          nextRetryAt,
          lastError: result.error,
          attemptCount: { increment: 1 },
        },
      });
    }
  } else {
    updates.push({
      id: recipient.id,
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        lastError: result.error,
        attemptCount: { increment: 1 },
      },
    });
  }

  return updates;
}

async function applyUpdates(updates: Array<{ id: string; data: Record<string, unknown> }>, campaignIds: Set<string>): Promise<void> {
  for (const u of updates) {
    await prisma.emailRecipient.update({ where: { id: u.id }, data: u.data as any });
  }
  for (const cid of campaignIds) {
    await updateCampaignCounts(cid);
  }
  for (const cid of campaignIds) {
    const campaign = await prisma.emailCampaign.findUnique({ where: { id: cid }, select: { hackathonId: true } });
    if (campaign) emitProgress(campaign.hackathonId, cid);
  }
}

async function updateCampaignCounts(campaignId: string): Promise<void> {
  const [sent, failed, pending, processing, retrying] = await Promise.all([
    prisma.emailRecipient.count({ where: { campaignId, status: 'SENT' } }),
    prisma.emailRecipient.count({ where: { campaignId, status: 'FAILED' } }),
    prisma.emailRecipient.count({ where: { campaignId, status: 'PENDING' } }),
    prisma.emailRecipient.count({ where: { campaignId, status: 'PROCESSING' } }),
    prisma.emailRecipient.count({ where: { campaignId, status: 'RETRYING' } }),
  ]);

  const total = sent + failed + pending + processing + retrying;
  let status = 'PROCESSING';

  if (pending === 0 && processing === 0 && retrying === 0) {
    status = failed > 0 && sent > 0 ? 'PARTIAL' : failed > 0 ? 'FAILED' : 'COMPLETED';
  }

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      sentCount: sent,
      failedCount: failed,
      pendingCount: pending,
      processingCount: processing,
      status: status as any,
      completedAt: ['COMPLETED', 'PARTIAL', 'FAILED'].includes(status) ? new Date() : undefined,
    },
  });
}

function emitProgress(hackathonId: string, campaignId: string): void {
  try {
    emitToHackathon(io, hackathonId, 'campaign:progress', { campaignId });
  } catch {
    // socket not available
  }
}

async function processNextBatch(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const recipients = await prisma.emailRecipient.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          { status: 'RETRYING', nextRetryAt: { lte: new Date() } },
        ],
      },
      include: {
        campaign: {
          select: {
            id: true,
            hackathonId: true,
            subject: true,
            messageBody: true,
          },
        },
      },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    if (recipients.length === 0) return;

    await prisma.emailRecipient.updateMany({
      where: { id: { in: recipients.map((r) => r.id) } },
      data: { status: 'PROCESSING' },
    });

    const results = await Promise.allSettled(
      recipients.map((r) => processRecipient(r))
    );

    const allUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];
    const refreshedCampaignIds = new Set<string>();

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allUpdates.push(...result.value);
        for (const u of result.value) {
          const recipient = recipients.find((r) => r.id === u.id);
          if (recipient) refreshedCampaignIds.add(recipient.campaign.id);
        }
      }
    }

    await applyUpdates(allUpdates, refreshedCampaignIds);
  } catch (err: any) {
    logger.error(`[EmailWorker] Batch error: ${err.message}`);
  } finally {
    isProcessing = false;
  }
}

export function startEmailWorker(): void {
  if (workerTimer) return;
  logger.info(`[EmailWorker] Started (batch: ${BATCH_SIZE}, interval: ${WORKER_INTERVAL}ms)`);
  workerTimer = setInterval(processNextBatch, WORKER_INTERVAL);
  processNextBatch();
}

export function stopEmailWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
  logger.info('[EmailWorker] Stopped');
}
