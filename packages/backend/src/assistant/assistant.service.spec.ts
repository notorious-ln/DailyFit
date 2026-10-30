import {
  AssistantSource,
  Feeling,
  RecommendationStatus,
  TaskStatus,
  TemplateType,
  User,
  UserRole,
} from '@prisma/client';
import { ANALYSIS_SCREEN_NOTICE } from './analysis-notice';
import { AssistantService } from './assistant.service';
import { LlmClient } from './llm.client';
import { LLM_PAYLOAD_KEYS, LlmPayload } from './llm-payload';

const FREE_NOTE = 'СЕКРЕТНАЯ_ПОМЕТКА_ПРОФИЛЯ';
const USER_COMMENT = 'после приседа тянуло колено';
const PLAN_DESCRIPTION = 'НЕ_В_МОДЕЛЬ_ОПИСАНИЕ';
const SAFE_LLM =
  'Получилось закрыть тренировку. С планом разошлось: одно питание пропущено. Самочувствие тяжёлое.';

function userFixture(): User {
  return {
    id: 1,
    email: 'hidden@example.com',
    passwordHash: 'hash-secret',
    displayName: 'Анна',
    role: UserRole.user,
    goal: 2,
    level: 1,
    place: 'home',
    workoutsPerWeek: 3,
    gender: 'female',
    age: 30,
    heightCm: 170,
    weightKg: 73.4,
    limitationTags: ['колено'],
    freeNote: FREE_NOTE,
    cloudAssistantEnabled: true,
  };
}

