import { describe, it, expect } from 'vitest';
import { suggestMapping, detectLayout, applyMapping } from '../mapper.service';

describe('Mapper Service', () => {
  describe('suggestMapping', () => {
    it('should map exact alias "Team Name" to teamName with HIGH confidence', () => {
      const headers = ['Team Name', 'Leader Email'];
      const mappings = suggestMapping(headers);
      const tn = mappings.find((m) => m.sourceHeader === 'Team Name');
      expect(tn?.targetField).toBe('teamName');
      expect(tn?.confidenceLabel).toBe('HIGH');
    });

    it('should map "Captain" to leaderName', () => {
      const headers = ['Captain', 'Team Name'];
      const mappings = suggestMapping(headers);
      const cap = mappings.find((m) => m.sourceHeader === 'Captain');
      expect(cap?.targetField).toBe('leaderName');
      expect(cap?.confidenceLabel).toBe('HIGH');
    });

    it('should map "Mail ID" to leaderEmail', () => {
      const headers = ['Mail ID'];
      const mappings = suggestMapping(headers);
      const mail = mappings.find((m) => m.sourceHeader === 'Mail ID');
      expect(mail?.targetField).toBe('leaderEmail');
    });

    it('should handle different capitalization', () => {
      const headers = ['team NAME', 'LEADER email'];
      const mappings = suggestMapping(headers);
      expect(mappings.find((m) => m.sourceHeader === 'team NAME')?.targetField).toBe('teamName');
      expect(mappings.find((m) => m.sourceHeader === 'LEADER email')?.targetField).toBe('leaderEmail');
    });

    it('should handle extra spaces', () => {
      const headers = ['  Team  Name  ', '  Leader  Email  '];
      const mappings = suggestMapping(headers);
      expect(mappings.find((m) => m.sourceHeader === '  Team  Name  ')?.targetField).toBe('teamName');
    });

    it('should return LOW confidence for unknown headers', () => {
      const headers = ['RandomColumn', 'SomeOtherData'];
      const mappings = suggestMapping(headers);
      mappings.forEach((m) => {
        expect(m.confidenceLabel).toBe('LOW');
        expect(m.targetField).toBe('');
      });
    });

    it('should match "Group Name" to teamName', () => {
      const headers = ['Group Name'];
      const mappings = suggestMapping(headers);
      expect(mappings.find((m) => m.sourceHeader === 'Group Name')?.targetField).toBe('teamName');
    });

    it('should match "Mobile Number" to leaderPhone', () => {
      const headers = ['Mobile Number'];
      const mappings = suggestMapping(headers);
      expect(mappings.find((m) => m.sourceHeader === 'Mobile Number')?.targetField).toBe('leaderPhone');
    });
  });

  describe('detectLayout', () => {
    it('should detect TEAM_PER_ROW when member columns exist', () => {
      const headers = ['Team Name', 'Member 2 Name', 'Member 3 Name', 'Leader Email'];
      const result = detectLayout(headers);
      expect(result.layout).toBe('TEAM_PER_ROW');
    });

    it('should detect PARTICIPANT_PER_ROW when no member columns', () => {
      const headers = ['Team Name', 'Participant Name', 'Email'];
      const result = detectLayout(headers);
      expect(result.layout).toBe('PARTICIPANT_PER_ROW');
    });
  });

  describe('applyMapping', () => {
    it('should map columns correctly based on mappings', () => {
      const rows = [['Team Alpha', 'John', 'john@test.com']];
      const headers = ['Team Name', 'Leader Name', 'Leader Email'];
      const mappings = [
        { sourceHeader: 'Team Name', targetField: 'teamName', confidence: 100, confidenceLabel: 'HIGH' as const, reason: 'test' },
        { sourceHeader: 'Leader Name', targetField: 'leaderName', confidence: 100, confidenceLabel: 'HIGH' as const, reason: 'test' },
        { sourceHeader: 'Leader Email', targetField: 'leaderEmail', confidence: 100, confidenceLabel: 'HIGH' as const, reason: 'test' },
      ];
      const result = applyMapping(rows, headers, mappings, 'TEAM_PER_ROW');
      expect(result[0].teamName).toBe('Team Alpha');
      expect(result[0].leaderName).toBe('John');
      expect(result[0].leaderEmail).toBe('john@test.com');
    });
  });
});
