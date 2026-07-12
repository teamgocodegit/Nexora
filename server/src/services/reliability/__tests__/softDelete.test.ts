import { describe, it, expect, vi } from 'vitest';

const mockTx = vi.hoisted(() => ({
  participant: { updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  team: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  room: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
}));

const mockPrisma = vi.hoisted(() => ({
  participant: { updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  team: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  room: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  $transaction: vi.fn((fn: any) => fn(mockTx)),
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../../lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import * as svc from '../softDelete.service';

describe('Soft Delete Service', () => {

  /* ── Team soft delete ── */
  describe('softDeleteTeam', () => {
    it('should soft delete a team and its participants', async () => {
      mockPrisma.team.findUnique.mockResolvedValue({
        id: 'team-1', hackathonId: 'hack-1', name: 'Team Alpha',
        participants: [{ id: 'p1' }, { id: 'p2' }],
      });

      await svc.softDeleteTeam('team-1', 'hack-1', 'admin-1', 'Test delete');

      expect(mockTx.team.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'team-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
      expect(mockTx.participant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teamId: 'team-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should throw if team not found', async () => {
      mockPrisma.team.findUnique.mockResolvedValue(null);
      await expect(svc.softDeleteTeam('bad-id', 'hack-1', 'admin-1')).rejects.toThrow('Team not found');
    });
  });

  describe('restoreTeam', () => {
    it('should restore a soft-deleted team and participants', async () => {
      mockPrisma.team.findUnique.mockResolvedValue({
        id: 'team-1', deletedAt: new Date(),
        participants: [{ id: 'p1', deletedAt: new Date() }],
      });

      await svc.restoreTeam('team-1');

      expect(mockTx.team.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'team-1' },
          data: { deletedAt: null, deletedById: null, deletionReason: null },
        }),
      );
      expect(mockTx.participant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teamId: 'team-1', deletedAt: { not: null } },
          data: { deletedAt: null, deletedById: null, deletionReason: null },
        }),
      );
    });

    it('should throw if team is not deleted', async () => {
      mockPrisma.team.findUnique.mockResolvedValue({ id: 'team-1', deletedAt: null, participants: [] });
      await expect(svc.restoreTeam('team-1')).rejects.toThrow('Team is not deleted');
    });

    it('should throw if team not found', async () => {
      mockPrisma.team.findUnique.mockResolvedValue(null);
      await expect(svc.restoreTeam('bad-id')).rejects.toThrow('Team not found');
    });
  });

  describe('softDeleteRoom', () => {
    it('should soft delete a room and reassign teams', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({ id: 'room-1', name: 'Room 101' });
      mockPrisma.team.count.mockResolvedValue(2);

      const result = await svc.softDeleteRoom('room-1', 'hack-1', 'admin-1');

      expect(result.teamsReassigned).toBe(2);
      expect(mockTx.team.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { room: 'Room 101', hackathonId: 'hack-1', deletedAt: null },
          data: { room: null },
        }),
      );
    });

    it('should throw if room not found', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(null);
      await expect(svc.softDeleteRoom('bad-id', 'hack-1', 'admin-1')).rejects.toThrow('Room not found');
    });
  });

  describe('restoreRoom', () => {
    it('should restore a soft-deleted room', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({ id: 'room-1', deletedAt: new Date() });
      await svc.restoreRoom('room-1');
      expect(mockPrisma.room.update).toHaveBeenCalled();
    });

    it('should throw if room not found', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(null);
      await expect(svc.restoreRoom('bad-id')).rejects.toThrow('Room not found');
    });

    it('should throw if room is not deleted', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({ id: 'room-1', deletedAt: null });
      await expect(svc.restoreRoom('room-1')).rejects.toThrow('Room is not deleted');
    });
  });

  describe('softDeleteParticipant', () => {
    it('should soft delete an individual participant', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue({
        id: 'p1', team: { hackathonId: 'hack-1' },
      });

      await svc.softDeleteParticipant('p1', 'admin-1', 'Removed from team');

      expect(mockPrisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date), deletedById: 'admin-1', deletionReason: 'Removed from team' }),
      });
    });

    it('should throw if participant not found', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue(null);
      await expect(svc.softDeleteParticipant('bad-id', 'admin-1')).rejects.toThrow('Participant not found');
    });
  });

  describe('restoreParticipant', () => {
    it('should restore a soft-deleted participant', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue({ id: 'p1', deletedAt: new Date() });
      await svc.restoreParticipant('p1');
      expect(mockPrisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { deletedAt: null, deletedById: null, deletionReason: null },
      });
    });

    it('should throw if participant not found', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue(null);
      await expect(svc.restoreParticipant('bad-id')).rejects.toThrow('Participant not found');
    });

    it('should throw if participant not deleted', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue({ id: 'p1', deletedAt: null });
      await expect(svc.restoreParticipant('p1')).rejects.toThrow('Participant is not deleted');
    });
  });

  describe('checkTeamDeleteGuard', () => {
    it('should block deletion when team has scores', async () => {
      mockPrisma.team.findUnique.mockResolvedValue({
        id: 'team-1', name: 'Team Alpha', status: 'REGISTERED',
        _count: { scores: 3, certificates: 0 },
      });

      const result = await svc.checkTeamDeleteGuard('team-1');
      expect(result.allowed).toBe(false);
      expect(result.blockers.some((b: string) => b.includes('scores'))).toBe(true);
    });

    it('should block deletion when team is checked in', async () => {
      mockPrisma.team.findUnique.mockResolvedValue({
        id: 'team-1', name: 'Team Alpha', status: 'CHECKED_IN',
        _count: { scores: 0, certificates: 0 },
      });

      const result = await svc.checkTeamDeleteGuard('team-1');
      expect(result.allowed).toBe(false);
      expect(result.blockers.some((b: string) => b.includes('checked in'))).toBe(true);
    });

    it('should allow deletion when team has no dependencies', async () => {
      mockPrisma.team.findUnique.mockResolvedValue({
        id: 'team-1', name: 'Team Alpha', status: 'REGISTERED',
        _count: { scores: 0, certificates: 0 },
      });

      const result = await svc.checkTeamDeleteGuard('team-1');
      expect(result.allowed).toBe(true);
      expect(result.blockers.length).toBe(0);
    });

    it('should throw if team not found', async () => {
      mockPrisma.team.findUnique.mockResolvedValue(null);
      await expect(svc.checkTeamDeleteGuard('bad-id')).rejects.toThrow('Team not found');
    });
  });

  describe('calculateTeamDeleteImpact', () => {
    it('should return impact summary', async () => {
      mockPrisma.team.findUnique.mockResolvedValue({
        id: 'team-1', name: 'Team Alpha', room: 'Room 101',
        _count: { participants: 4, scores: 5, certificates: 2 },
      });

      const impact = await svc.calculateTeamDeleteImpact('team-1');
      expect(impact.participants).toBe(4);
      expect(impact.scores).toBe(5);
      expect(impact.certificates).toBe(2);
      expect(impact.roomAssignments).toBe(1);
    });

    it('should throw if team not found', async () => {
      mockPrisma.team.findUnique.mockResolvedValue(null);
      await expect(svc.calculateTeamDeleteImpact('bad-id')).rejects.toThrow('Team not found');
    });
  });

  describe('getDeletedRecords', () => {
    it('should return deleted teams, rooms, and participants', async () => {
      const now = new Date();
      mockPrisma.team.findMany.mockResolvedValue([{ id: 't1', hackathonId: 'hack-1', name: 'Deleted Team', deletedAt: now, deletedBy: { id: 'admin-1', name: 'Admin' } }]);
      mockPrisma.room.findMany.mockResolvedValue([{ id: 'r1', hackathonId: 'hack-1', name: 'Deleted Room', deletedAt: now, deletedBy: { id: 'admin-1', name: 'Admin' } }]);
      mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1', name: 'Deleted Person', deletedAt: now, deletedBy: { id: 'admin-1', name: 'Admin' }, team: { id: 't1', name: 'Team', hackathonId: 'hack-1' } }]);

      const result = await svc.getDeletedRecords('hack-1');
      expect(result.teams).toHaveLength(1);
      expect(result.rooms).toHaveLength(1);
      expect(result.participants).toHaveLength(1);
    });
  });
});
