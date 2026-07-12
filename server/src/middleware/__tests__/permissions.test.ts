import { describe, it, expect } from 'vitest';
import { hasPermission } from '../permissions';

describe('Permissions', () => {
  describe('SUPER_ADMIN permissions', () => {
    it('should have hackathon:create', () => {
      expect(hasPermission('SUPER_ADMIN', 'hackathon:create')).toBe(true);
    });

    it('should have team:checkin', () => {
      expect(hasPermission('SUPER_ADMIN', 'team:checkin')).toBe(true);
    });

    it('should have certificate:generate', () => {
      expect(hasPermission('SUPER_ADMIN', 'certificate:generate')).toBe(true);
    });

    it('should have admin:manage', () => {
      expect(hasPermission('SUPER_ADMIN', 'admin:manage')).toBe(true);
    });

    it('should have reliability:manage', () => {
      expect(hasPermission('SUPER_ADMIN', 'reliability:manage')).toBe(true);
    });

    it('should have print:documents', () => {
      expect(hasPermission('SUPER_ADMIN', 'print:documents')).toBe(true);
    });

    it('should have email:send', () => {
      expect(hasPermission('SUPER_ADMIN', 'email:send')).toBe(true);
    });
  });

  describe('SUB_ADMIN permissions', () => {
    it('should have team:view', () => {
      expect(hasPermission('SUB_ADMIN', 'team:view')).toBe(true);
    });

    it('should have team:search', () => {
      expect(hasPermission('SUB_ADMIN', 'team:search')).toBe(true);
    });

    it('should have team:checkin', () => {
      expect(hasPermission('SUB_ADMIN', 'team:checkin')).toBe(true);
    });

    it('should have room:view', () => {
      expect(hasPermission('SUB_ADMIN', 'room:view')).toBe(true);
    });

    it('should have announcement:view', () => {
      expect(hasPermission('SUB_ADMIN', 'announcement:view')).toBe(true);
    });

    it('should NOT have hackathon:create', () => {
      expect(hasPermission('SUB_ADMIN', 'hackathon:create')).toBe(false);
    });

    it('should NOT have certificate:generate', () => {
      expect(hasPermission('SUB_ADMIN', 'certificate:generate')).toBe(false);
    });

    it('should NOT have admin:manage', () => {
      expect(hasPermission('SUB_ADMIN', 'admin:manage')).toBe(false);
    });

    it('should NOT have reliability:manage', () => {
      expect(hasPermission('SUB_ADMIN', 'reliability:manage')).toBe(false);
    });

    it('should NOT have email:send', () => {
      expect(hasPermission('SUB_ADMIN', 'email:send')).toBe(false);
    });

    it('should NOT have print:documents', () => {
      expect(hasPermission('SUB_ADMIN', 'print:documents')).toBe(false);
    });
  });

  describe('Unknown role permissions', () => {
    it('should return false for unknown role', () => {
      expect(hasPermission('PARTICIPANT' as any, 'team:view')).toBe(false);
    });

    it('should return false for empty role', () => {
      expect(hasPermission('' as any, 'team:view')).toBe(false);
    });
  });
});
