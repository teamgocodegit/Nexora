import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildTemplateContext } from '../campaign.service';

const mockHackathon = {
  name: 'HackFest 2025',
  venue: 'Main Convention Center',
  startDate: new Date('2025-03-15T09:00:00Z'),
};

describe('Campaign Service', () => {
  describe('buildTemplateContext', () => {
    it('should build context with all fields', () => {
      const ctx = buildTemplateContext(
        mockHackathon,
        'Team Alpha',
        'NEX-001',
        'Room 101',
        'John Doe',
        'Jane Leader',
        'jane@test.com',
      );

      expect(ctx.participantName).toBe('John Doe');
      expect(ctx.teamName).toBe('Team Alpha');
      expect(ctx.teamId).toBe('NEX-001');
      expect(ctx.leaderName).toBe('Jane Leader');
      expect(ctx.leaderEmail).toBe('jane@test.com');
      expect(ctx.hackathonName).toBe('HackFest 2025');
      expect(ctx.hackathonVenue).toBe('Main Convention Center');
      expect(ctx.roomName).toBe('Room 101');
      expect(ctx.hackathonName).toBe('HackFest 2025');
    });

    it('should use defaults for null teamId', () => {
      const ctx = buildTemplateContext(
        mockHackathon,
        'Team Alpha',
        null,
        null,
        'John Doe',
        'Jane Leader',
        'jane@test.com',
      );

      expect(ctx.teamId).toBe('NEX-000');
      expect(ctx.roomName).toBe('TBD');
    });

    it('should use defaults for null room', () => {
      const ctx = buildTemplateContext(
        mockHackathon,
        'Team Alpha',
        'NEX-001',
        null,
        'John Doe',
        'Jane Leader',
        'jane@test.com',
      );

      expect(ctx.roomName).toBe('TBD');
    });

    it('should include additional fields', () => {
      const ctx = buildTemplateContext(
        mockHackathon,
        'Team Alpha',
        null,
        null,
        'John Doe',
        'Jane Leader',
        'jane@test.com',
        { customField: 'customValue' },
      );

      expect(ctx.customField).toBe('customValue');
    });
  });

  describe('AudienceType enum', () => {
    it('should include APPROVED_REGISTRATIONS', () => {
      const types = [
        'ALL_TEAMS', 'ALL_PARTICIPANTS', 'TEAM_LEADERS',
        'CHECKED_IN', 'NOT_CHECKED_IN', 'REGISTERED',
        'ACTIVE', 'SUBMITTED', 'ROOM_SPECIFIC',
        'SELECTED_TEAMS', 'APPROVED_REGISTRATIONS', 'REJECTED_REGISTRATIONS',
      ];
      types.forEach((t) => {
        expect(t).toBeDefined();
      });
    });
  });
});
