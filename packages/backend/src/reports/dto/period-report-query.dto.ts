import { IsNotEmpty, Matches } from 'class-validator';

export class PeriodReportQueryDto {
  @IsNotEmpty({ message: 'Укажите from' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from должен быть в формате YYYY-MM-DD',
  })
  from: string;

  @IsNotEmpty({ message: 'Укажите to' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to должен быть в формате YYYY-MM-DD',
  })
  to: string;
}
