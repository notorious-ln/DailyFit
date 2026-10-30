import { useEffect, useState } from 'react';
import type { AuthResponse, PublicUser } from './api/auth';
import { getProfile, type Profile } from './api/profile';
import {
  clearSession,
  readToken,
  readUser,
  saveSession,
  saveUser,
} from './auth/session';
import { AuthPage } from './pages/AuthPage';
import { ProfileSetupPage } from './pages/ProfileSetupPage';

function needsSetup(user: Pick<PublicUser, 'goal' | 'level'> | null): boolean {
  return !user || user.goal == null || user.level == null;
}

export function App() {
  const [token, setToken] = useState(readToken);
  const [user, setUser] = useState<PublicUser | null>(readUser);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setLoadingProfile(false);
      return;
    }

    let cancelled = false;
    setLoadingProfile(true);
    getProfile()
      .then((next) => {
        if (cancelled) {
          return;
        }
        setProfile(next);
        setUser(next);
        saveUser(next);
      })
      .catch(() => {
        if (!cancelled) {
          clearSession();
          setToken(null);
          setUser(null);
          setProfile(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAuthSuccess = (response: AuthResponse) => {
    saveSession(response);
    setToken(response.token);
    setUser(response.user);
  };

  const handleProfileComplete = (next: Profile) => {
    setProfile(next);
    setUser(next);
    saveUser(next);
  };

  const handleLogout = () => {
    clearSession();
    setToken(null);
    setUser(null);
    setProfile(null);
  };

  if (!token || !user) {
    return <AuthPage onSuccess={handleAuthSuccess} />;
  }

  if (loadingProfile) {
    return (
      <main className="signed-in">
        <div className="signed-in-card">
          <div className="eyebrow">ПРОФИЛЬ</div>
          <div className="page-title">Загружаем данные…</div>
        </div>
      </main>
    );
  }

  if (needsSetup(user)) {
    return (
      <ProfileSetupPage
        initial={profile}
        onComplete={handleProfileComplete}
      />
    );
  }

  return (
    <main className="signed-in">
      <div className="signed-in-card">
        <div className="eyebrow">ПРОФИЛЬ СОХРАНЁН</div>
        <div className="page-title">Готово к каталогу</div>
        <p>
          Цель и уровень для <strong>{user.email}</strong> сохранены на
          сервере. Следующий экран — каталог планов.
        </p>
        <button className="primary-button" type="button" onClick={handleLogout}>
          Выйти
        </button>
      </div>
    </main>
  );
}
