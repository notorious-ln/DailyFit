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
import type { NavId } from './components/AppShell';
import { AuthPage } from './pages/AuthPage';
import { DiaryPage } from './pages/DiaryPage';
import { PlansPage } from './pages/PlansPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProfileSetupPage } from './pages/ProfileSetupPage';
import { ProgressPage } from './pages/ProgressPage';
import { TodayPage } from './pages/TodayPage';

function needsSetup(user: Pick<PublicUser, 'goal' | 'level'> | null): boolean {
  return !user || user.goal == null || user.level == null;
}

export function App() {
  const [token, setToken] = useState(readToken);
  const [user, setUser] = useState<PublicUser | null>(readUser);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(Boolean(token));
  const [route, setRoute] = useState<NavId>('today');

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
    setRoute('today');
  };

  const handleProfileComplete = (next: Profile) => {
    setProfile(next);
    setUser(next);
    saveUser(next);
    setRoute('today');
  };

  const handleProfileChange = (next: Profile) => {
    setProfile(next);
    setUser(next);
    saveUser(next);
  };

  const handleLogout = () => {
    clearSession();
    setToken(null);
    setUser(null);
    setProfile(null);
    setRoute('today');
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

  if (!profile) {
    return (
      <main className="signed-in">
        <div className="signed-in-card">
          <div className="eyebrow">ПРОФИЛЬ</div>
          <div className="page-title">Загружаем данные…</div>
        </div>
      </main>
    );
  }

  if (route === 'plans') {
    return (
      <PlansPage
        user={profile}
        onLogout={handleLogout}
        onNavigate={setRoute}
      />
    );
  }

  if (route === 'progress') {
    return (
      <ProgressPage
        user={profile}
        onLogout={handleLogout}
        onNavigate={setRoute}
      />
    );
  }

  if (route === 'profile') {
    return (
      <ProfilePage
        user={profile}
        onLogout={handleLogout}
        onNavigate={setRoute}
        onProfileChange={handleProfileChange}
      />
    );
  }

  if (route === 'diary') {
    return (
      <DiaryPage
        user={profile}
        onLogout={handleLogout}
        onNavigate={setRoute}
      />
    );
  }

  return (
    <TodayPage
      user={profile}
      onLogout={handleLogout}
      onNavigate={setRoute}
    />
  );
}
