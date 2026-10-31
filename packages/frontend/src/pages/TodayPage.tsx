import { FormEvent, useEffect, useState, type CSSProperties } from 'react';
import { ApiError } from '../api/client';
import {
  getDay,
  updateDayTasks,
  type DayTask,
  type DayView,
  type TaskStatus,
} from '../api/day';
import { upsertDiary, type Feeling } from '../api/diary';
import { getWeekProgress } from '../api/progress';
import type { Profile } from '../api/profile';
import { AppShell, type NavId } from '../components/AppShell';
import { Icon } from '../components/Icon';
import {
  addDays,
  firstName,
  formatDayHeading,
  greetingForNow,
  parseDateKey,
  toDateKey,
  weekAround,
  weekdayShort,
} from '../lib/dates';

type TodayPageProps = {
  user: Profile;
  onLogout: () => void;
  onNavigate: (id: NavId) => void;
};

type Exercise = {
  name: string;
  sets?: number;
  reps?: number;
  duration_sec?: number;
};

type MealItem = {
  name?: string;
  examples?: string[];
};

const STATUS_ACTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'done', label: 'Готово' },
  { value: 'partial', label: 'Частично' },
  { value: 'skipped', label: 'Пропуск' },
];

const FEELINGS: Array<{ value: Feeling; label: string }> = [
  { value: 'easy', label: 'Легко' },
  { value: 'normal', label: 'Нормально' },
  { value: 'hard', label: 'Тяжело' },
];

function asExercises(value: unknown): Exercise[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is Exercise =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as Exercise).name === 'string',
  );
}

function asMeals(value: unknown): MealItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is MealItem =>
      Boolean(item) && typeof item === 'object',
  );
}

function exerciseMeta(exercise: Exercise): string {
  if (exercise.sets != null && exercise.reps != null) {
    return `${exercise.sets} × ${exercise.reps}`;
  }
  if (exercise.sets != null && exercise.duration_sec != null) {
    const minutes = Math.round(exercise.duration_sec / 60);
    return minutes > 0
      ? `${exercise.sets} × ${minutes} мин`
      : `${exercise.sets} × ${exercise.duration_sec} сек`;
  }
  if (exercise.duration_sec != null) {
    const minutes = Math.round(exercise.duration_sec / 60);
    return minutes > 0 ? `${minutes} мин` : `${exercise.duration_sec} сек`;
  }
  return '';
}

function formatCalories(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return `${Math.round(value).toLocaleString('ru-RU')} ккал на день`;
}

