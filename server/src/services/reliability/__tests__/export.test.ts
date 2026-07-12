import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  hackathon: { findUnique: vi.fn() },
  team: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  participant: { findMany: vi.fn() },
  room: { findMany: vi.fn() },
  score: { findMany: vi.fn() },
  scoringCriteria: { findMany: vi.fn() },
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../../lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import * as svc from '../export.service';

describe('Export Service', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  /* ── Emergency Pack ── */
  describe('generateEmergencyPack', () => {
    it('should return full operational snapshot', async () => {
      const now = new Date();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'hack-1', name: 'Test Hack', venue: 'Venue', startDate: now, endDate: now, status: 'ACTIVE',
      });
      mockPrisma.team.findMany.mockResolvedValue([
        { id: 't1', teamId: 'T-001', name: 'Alpha', status: 'CHECKED_IN', room: 'Room 1', _count: { participants: 3 } },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', name: 'John', email: 'john@test.com', phone: '123', isLeader: true, team: { id: 't1', teamId: 'T-001', name: 'Alpha' } },
      ]);
      mockPrisma.room.findMany.mockResolvedValue([
        { id: 'r1', name: 'Room 1', building: 'Bldg', floor: '1', capacity: 30 },
      ]);
      mockPrisma.team.groupBy.mockResolvedValue([{ room: 'Room 1', _count: 1 }]);

      const pack = await svc.generateEmergencyPack('hack-1');
      expect(pack.hackathon?.name).toBe('Test Hack');
      expect(pack.teams?.count).toBe(1);
      expect(pack.teams?.checkedIn).toBe(1);
      expect(pack.participants?.count).toBe(1);
      expect(pack.rooms?.count).toBe(1);
      expect(pack.exportedAt).toBeTruthy();
    });
  });

  /* ── CSV Exports ── */
  describe('exportTeamsCsv', () => {
    it('should generate teams CSV', async () => {
      mockPrisma.team.findMany.mockResolvedValue([
        { teamId: 'T-001', id: 't1', name: 'Alpha', status: 'CHECKED_IN', room: 'Room 1', tableNumber: '5', _count: { participants: 3 } },
      ]);

      const csv = await svc.exportTeamsCsv('hack-1');
      expect(csv).toContain('Team_ID');
      expect(csv).toContain('Alpha');
      expect(csv).toContain('T-001');
    });
  });

  describe('exportParticipantsCsv', () => {
    it('should generate participants CSV', async () => {
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', name: 'John', email: 'john@test.com', phone: '123', isLeader: true, team: { teamId: 'T-001', name: 'Alpha' } },
      ]);

      const csv = await svc.exportParticipantsCsv('hack-1');
      expect(csv).toContain('John');
      expect(csv).toContain('john@test.com');
    });
  });

  describe('exportCheckinCsv', () => {
    it('should generate check-in CSV', async () => {
      mockPrisma.team.findMany.mockResolvedValue([
        { teamId: 'T-001', name: 'Alpha', status: 'CHECKED_IN', checkedInAt: new Date('2025-03-15T10:00:00Z'), _count: { participants: 3 }, participants: [{ checkedInAt: new Date('2025-03-15T10:00:00Z') }] },
      ]);

      const csv = await svc.exportCheckinCsv('hack-1');
      expect(csv).toContain('Alpha');
    });
  });

  describe('exportRoomsCsv', () => {
    it('should generate rooms CSV', async () => {
      mockPrisma.room.findMany.mockResolvedValue([
        { id: 'r1', name: 'Room 1', building: 'Bldg', floor: '1', capacity: 30 },
      ]);
      mockPrisma.team.groupBy.mockResolvedValue([{ room: 'Room 1', _count: 2 }]);

      const csv = await svc.exportRoomsCsv('hack-1');
      expect(csv).toContain('Room 1');
    });
  });

  describe('exportScoresCsv', () => {
    it('should generate scores CSV', async () => {
      mockPrisma.team.findMany.mockResolvedValue([
        { id: 't1', teamId: 'T-001', name: 'Alpha' },
      ]);
      mockPrisma.scoringCriteria.findMany.mockResolvedValue([
        { id: 'c1', name: 'Innovation', maxScore: 100 },
      ]);
      mockPrisma.score.findMany.mockResolvedValue([
        { id: 's1', score: 85, value: 85, teamId: 't1', criteriaId: 'c1', team: { name: 'Alpha' }, criteria: { name: 'Innovation' } },
      ]);

      const csv = await svc.exportScoresCsv('hack-1');
      expect(csv).toContain('Alpha');
      expect(csv).toContain('Innovation');
    });
  });


});
