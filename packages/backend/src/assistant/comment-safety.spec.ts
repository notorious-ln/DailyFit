import {
  containsDiagnosis,
  isSafeComment,
  promisesWeightByDate,
  SAFE_FALLBACK,
} from './comment-safety';

describe('comment safety', () => {
  it('rejects a diagnosis', () => {
    expect(containsDiagnosis('Похоже на диагноз: перегрузка')).toBe(true);
    expect(isSafeComment('У вас признаки заболевания сустава')).toBe(false);
  });

  it('rejects a promise to change weight by a date', () => {
    expect(promisesWeightByDate('К 01.12.2026 вы похудеете на 3 кг')).toBe(
      true,
    );
    expect(promisesWeightByDate('Обещаю, что вес снизится')).toBe(true);
    expect(promisesWeightByDate('Через 2 недели сбросите 2 кг')).toBe(true);
    expect(isSafeComment('К пятнице вес будет 60 кг')).toBe(false);
  });

  it('accepts a plain comparison of fact and plan', () => {
    const text =
      'Разбор за 2026-10-30. Сводка по задачам: 50%. Пропусков: 1. Получилось: «День A». С планом разошлось: пропущено «Завтрак». Самочувствие: тяжело.';
    expect(isSafeComment(text)).toBe(true);
    expect(isSafeComment(SAFE_FALLBACK)).toBe(true);
  });
});
