import { Gender, User } from '@prisma/client';

export type CalorieProfile = Pick<
  User,
  'gender' | 'age' | 'heightCm' | 'weightKg' | 'workoutsPerWeek' | 'goal'
>;

/**
 * Mifflin–St Jeor BMR × activity × goal.
 * goal: 1 = deficit, 2 = maintain, 3 = surplus (as used in profile).
 */
export function calculateDailyCalories(profile: CalorieProfile): number | null {
  const maintenance = calculateMaintenanceCalories(profile);
  if (maintenance == null) {
    return null;
  }
  return Math.round(maintenance * goalMultiplier(profile.goal));
}

/** Поддержание: BMR × активность, без множителя цели (FT-12 нижняя граница 80%). */
export function calculateMaintenanceCalories(
  profile: CalorieProfile,
): number | null {
  const { gender, age, heightCm, weightKg } = profile;
  if (
    gender == null ||
    age == null ||
    heightCm == null ||
    weightKg == null ||
    age <= 0 ||
    heightCm <= 0 ||
    weightKg <= 0
  ) {
    return null;
  }

  const bmr = mifflinStJeor(gender, weightKg, heightCm, age);
  const activity = activityMultiplier(profile.workoutsPerWeek);
  return Math.round(bmr * activity);
}

function mifflinStJeor(
  gender: Gender,
  weightKg: number,
  heightCm: number,
  age: number,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (gender === Gender.male) {
    return base + 5;
  }
  if (gender === Gender.female) {
    return base - 161;
  }
  // other — среднее между мужской и женской формулой
  return base - 78;
}

function activityMultiplier(workoutsPerWeek: number | null): number {
  const n = workoutsPerWeek ?? 0;
  if (n <= 0) return 1.2;
  if (n <= 3) return 1.375;
  if (n <= 5) return 1.55;
  return 1.725;
}

/** 1 cut / 2 maintain / 3 bulk */
function goalMultiplier(goal: number | null): number {
  if (goal === 1) return 0.85;
  if (goal === 3) return 1.1;
  return 1;
}
