import { JournalEvent } from '@prisma/client';
import { JournalService } from './journal.service';
import { sanitizeJournalDetails } from './journal.sanitize';

describe('sanitizeJournalDetails', () => {
  it('drops passwords, hashes, free notes and the raw model package', () => {
    const safe = sanitizeJournalDetails({
      recommendation_id: 5,
      password: 'correct-horse',
      passwordHash: '$2b$10$storedhashvalue0123456789012',
      password_hash: '$2b$10$anotherhashvalue012345678901',
      freeNote: 'личная пометка',
      user_comment: 'после приседа тянуло колено',
      user_day_comments: [{ text: 'был голод к вечеру' }],
      nested: {
        payload: {
          goal: 1,
          user_day_comments: [{ text: 'секретный текст' }],
        },
        kept: true,
      },
    });

    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain('correct-horse');
    expect(serialized).not.toContain('$2b$');
    expect(serialized).not.toContain('личная пометка');
    expect(serialized).not.toContain('после приседа');
    expect(serialized).not.toContain('был голод');
    expect(serialized).not.toContain('секретный текст');
    expect(safe).toEqual({
      recommendation_id: 5,
      nested: { kept: true },
    });
  });
});

describe('JournalService', () => {
  it('writes a sanitized row and uses the caller transaction', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const prisma = { journalEntry: { create } };
    const service = new JournalService(prisma as never);

    await service.record({
      userId: 3,
      event: JournalEvent.login,
      details: { password: 'correct-horse', ok: true },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 3,
        event: JournalEvent.login,
        details: { ok: true },
      },
    });

    const txCreate = jest.fn().mockResolvedValue({ id: 2 });
    await service.record(
      {
        userId: 3,
        event: JournalEvent.recommendation_accepted,
        details: { recommendation_id: 7 },
      },
      { journalEntry: { create: txCreate } } as never,
    );

    expect(txCreate).toHaveBeenCalledWith({
      data: {
        userId: 3,
        event: JournalEvent.recommendation_accepted,
        details: { recommendation_id: 7 },
      },
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
