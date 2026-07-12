import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { z } from 'zod';

export const createRoomSchema = z.object({
  name: z.string().min(1, 'Room name is required'),
  code: z.string().optional(),
  description: z.string().optional(),
  building: z.string().optional(),
  floor: z.string().optional(),
  capacityTeams: z.number().int().positive().optional(),
  capacityPeople: z.number().int().positive().optional(),
  capacity: z.number().int().positive().default(30),
  notes: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateRoomSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  building: z.string().optional().nullable(),
  floor: z.string().optional().nullable(),
  capacityTeams: z.number().int().positive().optional().nullable(),
  capacityPeople: z.number().int().positive().optional().nullable(),
  capacity: z.number().int().positive().optional(),
  notes: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
  status: z.enum(['ACTIVE', 'FULL', 'CLOSED', 'ARCHIVED']).optional(),
});

interface OccupancyInfo {
  teamCount: number;
  peopleCount: number;
}

export async function getRoomOccupancy(hackathonId: string, roomName: string): Promise<OccupancyInfo> {
  const teams = await prisma.team.findMany({
    where: { hackathonId, room: roomName, deletedAt: null },
    select: { id: true, _count: { select: { participants: true } } },
  });
  const teamCount = teams.length;
  const peopleCount = teams.reduce((sum, t) => sum + t._count.participants, 0);
  return { teamCount, peopleCount };
}

export async function getBulkOccupancy(hackathonId: string): Promise<Map<string, OccupancyInfo>> {
  const teams = await prisma.team.findMany({
    where: { hackathonId, room: { not: null }, deletedAt: null },
    select: { room: true, _count: { select: { participants: true } } },
  });
  const map = new Map<string, OccupancyInfo>();
  for (const t of teams) {
    const room = t.room!;
    const cur = map.get(room) || { teamCount: 0, peopleCount: 0 };
    cur.teamCount++;
    cur.peopleCount += t._count.participants;
    map.set(room, cur);
  }
  return map;
}

export async function recalculateRoomStatus(hackathonId: string, roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.deletedAt) return;

  const occ = await getRoomOccupancy(hackathonId, room.name);

  const maxTeams = room.capacityTeams ?? null;
  const maxPeople = room.capacityPeople ?? null;

  let newStatus: string = room.status;
  if (room.status === 'CLOSED' || room.status === 'ARCHIVED') return;

  if ((maxTeams !== null && occ.teamCount >= maxTeams) ||
      (maxPeople !== null && occ.peopleCount >= maxPeople)) {
    newStatus = 'FULL';
  } else {
    newStatus = 'ACTIVE';
  }

  if (newStatus !== room.status) {
    await prisma.room.update({
      where: { id: roomId },
      data: { status: newStatus as any },
    });
  }
}

export interface CapacityCheck {
  allowed: boolean;
  reason?: string;
  projectedTeamCount: number;
  projectedPeopleCount: number;
}

export async function checkCapacity(
  hackathonId: string,
  roomId: string,
  teamIds: string[],
): Promise<CapacityCheck> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new Error('Room not found');
  if (room.deletedAt) throw new Error('Room is deleted');
  if (room.status === 'CLOSED') return { allowed: false, reason: 'Room is closed', projectedTeamCount: 0, projectedPeopleCount: 0 };

  const current = await getRoomOccupancy(hackathonId, room.name);

  const teamsToAdd = await prisma.team.findMany({
    where: { id: { in: teamIds }, hackathonId },
    select: { id: true, _count: { select: { participants: true } } },
  });

  const addTeams = teamsToAdd.length;
  const addPeople = teamsToAdd.reduce((sum, t) => sum + t._count.participants, 0);

  const projectedTeamCount = current.teamCount + addTeams;
  const projectedPeopleCount = current.peopleCount + addPeople;

  if (room.capacityTeams !== null && projectedTeamCount > room.capacityTeams) {
    return {
      allowed: false,
      reason: `Exceeds team capacity: ${projectedTeamCount} > ${room.capacityTeams}`,
      projectedTeamCount,
      projectedPeopleCount,
    };
  }

  if (room.capacityPeople !== null && projectedPeopleCount > room.capacityPeople) {
    return {
      allowed: false,
      reason: `Exceeds people capacity: ${projectedPeopleCount} > ${room.capacityPeople}`,
      projectedTeamCount,
      projectedPeopleCount,
    };
  }

  return { allowed: true, projectedTeamCount, projectedPeopleCount };
}

