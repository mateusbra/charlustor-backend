import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminSeedService } from './admin-seed.service.js';

function createMocks() {
  const usersService = { findByEmail: vi.fn(), updateRole: vi.fn() };
  const service = new AdminSeedService(usersService as never);
  return { service, usersService };
}

describe('AdminSeedService', () => {
  const originalEnv = process.env.SEED_ADMIN_EMAIL;

  afterEach(() => {
    process.env.SEED_ADMIN_EMAIL = originalEnv;
  });

  it('does nothing when SEED_ADMIN_EMAIL is not set', async () => {
    delete process.env.SEED_ADMIN_EMAIL;
    const { service, usersService } = createMocks();

    await service.onModuleInit();

    expect(usersService.findByEmail).not.toHaveBeenCalled();
  });

  it('does nothing when no user exists with that email', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@example.com';
    const { service, usersService } = createMocks();
    usersService.findByEmail.mockResolvedValue(null);

    await service.onModuleInit();

    expect(usersService.updateRole).not.toHaveBeenCalled();
  });

  it('does nothing when the user is already ADMIN', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@example.com';
    const { service, usersService } = createMocks();
    usersService.findByEmail.mockResolvedValue({ id: 'user-1', role: 'ADMIN' });

    await service.onModuleInit();

    expect(usersService.updateRole).not.toHaveBeenCalled();
  });

  it('promotes the matching user to ADMIN', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@example.com';
    const { service, usersService } = createMocks();
    usersService.findByEmail.mockResolvedValue({ id: 'user-1', role: 'PLAYER' });

    await service.onModuleInit();

    expect(usersService.updateRole).toHaveBeenCalledWith('user-1', 'ADMIN');
  });
});
