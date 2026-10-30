import { FormEvent, useEffect, useMemo, useState } from 'react';
import { analyzeWeek, type AnalyzeResponse } from '../api/analyze';
import { ApiError } from '../api/client';
import {
  FEELING_LABELS,
  getDiaryWeek,
  upsertDiary,
  type DiaryDayItem,
  type DiaryWeek,
  type Feeling,
} from '../api/diary';
import type { Profile } from '../api/profile';
import { AppShell, type NavId } from '../components/AppShell';
import { Icon } from '../components/Icon';
import {
  currentIsoWeekRange,
  formatLongDate,
  parseDateKey,
  weekdayShort,
} from '../lib/dates';

type DiaryPageProps = {
  user: Profile;
  onLogout: () => void;
  onNavigate: (id: NavId) => void;
};

const FEELINGS: Feeling[] = ['easy', 'normal', 'hard'];

export function DiaryPage({ user, onLogout, onNavigate }: DiaryPageProps) {
  const weekRange = useMemo(() => currentIsoWeekRange(), []);
  const [data, setData] = useState<DiaryWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<DiaryDayItem | null>(null);
  const [feeling, setFeeling] = useState<Feeling>('normal');
  const [comment, setComment] = useState('');
  const [weight, setWeight] = useState('');
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const [analyzePending, setAnalyzePending] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);

  const reload = async () => {
    const next = await getDiaryWeek(weekRange.from, weekRange.to);
    setData(next);
    return next;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getDiaryWeek(weekRange.from, weekRange.to)
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
              : 'Не удалось загрузить дневник',
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
  }, [weekRange.from, weekRange.to]);

  const openDay = (day: DiaryDayItem) => {
    setSelected(day);
    setFeeling(day.feeling ?? 'normal');
    setComment(day.user_comment ?? '');
    setWeight(day.weight_kg != null ? String(day.weight_kg) : '');
    setSaveError('');
    setSaveMessage('');
  };

  const saveDay = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) {
      return;
    }
    setSavePending(true);
    setSaveError('');
    setSaveMessage('');
    try {
      await upsertDiary(selected.date, {
        feeling,
        user_comment: comment.trim() || null,
        weight_kg: weight ? Number(weight.replace(',', '.')) : null,
      });
      const next = await reload();
      const updated = next.days.find((day) => day.date === selected.date);
      if (updated) {
        setSelected(updated);
      }
      setSaveMessage('Запись сохранена');
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : 'Не удалось сохранить запись',
      );
    } finally {
      setSavePending(false);
    }
  };

  const runAnalyze = async () => {
    setAnalyzePending(true);
    setAnalyzeError('');
    try {
      const response = await analyzeWeek(weekRange.to);
      setAnalysis(response);
    } catch (err) {
      setAnalyzeError(
        err instanceof ApiError ? err.message : 'Не удалось выполнить разбор',
      );
    } finally {
      setAnalyzePending(false);
    }
  };

  const summaryText = (() => {
    if (!data || data.notes_count === 0) {
      return 'Пока нет записей за эту неделю. Отметьте самочувствие в любой день.';
    }
    const dominant = data.dominant_feeling
      ? FEELING_LABELS[data.dominant_feeling].toLowerCase()
      : null;
    return dominant
      ? `Вы оставили записи за ${data.notes_count} ${daysWord(data.notes_count)}. Чаще всего самочувствие было ${feelingAdj(data.dominant_feeling!)}.`
      : `Вы оставили записи за ${data.notes_count} ${daysWord(data.notes_count)}.`;
  })();

  return (
    <AppShell
      user={user}
      active="diary"
      onLogout={onLogout}
      onNavigate={onNavigate}
    >
      <div className="diary-page">
        <header className="diary-header">
          <div className="eyebrow">ИСТОРИЯ ЗАПИСЕЙ</div>
          <h1 className="page-title">Дневник самочувствия</h1>
          <p className="diary-lead">
            Все отметки, вес и комментарии собраны по дням.
          </p>
        </header>

        {error ? <div className="form-error">{error}</div> : null}

        <div className="diary-layout">
          <section className="aside-card diary-week-card">
            <div className="diary-week-head">
              <div>
                <h2>Эта неделя</h2>
                <p>Нажмите на день, чтобы открыть подробности</p>
              </div>
            </div>

            {loading ? (
              <div className="today-empty">Загружаем дневник…</div>
            ) : null}

            {!loading && data ? (
              <ul className="diary-day-list">
                {data.days.map((day) => {
                  const date = parseDateKey(day.date);
                  const percent = day.day_compliance_percent;
                  return (
                    <li key={day.date}>
                      <button
                        type="button"
                        className="diary-day-row"
                        onClick={() => openDay(day)}
                      >
                        <div className="diary-date-box">
                          <strong>{date.getDate()}</strong>
                          <span>{weekdayShort(date)}</span>
                        </div>
                        <div className="diary-day-main">
                          <strong>
                            {day.has_note && day.feeling
                              ? FEELING_LABELS[day.feeling]
                              : 'Нет записи'}
                          </strong>
                          <span>
                            {day.user_comment?.trim()
                              ? day.user_comment
                              : day.has_note
                                ? 'Комментарий не добавлен'
                                : 'Нажмите, чтобы добавить запись'}
                          </span>
                        </div>
                        <div className="diary-day-progress">
                          <div className="diary-progress-track">
                            <div
                              className="diary-progress-fill"
                              style={{
                                width: `${Math.max(0, Math.min(100, percent ?? 0))}%`,
                              }}
                            />
                          </div>
                          <em>
                            {percent == null ? '0%' : `${Math.round(percent)}%`}
                          </em>
                        </div>
                        <Icon name="chevron-right" size={18} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          <aside className="aside-card diary-summary-card">
            <div className="diary-summary-icon">
              <Icon name="book" size={20} />
            </div>
            <h2>Коротко о неделе</h2>
            <p>{summaryText}</p>

            <div className="diary-summary-stats">
              <div>
                <span>Записей</span>
                <strong>
                  {data ? `${data.notes_count} из ${data.days.length}` : '—'}
                </strong>
              </div>
              <div>
                <span>Последний вес</span>
                <strong>
                  {data?.last_weight_kg != null
                    ? `${data.last_weight_kg.toLocaleString('ru-RU', {
                        maximumFractionDigits: 1,
                      })} кг`
                    : '—'}
                </strong>
              </div>
            </div>

            <button
              type="button"
              className="analyze-week-button"
              disabled={analyzePending}
              onClick={runAnalyze}
            >
              <Icon name="sparkles" size={18} />
              {analyzePending ? 'Разбираем…' : 'Разобрать неделю'}
            </button>

            {analyzeError ? (
              <div className="form-error">{analyzeError}</div>
            ) : null}
            {analysis ? (
              <div className="analyze-result">
                <div className="analyze-source">
                  Источник:{' '}
                  {analysis.assistant_reply.source === 'llm'
                    ? 'облачный помощник'
                    : 'локальные правила'}
                </div>
                <p>{analysis.summary_text}</p>
                {(analysis.recommendation?.items_json?.length ?? 0) > 0 ? (
                  <ul className="detail-list">
                    {analysis.recommendation!.items_json.map((item) => (
                      <li key={item.id}>
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-note">
                    Допустимых правок нет — только комментарий.
                  </p>
                )}
              </div>
            ) : null}
          </aside>
        </div>
      </div>

      {selected ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setSelected(null)}
        >
          <form
            className="modal-card diary-day-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            onSubmit={saveDay}
          >
            <div className="modal-head">
              <div className="eyebrow">ДНЕВНИК ДНЯ</div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSelected(null)}
              >
                Закрыть
              </button>
            </div>
            <h2>{formatLongDate(selected.date)}</h2>
            <p className="modal-desc">
              Соблюдение плана:{' '}
              {selected.day_compliance_percent == null
                ? 'нет отметок'
                : `${Math.round(selected.day_compliance_percent)}%`}
            </p>

            <div className="form-section tight">
              <strong>Самочувствие</strong>
              <div className="segmented-control diary-feeling">
                {FEELINGS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={feeling === item ? 'selected' : undefined}
                    onClick={() => setFeeling(item)}
                  >
                    {FEELING_LABELS[item]}
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

            {selected.advisor_comment ? (
              <div className="assistant-note">
                Комментарий помощника: {selected.advisor_comment}
              </div>
            ) : null}

            {saveError ? <div className="form-error">{saveError}</div> : null}
            {saveMessage ? (
              <div className="form-success">{saveMessage}</div>
            ) : null}

            <button
              className="primary-button auth-submit"
              type="submit"
              disabled={savePending}
            >
              {savePending ? 'Сохраняем…' : 'Сохранить запись'}
            </button>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}

function daysWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return 'день';
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'дня';
  }
  return 'дней';
}

function feelingAdj(feeling: Feeling): string {
  if (feeling === 'easy') {
    return 'лёгким';
  }
  if (feeling === 'hard') {
    return 'тяжёлым';
  }
  return 'нормальным';
}
