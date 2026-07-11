import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

export interface StuckJob {
  type: 'IMPORT' | 'CAMPAIGN';
  id: string;
  name: string;
  status: string;
  stuckForMinutes: number;
  startedAt: string | null;
  recoverable: boolean;
  recoveryAction: string;
}

export async function findStuckJobs(hackathonId: string): Promise<StuckJob[]> {
  const stuck: StuckJob[] = [];
  const now = Date.now();

  const stuckImports = await prisma.importBatch.findMany({
    where: {
      hackathonId,
      status: 'IMPORTING',
      createdAt: { lte: new Date(now - 3600000) },
    },
  });

  for (const b of stuckImports) {
    const minutes = Math.round((now - b.createdAt.getTime()) / 60000);
    stuck.push({
      type: 'IMPORT',
      id: b.id,
      name: b.originalFileName,
      status: b.status,
      stuckForMinutes: minutes,
      startedAt: b.createdAt.toISOString(),
      recoverable: true,
      recoveryAction: 'Cancel the import batch and re-upload the file. No data loss expected as import is transactional.',
    });
  }

  const stuckCampaigns = await prisma.emailCampaign.findMany({
    where: {
      hackathonId,
      status: 'PROCESSING',
      startedAt: { lte: new Date(now - 600000) },
    },
  });

  for (const c of stuckCampaigns) {
    const started = c.startedAt || c.createdAt;
    const minutes = Math.round((now - started.getTime()) / 60000);
    stuck.push({
      type: 'CAMPAIGN',
      id: c.id,
      name: c.name,
      status: c.status,
      stuckForMinutes: minutes,
      startedAt: started.toISOString(),
      recoverable: true,
      recoveryAction: 'Cancel the campaign, verify email worker is running, then re-launch from draft.',
    });
  }

  const stuckCerts = await prisma.certificate.findMany({
    where: {
      hackathonId,
      status: 'GENERATING',
      createdAt: { lte: new Date(now - 1800000) },
    },
    take: 20,
  });

  for (const c of stuckCerts) {
    const minutes = Math.round((now - c.createdAt.getTime()) / 60000);
    stuck.push({
      type: 'CAMPAIGN',
      id: c.id,
      name: `Certificate for ${c.participantName}`,
      status: c.status,
      stuckForMinutes: minutes,
      startedAt: c.createdAt.toISOString(),
      recoverable: false,
      recoveryAction: 'Manually regenerate the certificate. Check certificate worker.',
    });
  }

  return stuck;
}

export async function recoverStuckImport(batchId: string): Promise<void> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) throw new Error('Import batch not found');
  if (batch.status !== 'IMPORTING') throw new Error('Import is not in IMPORTING status');

  await prisma.importBatch.update({
    where: { id: batchId },
    data: { status: 'FAILED', failureReason: 'Cancelled by reliability recovery — stuck in IMPORTING' },
  });

  logger.info(`[StuckJobs] Recovered stuck import ${batchId} — set to FAILED`);
}

export async function recoverStuckCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status !== 'PROCESSING') throw new Error('Campaign is not in PROCESSING status');

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status: 'FAILED', failureReason: 'Campaign stuck in PROCESSING — recovered by reliability system' },
  });

  await prisma.emailRecipient.updateMany({
    where: { campaignId, status: 'PROCESSING' },
    data: { status: 'FAILED', lastError: 'Recovered by reliability system — worker timeout' },
  });

  logger.info(`[StuckJobs] Recovered stuck campaign ${campaignId} — set to FAILED, PROCESSING recipients to FAILED`);
}
