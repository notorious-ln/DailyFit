import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class ActivateMealDto {
  @Type(() => Number)
  @IsInt()
  templateId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(800)
  daily_calories?: number;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
