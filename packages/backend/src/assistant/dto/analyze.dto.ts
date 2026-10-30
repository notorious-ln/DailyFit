import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, Matches } from 'class-validator';

export const ANALYZE_PERIODS = ['day', 'week'] as const;
export type AnalyzePeriodValue = (typeof ANALYZE_PERIODS)[number];

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  return Boolean(value);
}

export class AnalyzeDto {
  @IsIn(ANALYZE_PERIODS, {
    message: 'period должен быть day или week',
  })
  period: AnalyzePeriodValue;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date должен быть в формате YYYY-MM-DD',
  })
  date?: string;

  /** Учебный флаг: принудительно пройти сценарий таймаута внешней модели. */
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  simulate_timeout?: boolean;
}
