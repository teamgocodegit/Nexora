import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import crypto from 'crypto';

export type SnapshotType = 'MANUAL' | 'PRE_EVENT' | 'EVENT_START' | 'MID_EVENT' | 'PRE_JUDGING' | 'PRE_RESULTS' | 'FINAL' | 'AUTOMATIC';

interface SnapshotData {
  schemaVersion: number;
  createdAt: string;
  hackathon: Record<string, unknown>;
  teams: Record<string, unknown>[];
  participants: Record<string, unknown>[];
  rooms: Record<string, unknown>[];
  registrations: Record<string, unknown>[];
  scoringCriteria: Record<string, unknown>[];
  scores: Record<string, unknown>[];
  certificates: Record<string, unknown>[];
  problemStatements: Record<string, unknown>[];
  milestones: Record<string, unknown>[];
  importBatches: Record<string, unknown>[];
  emailCampaigns: Record<string, unknown>[];
}

export async function createSnapshot(
  hackathonId: string,
  type: SnapshotType,
  createdById: string,
): Promise<string> {
  const existing = await prisma.hackathonSnapshot.findFirst({
    where: { hackathonId, status: 'CREATING' },
  });
  if (existing) {
    throw new Error('A snapshot is already being created for this hackathon');
  }

  const snapshot = await prisma.hackathonSnapshot.create({
    data: { type, status: 'CREATING', hackathonId, createdById },
  });

  try {
    const [hackathon, teams, participants, rooms, registrations, scoringCriteria, scores, certificates, problemStatements, milestones, importBatches, emailCampaigns] = await Promise.all([
      prisma.hackathon.findUnique({ where: { id: hackathonId } }),
      prisma.team.findMany({ where: { hackathonId } }),
      prisma.participant.findMany({ where: { team: { hackathonId } } }),
      prisma.room.findMany({ where: { hackathonId } }),
      prisma.registration.findMany({ where: { hackathonId } }),
      prisma.scoringCriteria.findMany({ where: { hackathonId } }),
      prisma.score.findMany({ where: { team: { hackathonId } } }),
      prisma.certificate.findMany({ where: { hackathonId } }),
      prisma.problemStatement.findMany({ where: { hackathonId } }),
      prisma.eventMilestone.findMany({ where: { hackathonId } }),
      prisma.importBatch.findMany({ where: { hackathonId } }),
      prisma.emailCampaign.findMany({ where: { hackathonId } }),
    ]);

    if (!hackathon) throw new Error('Hackathon not found');

    const data: SnapshotData = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      hackathon: JSON.parse(JSON.stringify(hackathon)),
      teams: JSON.parse(JSON.stringify(teams)),
      participants: JSON.parse(JSON.stringify(participants)),
      rooms: JSON.parse(JSON.stringify(rooms)),
      registrations: JSON.parse(JSON.stringify(registrations)),
      scoringCriteria: JSON.parse(JSON.stringify(scoringCriteria)),
      scores: JSON.parse(JSON.stringify(scores)),
      certificates: JSON.parse(JSON.stringify(certificates)),
      problemStatements: JSON.parse(JSON.stringify(problemStatements)),
      milestones: JSON.parse(JSON.stringify(milestones)),
      importBatches: JSON.parse(JSON.stringify(importBatches)),
      emailCampaigns: JSON.parse(JSON.stringify(emailCampaigns)),
    };

    const serialized = JSON.stringify(data);
    const checksum = crypto.createHash('sha256').update(serialized).digest('hex');
    const byteSize = Buffer.byteLength(serialized, 'utf-8');

    const recordCounts = {
      teams: teams.length,
      participants: participants.length,
      rooms: rooms.length,
      registrations: registrations.length,
      scoringCriteria: scoringCriteria.length,
      scores: scores.length,
      certificates: certificates.length,
      problemStatements: problemStatements.length,
      milestones: milestones.length,
      importBatches: importBatches.length,
      emailCampaigns: emailCampaigns.length,
    };

    await prisma.hackathonSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: 'COMPLETED',
        checksum,
        data: data as any,
        recordCounts: recordCounts as any,
        size: byteSize,
        completedAt: new Date(),
      },
    });

    logger.info(`[Snapshot] Created ${type} snapshot ${snapshot.id} for hackathon ${hackathonId} (${byteSize} bytes)`);
    return snapshot.id;
  } catch (err: any) {
    await prisma.hackathonSnapshot.update({
      where: { id: snapshot.id },
      data: { status: 'FAILED', failureReason: err.message },
    }).catch(() => {});
    throw err;
  }
}

