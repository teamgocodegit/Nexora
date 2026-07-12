import { prisma } from '../../lib/prisma';
import { getBulkOccupancy } from './room.service';

export interface OpsDashboardMetrics {
  totalTeams: number;
  checkedIn: number;
  notArrived: number;
  assigned: number;
  unassigned: number;
  totalParticipants: number;
  activeRooms: number;
  fullRooms: number;
  closedRooms: number;
  nearlyFullRooms: number;
  capacityOverrides: number;
  checkedInNoRoom: number;
}

export interface RoomCard {
  id: string;
  name: string;
  code: string | null;
  building: string | null;
  floor: string | null;
  status: string;
  capacityTeams: number | null;
  capacityPeople: number | null;
  currentTeams: number;
  currentPeople: number;
  remainingTeamCapacity: number | null;
  remainingPeopleCapacity: number | null;
  sortOrder: number;
}

export async function getOpsDashboard(hackathonId: string): Promise<OpsDashboardMetrics> {
  const [
    totalTeams,
    checkedIn,
    totalParticipants,
    rooms,
    overridesCount,
    teamsNoRoom,
  ] = await Promise.all([
    prisma.team.count({ where: { hackathonId, deletedAt: null } }),
    prisma.team.count({ where: { hackathonId, status: 'CHECKED_IN', deletedAt: null } }),
    prisma.participant.count({ where: { team: { hackathonId }, deletedAt: null } }),
    prisma.room.findMany({
      where: { hackathonId, deletedAt: null },
      select: { id: true, status: true, name: true, capacityTeams: true, capacityPeople: true },
    }),
    prisma.capacityOverride.count({ where: { hackathonId, status: 'APPROVED' } }),
    prisma.team.count({
      where: { hackathonId, room: null, roomId: null, status: 'CHECKED_IN', deletedAt: null },
    }),
  ]);

  const occupancyMap = await getBulkOccupancy(hackathonId);

  let activeRooms = 0;
  let fullRooms = 0;
  let closedRooms = 0;
  let nearlyFullRooms = 0;

  for (const room of rooms) {
    const occ = occupancyMap.get(room.name) || { teamCount: 0, peopleCount: 0 };
    if (room.status === 'ACTIVE') activeRooms++;
    else if (room.status === 'FULL') fullRooms++;
    else if (room.status === 'CLOSED') closedRooms++;

    if (room.capacityTeams || room.capacityPeople) {
      const pctTeams = room.capacityTeams ? (occ.teamCount / room.capacityTeams) * 100 : 0;
      const pctPeople = room.capacityPeople ? (occ.peopleCount / room.capacityPeople) * 100 : 0;
      const maxPct = Math.max(pctTeams, pctPeople);
      if (maxPct >= 80 && maxPct < 100) nearlyFullRooms++;
    }
  }

  const assigned = totalTeams - [...occupancyMap.values()].reduce((sum, o) => sum + o.teamCount, 0);
  const actuallyAssigned = totalTeams - assigned;

  return {
    totalTeams,
    checkedIn,
    notArrived: totalTeams - checkedIn,
    assigned: actuallyAssigned,
    unassigned: assigned,
    totalParticipants,
    activeRooms,
    fullRooms,
    closedRooms,
    nearlyFullRooms,
    capacityOverrides: overridesCount,
    checkedInNoRoom: teamsNoRoom,
  };
}

