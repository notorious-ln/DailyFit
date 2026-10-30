import { IsOptional, Matches } from 'class-validator';

export class WeekProgressQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from должен быть в формате YYYY-MM-DD',
  })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to должен быть в формате YYYY-MM-DD',
  })
  to?: string;
}
