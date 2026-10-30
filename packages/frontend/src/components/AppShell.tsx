import type { ReactNode } from 'react';
import { LEVEL_OPTIONS, type Profile } from '../api/profile';
import {
  initials,
  shortDisplayName,
} from '../lib/dates';
import { Icon } from './Icon';

export type NavId =
  | 'today'
  | 'plans'
  | 'progress'
  | 'profile'
  | 'diary'
  | 'templates';

type AppShellProps = {
  user: Profile;
  active: NavId;
  onLogout: () => void;
  onNavigate?: (id: NavId) => void;
  children: ReactNode;
};

const NAV: Array<{
  id: NavId;
  label: string;
  icon: 'calendar' | 'clipboard' | 'chart' | 'user' | 'book' | 'templates';
  adminOnly?: boolean;
  ready?: boolean;
}> = [
  { id: 'today', label: 'Сегодня', icon: 'calendar', ready: true },
  { id: 'plans', label: 'Планы', icon: 'clipboard', ready: true },
  { id: 'progress', label: 'Прогресс', icon: 'chart', ready: true },
  { id: 'profile', label: 'Профиль', icon: 'user' },
  { id: 'diary', label: 'Дневник', icon: 'book' },
  { id: 'templates', label: 'Шаблоны', icon: 'templates', adminOnly: true },
];

export function AppShell({
  user,
  active,
  onLogout,
  onNavigate,
  children,
}: AppShellProps) {
  const levelLabel =
    LEVEL_OPTIONS.find((item) => item.value === user.level)?.label ?? 'Новичок';
  const name = shortDisplayName(user.display_name, user.email);
  const avatar = initials(user.display_name, user.email);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="dumbbell" size={20} />
          </div>
          <span>Ритм</span>
        </div>

        <nav className="app-nav" aria-label="Основная навигация">
          {NAV.filter(
            (item) => !item.adminOnly || user.role === 'admin',
          ).map((item) => {
            const enabled = Boolean(item.ready);
            return (
              <button
                key={item.id}
                type="button"
                className={
                  item.id === active ? 'app-nav-item active' : 'app-nav-item'
                }
                disabled={!enabled}
                title={enabled ? undefined : 'Раздел появится позже'}
                onClick={() => {
                  if (enabled) {
                    onNavigate?.(item.id);
                  }
                }}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
                {item.adminOnly ? (
                  <span className="admin-badge">ADMIN</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="logout-button"
            onClick={onLogout}
          >
            <Icon name="logout" size={18} />
            <span>Выйти</span>
          </button>

          <div className="user-chip">
            <div className="user-avatar">{avatar}</div>
            <div className="user-meta">
              <strong>{name}</strong>
              <span>{levelLabel}</span>
            </div>
            <Icon name="chevron-right" size={16} />
          </div>
        </div>
      </aside>

      <div className="app-shell-body">{children}</div>
    </div>
  );
}
