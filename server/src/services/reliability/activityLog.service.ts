import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

export interface LogActivityParams {
  action: string;
  hackathonId: string;
  actorId: string;
  entityType?: string;
  entityId?: string;
  teamId?: string;
  teamName?: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        action: params.action,
        hackathonId: params.hackathonId,
        actorId: params.actorId,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        teamId: params.teamId ?? null,
        teamName: params.teamName ?? null,
        metadata: (params.metadata ?? undefined) as any,
      },
    });
  } catch (err) {
    logger.error(`[ActivityLog] Failed to log: ${params.action} — ${err}`);
  }
}
