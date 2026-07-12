import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  room: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  team: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  capacityOverride: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn((arg: any) => {
    if (Array.isArray(arg)) {
      const results = arg.map((item: any) => {
        if (typeof item === 'function') return item();
        if (item && typeof item.then === 'function') return item;
        return item;
      });
      return Promise.all(results);
    }
    if (typeof arg === 'function') return arg(mockPrisma);
    return Promise.resolve(arg);
  }),
}));

vi.mock('../../../lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../../../lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import * as svc from '../room.service';

describe('Room Service', () => {
  afterEach(() => { vi.clearAllMocks(); });

  describe('getRoomOccupancy', () => {
    it('should calculate team and people counts', async () => {
      mockPrisma.team.findMany.mockResolvedValue([
        { id: 't1', _count: { participants: 3 } },
        { id: 't2', _count: { participants: 2 } },
      ]);
      const result = await svc.getRoomOccupancy('hack-1', 'Room 101');
      expect(result.teamCount).toBe(2);
      expect(result.peopleCount).toBe(5);
    });
  });

  describe('checkCapacity', () => {
    it('should allow when under capacity', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({ id: 'r1', name: 'Room 101', capacityTeams: 5, capacityPeople: 20, deletedAt: null, status: 'ACTIVE' });
      mockPrisma.team.findMany
        .mockResolvedValueOnce([{ id: 't1', _count: { participants: 2 } }, { id: 't2', _count: { participants: 3 } }])
        .mockResolvedValueOnce([{ id: 't3', _count: { participants: 1 } }]);
      const result = await svc.checkCapacity('hack-1', 'r1', ['t3']);
      expect(result.allowed).toBe(true);
      expect(result.projectedTeamCount).toBe(3);
      expect(result.projectedPeopleCount).toBe(6);
    });

    it('should block when over team capacity', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({ id: 'r1', name: 'Room 101', capacityTeams: 2, capacityPeople: null, deletedAt: null, status: 'ACTIVE' });
      mockPrisma.team.findMany
        .mockResolvedValueOnce([{ id: 't1', _count: { participants: 2 } }, { id: 't2', _count: { participants: 3 } }])
        .mockResolvedValueOnce([{ id: 't3', _count: { participants: 1 } }]);
      const result = await svc.checkCapacity('hack-1', 'r1', ['t3']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Exceeds team capacity');
    });

    it('should block when over people capacity', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({ id: 'r1', name: 'Room 101', capacityTeams: null, capacityPeople: 5, deletedAt: null, status: 'ACTIVE' });
      mockPrisma.team.findMany
        .mockResolvedValueOnce([{ id: 't1', _count: { participants: 3 } }, { id: 't2', _count: { participants: 2 } }])
        .mockResolvedValueOnce([{ id: 't3', _count: { participants: 2 } }]);
      const result = await svc.checkCapacity('hack-1', 'r1', ['t3']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Exceeds people capacity');
    });

    it('should block when room is closed', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({ id: 'r1', name: 'Room 101', capacityTeams: null, capacityPeople: null, deletedAt: null, status: 'CLOSED' });
      const result = await svc.checkCapacity('hack-1', 'r1', ['t1']);
      expect(result.allowed).toBe(false);
    });
  });

  describe('previewAutoAssign', () => {
    it('should balance teams across active rooms', async () => {
      mockPrisma.room.findMany.mockResolvedValue([
        { id: 'r1', name: 'Room A', capacityTeams: 3, capacityPeople: null, status: 'ACTIVE', sortOrder: 0, deletedAt: null },
        { id: 'r2', name: 'Room B', capacityTeams: 2, capacityPeople: null, status: 'ACTIVE', sortOrder: 1, deletedAt: null },
      ]);
      mockPrisma.team.findMany
        .mockResolvedValueOnce([
          { id: 't1', _count: { participants: 2 } },
          { id: 't2', _count: { participants: 3 } },
          { id: 't3', _count: { participants: 1 } },
          { id: 't4', _count: { participants: 4 } },
          { id: 't5', _count: { participants: 2 } },
        ])
        .mockResolvedValueOnce([]);

      const result = await svc.previewAutoAssign('hack-1');
      expect(result.totalTeams).toBe(5);
      expect(result.assignable).toBe(5);
      expect(result.allocations.length).toBe(2);
    });

    it('should report unassignable teams when capacity insufficient', async () => {
      mockPrisma.room.findMany.mockResolvedValue([
        { id: 'r1', name: 'Room A', capacityTeams: 1, capacityPeople: null, status: 'ACTIVE', sortOrder: 0, deletedAt: null },
      ]);
      mockPrisma.team.findMany
        .mockResolvedValueOnce([
          { id: 't1', _count: { participants: 2 } },
          { id: 't2', _count: { participants: 3 } },
        ])
        .mockResolvedValueOnce([]);

      const result = await svc.previewAutoAssign('hack-1');
      expect(result.totalTeams).toBe(2);
      expect(result.assignable).toBe(1);
      expect(result.unassignable).toBe(1);
    });
  });

  describe('archiveRoom', () => {
    it('should archive room with no teams', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({ id: 'r1', name: 'Room A', deletedAt: null });
      mockPrisma.team.count.mockResolvedValue(0);
      mockPrisma.room.update.mockResolvedValue({ id: 'r1', status: 'ARCHIVED' });
      mockPrisma.activityLog.create.mockResolvedValue({});

      await svc.archiveRoom('r1', 'hack-1', 'admin-1');
      expect(mockPrisma.room.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'ARCHIVED' } }));
    });

    it('should throw if room has assigned teams', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({ id: 'r1', name: 'Room A', deletedAt: null });
      mockPrisma.team.count.mockResolvedValue(3);
      await expect(svc.archiveRoom('r1', 'hack-1', 'admin-1')).rejects.toThrow('still assigned');
    });
  });

  describe('assignTeamsToRoom', () => {
    it('should assign teams with capacity check', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({ id: 'r1', name: 'Room A', capacityTeams: 10, capacityPeople: null, status: 'ACTIVE', deletedAt: null });
      mockPrisma.team.findMany
        .mockResolvedValueOnce([{ id: 't1', _count: { participants: 1 } }, { id: 't2', _count: { participants: 2 } }])
        .mockResolvedValueOnce([{ _count: { participants: 1 } }, { _count: { participants: 2 } }]);
      mockPrisma.team.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.room.update.mockResolvedValue({});

      const result = await svc.assignTeamsToRoom('hack-1', 'r1', ['t1', 't2'], 'admin-1');
      expect(result.assigned).toBe(2);
    });

    it('should allow override', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({ id: 'r1', name: 'Room A', capacityTeams: 1, capacityPeople: null, status: 'ACTIVE', deletedAt: null });
      mockPrisma.team.findMany
        .mockResolvedValueOnce([{ id: 't1', _count: { participants: 1 } }, { id: 't2', _count: { participants: 2 } }])
        .mockResolvedValueOnce([{ _count: { participants: 1 } }, { _count: { participants: 2 } }]);
      mockPrisma.team.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.capacityOverride.create.mockResolvedValue({});
      mockPrisma.room.update.mockResolvedValue({});

      const result = await svc.assignTeamsToRoom('hack-1', 'r1', ['t1', 't2'], 'admin-1', 'Emergency seating');
      expect(result.assigned).toBe(2);
    });
  });

  describe('moveTeamToRoom', () => {
    it('should move team and recalculate both rooms', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({ id: 'r2', name: 'Room B', capacityTeams: 10, capacityPeople: null, status: 'ACTIVE', deletedAt: null });
      mockPrisma.team.findUnique.mockResolvedValue({ id: 't1', room: 'Room A' });
      mockPrisma.team.update.mockResolvedValue({});
      mockPrisma.room.findFirst.mockResolvedValue({ id: 'r1', name: 'Room A' });
      mockPrisma.room.update.mockResolvedValue({});
      mockPrisma.team.findMany.mockResolvedValue([]);

      await svc.moveTeamToRoom('hack-1', 't1', 'r2', 'admin-1');
      expect(mockPrisma.team.update).toHaveBeenCalled();
    });
  });

  describe('unassignTeams', () => {
    it('should clear room fields', async () => {
      mockPrisma.team.findMany
        .mockResolvedValueOnce([{ room: 'Room A' }])
        .mockResolvedValueOnce([]);
      mockPrisma.team.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.room.findFirst.mockResolvedValue({ id: 'r1', name: 'Room A' });
      mockPrisma.room.update.mockResolvedValue({});

      const result = await svc.unassignTeams('hack-1', ['t1', 't2']);
      expect(result.unassigned).toBe(2);
    });
  });

  describe('reorderRooms', () => {
    it('should update sort order in transaction', async () => {
      mockPrisma.room.update.mockResolvedValue({});

      await svc.reorderRooms('hack-1', ['r1', 'r2', 'r3']);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });
});
