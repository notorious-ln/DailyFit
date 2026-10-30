import { IsIn, IsOptional, Matches } from 'class-validator';

export const ANALYZE_PERIODS = ['day', 'week'] as const;
export type AnalyzePeriodValue = (typeof ANALYZE_PERIODS)[number];

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
}
