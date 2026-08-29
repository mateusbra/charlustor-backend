import { createHash, randomBytes } from 'node:crypto';

// Refresh/reset tokens are high-entropy random values, not low-entropy
// user-chosen secrets — sha256 is enough here, bcrypt is reserved for
// passwords (see UsersService).
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}
