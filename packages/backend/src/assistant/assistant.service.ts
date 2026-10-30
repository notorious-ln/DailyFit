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
  JournalEvent,
  Prisma,
  RecommendationStatus,
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
import { calculateMaintenanceCalories } from '../plans/calorie-calculator';
import {
  classifyExternalCallError,
  ExternalCallFailure,
} from '../journal/external-call';
import { JournalService } from '../journal/journal.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  RecommendationResponse,
  toRecommendationResponse,
} from '../recommendations/recommendation.mapper';
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
import {
  MealTaskInput,
  buildMealRecommendations,
} from './rules-meal-recs';
import {
  RecommendationItem,
  WorkoutTaskInput,
  buildWorkoutRecommendations,
} from './rules-workout-recs';

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
  recommendation: RecommendationResponse | null;
};

type AnalyzeInput = {
  period: AnalyzePeriodValue;
  date?: string;
  simulate_timeout?: boolean;
};

type ResolvedComment = {
  text: string;
  source: AssistantSource;
  modelCalled: boolean;
  externalError: ExternalCallFailure | null;
};

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly llm: LlmClient,
    private readonly journal: JournalService,
  ) {}

  async analyze(userId: number, dto: AnalyzeInput): Promise<AnalyzeResponse> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException({ message: 'Пользователь не найден' });
    }

    const { from, to } = this.resolvePeriod(dto.period, dto.date);
    const today = calendarToday();
    const recentFrom = addUtcDays(to, -6);
    const weekStart = startOfIsoWeek(to);
    const weekEnd = addUtcDays(weekStart, 6);
    const historyFrom = addUtcDays(weekStart, -14);
    const futureTo = addUtcDays(today, 14);

    const [
      tasks,
      notes,
      plans,
      recentWorkouts,
      historyWorkouts,
      weekWorkouts,
      futureWorkouts,
      recentMeals,
      futureMeals,
    ] = await Promise.all([
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
      this.prisma.dayTask.findMany({
        where: {
          kind: 'workout',
          plan: { userId },
          taskDate: { gte: recentFrom, lte: to },
        },
        orderBy: [{ taskDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.dayTask.findMany({
        where: {
          kind: 'workout',
          plan: { userId },
          taskDate: { gte: historyFrom, lte: weekEnd },
        },
        orderBy: [{ taskDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.dayTask.findMany({
        where: {
          kind: 'workout',
          plan: { userId },
          taskDate: { gte: weekStart, lte: weekEnd },
        },
        orderBy: [{ taskDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.dayTask.findMany({
        where: {
          kind: 'workout',
          plan: { userId },
          taskDate: { gte: today, lte: futureTo },
          status: null,
        },
        orderBy: [{ taskDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.dayTask.findMany({
        where: {
          kind: 'meal',
          plan: { userId },
          taskDate: { gte: recentFrom, lte: to },
        },
        orderBy: [{ taskDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.dayTask.findMany({
        where: {
          kind: 'meal',
          plan: { userId },
          taskDate: { gte: today, lte: futureTo },
          status: null,
        },
        orderBy: [{ taskDate: 'asc' }, { id: 'asc' }],
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

    const { text, source, modelCalled, externalError } =
      await this.resolveComment(
        payload,
        rulesText,
        user.cloudAssistantEnabled,
        Boolean(dto.simulate_timeout),
      );

    if (externalError) {
      await this.journal.record({
        userId,
        event: JournalEvent.external_call_error,
        details: {
          reason: externalError.reason,
          ...(externalError.http_status != null
            ? { http_status: externalError.http_status }
            : {}),
        },
      });
    }

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

    const mealPlan = plans.find((plan) => plan.type === 'meal');
    const workoutItems = buildWorkoutRecommendations({
      periodFrom: from,
      periodTo: to,
      today,
      recentWorkouts: recentWorkouts.map((task) => this.toWorkoutInput(task)),
      historyWorkouts: historyWorkouts.map((task) => this.toWorkoutInput(task)),
      weekWorkouts: weekWorkouts.map((task) => this.toWorkoutInput(task)),
      futureWorkouts: futureWorkouts.map((task) => this.toWorkoutInput(task)),
      feelings: wellbeing,
    });
    const mealItems = buildMealRecommendations({
      periodFrom: from,
      periodTo: to,
      today,
      recentMeals: recentMeals.map((task) => this.toMealInput(task)),
      futureMeals: futureMeals.map((task) => this.toMealInput(task)),
      dailyCalories: mealPlan?.dailyCalories ?? null,
      maintenanceCalories: calculateMaintenanceCalories(user),
      limitationTags: user.limitationTags,
      feelings: wellbeing,
    });
    const draftItems = this.mergeDraftItems(workoutItems, mealItems);

    let recommendation: RecommendationResponse | null = null;
    if (draftItems.length > 0) {
      const created = await this.prisma.recommendation.create({
        data: {
          userId,
          periodFrom: from,
          periodTo: to,
          source,
          status: RecommendationStatus.draft,
          summaryText: text,
          itemsJson: draftItems as unknown as Prisma.InputJsonValue,
        },
      });
      recommendation = toRecommendationResponse(created);
    }

    await this.journal.record({
      userId,
      event: JournalEvent.analysis_requested,
      details: {
        period: dto.period,
        period_from: dateKey(from),
        period_to: dateKey(to),
        model_called: modelCalled,
        source,
        boundary_check: draftItems.length > 0 ? 'passed' : 'filtered_empty',
        kept_items: draftItems.length,
        recommendation_id: recommendation?.id ?? null,
      },
    });

    this.logger.log(
      `запрос разбора user=${userId} period=${dto.period} source=${source} boundaries=${draftItems.length > 0 ? `ok items=${draftItems.length}` : 'filtered_empty'}`,
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
      recommendation,
    };
  }

  private toWorkoutInput(task: {
    id: number;
    planId: number;
    title: string;
    taskDate: Date;
    status: TaskStatus | null;
    detailsJson: Prisma.JsonValue | null;
  }): WorkoutTaskInput {
    return {
      id: task.id,
      planId: task.planId,
      title: task.title,
      taskDate: task.taskDate,
      status: task.status,
      detailsJson: task.detailsJson,
    };
  }

  private toMealInput(task: {
    id: number;
    planId: number;
    title: string;
    taskDate: Date;
    status: TaskStatus | null;
    detailsJson: Prisma.JsonValue | null;
  }): MealTaskInput {
    return {
      id: task.id,
      planId: task.planId,
      title: task.title,
      taskDate: task.taskDate,
      status: task.status,
      detailsJson: task.detailsJson,
    };
  }

  private mergeDraftItems(
    workoutItems: RecommendationItem[],
    mealItems: RecommendationItem[],
  ): RecommendationItem[] {
    return [...workoutItems, ...mealItems].map((item, index) => ({
      ...item,
      id: `rec-${index + 1}`,
    }));
  }

  private async resolveComment(
    payload: LlmPayload,
    rulesText: string,
    cloudAssistantEnabled: boolean,
    simulateTimeout = false,
  ): Promise<ResolvedComment> {
    const local = isSafeComment(rulesText) ? rulesText : SAFE_FALLBACK;

    if (simulateTimeout) {
      this.logger.warn('учебный сценарий таймаута внешней модели');
      return {
        text: local,
        source: AssistantSource.rules,
        modelCalled: true,
        externalError: { reason: 'timeout' },
      };
    }

    if (!cloudAssistantEnabled || !this.llm.isEnabled()) {
      return {
        text: local,
        source: AssistantSource.rules,
        modelCalled: false,
        externalError: null,
      };
    }

    try {
      const raw = await this.llm.complete(payload);
      if (isSafeComment(raw)) {
        return {
          text: raw.trim(),
          source: AssistantSource.llm,
          modelCalled: true,
          externalError: null,
        };
      }
      this.logger.warn(
        'комментарий внешней модели отклонён: диагноз или обещание веса к дате',
      );
    } catch (error) {
      this.logger.warn('сбой внешней модели, комментарий построен правилами');
      return {
        text: local,
        source: AssistantSource.rules,
        modelCalled: true,
        externalError: classifyExternalCallError(error),
      };
    }

    return {
      text: local,
      source: AssistantSource.rules,
      modelCalled: true,
      externalError: null,
    };
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
