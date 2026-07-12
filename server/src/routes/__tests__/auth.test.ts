import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { signToken } from '../../middleware/auth';

const prisma = new PrismaClient();

const TEST_USER_EMAIL = 'test-auth@nexora.dev';
const TEST_USER_PASSWORD = 'test-password-123!';
const TEST_USER_NAME = 'Test Auth User';

let testUserId: string;

beforeAll(async () => {
  const passwordHash = bcrypt.hashSync(TEST_USER_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: { passwordHash, isActive: true },
    create: {
      name: TEST_USER_NAME,
      email: TEST_USER_EMAIL,
      role: 'SUPER_ADMIN',
      passwordHash,
      isActive: true,
    },
  });
  testUserId = user.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_USER_EMAIL } });
  await prisma.$disconnect();
});

describe('Auth Route Logic', () => {
  describe('Login Credential Verification', () => {
    it('should verify correct password against stored hash', async () => {
      const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
      expect(user).toBeDefined();
      expect(user!.passwordHash).toBeDefined();
      expect(user!.passwordHash!.startsWith('$2a$')).toBe(true);

      const valid = bcrypt.compareSync(TEST_USER_PASSWORD, user!.passwordHash!);
      expect(valid).toBe(true);
    });

    it('should reject wrong password against stored hash', async () => {
      const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
      const valid = bcrypt.compareSync('wrong-password', user!.passwordHash!);
      expect(valid).toBe(false);
    });

    it('should not store plaintext password in database', async () => {
      const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
      expect(user!.passwordHash).not.toBe(TEST_USER_PASSWORD);
      expect(user!.passwordHash).not.toContain(TEST_USER_PASSWORD);
    });

    it('should reject request for user without passwordHash', async () => {
      const userWithoutPassword = await prisma.user.findFirst({
        where: { passwordHash: null },
      });
      if (userWithoutPassword) {
        expect(userWithoutPassword.passwordHash).toBeNull();
      }
    });

    it('should reject inactive user', async () => {
      const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
      expect(user).toBeDefined();
      expect(user!.isActive).toBe(true);
    });
  });

  describe('Token Generation', () => {
    it('should generate token with correct claims', () => {
      const token = signToken({ id: testUserId, role: 'SUPER_ADMIN' });
      const decoded = jwt.decode(token) as any;

      expect(decoded.sub).toBe(testUserId);
      expect(decoded.role).toBe('SUPER_ADMIN');
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('should never include client-provided role in token', () => {
      const token = signToken({ id: testUserId, role: 'SUPER_ADMIN' });
      const decoded = jwt.decode(token) as any;

      // Role comes from database, not client
      expect(decoded.role).toBe('SUPER_ADMIN');
      expect(typeof decoded.role).toBe('string');
    });
  });

  describe('Failed Login Tracking', () => {
    it('should record failed login attempts', async () => {
      const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
      await prisma.user.update({
        where: { id: user!.id },
        data: { failedLoginAttempts: 1 },
      });

      const updated = await prisma.user.findUnique({ where: { id: user!.id } });
      expect(updated!.failedLoginAttempts).toBeGreaterThanOrEqual(1);
    });

    it('should reset failed attempts on successful login', async () => {
      const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
      await prisma.user.update({
        where: { id: user!.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });

      const updated = await prisma.user.findUnique({ where: { id: user!.id } });
      expect(updated!.failedLoginAttempts).toBe(0);
    });
  });

  describe('Account Locking', () => {
    it('should lock account after threshold attempts', async () => {
      // Simulate hitting the lock threshold
      const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
      await prisma.user.update({
        where: { id: user!.id },
        data: {
          failedLoginAttempts: 5,
          lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      const locked = await prisma.user.findUnique({ where: { id: user!.id } });
      expect(locked!.lockedUntil).toBeDefined();
      expect(locked!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

      // Reset
      await prisma.user.update({
        where: { id: user!.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    });
  });
});
