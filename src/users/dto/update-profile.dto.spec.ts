import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateProfileDto } from './update-profile.dto.js';

async function validateDto(input: object) {
  return validate(plainToInstance(UpdateProfileDto, input));
}

describe('UpdateProfileDto', () => {
  it('accepts a valid nickname and friend code', async () => {
    const errors = await validateDto({ nickname: 'duelist_1', masterDuelFriendCode: '1234-5678-9012' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a nickname with invalid characters', async () => {
    const errors = await validateDto({ nickname: 'no spaces allowed' });
    expect(errors.some((e) => e.property === 'nickname')).toBe(true);
  });

  it('rejects a friend code with an invalid format', async () => {
    const errors = await validateDto({ masterDuelFriendCode: 'not-a-code!' });
    expect(errors.some((e) => e.property === 'masterDuelFriendCode')).toBe(true);
  });

  it('allows omitting both fields', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });
});
