import { FormEvent, useState } from 'react';
import { login, register, type AuthResponse } from '../api/auth';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';

type Mode = 'login' | 'register';

type AuthPageProps = {
  onSuccess: (response: AuthResponse) => void;
};

export function AuthPage({ onSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.includes('@')) {
      setError('Введите корректный адрес электронной почты.');
      return;
    }
    if (password.length < 8) {
      setError('Пароль должен содержать не менее 8 символов.');
      return;
    }

    setPending(true);
    setError('');
    try {
      const response =
        mode === 'login'
          ? await login({ email, password })
          : await register({ email, password });
      onSuccess(response);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Сервер недоступен. Проверьте, что бэкенд запущен.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <div className="brand light">
          <div className="brand-mark">
            <Icon name="dumbbell" size={22} />
          </div>
          <span>Ритм</span>
        </div>
        <div className="auth-illustration">
          <div className="illustration-ring">
            <Icon name="chart" size={46} />
          </div>
          <div className="illustration-card">
            <Icon name="check" />
            <span>План на сегодня</span>
            <strong>3 из 4</strong>
          </div>
        </div>
        <div>
          <div className="auth-slogan">Тренируйтесь в своём ритме</div>
          <p>Планы, дневник и понятные рекомендации без давления.</p>
        </div>
      </section>

      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="mobile-brand">
            <div className="brand-mark">
              <Icon name="dumbbell" size={20} />
            </div>
            <strong>Ритм</strong>
          </div>
          <div className="page-title">
            {mode === 'login' ? 'С возвращением' : 'Создайте аккаунт'}
          </div>
          <p>
            {mode === 'login'
              ? 'Войдите, чтобы продолжить вести дневник.'
              : 'Начните с простого плана под вашу цель.'}
          </p>

          <div className="segmented-control auth-tabs" role="tablist">
            <button
              type="button"
              className={mode === 'login' ? 'selected' : ''}
              onClick={() => switchMode('login')}
            >
              Вход
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'selected' : ''}
              onClick={() => switchMode('register')}
            >
              Регистрация
            </button>
          </div>

          <label className="form-field">
            <span>Электронная почта *</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="anna@example.ru"
            />
          </label>

          <label className="form-field">
            <span>Пароль *</span>
            <input
              type="password"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <small>Не менее 8 символов</small>
          </label>

          {error ? <div className="form-error">{error}</div> : null}

          <button
            className="primary-button auth-submit"
            type="submit"
            disabled={pending}
          >
            {pending
              ? 'Отправляем…'
              : mode === 'login'
                ? 'Войти'
                : 'Создать аккаунт'}
          </button>
        </form>
      </section>
    </main>
  );
}
