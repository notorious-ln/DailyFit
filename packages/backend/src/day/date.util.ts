/** Calendar date as UTC midnight for Prisma `@db.Date`. */
export function parseDateParam(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('INVALID_DATE');
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('INVALID_DATE');
  }

  return date;
}

export function calendarToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function diffUtcDays(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 86_400_000);
}

/** Editable if date is not older than 7 calendar days before today. */
export function isDayReadonly(taskDate: Date, today = calendarToday()): boolean {
  return taskDate.getTime() < addUtcDays(today, -7).getTime();
}

/** Monday 00:00 UTC of the ISO week that contains `date`. */
export function startOfIsoWeek(date: Date): Date {
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addUtcDays(date, mondayOffset);
}
