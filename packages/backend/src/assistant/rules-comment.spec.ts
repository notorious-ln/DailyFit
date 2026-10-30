import { Feeling, TaskStatus } from '@prisma/client';
import { isSafeComment } from './comment-safety';
import { buildRulesComment } from './rules-comment';

describe('buildRulesComment', () => {
  it('explains what worked and where the fact diverged, in plain language', () => {
    const text = buildRulesComment({
      period: 'day',
      from: '2026-10-30',
      to: '2026-10-30',
      workoutPercent: 100,
      mealPercent: 0,
      overallPercent: 50,
      skipCount: 1,
      tasks: [
        { title: 'День A', status: TaskStatus.done },
        { title: 'Завтрак', status: TaskStatus.skipped },
        { title: 'Обед', status: TaskStatus.partial },
      ],
      feelings: [{ feeling: Feeling.hard }],
    });

    expect(text).toContain('Получилось: «День A»');
    expect(text).toContain('С планом разошлось');
    expect(text).toContain('пропущено «Завтрак»');
    expect(text).toContain('частично «Обед»');
    expect(text).toContain('Самочувствие: тяжело');
    expect(text).toContain('50%');
    expect(isSafeComment(text)).toBe(true);
  });

  it('summarises a week without a weight promise', () => {
    const text = buildRulesComment({
      period: 'week',
      from: '2026-10-26',
      to: '2026-11-01',
      workoutPercent: 80,
      mealPercent: 50,
      overallPercent: 65,
      skipCount: 2,
      tasks: [{ title: 'День A', status: TaskStatus.done }],
      feelings: [
        { feeling: Feeling.easy },
        { feeling: Feeling.easy },
        { feeling: Feeling.normal },
      ],
    });

    expect(text).toContain('неделю 2026-10-26 — 2026-11-01');
    expect(text).toContain('тренировки 80%');
    expect(text).toContain('питание 50%');
    expect(text).toContain('Пропусков: 2');
    expect(text).toContain('легко (2)');
    expect(isSafeComment(text)).toBe(true);
  });
});
