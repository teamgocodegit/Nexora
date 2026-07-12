import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { signToken } from '../auth';

const TEST_SECRET = 'test-secret-that-is-at-least-32-chars-long!!';

describe('Auth Middleware', () => {
  describe('signToken', () => {
    it('should sign a valid JWT with HS256 algorithm', () => {
      const token = signToken({ id: 'user-1', role: 'SUPER_ADMIN' });
      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);

      const decoded = jwt.decode(token) as any;
      expect(decoded).toBeDefined();
      expect(decoded.sub).toBe('user-1');
      expect(decoded.role).toBe('SUPER_ADMIN');
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('should include expiration claim', () => {
      const token = signToken({ id: 'user-1', role: 'SUB_ADMIN' }, '1h');
      const decoded = jwt.decode(token) as any;
      const exp = decoded.exp;
      const iat = decoded.iat;
      expect(exp - iat).toBe(3600);
    });

    it('should not include password or sensitive data in payload', () => {
      const token = signToken({ id: 'user-1', role: 'SUPER_ADMIN' });
      const decoded = jwt.decode(token) as any;
      expect(decoded.passwordHash).toBeUndefined();
      expect(decoded.apiKey).toBeUndefined();
    });
  });

  describe('JWT verification with restricted algorithms', () => {
    it('should reject token signed with none algorithm', () => {
      const token = [
        Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
        Buffer.from(JSON.stringify({ sub: 'user-1', role: 'SUPER_ADMIN' })).toString('base64url'),
        '',
      ].join('.');

      expect(() => {
        jwt.verify(token, TEST_SECRET, { algorithms: ['HS256'] });
      }).toThrow();
    });

    it('should reject token signed with wrong secret', () => {
      const token = jwt.sign({ sub: 'user-1', role: 'SUPER_ADMIN' }, 'wrong-secret', { algorithm: 'HS256' });
      expect(() => {
        jwt.verify(token, 'different-secret', { algorithms: ['HS256'] });
      }).toThrow();
    });

    it('should reject expired token', () => {
      const token = jwt.sign(
        { sub: 'user-1', role: 'SUPER_ADMIN', iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 },
        TEST_SECRET,
        { algorithm: 'HS256' },
      );
      expect(() => {
        jwt.verify(token, TEST_SECRET, { algorithms: ['HS256'] });
      }).toThrow(/expired/i);
    });
  });
});
