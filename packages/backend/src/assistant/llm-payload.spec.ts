import { Feeling, TemplateType } from '@prisma/client';
import { buildLlmPayload, LLM_PAYLOAD_KEYS } from './llm-payload';

describe('buildLlmPayload', () => {
  const freeNote = 'СЕКРЕТНАЯ_ПОМЕТКА_ПРОФИЛЯ';

  const payload = buildLlmPayload({
    goal: 2,
    level: 1,
    limitationTags: ['колено'],
    freeNote,
    compliance: {
      period: 'day',
      from: '2026-10-30',
      to: '2026-10-30',
      workout_percent: 100,
      meal_percent: 0,
      overall_percent: 50,
    },
    skipCount: 1,
    wellbeing: [{ date: '2026-10-30', feeling: Feeling.hard }],
    activePlanParameters: [
      {
        type: TemplateType.workout,
        title: 'Старт дома',
        level_place: '1/home',
        daily_calories: null,
        days_per_week: 3,
      },
    ],
    userDayComments: [
      { date: '2026-10-30', text: 'после приседа тянуло колено' },
    ],
  });

  it('keeps only the allowlisted fields', () => {
    expect(Object.keys(payload).sort()).toEqual([...LLM_PAYLOAD_KEYS].sort());
  });

  it('sends goal, level, limits, percents, skips, wellbeing and the day comment', () => {
    expect(payload.goal).toBe(2);
    expect(payload.level).toBe(1);
    expect(payload.limitation_tags).toEqual(['колено']);
    expect(payload.compliance_summary.overall_percent).toBe(50);
    expect(payload.skip_count).toBe(1);
    expect(payload.wellbeing).toEqual([
      { date: '2026-10-30', feeling: Feeling.hard },
    ]);
    expect(payload.user_day_comments).toEqual([
      { date: '2026-10-30', text: 'после приседа тянуло колено' },
    ]);
    expect(payload.active_plan_parameters[0].days_per_week).toBe(3);
  });

  it('drops the free profile note', () => {
    expect(JSON.stringify(payload)).not.toContain(freeNote);
    expect(payload).not.toHaveProperty('free_note');
    expect(payload).not.toHaveProperty('freeNote');
  });
});
