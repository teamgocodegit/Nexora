import { describe, it, expect } from 'vitest';
import { normalizeTeamPerRow, normalizeParticipantPerRow } from '../normalizer.service';

describe('Normalizer Service', () => {
  describe('normalizeTeamPerRow', () => {
    it('should normalize team data correctly', () => {
      const records = [
        { teamName: '  Team Alpha  ', leaderName: '  John  ', leaderEmail: '  JOHN@TEST.COM  ', leaderPhone: '+1 234 567 8900' },
      ];
      const result = normalizeTeamPerRow(records);
      expect(result.records).toHaveLength(1);
      expect(result.records[0].teamName).toBe('Team Alpha');
      expect(result.records[0].leaderName).toBe('John');
      expect(result.records[0].leaderEmail).toBe('john@test.com');
      expect(result.records[0].leaderPhone).toBe('+12345678900');
    });

    it('should skip empty rows (no team name, no leader name)', () => {
      const records = [{ teamName: '', leaderName: '', leaderEmail: '' }];
      const result = normalizeTeamPerRow(records);
      expect(result.records).toHaveLength(0);
      expect(result.skippedRows).toHaveLength(1);
    });

    it('should report errors for missing team name', () => {
      const records = [{ teamName: '', leaderName: 'John', leaderEmail: 'john@test.com' }];
      const result = normalizeTeamPerRow(records);
      expect(result.records).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Team name missing');
    });

    it('should report errors for missing leader email', () => {
      const records = [{ teamName: 'Team A', leaderName: 'John', leaderEmail: '' }];
      const result = normalizeTeamPerRow(records);
      expect(result.records).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Leader email missing');
    });
  });

  describe('normalizeParticipantPerRow', () => {
    it('should group participants by team', () => {
      const records = [
        { teamName: 'Team A', memberName: 'John', memberEmail: 'john@test.com' },
        { teamName: 'Team A', memberName: 'Jane', memberEmail: 'jane@test.com' },
        { teamName: 'Team B', memberName: 'Bob', memberEmail: 'bob@test.com' },
      ];
      const result = normalizeParticipantPerRow(records);
      expect(result.records).toHaveLength(2);
      expect(result.records[0].teamName).toBe('Team A');
      expect(result.records[0].members).toHaveLength(2);
      expect(result.records[1].teamName).toBe('Team B');
      expect(result.records[1].members).toHaveLength(1);
    });

    it('should skip empty rows', () => {
      const records = [{ teamName: '', memberName: '', memberEmail: '' }];
      const result = normalizeParticipantPerRow(records);
      expect(result.records).toHaveLength(0);
      expect(result.skippedRows).toHaveLength(1);
    });
  });
});