export async function verifySnapshotIntegrity(snapshotId: string): Promise<{ valid: boolean; expected: string; computed: string }> {
  const snapshot = await prisma.hackathonSnapshot.findUnique({
    where: { id: snapshotId },
  });

  if (!snapshot) throw new Error('Snapshot not found');
  if (snapshot.status !== 'COMPLETED') throw new Error('Snapshot is not completed');
  if (!snapshot.data || !snapshot.checksum) throw new Error('Snapshot has no data or checksum');

  const serialized = JSON.stringify(snapshot.data);
  const computed = crypto.createHash('sha256').update(serialized).digest('hex');

  return {
    valid: computed === snapshot.checksum,
    expected: snapshot.checksum,
    computed,
  };
}

export interface RestorePlan {
  dryRun: boolean;
  snapshot: { id: string; type: string; createdAt: string; checksum: string };
  integrity: { valid: boolean } | null;
  currentCounts: Record<string, number>;
  snapshotCounts: Record<string, number>;
  restoreBlockers: string[];
  restoreDisabled: boolean;
}

export async function planRestore(
  snapshotId: string,
  hackathonId: string,
): Promise<RestorePlan> {
  const snapshot = await prisma.hackathonSnapshot.findUnique({
    where: { id: snapshotId },
  });

  if (!snapshot) throw new Error('Snapshot not found');
  if (snapshot.status !== 'COMPLETED') throw new Error('Snapshot is not completed');
  if (!snapshot.data) throw new Error('Snapshot has no data');

  const data = snapshot.data as unknown as SnapshotData;
  const blockers: string[] = [];

  let integrity: { valid: boolean } | null = null;
  try {
    integrity = await verifySnapshotIntegrity(snapshotId);
    if (!integrity.valid) blockers.push('Snapshot checksum is invalid — data may be corrupted');
  } catch { blockers.push('Could not verify snapshot integrity'); }

  const [teamCount, participantCount, roomCount, certCount, scoreCount] = await Promise.all([
    prisma.team.count({ where: { hackathonId, deletedAt: null } }),
    prisma.participant.count({ where: { team: { hackathonId }, deletedAt: null } }),
    prisma.room.count({ where: { hackathonId, deletedAt: null } }),
    prisma.certificate.count({ where: { hackathonId } }),
    prisma.score.count({ where: { team: { hackathonId } } }),
  ]);

  return {
    dryRun: true,
    snapshot: {
      id: snapshot.id,
      type: snapshot.type,
      createdAt: snapshot.createdAt.toISOString(),
      checksum: snapshot.checksum || '',
    },
    integrity,
    currentCounts: {
      teams: teamCount,
      participants: participantCount,
      rooms: roomCount,
      certificates: certCount,
      scores: scoreCount,
    },
    snapshotCounts: {
      teams: data.teams.length,
      participants: data.participants.length,
      rooms: data.rooms.length,
      certificates: data.certificates.length,
      scores: data.scores.length,
    },
    restoreBlockers: blockers,
    restoreDisabled: true,
  };
}

export async function listSnapshots(hackathonId: string) {
  return prisma.hackathonSnapshot.findMany({
    where: { hackathonId },
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });
}