export async function getRoomCards(hackathonId: string): Promise<RoomCard[]> {
  const rooms = await prisma.room.findMany({
    where: { hackathonId, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  const occupancyMap = await getBulkOccupancy(hackathonId);

  return rooms.map(room => {
    const occ = occupancyMap.get(room.name) || { teamCount: 0, peopleCount: 0 };
    return {
      id: room.id,
      name: room.name,
      code: room.code,
      building: room.building,
      floor: room.floor,
      status: room.status,
      capacityTeams: room.capacityTeams,
      capacityPeople: room.capacityPeople,
      currentTeams: occ.teamCount,
      currentPeople: occ.peopleCount,
      remainingTeamCapacity: room.capacityTeams !== null ? room.capacityTeams - occ.teamCount : null,
      remainingPeopleCapacity: room.capacityPeople !== null ? room.capacityPeople - occ.peopleCount : null,
      sortOrder: room.sortOrder,
    };
  });
}

export interface ExceptionItem {
  type: 'INFO' | 'WARNING' | 'CRITICAL';
  category: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  explanation: string;
  suggestedAction: string;
}

export async function getExceptions(hackathonId: string): Promise<ExceptionItem[]> {
  const exceptions: ExceptionItem[] = [];

  const [teams, rooms, checkedInTeamsNoRoom] = await Promise.all([
    prisma.team.findMany({
      where: { hackathonId, deletedAt: null },
      select: { id: true, name: true, status: true, room: true, roomId: true, _count: { select: { participants: true } } },
    }),
    prisma.room.findMany({ where: { hackathonId, deletedAt: null } }),
    prisma.team.findMany({
      where: { hackathonId, room: null, roomId: null, status: 'CHECKED_IN', deletedAt: null },
      select: { id: true, name: true },
    }),
  ]);

  const roomNameMap = new Map(rooms.map(r => [r.name, r]));
  const roomIdMap = new Map(rooms.map(r => [r.id, r]));

  for (const team of checkedInTeamsNoRoom) {
    exceptions.push({
      type: 'CRITICAL',
      category: 'CHECKED_IN_NO_ROOM',
      entityType: 'Team',
      entityId: team.id,
      entityName: team.name,
      explanation: `Team "${team.name}" is checked in but has no room assigned.`,
      suggestedAction: 'Assign this team to a room immediately.',
    });
  }

  for (const team of teams) {
    if (team.roomId) {
      const room = roomIdMap.get(team.roomId);
      if (!room) {
        exceptions.push({
          type: 'CRITICAL',
          category: 'INVALID_ROOM_REFERENCE',
          entityType: 'Team',
          entityId: team.id,
          entityName: team.name,
          explanation: `Team "${team.name}" references room ID "${team.roomId}" which does not exist.`,
          suggestedAction: 'Reassign the team to a valid room.',
        });
      } else if (room.status === 'ARCHIVED' || room.deletedAt) {
        exceptions.push({
          type: 'WARNING',
          category: 'ASSIGNED_TO_INACTIVE_ROOM',
          entityType: 'Team',
          entityId: team.id,
          entityName: team.name,
          explanation: `Team "${team.name}" is assigned to room "${room.name}" which is ${room.deletedAt ? 'deleted' : 'archived'}.`,
          suggestedAction: 'Reassign the team to an active room.',
        });
      }
    } else if (team.room) {
      const room = roomNameMap.get(team.room);
      if (!room) {
        exceptions.push({
          type: 'WARNING',
          category: 'ORPHANED_ROOM_ASSIGNMENT',
          entityType: 'Team',
          entityId: team.id,
          entityName: team.name,
          explanation: `Team "${team.name}" is assigned to room "${team.room}" which no longer exists.`,
          suggestedAction: 'Reassign the team to a valid room or clear the room field.',
        });
      }
    }

    if (team._count.participants === 0) {
      exceptions.push({
        type: 'WARNING',
        category: 'EMPTY_TEAM',
        entityType: 'Team',
        entityId: team.id,
        entityName: team.name,
        explanation: `Team "${team.name}" has zero participants.`,
        suggestedAction: 'Add participants or consider removing the team.',
      });
    }
  }

  const occupancyMap = await getBulkOccupancy(hackathonId);

  for (const room of rooms) {
    if (room.status === 'CLOSED') continue;
    const occ = occupancyMap.get(room.name) || { teamCount: 0, peopleCount: 0 };

    if (room.capacityTeams !== null && occ.teamCount > room.capacityTeams) {
      exceptions.push({
        type: 'CRITICAL',
        category: 'ROOM_OVER_TEAM_CAPACITY',
        entityType: 'Room',
        entityId: room.id,
        entityName: room.name,
        explanation: `Room "${room.name}" has ${occ.teamCount} teams (capacity: ${room.capacityTeams}).`,
        suggestedAction: 'Move excess teams to another room or increase capacity.',
      });
    }

    if (room.capacityPeople !== null && occ.peopleCount > room.capacityPeople) {
      exceptions.push({
        type: 'CRITICAL',
        category: 'ROOM_OVER_PEOPLE_CAPACITY',
        entityType: 'Room',
        entityId: room.id,
        entityName: room.name,
        explanation: `Room "${room.name}" has ${occ.peopleCount} participants (capacity: ${room.capacityPeople}).`,
        suggestedAction: 'Move excess participants to another room or increase capacity.',
      });
    }
  }

  return exceptions;
}

export async function getLiveRoomData(hackathonId: string, roomId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new Error('Room not found');

  const occupancyMap = await getBulkOccupancy(hackathonId);
  const occ = occupancyMap.get(room.name) || { teamCount: 0, peopleCount: 0 };

  const teamsInRoom = await prisma.team.findMany({
    where: { hackathonId, room: room.name, deletedAt: null },
    select: {
      id: true,
      teamId: true,
      name: true,
      status: true,
      checkInTime: true,
      _count: { select: { participants: true } },
    },
    orderBy: { name: 'asc' },
  });

  return {
    room: {
      id: room.id,
      name: room.name,
      code: room.code,
      description: room.description,
      building: room.building,
      floor: room.floor,
      status: room.status,
      capacityTeams: room.capacityTeams,
      capacityPeople: room.capacityPeople,
      notes: room.notes,
      sortOrder: room.sortOrder,
      currentTeams: occ.teamCount,
      currentPeople: occ.peopleCount,
      remainingTeamCapacity: room.capacityTeams !== null ? room.capacityTeams - occ.teamCount : null,
      remainingPeopleCapacity: room.capacityPeople !== null ? room.capacityPeople - occ.peopleCount : null,
    },
    teams: teamsInRoom.map(t => ({
      id: t.id,
      teamId: t.teamId,
      name: t.name,
      status: t.status,
      participantCount: t._count.participants,
      checkedIn: t.status === 'CHECKED_IN',
      checkInTime: t.checkInTime,
    })),
  };
}