describe('AssistantService', () => {
  const noteDate = new Date('2026-10-30T00:00:00.000Z');

  function setup(
    llm: {
      isEnabled: boolean;
      complete?: (payload: LlmPayload) => Promise<string>;
    },
    options?: {
      dayTaskFindMany?: jest.Mock;
    },
  ) {
    const sent: LlmPayload[] = [];
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn(
      (args: {
        data: {
          period: 'day' | 'week';
          periodFrom: Date;
          periodTo: Date;
          role: string;
          text: string;
          source: AssistantSource;
        };
      }) =>
        Promise.resolve({
          id: 9,
          createdAt: new Date('2026-10-30T12:00:00.000Z'),
          period: args.data.period,
          periodFrom: args.data.periodFrom,
          periodTo: args.data.periodTo,
          role: args.data.role,
          text: args.data.text,
          source: args.data.source,
        }),
    );
    const recommendationCreate = jest.fn(
      (args: {
        data: {
          userId: number;
          periodFrom: Date;
          periodTo: Date;
          source: AssistantSource;
          status: RecommendationStatus;
          summaryText: string;
          itemsJson: unknown;
        };
      }) =>
        Promise.resolve({
          id: 42,
          createdAt: new Date('2026-10-30T12:05:00.000Z'),
          ...args.data,
        }),
    );
    const complete = jest.fn((payload: LlmPayload) => {
      sent.push(payload);
      if (!llm.complete) {
        return Promise.reject(new Error('complete was not expected'));
      }
      return llm.complete(payload);
    });
    const prisma = {
      dayTask: {
        findMany:
          options?.dayTaskFindMany ??
          jest.fn().mockResolvedValue([
            {
              id: 10,
              planId: 4,
              title: 'День A',
              kind: 'workout',
              status: TaskStatus.done,
              taskDate: noteDate,
              detailsJson: {
                exercises: [{ name: 'Приседания', sets: 3, reps: 12 }],
              },
            },
            {
              id: 11,
              planId: 5,
              title: 'Завтрак',
              kind: 'meal',
              status: TaskStatus.skipped,
              taskDate: noteDate,
              detailsJson: null,
            },
          ]),
      },
      diaryNote: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 3,
            userId: 1,
            noteDate,
            feeling: Feeling.hard,
            weightKg: 73.4,
            userComment: USER_COMMENT,
            advisorComment: null,
          },
        ]),
        updateMany,
      },
      activePlan: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 4,
            type: TemplateType.workout,
            title: 'Старт дома',
            levelPlace: '1/home',
            dailyCalories: null,
            isActive: true,
            bodyJson: { days_per_week: 3, description: PLAN_DESCRIPTION },
          },
        ]),
      },
      assistantReply: {
        create,
      },
      recommendation: {
        create: recommendationCreate,
      },
    };

    const users = {
      findById: jest.fn().mockResolvedValue(userFixture()),
    };

    const client = {
      isEnabled: () => llm.isEnabled,
      complete,
    } as unknown as LlmClient;

    const service = new AssistantService(
      prisma as never,
      users as never,
      client,
    );

    return {
      service,
      create,
      updateMany,
      complete,
      sent,
      recommendationCreate,
      prisma,
      users,
    };
  }

  it('saves an assistant reply apart from diary facts and keeps the free note local', async () => {
    const { service, create, updateMany, sent } = setup({
      isEnabled: true,
      complete: () => Promise.resolve(SAFE_LLM),
    });

    const response = await service.analyze(1, {
      period: 'day',
      date: '2026-10-30',
    });

    expect(sent).toHaveLength(1);
    expect(Object.keys(sent[0]).sort()).toEqual([...LLM_PAYLOAD_KEYS].sort());
    const serialized = JSON.stringify(sent[0]);
    expect(serialized).toContain(USER_COMMENT);
    expect(serialized).toContain('колено');
    expect(serialized).not.toContain(FREE_NOTE);
    expect(serialized).not.toContain('hidden@example.com');
    expect(serialized).not.toContain('hash-secret');
    expect(serialized).not.toContain('73.4');
    expect(serialized).not.toContain('Анна');
    expect(serialized).not.toContain(PLAN_DESCRIPTION);
    expect(sent[0].goal).toBe(2);
    expect(sent[0].level).toBe(1);
    expect(sent[0].skip_count).toBe(1);
    expect(sent[0].wellbeing).toEqual([
      { date: '2026-10-30', feeling: Feeling.hard },
    ]);
    expect(sent[0].active_plan_parameters).toEqual([
      {
        type: TemplateType.workout,
        title: 'Старт дома',
        level_place: '1/home',
        daily_calories: null,
        days_per_week: 3,
      },
    ]);

    expect(response.summary_text).toBe(SAFE_LLM);
    expect(response.recommendation).toBeNull();
    expect(response.screen_notice).toBe(ANALYSIS_SCREEN_NOTICE);
    expect(response.assistant_reply).toMatchObject({
      id: 9,
      role: 'assistant',
      text: SAFE_LLM,
      period: 'day',
      source: AssistantSource.llm,
    });
    expect(response.diary_facts).toEqual([
      {
        note_date: '2026-10-30',
        feeling: Feeling.hard,
        weight_kg: 73.4,
        user_comment: USER_COMMENT,
      },
    ]);
    expect(response.diary_facts[0]).not.toHaveProperty('advisor_comment');
    const saved = create.mock.calls[0]?.[0].data;
    expect(saved?.role).toBe('assistant');
    expect(saved?.text).toBe(SAFE_LLM);
    expect(saved?.source).toBe(AssistantSource.llm);
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 1, noteDate },
      data: { advisorComment: SAFE_LLM },
    });
  });

  it('falls back to a rules comment when the model diagnoses or promises weight', async () => {
    const { service, create } = setup({
      isEnabled: true,
      complete: () =>
        Promise.resolve(
          'У вас диагноз перегрузка. К 01.12.2026 вы похудеете на 3 кг.',
        ),
    });

    const response = await service.analyze(1, {
      period: 'day',
      date: '2026-10-30',
    });

    expect(response.assistant_reply.source).toBe(AssistantSource.rules);
    expect(response.summary_text).toContain('Получилось');
    expect(response.summary_text).toContain('С планом разошлось');
    expect(response.summary_text).not.toContain('диагноз');
    expect(response.summary_text).not.toContain('похуде');
    const saved = create.mock.calls[0]?.[0].data;
    expect(saved?.source).toBe(AssistantSource.rules);
    expect(saved?.text).toBe(response.summary_text);
  });

  it('does not call the model when the cloud assistant is off', async () => {
    const { service, complete } = setup({ isEnabled: false });

    const response = await service.analyze(1, {
      period: 'week',
      date: '2026-10-30',
    });

    expect(complete).not.toHaveBeenCalled();
    expect(response.assistant_reply.period).toBe('week');
    expect(response.assistant_reply.period_from).toBe('2026-10-26');
    expect(response.assistant_reply.period_to).toBe('2026-11-01');
    expect(response.assistant_reply.source).toBe(AssistantSource.rules);
    expect(response.summary_text).toContain('неделю');
    expect(response.summary_text).toContain('разошл');
  });

  it('does not call the model when the user disabled cloud assistant in settings', async () => {
    const { service, complete, users } = setup({
      isEnabled: true,
      complete: async () => SAFE_LLM,
    });
    users.findById.mockResolvedValue({
      ...userFixture(),
      cloudAssistantEnabled: false,
    });

    const response = await service.analyze(1, {
      period: 'week',
      date: '2026-10-30',
    });

    expect(complete).not.toHaveBeenCalled();
    expect(response.assistant_reply.source).toBe(AssistantSource.rules);
  });

  it('does not copy a week reply into a single diary row', async () => {
    const { service, create, updateMany } = setup({ isEnabled: false });

    await service.analyze(1, { period: 'week', date: '2026-10-30' });

    expect(updateMany).not.toHaveBeenCalled();
    const saved = create.mock.calls[0]?.[0].data;
    expect(saved?.role).toBe('assistant');
    expect(saved?.period).toBe('week');
  });

  it('creates a draft recommendation when skips and future workouts allow ease items', async () => {
    const dayTaskFindMany = jest.fn(
      (args: {
        where?: {
          kind?: string;
          status?: null;
          taskDate?: { gte?: Date; lte?: Date };
        };
      }) => {
        const kind = args.where?.kind;
        const statusNull = args.where?.status === null;
        if (kind === 'workout' && statusNull) {
          return Promise.resolve([
            {
              id: 20,
              planId: 4,
              title: 'День B',
              kind: 'workout',
              status: null,
              taskDate: new Date('2026-10-31T00:00:00.000Z'),
              detailsJson: {
                exercises: [
                  { name: 'Отжимания с паузой', sets: 3, reps: 8 },
                  { name: 'Приседания', sets: 3, reps: 12 },
                ],
              },
            },
          ]);
        }
        if (kind === 'workout') {
          return Promise.resolve([
            {
              id: 1,
              planId: 4,
              title: 'День A',
              kind: 'workout',
              status: TaskStatus.skipped,
              taskDate: new Date('2026-10-24T00:00:00.000Z'),
              detailsJson: {
                exercises: [{ name: 'Приседания', sets: 3, reps: 12 }],
              },
            },
            {
              id: 2,
              planId: 4,
              title: 'День C',
              kind: 'workout',
              status: TaskStatus.skipped,
              taskDate: new Date('2026-10-26T00:00:00.000Z'),
              detailsJson: {
                exercises: [{ name: 'Приседания', sets: 3, reps: 12 }],
              },
            },
          ]);
        }
        if (kind === 'meal') {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          {
            id: 1,
            planId: 4,
            title: 'День A',
            kind: 'workout',
            status: TaskStatus.skipped,
            taskDate: new Date('2026-10-24T00:00:00.000Z'),
            detailsJson: {
              exercises: [{ name: 'Приседания', sets: 3, reps: 12 }],
            },
          },
          {
            id: 2,
            planId: 4,
            title: 'День C',
            kind: 'workout',
            status: TaskStatus.skipped,
            taskDate: new Date('2026-10-26T00:00:00.000Z'),
            detailsJson: {
              exercises: [{ name: 'Приседания', sets: 3, reps: 12 }],
            },
          },
        ]);
      },
    );

    const { service, recommendationCreate } = setup(
      { isEnabled: false },
      { dayTaskFindMany },
    );

    const response = await service.analyze(1, {
      period: 'week',
      date: '2026-10-30',
    });

    expect(recommendationCreate).toHaveBeenCalled();
    expect(response.recommendation).not.toBeNull();
    expect(response.recommendation?.status).toBe(RecommendationStatus.draft);
    expect(response.recommendation?.items_json.length).toBeGreaterThan(0);
    expect(
      response.recommendation?.items_json.every(
        (item) => item.change.direction !== 'harden',
      ),
    ).toBe(true);
    const saved = recommendationCreate.mock.calls[0]?.[0].data;
    expect(saved?.status).toBe(RecommendationStatus.draft);
    expect(Array.isArray(saved?.itemsJson)).toBe(true);
  });
});
