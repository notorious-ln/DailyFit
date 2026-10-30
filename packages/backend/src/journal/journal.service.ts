import { Injectable } from '@nestjs/common';
import { JournalEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeJournalDetails } from './journal.sanitize';

export type JournalRecord = {
  userId: number;
  event: JournalEvent;
  details?: Record<string, unknown>;
};

@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: JournalRecord,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    await db.journalEntry.create({
      data: {
        userId: input.userId,
        event: input.event,
        details: sanitizeJournalDetails(input.details ?? {}),
      },
    });
  }
}