export function TodayPage({ user, onLogout, onNavigate }: TodayPageProps) {
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [day, setDay] = useState<DayView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [workoutPercent, setWorkoutPercent] = useState<number | null>(null);
  const [mealPercent, setMealPercent] = useState<number | null>(null);

  const [feeling, setFeeling] = useState<Feeling>('normal');
  const [comment, setComment] = useState('');
  const [weight, setWeight] = useState(
    user.weight_kg != null ? String(user.weight_kg) : '',
  );
  const [diaryPending, setDiaryPending] = useState(false);
  const [diaryMessage, setDiaryMessage] = useState('');
  const [diaryError, setDiaryError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    getDay(selectedDate)
      .then((next) => {
        if (!cancelled) {
          setDay(next);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDay(null);
          setError(
            err instanceof ApiError
              ? err.message
              : 'Не удалось загрузить день',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  useEffect(() => {
    const center = parseDateKey(selectedDate);
    const monday =
      center.getDay() === 0
        ? addDays(center, -6)
        : addDays(center, 1 - center.getDay());
    const weekFrom = toDateKey(monday);
    const weekTo = toDateKey(addDays(monday, 6));

    let cancelled = false;
    getWeekProgress(weekFrom, weekTo)
      .then((progress) => {
        if (cancelled) {
          return;
        }
        setWorkoutPercent(progress.workout_percent);
        setMealPercent(progress.meal_percent);
      })
      .catch(() => {
        if (!cancelled) {
          setWorkoutPercent(null);
          setMealPercent(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const selected = parseDateKey(selectedDate);
  const name = firstName(user.display_name, user.email);
  const tasks = day?.tasks ?? [];
  const doneCount = tasks.filter((task) => task.status === 'done').length;
  const totalCount = tasks.length;
  const compliance = day?.day_compliance_percent ?? 0;
  const progressLabel =
    totalCount === 0
      ? 'Нет задач'
      : `${doneCount} из ${totalCount} задач выполнено`;
  const progressRatio =
    totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  const setTaskStatus = async (task: DayTask, status: TaskStatus) => {
    if (day?.readonly) {
      return;
    }
    setUpdatingId(task.id);
    setError('');
    try {
      const next = await updateDayTasks(selectedDate, [
        { id: task.id, status },
      ]);
      setDay(next);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Не удалось сохранить отметку',
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const saveDiary = async (event: FormEvent) => {
    event.preventDefault();
    setDiaryPending(true);
    setDiaryError('');
    setDiaryMessage('');
    try {
      await upsertDiary(selectedDate, {
        feeling,
        user_comment: comment.trim() || null,
        weight_kg: weight ? Number(weight.replace(',', '.')) : null,
      });
      setDiaryMessage('Запись сохранена');
    } catch (err) {
      setDiaryError(
        err instanceof ApiError ? err.message : 'Не удалось сохранить дневник',
      );
    } finally {
      setDiaryPending(false);
    }
  };

  const workoutTasks = tasks.filter((task) => task.kind === 'workout');
  const mealTasks = tasks.filter((task) => task.kind === 'meal');
  const otherTasks = tasks.filter(
    (task) => task.kind !== 'workout' && task.kind !== 'meal',
  );

  return (
    <AppShell
      user={user}
      active="today"
      onLogout={onLogout}
      onNavigate={onNavigate}
    >
      <div className="today-layout">
        <section className="today-main">
          <header className="today-header">
            <div className="eyebrow">{formatDayHeading(selected)}</div>
            <h1 className="page-title">
              {greetingForNow()}, {name}
            </h1>
            <p className="today-lead">
              Ваш план на день, отметки и короткая запись в дневник.
            </p>
          </header>

          <div className="week-strip" role="listbox" aria-label="Неделя">
            {weekAround(selected).map((dayItem) => {
              const key = toDateKey(dayItem);
              const selectedDay = key === selectedDate;
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={selectedDay}
                  className={
                    selectedDay ? 'week-day selected' : 'week-day'
                  }
                  onClick={() => setSelectedDate(key)}
                >
                  <span>{weekdayShort(dayItem)}</span>
                  <strong>{dayItem.getDate()}</strong>
                  <i className={selectedDay ? 'dot active' : 'dot'} />
                </button>
              );
            })}
          </div>

          <div className="plan-panel">
            <div className="plan-panel-head">
              <h2>План на сегодня</h2>
              <div className="plan-progress">
                <div className="plan-progress-track">
                  <div
                    className="plan-progress-fill"
                    style={{ width: `${progressRatio}%` }}
                  />
                </div>
                <span>{progressLabel}</span>
              </div>
            </div>

            {error ? <div className="form-error">{error}</div> : null}

            {loading ? (
              <div className="today-empty">Загружаем задачи…</div>
            ) : null}

            {!loading && tasks.length === 0 ? (
              <div className="today-empty">
                На эту дату пока нет задач. Активируйте план тренировок или
                питания в разделе «Планы», и они появятся здесь.
              </div>
            ) : null}

            <div className="task-stack">
              {workoutTasks.map((task) => {
                const details = task.details_json ?? {};
                const exercises = asExercises(details.exercises);
                return (
                  <article key={task.id} className="task-card">
                    <div className="task-card-top">
                      <div className="task-kind">
                        <Icon name="dumbbell" size={16} />
                        <span>ТРЕНИРОВКА</span>
                      </div>
                    </div>
                    <h3>{task.title}</h3>
                    {typeof details.description === 'string' &&
                    details.description ? (
                      <p className="task-desc">{details.description}</p>
                    ) : null}

                    {exercises.length > 0 ? (
                      <ul className="exercise-list">
                        {exercises.map((exercise) => (
                          <li key={exercise.name}>
                            <span>{exercise.name}</span>
                            <strong>{exerciseMeta(exercise)}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <StatusButtons
                      status={task.status}
                      disabled={Boolean(day?.readonly) || updatingId === task.id}
                      onSelect={(status) => setTaskStatus(task, status)}
                    />
                  </article>
                );
              })}

              {mealTasks.map((task) => {
                const details = task.details_json ?? {};
                const meals = asMeals(details.meals);
                const calories = formatCalories(details.daily_calories);
                return (
                  <article key={task.id} className="task-card meal-card">
                    <div className="task-card-top">
                      <div className="task-kind">
                        <Icon name="meal" size={16} />
                        <span>ПИТАНИЕ</span>
                      </div>
                      {calories ? (
                        <span className="meal-calories">{calories}</span>
                      ) : null}
                    </div>
                    <h3>{task.title.replace(/^Питание:\s*/i, '')}</h3>

                    {meals.length > 0 ? (
                      <ul className="meal-list">
                        {meals.map((meal, index) => {
                          const title = meal.name ?? `Приём ${index + 1}`;
                          const examples = (meal.examples ?? []).join(', ');
                          const done = task.status === 'done';
                          return (
                            <li
                              key={`${title}-${index}`}
                              className={done ? 'meal-item done' : 'meal-item'}
                            >
                              <div className="meal-item-main">
                                {done ? (
                                  <span className="meal-check">
                                    <Icon name="check" size={14} />
                                  </span>
                                ) : (
                                  <span className="meal-bullet" />
                                )}
                                <div>
                                  <strong>{title}</strong>
                                  {examples ? <p>{examples}</p> : null}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}

                    <StatusButtons
                      status={task.status}
                      disabled={Boolean(day?.readonly) || updatingId === task.id}
                      onSelect={(status) => setTaskStatus(task, status)}
                    />
                  </article>
                );
              })}

              {otherTasks.map((task) => (
                <article key={task.id} className="task-card">
                  <h3>{task.title}</h3>
                  <StatusButtons
                    status={task.status}
                    disabled={Boolean(day?.readonly) || updatingId === task.id}
                    onSelect={(status) => setTaskStatus(task, status)}
                  />
                </article>
              ))}
            </div>

            <p className="plan-disclaimer">
              Калорийность и состав приёмов пищи носят ориентировочный характер
              и не заменяют консультацию специалиста.
            </p>
          </div>
        </section>

        <aside className="today-aside">
          <div className="aside-card progress-card">
            <div className="aside-card-head">
              <h2>Сегодня</h2>
              <span className="status-pill">
                {compliance >= 100
                  ? 'Готово'
                  : compliance > 0
                    ? 'В процессе'
                    : 'Ожидает'}
              </span>
            </div>

            <div className="progress-ring-wrap">
              <div
                className="progress-ring"
                style={
                  {
                    '--progress': `${Math.max(0, Math.min(100, compliance))}`,
                  } as CSSProperties
                }
              >
                <div className="progress-ring-inner">
                  <strong>{Math.round(compliance)}%</strong>
                  <span>выполнено</span>
                </div>
              </div>
            </div>

            <div className="progress-stats">
              <div>
                <strong>
                  {workoutPercent != null ? `${Math.round(workoutPercent)}%` : '—'}
                </strong>
                <span>тренировки</span>
              </div>
              <div>
                <strong>
                  {mealPercent != null ? `${Math.round(mealPercent)}%` : '—'}
                </strong>
                <span>питание</span>
              </div>
            </div>

            <button type="button" className="text-link" disabled>
              Открыть прогресс
              <Icon name="chevron-right" size={16} />
            </button>
          </div>

          <form className="aside-card diary-card" onSubmit={saveDiary}>
            <h2>Дневник дня</h2>
            <p className="diary-question">Как прошёл сегодняшний день?</p>

            <div className="form-section tight">
              <strong>Самочувствие</strong>
              <div className="segmented-control diary-feeling">
                {FEELINGS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={feeling === item.value ? 'selected' : undefined}
                    onClick={() => setFeeling(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="form-field">
              <span>Комментарий</span>
              <textarea
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Например: было много энергии..."
                maxLength={500}
              />
            </label>

            <label className="form-field">
              <span>Вес, кг необязательно</span>
              <input
                type="text"
                inputMode="decimal"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                placeholder="64.2"
              />
            </label>

            {diaryError ? <div className="form-error">{diaryError}</div> : null}
            {diaryMessage ? (
              <div className="form-success">{diaryMessage}</div>
            ) : null}

            <button
              className="primary-button diary-submit"
              type="submit"
              disabled={diaryPending}
            >
              {diaryPending ? 'Сохраняем…' : 'Сохранить запись'}
            </button>
          </form>
        </aside>
      </div>
    </AppShell>
  );
}

function StatusButtons({
  status,
  disabled,
  onSelect,
}: {
  status: TaskStatus | null;
  disabled: boolean;
  onSelect: (status: TaskStatus) => void;
}) {
  return (
    <div className="status-actions">
      {STATUS_ACTIONS.map((action) => (
        <button
          key={action.value}
          type="button"
          className={
            status === action.value
              ? `status-btn ${action.value} selected`
              : `status-btn ${action.value}`
          }
          disabled={disabled}
          onClick={() => onSelect(action.value)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
