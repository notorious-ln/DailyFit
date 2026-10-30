import { Feeling, TaskStatus } from '@prisma/client';

const FEELING_LABEL: Record<Feeling, string> = {
  [Feeling.easy]: 'легко',
  [Feeling.normal]: 'нормально',
  [Feeling.hard]: 'тяжело',
};

export type RulesTask = {
  title: string;
  status: TaskStatus | null;
};

export type RulesCommentInput = {
  period: 'day' | 'week';
  from: string;
  to: string;
  workoutPercent: number | null;
  mealPercent: number | null;
  overallPercent: number | null;
  skipCount: number;
  tasks: RulesTask[];
  feelings: Array<{ feeling: Feeling }>;
};

export function buildRulesComment(input: RulesCommentInput): string {
  const done = input.tasks.filter((task) => task.status === TaskStatus.done);
  const partial = input.tasks.filter(
    (task) => task.status === TaskStatus.partial,
  );
  const skipped = input.tasks.filter(
    (task) => task.status === TaskStatus.skipped,
  );
  const marked = done.length + partial.length + skipped.length;

  const parts = [periodIntro(input)];

  if (input.tasks.length === 0) {
    parts.push(
      'Задач активного плана в этом периоде нет, поэтому сравнить факт с планом не получилось.',
    );
  } else if (marked === 0) {
    parts.push('Отметок пока нет, поэтому факт с планом ещё не сравнивался.');
  } else {
    parts.push(
      done.length > 0
        ? `Получилось: ${joinLimited(done.map((task) => `«${task.title}»`))}.`
        : 'Полностью выполненных задач нет.',
    );

    const diverged = [
      ...skipped.map((task) => `пропущено «${task.title}»`),
      ...partial.map((task) => `частично «${task.title}»`),
    ];
    parts.push(
      diverged.length > 0
        ? `С планом разошлось: ${joinLimited(diverged)}.`
        : 'Расхождений с планом по отметкам нет.',
    );
  }

  if (input.feelings.length > 0) {
    parts.push(`Самочувствие: ${formatFeelings(input.feelings)}.`);
  }

  return parts.join(' ');
}

function periodIntro(input: RulesCommentInput): string {
  if (input.period === 'day') {
    const bits = [`Разбор за ${input.from}.`];
    if (input.overallPercent != null) {
      bits.push(`Сводка по задачам: ${formatPercent(input.overallPercent)}.`);
    }
    bits.push(`Пропусков: ${input.skipCount}.`);
    return bits.join(' ');
  }

  const bits = [`Разбор за неделю ${input.from} — ${input.to}.`];
  const percents: string[] = [];
  if (input.workoutPercent != null) {
    percents.push(`тренировки ${formatPercent(input.workoutPercent)}`);
  }
  if (input.mealPercent != null) {
    percents.push(`питание ${formatPercent(input.mealPercent)}`);
  }
  if (percents.length > 0) {
    bits.push(`Сводка: ${percents.join(', ')}.`);
  }
  bits.push(`Пропусков: ${input.skipCount}.`);
  return bits.join(' ');
}

function formatFeelings(feelings: Array<{ feeling: Feeling }>): string {
  const counts = new Map<Feeling, number>();
  for (const item of feelings) {
    counts.set(item.feeling, (counts.get(item.feeling) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([feeling, count]) =>
      count > 1
        ? `${FEELING_LABEL[feeling]} (${count})`
        : FEELING_LABEL[feeling],
    )
    .join(', ');
}

function formatPercent(value: number): string {
  return `${value}%`;
}

function joinLimited(items: string[], limit = 5): string {
  if (items.length <= limit) {
    return items.join(', ');
  }
  return `${items.slice(0, limit).join(', ')} и ещё ${items.length - limit}`;
}
