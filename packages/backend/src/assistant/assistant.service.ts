import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivePlan,
  AssistantSource,
  DiaryNote,
  Feeling,
  TaskStatus,
} from '@prisma/client';
import { asObject } from '../catalog/catalog.service';
import { compliancePercent } from '../compliance/compliance.util';
import {
  addUtcDays,
  calendarToday,
  dateKey,
  parseDateParam,
  startOfIsoWeek,
} from '../day/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ANALYSIS_SCREEN_NOTICE, ASSISTANT_ROLE } from './analysis-notice';
import { isSafeComment, SAFE_FALLBACK } from './comment-safety';
import { AnalyzePeriodValue } from './dto/analyze.dto';
import { LlmClient } from './llm.client';
import {
  ActivePlanParameter,
  buildLlmPayload,
  LlmPayload,
} from './llm-payload';
import { buildRulesComment } from './rules-comment';

export type DiaryFact = {
  note_date: string;
  feeling: Feeling;
  weight_kg: number | null;
  user_comment: string | null;
};

export type AssistantReplyResponse = {
  id: number;
  role: typeof ASSISTANT_ROLE;
  text: string;
  period: AnalyzePeriodValue;
  period_from: string;
  period_to: string;
  source: AssistantSource;
  created_at: string;
};

export type AnalyzeResponse = {
  summary_text: string;
  assistant_reply: AssistantReplyResponse;
  diary_facts: DiaryFact[];
  screen_notice: string;
  recommendation: null;
};

type AnalyzeInput = {
  period: AnalyzePeriodValue;
  date?: string;
};

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly llm: LlmClient,
  ) {}

  async analyze(userId: number, dto: AnalyzeInput): Promise<AnalyzeResponse> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException({ message: 'Пользователь не найден' });
    }

    const { from, to } = this.resolvePeriod(dto.period, dto.date);
    const [tasks, notes, plans] = await Promise.all([
      this.prisma.dayTask.findMany({
        where: {
          plan: { userId },
          taskDate: { gte: from, lte: to },
        },
        orderBy: [{ taskDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.diaryNote.findMany({
        where: {
          userId,
          noteDate: { gte: from, lte: to },
        },
        orderBy: { noteDate: 'asc' },
      }),
      this.prisma.activePlan.findMany({
        where: { userId, isActive: true },
        orderBy: { id: 'asc' },
      }),
    ]);

    const workouts = tasks.filter((task) => task.kind === 'workout');
    const meals = tasks.filter((task) => task.kind === 'meal');
    const skipCount = tasks.filter(
      (task) => task.status === TaskStatus.skipped,
    ).length;
    const wellbeing = notes.map((note) => ({
      date: dateKey(note.noteDate),
      feeling: note.feeling,
    }));
    const userDayComments = notes.flatMap((note) => {
      const text = note.userComment?.trim();
      if (!text) {
        return [];
      }
      return [{ date: dateKey(note.noteDate), text }];
    });

    const payload = buildLlmPayload({
      goal: user.goal,
      level: user.level,
      limitationTags: user.limitationTags,
      freeNote: user.freeNote,
      compliance: {
        period: dto.period,
        from: dateKey(from),
        to: dateKey(to),
        workout_percent: compliancePercent(workouts),
        meal_percent: compliancePercent(meals),
        overall_percent: compliancePercent(tasks),
      },
      skipCount,
      wellbeing,
      activePlanParameters: plans.map((plan) => this.toPlanParameters(plan)),
      userDayComments,
    });

    const rulesText = buildRulesComment({
      period: dto.period,
      from: dateKey(from),
      to: dateKey(to),
      workoutPercent: payload.compliance_summary.workout_percent,
      mealPercent: payload.compliance_summary.meal_percent,
      overallPercent: payload.compliance_summary.overall_percent,
      skipCount,
      tasks: tasks.map((task) => ({
        title: task.title,
        status: task.status,
      })),
      feelings: wellbeing,
    });

    const { text, source } = await this.resolveComment(payload, rulesText);

    const reply = await this.prisma.assistantReply.create({
      data: {
        userId,
        period: dto.period,
        periodFrom: from,
        periodTo: to,
        role: ASSISTANT_ROLE,
        text,
        source,
      },
    });

    if (dto.period === 'day') {
      await this.prisma.diaryNote.updateMany({
        where: { userId, noteDate: from },
        data: { advisorComment: text },
      });
    }

    this.logger.log(
      `запрос разбора user=${userId} period=${dto.period} source=${source} boundaries=ok`,
    );

    return {
      summary_text: text,
      assistant_reply: {
        id: reply.id,
        role: ASSISTANT_ROLE,
        text: reply.text,
        period: reply.period,
        period_from: dateKey(reply.periodFrom),
        period_to: dateKey(reply.periodTo),
        source: reply.source,
        created_at: reply.createdAt.toISOString(),
      },
      diary_facts: notes.map((note) => this.toDiaryFact(note)),
      screen_notice: ANALYSIS_SCREEN_NOTICE,
      recommendation: null,
    };
  }

  private async resolveComment(
    payload: LlmPayload,
    rulesText: string,
  ): Promise<{ text: string; source: AssistantSource }> {
    const local = isSafeComment(rulesText) ? rulesText : SAFE_FALLBACK;

    if (!this.llm.isEnabled()) {
      return { text: local, source: AssistantSource.rules };
    }

    try {
      const raw = await this.llm.complete(payload);
      if (isSafeComment(raw)) {
        return { text: raw.trim(), source: AssistantSource.llm };
      }
      this.logger.warn(
        'комментарий внешней модели отклонён: диагноз или обещание веса к дате',
      );
    } catch {
      this.logger.warn('сбой внешней модели, комментарий построен правилами');
    }

    return { text: local, source: AssistantSource.rules };
  }

  private toPlanParameters(plan: ActivePlan): ActivePlanParameter {
    const body = asObject(plan.bodyJson);
    return {
      type: plan.type,
      title: plan.title,
      level_place: plan.levelPlace,
      daily_calories: plan.dailyCalories,
      days_per_week:
        typeof body.days_per_week === 'number' ? body.days_per_week : null,
    };
  }

  private toDiaryFact(note: DiaryNote): DiaryFact {
    return {
      note_date: dateKey(note.noteDate),
      feeling: note.feeling,
      weight_kg: note.weightKg,
      user_comment: note.userComment,
    };
  }

  private resolvePeriod(
    period: AnalyzePeriodValue,
    date: string | undefined,
  ): { from: Date; to: Date } {
    const anchor = date ? this.parseDate(date) : calendarToday();
    if (period === 'day') {
      return { from: anchor, to: anchor };
    }
    const from = startOfIsoWeek(anchor);
    return { from, to: addUtcDays(from, 6) };
  }

  private parseDate(value: string): Date {
    try {
      return parseDateParam(value);
    } catch {
      throw new BadRequestException({
        message: 'Дата должна быть в формате YYYY-MM-DD',
      });
    }
  }
}
