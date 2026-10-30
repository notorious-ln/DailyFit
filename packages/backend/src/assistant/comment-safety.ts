const DIAGNOSIS_MARKERS = [
  'диагноз',
  'заболеван',
  'симптом',
  'диабет',
  'гипертон',
  'депресс',
  'ожирен',
  'анорекс',
  'булими',
  'патолог',
  'препарат',
  'медицин',
  'терапи',
  'лечени',
  'болезн',
];

const WEIGHT_HINT =
  /похуд|сброс|набрать|набер|килограмм|\d+\s*кг|(?:^|[^а-яё])вес(?:[^а-яё]|$)/;

const DATE_HINT =
  /к\s+\d{1,2}[./]\d{1,2}|до\s+\d{1,2}[./]\d{1,2}|к\s+(?:понедель|вторник|сред|четверг|пятниц|суббот|воскресен|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)|через\s+\d+\s+(?:дн|недел|месяц)|к\s+концу/;

const WEIGHT_PROMISE =
  /обеща.{0,40}(?:вес|кг|похуд)|гарантир.{0,40}(?:вес|кг|похуд)/;

export const SAFE_FALLBACK =
  'Сравнил отметки с планом. Подробный текст сейчас недоступен: посмотрите, что отмечено выполненным и что пропущено.';

export function containsDiagnosis(text: string): boolean {
  const lower = text.toLowerCase();
  return DIAGNOSIS_MARKERS.some((marker) => lower.includes(marker));
}

export function promisesWeightByDate(text: string): boolean {
  const value = text.toLowerCase();
  if (WEIGHT_PROMISE.test(value)) {
    return true;
  }
  return WEIGHT_HINT.test(value) && DATE_HINT.test(value);
}

/** Комментарий без диагноза и без обещания изменить вес к дате. */
export function isSafeComment(text: string): boolean {
  const value = text.trim();
  if (!value || value.length > 2000) {
    return false;
  }
  if (containsDiagnosis(value) || promisesWeightByDate(value)) {
    return false;
  }
  return true;
}
