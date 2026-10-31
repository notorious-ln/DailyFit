import { FormEvent, useState } from 'react';
import { ApiError } from '../api/client';
import {
  GOAL_OPTIONS,
  LEVEL_OPTIONS,
  LIMITATION_OPTIONS,
  PLACE_OPTIONS,
  updateProfile,
  type Gender,
  type Profile,
  type TrainingPlace,
} from '../api/profile';
import { AppShell, type NavId } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { shortDisplayName } from '../lib/dates';

type ProfilePageProps = {
  user: Profile;
  onLogout: () => void;
  onNavigate: (id: NavId) => void;
  onProfileChange: (profile: Profile) => void;
};

export function ProfilePage({
  user,
  onLogout,
  onNavigate,
  onProfileChange,
}: ProfilePageProps) {
  const [editing, setEditing] = useState(false);
  const [addingLimit, setAddingLimit] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [displayName, setDisplayName] = useState(user.display_name ?? '');
  const [goal, setGoal] = useState(user.goal ?? 1);
  const [level, setLevel] = useState(user.level ?? 1);
  const [place, setPlace] = useState<TrainingPlace>(user.place ?? 'home');
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState(
    user.workouts_per_week ?? 3,
  );
  const [gender, setGender] = useState<Gender | ''>(user.gender ?? '');
  const [age, setAge] = useState(user.age?.toString() ?? '');
  const [heightCm, setHeightCm] = useState(user.height_cm?.toString() ?? '');
  const [weightKg, setWeightKg] = useState(user.weight_kg?.toString() ?? '');
  const [freeNote, setFreeNote] = useState(user.free_note ?? '');

  const goalLabel =
    GOAL_OPTIONS.find((item) => item.value === user.goal)?.label ?? '—';
  const levelLabel =
    LEVEL_OPTIONS.find((item) => item.value === user.level)?.label ?? '—';
  const placeLabel =
    PLACE_OPTIONS.find((item) => item.value === user.place)?.label ?? '—';
  const conditions = [
    placeLabel,
    user.workouts_per_week != null
      ? `${user.workouts_per_week} ${timesWord(user.workouts_per_week)} в неделю`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const availableLimits = LIMITATION_OPTIONS.filter(
    (item) => !user.limitation_tags.includes(item),
  );

  const openEditor = () => {
    setDisplayName(user.display_name ?? '');
    setGoal(user.goal ?? 1);
    setLevel(user.level ?? 1);
    setPlace(user.place ?? 'home');
    setWorkoutsPerWeek(user.workouts_per_week ?? 3);
    setGender(user.gender ?? '');
    setAge(user.age?.toString() ?? '');
    setHeightCm(user.height_cm?.toString() ?? '');
    setWeightKg(user.weight_kg?.toString() ?? '');
    setFreeNote(user.free_note ?? '');
    setError('');
    setMessage('');
    setEditing(true);
  };

  const saveProfile = async (
    patch: Partial<{
      display_name: string | null;
      goal: number;
      level: number;
      place: TrainingPlace;
      workouts_per_week: number;
      gender: Gender | null;
      age: number | null;
      height_cm: number | null;
      weight_kg: number | null;
      limitation_tags: string[];
      free_note: string | null;
      cloud_assistant_enabled: boolean;
    }>,
  ) => {
    if (user.goal == null || user.level == null) {
      throw new Error('Сначала заполните цель и уровень');
    }
    setPending(true);
    setError('');
    setMessage('');
    try {
      const next = await updateProfile({
        display_name: user.display_name,
        goal: user.goal,
        level: user.level,
        place: user.place ?? undefined,
        workouts_per_week: user.workouts_per_week ?? undefined,
        gender: user.gender,
        age: user.age,
        height_cm: user.height_cm,
        weight_kg: user.weight_kg,
        limitation_tags: user.limitation_tags,
        free_note: user.free_note,
        cloud_assistant_enabled: user.cloud_assistant_enabled,
        ...patch,
      });
      onProfileChange(next);
      setMessage('Профиль обновлён');
      return next;
    } catch (err) {
      const text =
        err instanceof ApiError ? err.message : 'Не удалось сохранить профиль';
      setError(text);
      throw err;
    } finally {
      setPending(false);
    }
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await saveProfile({
        display_name: displayName.trim() || null,
        goal,
        level,
        place,
        workouts_per_week: workoutsPerWeek,
        gender: gender || null,
        age: age ? Number(age) : null,
        height_cm: heightCm ? Number(heightCm) : null,
        weight_kg: weightKg ? Number(weightKg) : null,
        free_note: freeNote.trim() || null,
      });
      setEditing(false);
    } catch {
      // error already set
    }
  };

  const toggleAssistant = async () => {
    try {
      await saveProfile({
        cloud_assistant_enabled: !user.cloud_assistant_enabled,
      });
    } catch {
      // error already set
    }
  };

  const removeLimit = async (item: string) => {
    try {
      await saveProfile({
        limitation_tags: user.limitation_tags.filter((tag) => tag !== item),
      });
    } catch {
      // error already set
    }
  };

  const addLimit = async (item: string) => {
    try {
      await saveProfile({
        limitation_tags: [...user.limitation_tags, item],
      });
      setAddingLimit(false);
    } catch {
      // error already set
    }
  };

  return (
    <AppShell
      user={user}
      active="profile"
      onLogout={onLogout}
      onNavigate={onNavigate}
    >
      <div className="profile-page">
        <header className="profile-header">
          <div className="eyebrow">ЛИЧНЫЕ ПАРАМЕТРЫ</div>
          <h1 className="page-title">Профиль и цель</h1>
          <p className="profile-lead">
            Данные для подбора планов и стартовой калорийности.
          </p>
        </header>

        {error ? <div className="form-error">{error}</div> : null}
        {message ? <div className="form-success">{message}</div> : null}

        <section className="profile-grid">
          <article className="aside-card profile-card">
            <div className="profile-card-head">
              <div className="profile-card-icon">
                <Icon name="user" size={20} />
              </div>
              <div>
                <h2>Профиль</h2>
                <p>Параметры для подбора планов</p>
              </div>
            </div>

            <dl className="profile-rows">
              <div>
                <dt>Отображаемое имя</dt>
                <dd>{shortDisplayName(user.display_name, user.email)}</dd>
              </div>
              <div>
                <dt>Цель</dt>
                <dd>{goalLabel}</dd>
              </div>
              <div>
                <dt>Уровень</dt>
                <dd>{levelLabel}</dd>
              </div>
              <div>
                <dt>Условия</dt>
                <dd>{conditions || '—'}</dd>
              </div>
            </dl>

            <button
              type="button"
              className="secondary-button"
              onClick={openEditor}
              disabled={pending}
            >
              Редактировать профиль
            </button>
          </article>

          <article className="aside-card assistant-card">
            <div className="profile-card-head">
              <div className="analyze-icon">
                <Icon name="sparkles" size={20} />
              </div>
              <div>
                <h2>Облачный помощник</h2>
                <p>Комментарии и рекомендации по дневнику</p>
              </div>
            </div>

            <div className="assistant-toggle-row">
              <div>
                <strong>
                  {user.cloud_assistant_enabled
                    ? 'Помощник включён'
                    : 'Помощник выключен'}
                </strong>
                <span>Разбор отправляется только по вашему запросу</span>
              </div>
              <button
                type="button"
                className={
                  user.cloud_assistant_enabled
                    ? 'toggle-switch on'
                    : 'toggle-switch'
                }
                role="switch"
                aria-checked={user.cloud_assistant_enabled}
                disabled={pending}
                onClick={toggleAssistant}
              >
                <span />
              </button>
            </div>

            <div className="assistant-note">
              Во внешнюю модель не передаются пароль, электронная почта и
              свободная пометка профиля.
            </div>
          </article>
        </section>

        <article className="aside-card limits-card">
          <div className="profile-card-head">
            <div className="profile-card-icon">
              <Icon name="settings" size={20} />
            </div>
            <div>
              <h2>Ограничения</h2>
              <p>Учитываются при подборе и корректировке нагрузки</p>
            </div>
          </div>

          <div className="tag-list profile-tags">
            {user.limitation_tags.map((item) => (
              <button
                type="button"
                key={item}
                className="selected-tag"
                disabled={pending}
                onClick={() => removeLimit(item)}
                title="Убрать ограничение"
              >
                {item}
              </button>
            ))}

            {availableLimits.length > 0 ? (
              <button
                type="button"
                className="add-tag"
                disabled={pending}
                onClick={() => setAddingLimit((value) => !value)}
              >
                + Добавить
              </button>
            ) : null}
          </div>

          {addingLimit ? (
            <div className="tag-list profile-tags add-list">
              {availableLimits.map((item) => (
                <button
                  type="button"
                  key={item}
                  disabled={pending}
                  onClick={() => addLimit(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
        </article>
      </div>

      {editing ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setEditing(false)}
        >
          <form
            className="modal-card profile-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-edit-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={submitEdit}
          >
            <div className="modal-head">
              <div className="eyebrow">ПРОФИЛЬ</div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setEditing(false)}
              >
                Закрыть
              </button>
            </div>
            <h2 id="profile-edit-title">Редактировать профиль</h2>

            <label className="form-field">
              <span>Отображаемое имя</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Анна К."
                maxLength={80}
              />
            </label>

            <div className="form-section">
              <strong>Цель</strong>
              <div className="choice-grid">
                {GOAL_OPTIONS.map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    className={goal === item.value ? 'selected' : ''}
                    onClick={() => setGoal(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="two-columns">
              <div className="form-section">
                <strong>Уровень</strong>
                <div className="choice-grid two">
                  {LEVEL_OPTIONS.map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      className={level === item.value ? 'selected' : ''}
                      onClick={() => setLevel(item.value)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-section">
                <strong>Где тренируетесь</strong>
                <div className="choice-grid two">
                  {PLACE_OPTIONS.map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      className={place === item.value ? 'selected' : ''}
                      onClick={() => setPlace(item.value)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-section">
              <strong>Тренировок в неделю</strong>
              <div className="number-choice">
                {[2, 3, 4, 5].map((number) => (
                  <button
                    type="button"
                    key={number}
                    className={workoutsPerWeek === number ? 'selected' : ''}
                    onClick={() => setWorkoutsPerWeek(number)}
                  >
                    {number}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-section">
              <strong>Данные для стартовой калорийности</strong>
              <div className="details-grid">
                <label className="form-field">
                  <span>Пол</span>
                  <select
                    value={gender}
                    onChange={(event) =>
                      setGender(event.target.value as Gender | '')
                    }
                  >
                    <option value="">Не указан</option>
                    <option value="female">Женский</option>
                    <option value="male">Мужской</option>
                    <option value="other">Другой</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Возраст</span>
                  <input
                    inputMode="numeric"
                    value={age}
                    onChange={(event) => setAge(event.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>Рост, см</span>
                  <input
                    inputMode="decimal"
                    value={heightCm}
                    onChange={(event) => setHeightCm(event.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>Вес, кг</span>
                  <input
                    inputMode="decimal"
                    value={weightKg}
                    onChange={(event) => setWeightKg(event.target.value)}
                  />
                </label>
              </div>
            </div>

            <label className="form-field">
              <span>Свободная пометка</span>
              <textarea
                rows={3}
                value={freeNote}
                onChange={(event) => setFreeNote(event.target.value)}
                placeholder="Не уходит во внешнюю модель"
                maxLength={2000}
              />
            </label>

            {error ? <div className="form-error">{error}</div> : null}

            <button
              className="primary-button auth-submit"
              type="submit"
              disabled={pending}
            >
              {pending ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}

function timesWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return 'раз';
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'раза';
  }
  return 'раз';
}