export async function assignTeamsToRoom(
  hackathonId: string,
  roomId: string,
  teamIds: string[],
  actorId: string,
  overrideReason?: string,
): Promise<{ assigned: number }> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new Error('Room not found');

  if (!overrideReason) {
    const check = await checkCapacity(hackathonId, roomId, teamIds);
    if (!check.allowed) {
      throw new Error(`Capacity check failed: ${check.reason}`);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const update = await tx.team.updateMany({
      where: { id: { in: teamIds }, hackathonId },
      data: { room: room.name, roomId: room.id },
    });

    if (overrideReason) {
      const current = await getRoomOccupancy(hackathonId, room.name);
      const teams = await prisma.team.findMany({
        where: { id: { in: teamIds }, hackathonId },
        select: { _count: { select: { participants: true } } },
      });
      const addPeople = teams.reduce((sum, t) => sum + t._count.participants, 0);
      await tx.capacityOverride.create({
        data: {
          reason: overrideReason,
          previousOccupancyTeams: current.teamCount,
          previousOccupancyPeople: current.peopleCount,
          projectedOccupancyTeams: current.teamCount + teamIds.length,
          projectedOccupancyPeople: current.peopleCount + addPeople,
          roomId,
          actorId,
          hackathonId,
          status: 'APPROVED',
        },
      });
    }

    return update.count;
  });

  await recalculateRoomStatus(hackathonId, roomId);
  return { assigned: result };
}

