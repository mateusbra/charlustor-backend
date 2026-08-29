import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard.js';

function createContext(userRole: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: userRole ? { role: userRole } : undefined }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows the request when no roles are required', () => {
    const reflector = { getAllAndOverride: vi.fn(() => undefined) };
    const guard = new RolesGuard(reflector as never);

    expect(guard.canActivate(createContext('PLAYER'))).toBe(true);
  });

  it('blocks a user whose role is not in the required list', () => {
    const reflector = { getAllAndOverride: vi.fn(() => ['ORGANIZER', 'ADMIN']) };
    const guard = new RolesGuard(reflector as never);

    expect(guard.canActivate(createContext('PLAYER'))).toBe(false);
  });

  it('allows a user whose role is in the required list', () => {
    const reflector = { getAllAndOverride: vi.fn(() => ['ORGANIZER', 'ADMIN']) };
    const guard = new RolesGuard(reflector as never);

    expect(guard.canActivate(createContext('ADMIN'))).toBe(true);
  });
});
