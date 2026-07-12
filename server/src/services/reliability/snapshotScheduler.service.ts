import { prisma } from '../../lib/prisma';
import { createSnapshot, type SnapshotType } from './snapshot.service';
import { logger } from '../../lib/logger';

const SCHEDULER_INTERVAL = parseInt(process.env.SNAPSHOT_SCHEDULER_INTERVAL || '3600000', 10);

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

const AUTOMATED_SNAPSHOT_TYPES: SnapshotType[] = ['AUTOMATIC', 'MID_EVENT', 'PRE_RESULTS'];

async function checkAndCreateAutomatedSnapshots(): Promise<void> {
  try {
    const activeHackathons = await prisma.hackathon.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, status: true },
    });

    for (const hackathon of activeHackathons) {
      const lastSnapshot = await prisma.hackathonSnapshot.findFirst({
        where: { hackathonId: hackathon.id, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });

      const hoursSinceLastSnapshot = lastSnapshot
        ? (Date.now() - lastSnapshot.createdAt.getTime()) / 3600000
        : Infinity;

      if (hoursSinceLastSnapshot >= 24) {
        try {
          const admins = await prisma.user.findMany({
            where: { role: 'SUPER_ADMIN', isActive: true },
            select: { id: true },
            take: 1,
          });

          const adminId = admins[0]?.id;
          if (!adminId) continue;

          await createSnapshot(hackathon.id, 'AUTOMATIC', adminId);
          logger.info(`[SnapshotScheduler] Automated snapshot created for hackathon "${hackathon.name}"`);
        } catch (err: any) {
          logger.error(`[SnapshotScheduler] Failed automated snapshot for "${hackathon.name}": ${err.message}`);
        }
      }
    }
  } catch (err: any) {
    logger.error(`[SnapshotScheduler] Error: ${err.message}`);
  }
}

export function startSnapshotScheduler(): void {
  if (schedulerTimer) return;
  logger.info(`[SnapshotScheduler] Started (interval: ${SCHEDULER_INTERVAL}ms)`);
  checkAndCreateAutomatedSnapshots();
  schedulerTimer = setInterval(checkAndCreateAutomatedSnapshots, SCHEDULER_INTERVAL);
}

export function stopSnapshotScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  logger.info('[SnapshotScheduler] Stopped');
}
