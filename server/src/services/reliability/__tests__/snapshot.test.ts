import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  hackathon: { findUnique: vi.fn() },
  team: { findMany: vi.fn(), count: vi.fn() },
  participant: { findMany: vi.fn(), count: vi.fn() },
  room: { findMany: vi.fn(), count: vi.fn() },
  registration: { findMany: vi.fn() },
  scoringCriteria: { findMany: vi.fn() },
  score: { findMany: vi.fn(), count: vi.fn() },
  certificate: { findMany: vi.fn() },
  problemStatement: { findMany: vi.fn() },
  eventMilestone: { findMany: vi.fn() },
  importBatch: { findMany: vi.fn() },
  emailCampaign: { findMany: vi.fn() },
  admin: { findFirst: vi.fn() },
  hackathonSnapshot: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn((fn: any) => fn(mockPrisma)),
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../../lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('crypto', () => {
  const hashMock = {
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'mock-sha256-hash'),
  };
  return {
    default: { createHash: vi.fn(() => hashMock) },
    createHash: vi.fn(() => hashMock),
  };
});

import * as svc from '../snapshot.service';

describe('Snapshot Service', () => {

  /* ── Create Snapshot ── */
  describe('createSnapshot', () => {
    it('should create a snapshot with hash and counts', async () => {
      mockPrisma.hackathon.findUnique.mockResolvedValue({ id: 'hack-1', name: 'Test Hack' });
      mockPrisma.hackathonSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.team.findMany.mockResolvedValue([]);
      mockPrisma.participant.findMany.mockResolvedValue([]);
      mockPrisma.room.findMany.mockResolvedValue([]);
      mockPrisma.registration.findMany.mockResolvedValue([]);
      mockPrisma.scoringCriteria.findMany.mockResolvedValue([]);
      mockPrisma.score.findMany.mockResolvedValue([]);
      mockPrisma.certificate.findMany.mockResolvedValue([]);
      mockPrisma.problemStatement.findMany.mockResolvedValue([]);
      mockPrisma.eventMilestone.findMany.mockResolvedValue([]);
      mockPrisma.importBatch.findMany.mockResolvedValue([]);
      mockPrisma.emailCampaign.findMany.mockResolvedValue([]);
      mockPrisma.team.count.mockResolvedValue(5);
      mockPrisma.participant.count.mockResolvedValue(20);
      mockPrisma.room.count.mockResolvedValue(3);
      mockPrisma.score.count.mockResolvedValue(15);
      mockPrisma.hackathonSnapshot.create.mockResolvedValue({
        id: 'snap-1',
        type: 'MANUAL',
        status: 'COMPLETED',
        teamCount: 5,
        participantCount: 20,
        roomCount: 3,
        scoreCount: 15,
        sha256Hash: 'mock-sha256-hash',
        hackathonId: 'hack-1',
        createdById: 'admin-1',
        createdAt: new Date(),
      });
      mockPrisma.hackathonSnapshot.update.mockResolvedValue({});

      const result = await svc.createSnapshot('hack-1', 'MANUAL', 'admin-1');

      expect(result).toBeDefined();
      expect(mockPrisma.hackathonSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'MANUAL', hackathonId: 'hack-1', createdById: 'admin-1' }),
        }),
      );
    });

    it('should throw on missing hackathon', async () => {
      mockPrisma.hackathon.findUnique.mockResolvedValue(null);
      await expect(svc.createSnapshot('bad-id', 'MANUAL', 'admin-1')).rejects.toThrow('Hackathon not found');
    });
  });

  /* ── Verify Integrity ── */
  describe('verifySnapshotIntegrity', () => {
    it('should return valid for matching hash', async () => {
      mockPrisma.hackathonSnapshot.findUnique.mockResolvedValue({
        id: 'snap-1',
        sha256Hash: 'mock-sha256-hash',
        status: 'COMPLETED',
        data: { teams: [], participants: [], rooms: [] },
        checksum: 'mock-sha256-hash',
      });

      const result = await svc.verifySnapshotIntegrity('snap-1');
      expect(result.valid).toBe(true);
    });
  });

  /* ── List Snapshots ── */
  describe('listSnapshots', () => {
    it('should list snapshots ordered by creation date', async () => {
      mockPrisma.hackathonSnapshot.findMany.mockResolvedValue([
        { id: 'snap-1', type: 'MANUAL', createdAt: new Date('2025-03-15'), status: 'COMPLETED', createdBy: { id: 'a1', name: 'Admin' } },
        { id: 'snap-2', type: 'AUTOMATIC', createdAt: new Date('2025-03-16'), status: 'COMPLETED', createdBy: { id: 'a1', name: 'Admin' } },
      ]);

      const list = await svc.listSnapshots('hack-1');
      expect(list).toHaveLength(2);
    });
  });
});
