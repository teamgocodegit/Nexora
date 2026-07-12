import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  team: { findMany: vi.fn(), count: vi.fn() },
  room: { findMany: vi.fn(), findUnique: vi.fn() },
  participant: { count: vi.fn() },
  capacityOverride: { count: vi.fn(), findMany: vi.fn() },
}));

vi.mock('../../../lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../../../lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import * as svc from '../operations.service';

describe('Operations Service', () => {
  afterEach(() => { vi.clearAllMocks(); });

  describe('getOpsDashboard', () => {
    it('should return correct metrics', async () => {
      mockPrisma.team.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(60)
        .mockResolvedValueOnce(5);
      mockPrisma.participant.count.mockResolvedValue(350);
      mockPrisma.room.findMany.mockResolvedValue([
        { id: 'r1', name: 'Room A', status: 'ACTIVE', capacityTeams: 20, capacityPeople: null },
        { id: 'r2', name: 'Room B', status: 'FULL', capacityTeams: 15, capacityPeople: null },
        { id: 'r3', name: 'Room C', status: 'CLOSED', capacityTeams: null, capacityPeople: null },
      ]);
      mockPrisma.capacityOverride.count.mockResolvedValue(2);
      mockPrisma.team.findMany
        .mockResolvedValueOnce([
          { room: 'Room A', _count: { participants: 2 } },
          { room: 'Room A', _count: { participants: 3 } },
          { room: 'Room B', _count: { participants: 4 } },
        ]);

      const result = await svc.getOpsDashboard('hack-1');
      expect(result.totalTeams).toBe(100);
      expect(result.checkedIn).toBe(60);
      expect(result.totalParticipants).toBe(350);
      expect(result.activeRooms).toBe(1);
      expect(result.fullRooms).toBe(1);
      expect(result.closedRooms).toBe(1);
      expect(result.capacityOverrides).toBe(2);
      expect(result.checkedInNoRoom).toBe(5);
    });
  });

  describe('getRoomCards', () => {
    it('should return cards with occupancy', async () => {
      mockPrisma.room.findMany.mockResolvedValue([
        { id: 'r1', name: 'Room A', code: null, building: null, floor: null, status: 'ACTIVE', capacityTeams: 20, capacityPeople: 100, sortOrder: 0, deletedAt: null },
      ]);
      mockPrisma.team.findMany.mockResolvedValue([
        { room: 'Room A', _count: { participants: 2 } },
        { room: 'Room A', _count: { participants: 3 } },
      ]);
      const cards = await svc.getRoomCards('hack-1');
      expect(cards.length).toBe(1);
      expect(cards[0].currentTeams).toBe(2);
      expect(cards[0].currentPeople).toBe(5);
      expect(cards[0].remainingTeamCapacity).toBe(18);
      expect(cards[0].remainingPeopleCapacity).toBe(95);
    });
  });

  describe('getExceptions', () => {
    it('should detect checked-in teams without room', async () => {
      mockPrisma.team.findMany
        .mockResolvedValueOnce([{ id: 't1', name: 'Team A', status: 'CHECKED_IN', room: null, roomId: null, _count: { participants: 3 } }])
        .mockResolvedValueOnce([{ id: 't1', name: 'Team A' }])
        .mockResolvedValueOnce([]);
      mockPrisma.room.findMany.mockResolvedValue([{ id: 'r1', name: 'Room A', status: 'ACTIVE', capacityTeams: null, capacityPeople: null, deletedAt: null }]);

      const exc = await svc.getExceptions('hack-1');
      expect(exc.some(e => e.category === 'CHECKED_IN_NO_ROOM')).toBe(true);
    });

    it('should detect teams with zero participants', async () => {
      mockPrisma.team.findMany
        .mockResolvedValueOnce([{ id: 't1', name: 'Team A', status: 'REGISTERED', room: null, roomId: null, _count: { participants: 0 } }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.room.findMany.mockResolvedValue([]);

      const exc = await svc.getExceptions('hack-1');
      expect(exc.some(e => e.category === 'EMPTY_TEAM')).toBe(true);
    });
  });
});
