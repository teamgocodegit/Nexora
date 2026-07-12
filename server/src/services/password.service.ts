import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(password: string): string {
  validatePasswordPolicy(password);
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function validatePasswordPolicy(password: string): void {
  if (!password || typeof password !== 'string') {
    throw new Error('Password is required');
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must not exceed ${PASSWORD_MAX_LENGTH} characters`);
  }
  if (password.trim() !== password) {
    throw new Error('Password must not start or end with whitespace');
  }
}
