const WEEKDAY_SHORT = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'] as const;
const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function formatDayHeading(date: Date): string {
  const weekday = WEEKDAY_SHORT[date.getDay()];
  const day = date.getDate();
  const month = MONTHS_GENITIVE[date.getMonth()].toUpperCase();
  return `${weekday}, ${day} ${month}`;
}

export function weekdayShort(date: Date): string {
  return WEEKDAY_SHORT[date.getDay()];
}

export function weekAround(date: Date): Date[] {
  const monday =
    date.getDay() === 0 ? addDays(date, -6) : addDays(date, 1 - date.getDay());
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function greetingForNow(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) {
    return 'Доброй ночи';
  }
  if (hour < 12) {
    return 'Доброе утро';
  }
  if (hour < 18) {
    return 'Добрый день';
  }
  return 'Добрый вечер';
}

export function firstName(displayName: string | null, email: string): string {
  if (displayName?.trim()) {
    return displayName.trim().split(/\s+/)[0];
  }
  const local = email.split('@')[0] ?? 'друг';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function initials(displayName: string | null, email: string): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function shortDisplayName(
  displayName: string | null,
  email: string,
): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[1][0]}.`;
    }
    return parts[0];
  }
  return firstName(null, email);
}

export function formatWeekRange(fromKey: string, toKey: string): string {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  const sameMonth = from.getMonth() === to.getMonth();
  if (sameMonth) {
    return `${from.getDate()}–${to.getDate()} ${MONTHS_GENITIVE[from.getMonth()].toUpperCase()}`;
  }
  return `${from.getDate()} ${MONTHS_GENITIVE[from.getMonth()].toUpperCase()} – ${to.getDate()} ${MONTHS_GENITIVE[to.getMonth()].toUpperCase()}`;
}

export function formatLongDate(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const weekdayNames = [
    'воскресенье',
    'понедельник',
    'вторник',
    'среда',
    'четверг',
    'пятница',
    'суббота',
  ];
  const weekday = weekdayNames[date.getDay()];
  const label = `${weekday}, ${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function currentIsoWeekRange(now = new Date()): {
  from: string;
  to: string;
} {
  const monday =
    now.getDay() === 0 ? addDays(now, -6) : addDays(now, 1 - now.getDay());
  return {
    from: toDateKey(monday),
    to: toDateKey(addDays(monday, 6)),
  };
}
