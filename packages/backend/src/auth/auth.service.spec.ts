jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import { UnauthorizedException } from '@nestjs/common';
import { JournalEvent, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

const hash = bcrypt.hash as unknown as jest.Mock;
const compare = bcrypt.compare as unknown as jest.Mock;

const PASSWORD = 'correct-horse';
const PASSWORD_HASH = '$2b$10$storedhashvalue0123456789012';
const FREE_NOTE = 'личная пометка';

function userFixture(): User {
  return {
    id: 3,
    email: 'user@example.com',
    passwordHash: PASSWORD_HASH,
    displayName: null,
    role: UserRole.user,
    goal: null,
    level: null,
    place: null,
    workoutsPerWeek: null,
    gender: null,
    age: null,
    heightCm: null,
    weightKg: null,
    limitationTags: [],
    freeNote: FREE_NOTE,
    cloudAssistantEnabled: true,
  };
}

describe('AuthService journal', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function setup() {
    const user = userFixture();
    const users = {
      findByEmail: jest.fn().mockResolvedValue(user),
      create: jest.fn().mockResolvedValue(user),
      isUniqueConstraintError: () => false,
    };
    const jwt = { sign: jest.fn().mockReturnValue('token') };
    const journalRecord = jest.fn().mockResolvedValue(undefined);
    const service = new AuthService(
      users as never,
      jwt as never,
      { record: journalRecord } as never,
    );
    return { service, users, journalRecord, user };
  }

  it('records registration without the password or its hash', async () => {
    const { service, users, journalRecord, user } = setup();
    users.findByEmail.mockResolvedValue(null);
    hash.mockResolvedValue(PASSWORD_HASH);

    await service.register({
      email: 'user@example.com',
      password: PASSWORD,
      display_name: 'Анна',
    });

    expect(journalRecord).toHaveBeenCalledWith({
      userId: user.id,
      event: JournalEvent.register,
    });
    const serialized = JSON.stringify(journalRecord.mock.calls);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain(PASSWORD_HASH);
    expect(serialized).not.toContain(FREE_NOTE);
  });

  it('records a successful login without the password or its hash', async () => {
    const { service, journalRecord, user } = setup();
    compare.mockResolvedValue(true);

    await service.login({
      email: 'user@example.com',
      password: PASSWORD,
    });

    expect(journalRecord).toHaveBeenCalledWith({
      userId: user.id,
      event: JournalEvent.login,
    });
    const serialized = JSON.stringify(journalRecord.mock.calls);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain(PASSWORD_HASH);
    expect(serialized).not.toContain(FREE_NOTE);
  });

  it('does not write a journal row when the password is wrong', async () => {
    const { service, journalRecord } = setup();
    compare.mockResolvedValue(false);

    await expect(
      service.login({
        email: 'user@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(journalRecord).not.toHaveBeenCalled();
  });
});