export async function moveTeamToRoom(
  hackathonId: string,
  teamId: string,
  targetRoomId: string,
  actorId: string,
  overrideReason?: string,
): Promise<void> {
  const targetRoom = await prisma.room.findUnique({ where: { id: targetRoomId } });
  if (!targetRoom) throw new Error('Target room not found');

  if (!overrideReason) {
    const check = await checkCapacity(hackathonId, targetRoomId, [teamId]);
    if (!check.allowed) {
      throw new Error(`Capacity check failed: ${check.reason}`);
    }
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  const previousRoom = team?.room;

  await prisma.team.update({
    where: { id: teamId },
    data: { room: targetRoom.name, roomId: targetRoom.id },
  });

  if (previousRoom) {
    const prevRoom = await prisma.room.findFirst({
      where: { hackathonId, name: previousRoom, deletedAt: null },
    });
    if (prevRoom) {
      await recalculateRoomStatus(hackathonId, prevRoom.id);
    }
  }

  await recalculateRoomStatus(hackathonId, targetRoomId);

  if (overrideReason) {
    const current = await getRoomOccupancy(hackathonId, targetRoom.name);
    const teamData = await prisma.team.findUnique({
      where: { id: teamId },
      select: { _count: { select: { participants: true } } },
    });
    await prisma.capacityOverride.create({
      data: {
        reason: overrideReason,
        previousOccupancyTeams: current.teamCount - 1,
        previousOccupancyPeople: current.peopleCount - (teamData?._count.participants || 0),
        projectedOccupancyTeams: current.teamCount,
        projectedOccupancyPeople: current.peopleCount,
        roomId: targetRoomId,
        teamId,
        actorId,
        hackathonId,
      },
    });
  }
}

export async function unassignTeams(
  hackathonId: string,
  teamIds: string[],
): Promise<{ unassigned: number }> {
  const affectedRooms = await prisma.team.findMany({
    where: { id: { in: teamIds }, room: { not: null }, deletedAt: null },
    select: { room: true },
    distinct: ['room'],
  });

  const result = await prisma.team.updateMany({
    where: { id: { in: teamIds }, hackathonId },
    data: { room: null, roomId: null },
  });

  for (const { room: roomName } of affectedRooms) {
    if (roomName) {
      const room = await prisma.room.findFirst({
        where: { hackathonId, name: roomName, deletedAt: null },
      });
      if (room) {
        await recalculateRoomStatus(hackathonId, room.id);
      }
    }
  }

  return { unassigned: result.count };
}

export interface AutoAssignPreview {
  totalTeams: number;
  assignable: number;
  unassignable: number;
  unassignableTeamIds: string[];
  allocations: Array<{ roomId: string; roomName: string; teamIds: string[]; teamCount: number; peopleCount: number; capacityTeams: number | null; capacityPeople: number | null }>;
  message: string;
}

export async function previewAutoAssign(hackathonId: string): Promise<AutoAssignPreview> {
  const [rooms, unassignedTeams] = await Promise.all([
    prisma.room.findMany({
      where: { hackathonId, deletedAt: null, status: { notIn: ['CLOSED', 'ARCHIVED'] } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.team.findMany({
      where: { hackathonId, roomId: null, room: null, deletedAt: null },
      select: { id: true, _count: { select: { participants: true } } },
    }),
  ]);

  const activeRooms = rooms.filter(r => r.status !== 'CLOSED' && r.status !== 'ARCHIVED');
  const occupancyMap = await getBulkOccupancy(hackathonId);

  const teamQueue = [...unassignedTeams];
  const allocations: AutoAssignPreview['allocations'] = [];

  for (const room of activeRooms) {
    const occ = occupancyMap.get(room.name) || { teamCount: 0, peopleCount: 0 };
    const maxTeams = room.capacityTeams ?? null;
    const maxPeople = room.capacityPeople ?? null;
    const roomAlloc: AutoAssignPreview['allocations'][0] = {
      roomId: room.id,
      roomName: room.name,
      teamIds: [],
      teamCount: occ.teamCount,
      peopleCount: occ.peopleCount,
      capacityTeams: maxTeams,
      capacityPeople: maxPeople,
    };

    while (teamQueue.length > 0) {
      const team = teamQueue[0];
      const teamSize = team._count.participants;

      if (maxTeams !== null && roomAlloc.teamCount + 1 > maxTeams) break;
      if (maxPeople !== null && roomAlloc.peopleCount + teamSize > maxPeople) break;

      const t = teamQueue.shift()!;
      roomAlloc.teamIds.push(t.id);
      roomAlloc.teamCount++;
      roomAlloc.peopleCount += teamSize;
    }

    allocations.push(roomAlloc);
  }

  const unassignableTeamIds = teamQueue.map(t => t.id);

  return {
    totalTeams: unassignedTeams.length,
    assignable: unassignedTeams.length - unassignableTeamIds.length,
    unassignable: unassignableTeamIds.length,
    unassignableTeamIds,
    allocations,
    message: unassignableTeamIds.length > 0
      ? `${unassignedTeams.length - unassignableTeamIds.length}/${unassignedTeams.length} teams can be assigned. ${unassignableTeamIds.length} teams cannot be assigned because available capacity is insufficient.`
      : `All ${unassignedTeams.length} unassigned teams can be assigned.`,
  };
}

export async function applyAutoAssign(hackathonId: string, actorId: string): Promise<{ assigned: number; unassigned: number }> {
  const preview = await previewAutoAssign(hackathonId);

  let totalAssigned = 0;
  for (const alloc of preview.allocations) {
    if (alloc.teamIds.length > 0) {
      await prisma.team.updateMany({
        where: { id: { in: alloc.teamIds }, hackathonId },
        data: { room: alloc.roomName, roomId: alloc.roomId },
      });
      totalAssigned += alloc.teamIds.length;
      await recalculateRoomStatus(hackathonId, alloc.roomId);
    }
  }

  await prisma.activityLog.create({
    data: {
      action: `Auto-assigned ${totalAssigned} teams to rooms`,
      hackathonId,
      actorId,
      entityType: 'Room',
      metadata: { assigned: totalAssigned, unassigned: preview.unassignable },
    },
  }).catch(e => logger.error(`[ActivityLog] ${e}`));

  return { assigned: totalAssigned, unassigned: preview.unassignable };
}

export async function archiveRoom(roomId: string, hackathonId: string, actorId: string): Promise<void> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new Error('Room not found');

  const activeTeams = await prisma.team.count({
    where: { hackathonId, room: room.name, deletedAt: null },
  });

  if (activeTeams > 0) {
    throw new Error(`Cannot archive room "${room.name}" — ${activeTeams} team(s) still assigned. Unassign teams first.`);
  }

  await prisma.room.update({
    where: { id: roomId },
    data: { status: 'ARCHIVED' },
  });

  await prisma.activityLog.create({
    data: {
      action: `Room "${room.name}" archived`,
      hackathonId,
      actorId,
      entityType: 'Room',
      entityId: roomId,
    },
  }).catch(e => logger.error(`[ActivityLog] ${e}`));
}

export async function restoreArchivedRoom(roomId: string, hackathonId: string, actorId: string): Promise<void> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new Error('Room not found');
  if (room.status !== 'ARCHIVED') throw new Error('Room is not archived');

  await prisma.room.update({
    where: { id: roomId },
    data: { status: 'ACTIVE' },
  });

  await prisma.activityLog.create({
    data: {
      action: `Room "${room.name}" restored from archive`,
      hackathonId,
      actorId,
      entityType: 'Room',
      entityId: roomId,
    },
  }).catch(e => logger.error(`[ActivityLog] ${e}`));
}

export async function reorderRooms(hackathonId: string, orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.room.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );
}
