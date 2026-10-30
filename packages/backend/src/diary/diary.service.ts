import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DiaryNote, Feeling } from '@prisma/client';
import { dateKey, parseDateParam } from '../day/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertDiaryDto } from './dto/upsert-diary.dto';

export type DiaryNoteResponse = {
  id: number;
  user_id: number;
  note_date: string;
  feeling: Feeling;
  weight_kg: number | null;
  user_comment: string | null;
  advisor_comment: string | null;
};

@Injectable()
export class DiaryService {
  private readonly logger = new Logger(DiaryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    userId: number,
    dateParam: string,
    dto: UpsertDiaryDto,
  ): Promise<DiaryNoteResponse> {
    const noteDate = this.parseDate(dateParam);
    const weightKg = dto.weight_kg ?? null;
    const userComment = dto.user_comment ?? null;

    const note = await this.prisma.diaryNote.upsert({
      where: {
        userId_noteDate: {
          userId,
          noteDate,
        },
      },
      create: {
        userId,
        noteDate,
        feeling: dto.feeling,
        weightKg,
        userComment,
      },
      update: {
        feeling: dto.feeling,
        weightKg,
        userComment,
      },
    });

    this.logger.log(
      `дневник сохранён user=${userId} date=${dateKey(noteDate)} feeling=${dto.feeling}`,
    );

    return this.toResponse(note);
  }

  private parseDate(dateParam: string): Date {
    try {
      return parseDateParam(dateParam);
    } catch {
      throw new BadRequestException({
        message: 'Дата должна быть в формате YYYY-MM-DD',
      });
    }
  }

  private toResponse(note: DiaryNote): DiaryNoteResponse {
    return {
      id: note.id,
      user_id: note.userId,
      note_date: dateKey(note.noteDate),
      feeling: note.feeling,
      weight_kg: note.weightKg,
      user_comment: note.userComment,
      advisor_comment: note.advisorComment,
    };
  }
}
