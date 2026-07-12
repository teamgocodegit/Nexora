import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  hackathon: { findUnique: vi.fn() },
  team: { findMany: vi.fn() },
  participant: { findMany: vi.fn() },
  room: { findMany: vi.fn() },
  registration: { findMany: vi.fn() },
  score: { findMany: vi.fn() },
  certificate: { findMany: vi.fn() },
  importBatch: { findMany: vi.fn() },
  emailCampaign: { findMany: vi.fn() },
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../../lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import * as svc from '../integrity.service';

describe('Integrity Service', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkIntegrity', () => {
    it('should return results with all checks', async () => {
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'hack-1', name: 'Test Hack', maxTeams: 10, minTeamSize: 1, maxTeamSize: 5,
      });
      mockPrisma.team.findMany.mockResolvedValue([
        { id: 't1', name: 'Alpha', teamId: 'T-001', status: 'CHECKED_IN', room: 'Room 101', hackathonId: 'hack-1', qrToken: 'qr1', _count: { participants: 2 } },
        { id: 't2', name: 'Beta', teamId: 'T-002', status: 'CHECKED_IN', room: 'Room 999', hackathonId: 'hack-1', qrToken: 'qr2', _count: { participants: 1 } },
      ]);
      mockPrisma.room.findMany.mockResolvedValue([
        { id: 'r1', name: 'Room 101', capacity: 30 },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', name: 'John', email: 'john@test.com', teamId: 't1' },
        { id: 'p2', name: 'Jane', email: 'jane@test.com', teamId: 't1' },
        { id: 'p3', name: 'Jim', email: 'jim@test.com', teamId: 't2' },
      ]);
      mockPrisma.registration.findMany.mockResolvedValue([]);
      mockPrisma.score.findMany.mockResolvedValue([
        { id: 's1', value: 85, teamId: 't1', criteriaId: 'c1', criteria: { name: 'Innovation', maxScore: 100 } },
      ]);
      mockPrisma.certificate.findMany.mockResolvedValue([]);
      mockPrisma.importBatch.findMany.mockResolvedValue([]);
      mockPrisma.emailCampaign.findMany.mockResolvedValue([]);

      const result = await svc.checkIntegrity('hack-1');

      expect(result.summary.totalTeams).toBe(2);
      expect(result.summary.totalParticipants).toBe(3);
      expect(result.summary.totalScores).toBe(1);
      expect(result.issues).toBeDefined();
    });

    it('should handle empty hackathon', async () => {
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'hack-1', name: 'Empty Hack', maxTeams: 10, minTeamSize: 1, maxTeamSize: 5,
      });
      mockPrisma.team.findMany.mockResolvedValue([]);
      mockPrisma.room.findMany.mockResolvedValue([]);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      mockPrisma.registration.findMany.mockResolvedValue([]);
      mockPrisma.score.findMany.mockResolvedValue([]);
      mockPrisma.certificate.findMany.mockResolvedValue([]);
      mockPrisma.importBatch.findMany.mockResolvedValue([]);
      mockPrisma.emailCampaign.findMany.mockResolvedValue([]);

      const result = await svc.checkIntegrity('hack-1');

      expect(result.summary.totalTeams).toBe(0);
      expect(result.issues).toEqual([]);
    });
  });
});
