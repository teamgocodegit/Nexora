import { prisma } from '../../lib/prisma';
import { launchCampaign } from './campaign.service';
import { logger } from '../../lib/logger';

const SCHEDULER_INTERVAL = parseInt(process.env.EMAIL_SCHEDULER_INTERVAL || '15000', 15);

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

async function checkDueCampaigns(): Promise<void> {
  try {
    const now = new Date();

    const dueCampaigns = await prisma.emailCampaign.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: now },
      },
      select: { id: true, hackathonId: true, createdById: true, name: true },
    });

    for (const campaign of dueCampaigns) {
      logger.info(`[Scheduler] Launching due campaign: ${campaign.name} (${campaign.id})`);
      try {
        await launchCampaign(campaign.hackathonId, campaign.id, campaign.createdById);
        logger.info(`[Scheduler] Campaign ${campaign.id} launched successfully`);
      } catch (err: any) {
        logger.error(`[Scheduler] Failed to launch campaign ${campaign.id}: ${err.message}`);
        await prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: { status: 'FAILED', failureReason: err.message },
        }).catch(() => {});
      }
    }
  } catch (err: any) {
    logger.error(`[Scheduler] Error checking due campaigns: ${err.message}`);
  }
}

export function startScheduler(): void {
  if (schedulerTimer) return;
  logger.info(`[Scheduler] Started (interval: ${SCHEDULER_INTERVAL}ms)`);
  checkDueCampaigns();
  schedulerTimer = setInterval(checkDueCampaigns, SCHEDULER_INTERVAL);
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  logger.info('[Scheduler] Stopped');
}
