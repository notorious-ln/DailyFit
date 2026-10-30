import { useEffect, useMemo, useState } from 'react';
import { analyzeWeek, type AnalyzeResponse } from '../api/analyze';
import { ApiError } from '../api/client';
import {
  getWeekProgress,
  type DayCompliance,
  type WeekProgress,
  type WeightPoint,
} from '../api/progress';
import type { Profile } from '../api/profile';
import { AppShell, type NavId } from '../components/AppShell';
import { Icon } from '../components/Icon';
import {
  currentIsoWeekRange,
  formatLongDate,
  formatWeekRange,
  parseDateKey,
  weekdayShort,
} from '../lib/dates';

type ProgressPageProps = {
  user: Profile;
  onLogout: () => void;
  onNavigate: (id: NavId) => void;
};

function formatPercent(value: number | null | undefined): string {
  if (value == null) {
    return '—';
  }
  return `${Math.round(value)}%`;
}

function formatWeight(value: number | null | undefined): string {
  if (value == null) {
    return '—';
  }
  return `${value.toLocaleString('ru-RU', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })} кг`;
}

function deltaLabel(value: number | null | undefined, unit: string): string | null {
  if (value == null) {
    return null;
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('ru-RU', {
    maximumFractionDigits: 1,
  })}${unit}`;
}

export function ProgressPage({
  user,
  onLogout,
  onNavigate,
}: ProgressPageProps) {
  const week = useMemo(() => currentIsoWeekRange(), []);
  const [data, setData] = useState<WeekProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analyzePending, setAnalyzePending] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [timeoutNotice, setTimeoutNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    getWeekProgress(week.from, week.to)
      .then((next) => {
        if (!cancelled) {
          setData(next);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(
            err instanceof ApiError
              ? err.message
              : 'Не удалось загрузить прогресс',
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
  }, [week.from, week.to]);

  const runAnalyze = async (simulateTimeout = false) => {
    setAnalyzePending(true);
    setAnalyzeError('');
    setTimeoutNotice('');
    try {
      const response = await analyzeWeek(week.to, simulateTimeout);
      setAnalysis(response);
      if (simulateTimeout || response.assistant_reply.source === 'rules') {
        if (simulateTimeout) {
          setTimeoutNotice(
            'Сценарий таймаута: внешняя модель недоступна, показан правиловый разбор.',
          );
        }
      }
    } catch (err) {
      setAnalyzeError(
        err instanceof ApiError ? err.message : 'Не удалось выполнить разбор',
      );
    } finally {
      setAnalyzePending(false);
    }
  };

  const overallDelta = deltaLabel(data?.overall_delta, '%');
  const weightDelta = deltaLabel(data?.weight_delta_kg, ' кг');
  const workoutSubtitle =
    data == null || data.workout_total === 0
      ? 'Нет тренировок на неделе'
      : data.workout_partial > 0
        ? data.workout_partial === 1
          ? 'Одна выполнена частично'
          : `${data.workout_partial} выполнены частично`
        : data.workout_done === data.workout_total
          ? 'Все тренировки отмечены'
          : 'По отметкам за неделю';

  return (
    <AppShell
      user={user}
      active="progress"
      onLogout={onLogout}
      onNavigate={onNavigate}
    >
      <div className="progress-page">
        <header className="progress-header">
          <div className="eyebrow">
            {data ? formatWeekRange(data.from, data.to) : formatWeekRange(week.from, week.to)}
          </div>
          <h1 className="page-title">Прогресс за неделю</h1>
          <p className="progress-lead">
            Соблюдение плана, тренировки и питание в одной сводке.
          </p>
        </header>

        {error ? <div className="form-error">{error}</div> : null}

        {loading ? (
          <div className="today-empty">Загружаем прогресс…</div>
        ) : null}

        {!loading && data?.empty ? (
          <div className="today-empty">
            За эту неделю ещё нет отметок. Начните с экрана «Сегодня», чтобы
            появилась сводка.
            <button
              type="button"
              className="primary-button catalog-cta"
              style={{ marginTop: 14, maxWidth: 220 }}
              onClick={() => onNavigate('today')}
            >
              Открыть Сегодня
            </button>
          </div>
        ) : null}

        {!loading && data && !data.empty ? (
          <>
            <section className="metric-grid">
              <article className="metric-card">
                <span>Соблюдение плана</span>
                <strong>{formatPercent(data.overall_percent)}</strong>
                <em className={data.overall_delta != null && data.overall_delta >= 0 ? 'up' : undefined}>
                  {overallDelta
                    ? `${overallDelta} к прошлой неделе`
                    : 'Нет сравнения с прошлой неделей'}
                </em>
              </article>

              <article className="metric-card">
                <span>Тренировки</span>
                <strong>
                  {data.workout_total > 0
                    ? `${data.workout_done} / ${data.workout_total}`
                    : '—'}
                </strong>
                <em>{workoutSubtitle}</em>
              </article>

              <article className="metric-card">
                <span>Питание</span>
                <strong>{formatPercent(data.meal_percent)}</strong>
                <em>
                  {data.meal_percent != null
                    ? 'По отметкам питания за неделю'
                    : 'Нет отметок питания'}
                </em>
              </article>

              <article className="metric-card">
                <span>Текущий вес</span>
                <strong>{formatWeight(data.current_weight_kg)}</strong>
                <em
                  className={
                    data.weight_delta_kg != null && data.weight_delta_kg <= 0
                      ? 'up'
                      : undefined
                  }
                >
                  {weightDelta
                    ? `${weightDelta} за неделю`
                    : 'Добавьте вес в дневнике'}
                </em>
              </article>
            </section>

            <section className="compliance-card">
              <div className="compliance-head">
                <div>
                  <h2>Соблюдение по дням</h2>
                  <p>Процент выполненных задач</p>
                </div>
                <span className="status-pill">
                  Среднее {formatPercent(data.overall_percent)}
                </span>
              </div>

              <DayBars days={data.days} />
              <WeightSparkline series={data.weight_series} days={data.days} />
            </section>

            <section className="progress-bottom">
              <article className="aside-card skips-card">
                <h2>Пропуски недели</h2>
                {data.skips.length === 0 ? (
                  <p className="empty-note">Пропусков и частичных отметок нет.</p>
                ) : (
                  <ul className="skips-list">
                    {data.skips.map((item) => (
                      <li key={`${item.date}-${item.title}-${item.status}`}>
                        <div
                          className={
                            item.kind === 'workout'
                              ? 'skip-icon workout'
                              : 'skip-icon meal'
                          }
                        >
                          <Icon
                            name={item.kind === 'workout' ? 'dumbbell' : 'meal'}
                            size={18}
                          />
                        </div>
                        <div>
                          <strong>
                            {item.status === 'partial'
                              ? `${item.title} — частично`
                              : `${item.title} — пропуск`}
                          </strong>
                          <span>{formatLongDate(item.date)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </article>

              <article className="aside-card analyze-card">
                <div className="analyze-icon">
                  <Icon name="sparkles" size={20} />
                </div>
                <h2>Интеллектуальный разбор</h2>
                <p>
                  Помощник сравнит план с отметками и предложит безопасную
                  корректировку.
                </p>

                <button
                  type="button"
                  className="primary-button analyze-cta"
                  disabled={analyzePending}
                  onClick={() => runAnalyze(false)}
                >
                  {analyzePending ? 'Разбираем…' : 'Разобрать неделю'}
                </button>

                <button
                  type="button"
                  className="text-link analyze-timeout"
                  disabled={analyzePending}
                  onClick={() => runAnalyze(true)}
                >
                  Проверить сценарий таймаута
                </button>

                {analyzeError ? (
                  <div className="form-error">{analyzeError}</div>
                ) : null}
                {timeoutNotice ? (
                  <div className="form-success">{timeoutNotice}</div>
                ) : null}
                {analysis ? <AnalyzeResultPanel analysis={analysis} /> : null}
              </article>
            </section>
          </>
        ) : null}

        {!loading && data && data.empty ? (
          <section className="progress-bottom single">
            <article className="aside-card analyze-card">
              <div className="analyze-icon">
                <Icon name="sparkles" size={20} />
              </div>
              <h2>Интеллектуальный разбор</h2>
              <p>
                Когда появятся отметки, можно будет разобрать неделю и получить
                безопасные предложения.
              </p>
              <button
                type="button"
                className="primary-button analyze-cta"
                disabled={analyzePending}
                onClick={() => runAnalyze(false)}
              >
                {analyzePending ? 'Разбираем…' : 'Разобрать неделю'}
              </button>
              <button
                type="button"
                className="text-link analyze-timeout"
                disabled={analyzePending}
                onClick={() => runAnalyze(true)}
              >
                Проверить сценарий таймаута
              </button>
              {analyzeError ? (
                <div className="form-error">{analyzeError}</div>
              ) : null}
              {timeoutNotice ? (
                <div className="form-success">{timeoutNotice}</div>
              ) : null}
              {analysis ? <AnalyzeResultPanel analysis={analysis} /> : null}
            </article>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function DayBars({ days }: { days: DayCompliance[] }) {
  return (
    <div className="day-bars" aria-label="Соблюдение по дням">
      {days.map((day) => {
        const date = parseDateKey(day.date);
        const value = day.percent;
        return (
          <div key={day.date} className="day-bar">
            <div className="day-bar-track">
              {value == null ? (
                <span className="day-bar-empty">—</span>
              ) : (
                <div
                  className="day-bar-fill"
                  style={{ height: `${Math.max(8, Math.min(100, value))}%` }}
                />
              )}
            </div>
            <strong>{value == null ? '—' : `${Math.round(value)}%`}</strong>
            <span>{weekdayShort(date)}</span>
          </div>
        );
      })}
    </div>
  );
}

function WeightSparkline({
  series,
  days,
}: {
  series: WeightPoint[];
  days: DayCompliance[];
}) {
  if (series.length === 0 || days.length === 0) {
    return (
      <div className="weight-spark empty">
        Нет записей веса за неделю. Отметьте вес в дневнике дня.
      </div>
    );
  }

  const weights = series.map((point) => point.weight_kg);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const span = Math.max(max - min, 0.1);
  const width = 560;
  const height = 64;
  const points = series
    .map((point, index) => {
      const x =
        series.length === 1
          ? width / 2
          : (index / (series.length - 1)) * width;
      const y = height - ((point.weight_kg - min) / span) * (height - 12) - 6;
      return `${x},${y}`;
    })
    .join(' ');

  const first = series[0];
  const last = series[series.length - 1];

  return (
    <div className="weight-spark">
      <div className="weight-spark-labels">
        <span>Вес {formatWeight(first.weight_kg)}</span>
        <span>
          {formatLongDate(last.date)} · {formatWeight(last.weight_kg)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="weight-spark-svg"
        role="img"
        aria-label="Динамика веса"
      >
        <polyline
          fill="none"
          stroke="#0f766e"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
      </svg>
    </div>
  );
}

function AnalyzeResultPanel({ analysis }: { analysis: AnalyzeResponse }) {
  const items = analysis.recommendation?.items_json ?? [];
  return (
    <div className="analyze-result">
      <div className="analyze-source">
        Источник:{' '}
        {analysis.assistant_reply.source === 'llm'
          ? 'облачный помощник'
          : 'локальные правила'}
      </div>
      <p>{analysis.summary_text}</p>
      {items.length > 0 ? (
        <ul className="detail-list">
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-note">Допустимых правок нет — только комментарий.</p>
      )}
      <small>{analysis.screen_notice}</small>
    </div>
  );
}
