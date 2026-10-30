import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  getTemplate,
  listTemplates,
  parseLevelPlace,
  type TemplateCard,
  type TemplateDetails,
  type TemplateType,
} from '../api/catalog';
import { ApiError } from '../api/client';
import {
  activateMeal,
  activateWorkout,
  listActivePlans,
  previewMealCalories,
  type ActivePlan,
} from '../api/plans';
import {
  GOAL_OPTIONS,
  LEVEL_OPTIONS,
  PLACE_OPTIONS,
  type Profile,
  type TrainingPlace,
} from '../api/profile';
import { AppShell, type NavId } from '../components/AppShell';
import { Icon } from '../components/Icon';
import {
  activeMealSubtitle,
  activeWorkoutSubtitle,
  mealMeta,
  templateBadge,
  workoutMeta,
} from '../lib/planMeta';

type PlansPageProps = {
  user: Profile;
  onLogout: () => void;
  onNavigate: (id: NavId) => void;
};

type MealConfirmState = {
  template: TemplateDetails;
  suggested: number | null;
  needsManual: boolean;
  message: string;
  calories: string;
};

export function PlansPage({ user, onLogout, onNavigate }: PlansPageProps) {
  const [catalogType, setCatalogType] = useState<TemplateType>('workout');
  const [levels, setLevels] = useState<number[]>(
    user.level != null ? [user.level] : [1],
  );
  const [places, setPlaces] = useState<TrainingPlace[]>(
    user.place ? [user.place] : ['home'],
  );

  const [items, setItems] = useState<TemplateCard[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [activePlans, setActivePlans] = useState<ActivePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<TemplateDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [replaceWarning, setReplaceWarning] = useState<string | null>(null);
  const [mealConfirm, setMealConfirm] = useState<MealConfirmState | null>(null);
  const [actionMessage, setActionMessage] = useState('');

  const goalLabel =
    GOAL_OPTIONS.find((item) => item.value === user.goal)?.label ?? 'вашу цель';
  const levelLabel =
    LEVEL_OPTIONS.find((item) => item.value === user.level)?.label ?? 'ваш уровень';

  const activeWorkout = activePlans.find((plan) => plan.type === 'workout');
  const activeMeal = activePlans.find((plan) => plan.type === 'meal');

  const query = useMemo(() => {
    const anyLevel = levels.length !== 1;
    const anyPlace = places.length !== 1;
    return {
      type: catalogType,
      ...(anyLevel
        ? { any_level: true as const }
        : { level: levels[0] }),
      ...(anyPlace
        ? { any_place: true as const }
        : { place: places[0] }),
    };
  }, [catalogType, levels, places]);

  const reloadActive = async () => {
    const plans = await listActivePlans();
    setActivePlans(plans);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([listTemplates(query), listActivePlans()])
      .then(([catalog, plans]) => {
        if (cancelled) {
          return;
        }
        setItems(Array.isArray(catalog?.items) ? catalog.items : []);
        setHint(catalog?.hint ?? null);
        setActivePlans(Array.isArray(plans) ? plans : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setItems([]);
          setActivePlans([]);
          setError(
            err instanceof ApiError
              ? err.message
              : 'Не удалось загрузить каталог',
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
  }, [query]);

  const toggleLevel = (value: number) => {
    setLevels((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const togglePlace = (value: TrainingPlace) => {
    setPlaces((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const openTemplate = async (id: number) => {
    setDetailLoading(true);
    setError('');
    setReplaceWarning(null);
    setActionMessage('');
    try {
      const details = await getTemplate(id);
      setSelected(details);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Не удалось открыть план',
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setReplaceWarning(null);
    setMealConfirm(null);
  };

  const confirmWorkout = async (templateId: number, replace = false) => {
    setActionPending(true);
    setError('');
    setReplaceWarning(null);
    try {
      await activateWorkout(templateId, replace);
      await reloadActive();
      setActionMessage('План тренировок активирован');
      setSelected(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setReplaceWarning(
          err.message || 'Уже есть активный план. Подтвердите замену.',
        );
      } else {
        setError(
          err instanceof ApiError ? err.message : 'Не удалось активировать план',
        );
      }
    } finally {
      setActionPending(false);
    }
  };

  const startMealActivation = async (template: TemplateDetails) => {
    setActionPending(true);
    setError('');
    try {
      const preview = await previewMealCalories(template.id);
      setMealConfirm({
        template,
        suggested: preview.suggested_calories,
        needsManual: preview.needs_manual_input,
        message: preview.message,
        calories:
          preview.suggested_calories != null
            ? String(preview.suggested_calories)
            : '',
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Не удалось рассчитать калорийность',
      );
    } finally {
      setActionPending(false);
    }
  };

  const confirmMeal = async (event: FormEvent) => {
    event.preventDefault();
    if (!mealConfirm) {
      return;
    }
    setActionPending(true);
    setError('');
    try {
      const calories = mealConfirm.calories
        ? Number(mealConfirm.calories)
        : null;
      if (mealConfirm.needsManual && (calories == null || Number.isNaN(calories))) {
        setError('Укажите суточную калорийность');
        return;
      }
      await activateMeal(
        mealConfirm.template.id,
        calories != null && !Number.isNaN(calories) ? calories : null,
      );
      await reloadActive();
      setActionMessage('План питания активирован');
      setMealConfirm(null);
      setSelected(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Не удалось активировать план',
      );
    } finally {
      setActionPending(false);
    }
  };

  const activateSelected = async () => {
    if (!selected) {
      return;
    }
    if (selected.type === 'workout') {
      await confirmWorkout(selected.id, false);
      return;
    }
    await startMealActivation(selected);
  };

  return (
    <AppShell
      user={user}
      active="plans"
      onLogout={onLogout}
      onNavigate={onNavigate}
    >
      <div className="plans-page">
        <header className="plans-header">
          <div className="eyebrow">МОИ ПРОГРАММЫ</div>
          <h1 className="page-title">Планы тренировок и питания</h1>
          <p className="plans-lead">
            Выберите подходящий шаблон — мы создадим вашу личную копию.
          </p>
        </header>

        <section className="active-plans">
          <ActivePlanCard
            kind="workout"
            plan={activeWorkout}
            emptyTitle="Нет активного плана тренировок"
            emptyText="Выберите шаблон в каталоге ниже"
          />
          <ActivePlanCard
            kind="meal"
            plan={activeMeal}
            emptyTitle="Нет активного плана питания"
            emptyText="Выберите шаблон питания в каталоге"
          />
        </section>

        <section className="catalog-panel">
          <div className="catalog-head">
            <div>
              <h2>Каталог планов</h2>
              <p>
                Подобраны под цель «{goalLabel}» и уровень «{levelLabel}»
              </p>
            </div>
            <div className="segmented-control catalog-type">
              <button
                type="button"
                className={catalogType === 'workout' ? 'selected' : undefined}
                onClick={() => setCatalogType('workout')}
              >
                Тренировки
              </button>
              <button
                type="button"
                className={catalogType === 'meal' ? 'selected' : undefined}
                onClick={() => setCatalogType('meal')}
              >
                Питание
              </button>
            </div>
          </div>

          <div className="filter-chips">
            {LEVEL_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={
                  levels.includes(item.value) ? 'filter-chip selected' : 'filter-chip'
                }
                onClick={() => toggleLevel(item.value)}
              >
                {levels.includes(item.value) ? (
                  <Icon name="check" size={14} />
                ) : null}
                {item.label}
              </button>
            ))}
            {PLACE_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={
                  places.includes(item.value) ? 'filter-chip selected' : 'filter-chip'
                }
                onClick={() => togglePlace(item.value)}
              >
                {places.includes(item.value) ? (
                  <Icon name="check" size={14} />
                ) : null}
                {item.label}
              </button>
            ))}
          </div>

          {error ? <div className="form-error">{error}</div> : null}
          {actionMessage ? (
            <div className="form-success">{actionMessage}</div>
          ) : null}

          {loading ? (
            <div className="today-empty">Загружаем каталог…</div>
          ) : null}

          {!loading && items.length === 0 ? (
            <div className="today-empty">
              {hint ??
                'Нет шаблонов под текущие условия. Попробуйте ослабить фильтры.'}
            </div>
          ) : null}

          <div className="catalog-grid">
            {items.map((item) => {
              const badge = templateBadge(item, user);
              const isActive = activePlans.some(
                (plan) => plan.template_id === item.id && plan.is_active,
              );
              const meta =
                item.type === 'workout'
                  ? workoutMeta(item)
                  : mealMeta(item);
              return (
                <article
                  key={item.id}
                  className={
                    badge.kind === 'fit' || isActive
                      ? 'catalog-card highlighted'
                      : 'catalog-card'
                  }
                >
                  <div className="catalog-card-top">
                    <span className={`catalog-badge ${badge.kind}`}>
                      {badge.label}
                    </span>
                    {isActive ? (
                      <span className="catalog-check">
                        <Icon name="check" size={16} />
                      </span>
                    ) : null}
                  </div>

                  <div className="catalog-icon">
                    <Icon
                      name={item.type === 'workout' ? 'dumbbell' : 'meal'}
                      size={22}
                    />
                  </div>

                  <h3>{item.title}</h3>
                  <div className="catalog-meta">{meta}</div>
                  <p>
                    {item.description ??
                      'Подробности откроются на карточке плана.'}
                  </p>

                  <button
                    type="button"
                    className={
                      isActive || badge.kind === 'fit'
                        ? 'secondary-button'
                        : 'primary-button catalog-cta'
                    }
                    onClick={() => openTemplate(item.id)}
                    disabled={detailLoading}
                  >
                    {isActive ? 'Открыть план' : 'Подробнее'}
                  </button>
                </article>
              );
            })}
          </div>

          <p className="plan-disclaimer">
            При выборе питания калорийность уточняется по профилю до активации.
            Это учебная оценка, а не медицинское назначение.
          </p>
        </section>
      </div>

      {selected ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDetail}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div className="task-kind">
                <Icon
                  name={selected.type === 'workout' ? 'dumbbell' : 'meal'}
                  size={16}
                />
                <span>
                  {selected.type === 'workout' ? 'ТРЕНИРОВКИ' : 'ПИТАНИЕ'}
                </span>
              </div>
              <button type="button" className="modal-close" onClick={closeDetail}>
                Закрыть
              </button>
            </div>

            <h2 id="plan-detail-title">{selected.title}</h2>
            <div className="catalog-meta">
              {selected.type === 'workout'
                ? workoutMeta(selected)
                : mealMeta(selected)}
            </div>
            <p className="modal-desc">
              {selected.description ?? 'Описание пока не заполнено.'}
            </p>

            <TemplateBody details={selected} />

            {replaceWarning ? (
              <div className="replace-box">
                <p>{replaceWarning}</p>
                <div className="status-actions">
                  <button
                    type="button"
                    className="primary-button catalog-cta"
                    disabled={actionPending}
                    onClick={() => confirmWorkout(selected.id, true)}
                  >
                    Заменить план
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={actionPending}
                    onClick={() => setReplaceWarning(null)}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="primary-button auth-submit"
                disabled={actionPending}
                onClick={activateSelected}
              >
                {actionPending
                  ? 'Сохраняем…'
                  : 'Сделать моим планом'}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {mealConfirm ? (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal-card"
            role="dialog"
            aria-modal="true"
            onSubmit={confirmMeal}
          >
            <div className="eyebrow">ПЛАН ПИТАНИЯ</div>
            <h2>{mealConfirm.template.title}</h2>
            <p className="modal-desc">{mealConfirm.message}</p>
            <label className="form-field">
              <span>Суточная калорийность, ккал</span>
              <input
                type="number"
                min={800}
                step={10}
                required={mealConfirm.needsManual}
                value={mealConfirm.calories}
                onChange={(event) =>
                  setMealConfirm((current) =>
                    current
                      ? { ...current, calories: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            {error ? <div className="form-error">{error}</div> : null}
            <div className="status-actions">
              <button
                type="submit"
                className="primary-button catalog-cta"
                disabled={actionPending}
              >
                {actionPending ? 'Активируем…' : 'Подтвердить'}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={actionPending}
                onClick={() => setMealConfirm(null)}
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}

function ActivePlanCard({
  kind,
  plan,
  emptyTitle,
  emptyText,
}: {
  kind: TemplateType;
  plan?: ActivePlan;
  emptyTitle: string;
  emptyText: string;
}) {
  if (!plan) {
    return (
      <div className="active-plan-card empty">
        <div className="active-plan-icon">
          <Icon name={kind === 'workout' ? 'dumbbell' : 'meal'} size={20} />
        </div>
        <div>
          <div className="active-plan-label">
            {kind === 'workout' ? 'активный план' : 'план питания'}
          </div>
          <strong>{emptyTitle}</strong>
          <p>{emptyText}</p>
        </div>
      </div>
    );
  }

  const parsed = parseLevelPlace(plan.level_place);
  return (
    <div className="active-plan-card">
      <div className="active-plan-icon">
        <Icon name={kind === 'workout' ? 'dumbbell' : 'meal'} size={20} />
      </div>
      <div className="active-plan-body">
        <div className="active-plan-label">
          {kind === 'workout' ? 'активный план' : 'план питания'}
        </div>
        <strong>{plan.title}</strong>
        <p>
          {kind === 'workout'
            ? activeWorkoutSubtitle(plan)
            : activeMealSubtitle(plan)}
        </p>
      </div>
      <span className="active-badge">Активен</span>
      <span className="sr-only">
        {parsed.level}/{parsed.place}
      </span>
    </div>
  );
}

function TemplateBody({ details }: { details: TemplateDetails }) {
  const body = details.body_json;
  if (details.type === 'workout') {
    const days = Array.isArray(body.days) ? body.days : [];
    if (days.length === 0) {
      return null;
    }
    return (
      <ul className="detail-list">
        {days.map((day, index) => {
          const item = day as {
            title?: string;
            description?: string;
            exercises?: Array<{ name?: string }>;
          };
          return (
            <li key={`${item.title ?? index}`}>
              <strong>{item.title ?? `День ${index + 1}`}</strong>
              <span>
                {item.description ??
                  (Array.isArray(item.exercises)
                    ? item.exercises
                        .map((exercise) => exercise.name)
                        .filter(Boolean)
                        .join(', ')
                    : '')}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  const meals = Array.isArray(body.meals) ? body.meals : [];
  if (meals.length === 0) {
    return null;
  }
  return (
    <ul className="detail-list">
      {meals.map((meal, index) => {
        const item = meal as { name?: string; examples?: string[] };
        return (
          <li key={`${item.name ?? index}`}>
            <strong>{item.name ?? `Приём ${index + 1}`}</strong>
            <span>{(item.examples ?? []).join(', ')}</span>
          </li>
        );
      })}
    </ul>
  );
}
