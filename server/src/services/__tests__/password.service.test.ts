import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, validatePasswordPolicy } from '../password.service';

describe('Password Service', () => {
  describe('hashPassword', () => {
    it('should hash a password', () => {
      const hash = hashPassword('my-strong-password-123');
      expect(hash).toBeDefined();
      expect(hash).toContain('$2a$');
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should produce different hashes for same password', () => {
      const hash1 = hashPassword('my-strong-password-123');
      const hash2 = hashPassword('my-strong-password-123');
      expect(hash1).not.toBe(hash2);
    });

    it('should reject passwords shorter than 10 characters', () => {
      expect(() => hashPassword('short')).toThrow('at least 10');
    });

    it('should reject empty passwords', () => {
      expect(() => hashPassword('')).toThrow('Password is required');
    });

    it('should reject passwords with leading whitespace', () => {
      expect(() => hashPassword('  password-with-leading-space')).toThrow('whitespace');
    });

    it('should reject passwords with trailing whitespace', () => {
      expect(() => hashPassword('password-with-trailing-space  ')).toThrow('whitespace');
    });

    it('should reject passwords exceeding max length', () => {
      const longPw = 'a'.repeat(129);
      expect(() => hashPassword(longPw)).toThrow('not exceed');
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', () => {
      const hash = hashPassword('my-strong-password-123');
      expect(verifyPassword('my-strong-password-123', hash)).toBe(true);
    });

    it('should reject incorrect password', () => {
      const hash = hashPassword('my-strong-password-123');
      expect(verifyPassword('wrong-password', hash)).toBe(false);
    });
  });

  describe('validatePasswordPolicy', () => {
    it('should accept valid password', () => {
      expect(() => validatePasswordPolicy('valid-password-length')).not.toThrow();
    });

    it('should reject null/undefined', () => {
      expect(() => validatePasswordPolicy(null as any)).toThrow('Password is required');
      expect(() => validatePasswordPolicy(undefined as any)).toThrow('Password is required');
    });

    it('should reject short passwords', () => {
      expect(() => validatePasswordPolicy('abcdefgh')).toThrow('at least 10');
    });
  });
});
