import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

export interface ImpactSummary {
  teams: number;
  participants: number;
  scores: number;
  certificates: number;
  roomAssignments: number;
  campaignRelationships: number;
}

export async function calculateTeamDeleteImpact(teamId: string): Promise<ImpactSummary> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      _count: { select: { participants: true, scores: true, certificates: true } },
    },
  });

  if (!team) throw new Error('Team not found');

  return {
    teams: 1,
    participants: team._count.participants,
    scores: team._count.scores,
    certificates: team._count.certificates,
    roomAssignments: team.room ? 1 : 0,
    campaignRelationships: 0,
  };
}

export async function softDeleteTeam(
  teamId: string,
  hackathonId: string,
  deletedById: string,
  reason?: string,
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { participants: true },
  });

  if (!team) throw new Error('Team not found');

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.participant.updateMany({
      where: { teamId },
      data: { deletedAt: now, deletedById, deletionReason: reason || 'Team deleted' },
    });

    await tx.team.update({
      where: { id: teamId },
      data: {
        deletedAt: now,
        deletedById,
        deletionReason: reason || null,
      },
    });
  });
}

export async function restoreTeam(teamId: string): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { participants: true },
  });

  if (!team) throw new Error('Team not found');
  if (!team.deletedAt) throw new Error('Team is not deleted');

  await prisma.$transaction(async (tx) => {
    await tx.participant.updateMany({
      where: { teamId, deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null, deletionReason: null },
    });

    await tx.team.update({
      where: { id: teamId },
      data: { deletedAt: null, deletedById: null, deletionReason: null },
    });
  });
}

export async function softDeleteRoom(
  roomId: string,
  hackathonId: string,
  deletedById: string,
  reason?: string,
): Promise<{ teamsReassigned: number }> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
  });

  if (!room) throw new Error('Room not found');

  const teamsInRoom = await prisma.team.count({
    where: { room: room.name, hackathonId, deletedAt: null },
  });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.team.updateMany({
      where: { room: room.name, hackathonId, deletedAt: null },
      data: { room: null },
    });

    await tx.room.update({
      where: { id: roomId },
      data: { deletedAt: now, deletedById, deletionReason: reason || null },
    });
  });

  return { teamsReassigned: teamsInRoom };
}

export async function restoreRoom(roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new Error('Room not found');
  if (!room.deletedAt) throw new Error('Room is not deleted');

  await prisma.room.update({
    where: { id: roomId },
    data: { deletedAt: null, deletedById: null, deletionReason: null },
  });
}

export async function softDeleteParticipant(
  participantId: string,
  deletedById: string,
  reason?: string,
): Promise<void> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { team: { select: { hackathonId: true } } },
  });

  if (!participant) throw new Error('Participant not found');

  await prisma.participant.update({
    where: { id: participantId },
    data: {
      deletedAt: new Date(),
      deletedById,
      deletionReason: reason || null,
    },
  });
}

export async function restoreParticipant(participantId: string): Promise<void> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
  });

  if (!participant) throw new Error('Participant not found');
  if (!participant.deletedAt) throw new Error('Participant is not deleted');

  await prisma.participant.update({
    where: { id: participantId },
    data: { deletedAt: null, deletedById: null, deletionReason: null },
  });
}

export async function checkTeamDeleteGuard(teamId: string): Promise<{ allowed: boolean; blockers: string[] }> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      _count: { select: { scores: true, certificates: true } },
    },
  });

  if (!team) throw new Error('Team not found');

  const blockers: string[] = [];
  if (team.status === 'CHECKED_IN') {
    blockers.push(`Team "${team.name}" has already checked in. Archive the team instead.`);
  }
  if (team.status === 'ACTIVE' || team.status === 'SUBMITTED') {
    blockers.push(`Team "${team.name}" is in ${team.status} status with ongoing activity.`);
  }
  if (team._count.scores > 0) {
    blockers.push(`Team "${team.name}" has ${team._count.scores} judging scores. Delete scores first or archive.`);
  }
  if (team._count.certificates > 0) {
    blockers.push(`Team "${team.name}" has ${team._count.certificates} certificates. Revoke certificates first or archive.`);
  }

  return { allowed: blockers.length === 0, blockers };
}

export async function getDeletedRecords(hackathonId: string) {
  const [teams, rooms, participants] = await Promise.all([
    prisma.team.findMany({
      where: { hackathonId, deletedAt: { not: null } },
      include: { deletedBy: { select: { id: true, name: true } } },
    }),
    prisma.room.findMany({
      where: { hackathonId, deletedAt: { not: null } },
      include: { deletedBy: { select: { id: true, name: true } } },
    }),
    prisma.participant.findMany({
      where: { team: { hackathonId }, deletedAt: { not: null } },
      include: {
        deletedBy: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
      take: 500,
    }),
  ]);

  return { teams, rooms, participants };
}
