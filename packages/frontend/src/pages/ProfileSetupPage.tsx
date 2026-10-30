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
import { Icon } from '../components/Icon';

type ProfileSetupPageProps = {
  initial?: Profile | null;
  onComplete: (profile: Profile) => void;
};

export function ProfileSetupPage({
  initial,
  onComplete,
}: ProfileSetupPageProps) {
  const [goal, setGoal] = useState(initial?.goal ?? 1);
  const [level, setLevel] = useState(initial?.level ?? 1);
  const [place, setPlace] = useState<TrainingPlace>(initial?.place ?? 'home');
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState(
    initial?.workouts_per_week ?? 3,
  );
  const [gender, setGender] = useState<Gender | ''>(initial?.gender ?? 'female');
  const [age, setAge] = useState(initial?.age?.toString() ?? '');
  const [heightCm, setHeightCm] = useState(
    initial?.height_cm?.toString() ?? '',
  );
  const [weightKg, setWeightKg] = useState(
    initial?.weight_kg?.toString() ?? '',
  );
  const [limits, setLimits] = useState<string[]>(
    initial?.limitation_tags?.length
      ? initial.limitation_tags
      : ['Без прыжков'],
  );
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const toggleLimit = (item: string) => {
    setLimits((current) =>
      current.includes(item)
        ? current.filter((value) => value !== item)
        : [...current, item],
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');

    try {
      const profile = await updateProfile({
        goal,
        level,
        place,
        workouts_per_week: workoutsPerWeek,
        gender: gender || null,
        age: age ? Number(age) : null,
        height_cm: heightCm ? Number(heightCm) : null,
        weight_kg: weightKg ? Number(weightKg) : null,
        limitation_tags: limits,
      });
      onComplete(profile);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Не удалось сохранить профиль.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="setup-page">
      <header className="setup-header">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="dumbbell" size={22} />
          </div>
          <span>Ритм</span>
        </div>
        <span>Шаг 1 из 2</span>
      </header>

      <form className="setup-content" onSubmit={submit}>
        <div className="eyebrow">НАСТРОИМ ВАШ ПЛАН</div>
        <div className="page-title">Расскажите немного о себе</div>
        <p className="setup-intro">
          Это займёт пару минут. Параметры можно изменить позже.
        </p>

        <section className="setup-card">
          <div className="form-section">
            <strong>Ваша цель</strong>
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
            <p>
              Пол, возраст, рост и вес нужны только для учебного расчёта по
              формуле Миффлина — Сан Жеора.
            </p>
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
                  placeholder="27"
                />
              </label>
              <label className="form-field">
                <span>Рост, см</span>
                <input
                  inputMode="decimal"
                  value={heightCm}
                  onChange={(event) => setHeightCm(event.target.value)}
                  placeholder="168"
                />
              </label>
              <label className="form-field">
                <span>Вес, кг</span>
                <input
                  inputMode="decimal"
                  value={weightKg}
                  onChange={(event) => setWeightKg(event.target.value)}
                  placeholder="64.2"
                />
              </label>
            </div>
          </div>

          <div className="form-section">
            <strong>Ограничения</strong>
            <div className="tag-list">
              {LIMITATION_OPTIONS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={limits.includes(item) ? 'selected-tag' : ''}
                  onClick={() => toggleLimit(item)}
                >
                  {limits.includes(item) ? <Icon name="check" size={14} /> : null}
                  {item}
                </button>
              ))}
            </div>
          </div>

          {error ? <div className="form-error">{error}</div> : null}

          <button
            className="primary-button setup-submit"
            type="submit"
            disabled={pending}
          >
            {pending ? 'Сохраняем…' : 'Перейти к каталогу'}
            {!pending ? <Icon name="chevron-right" size={18} /> : null}
          </button>
        </section>
      </form>
    </main>
  );
}
