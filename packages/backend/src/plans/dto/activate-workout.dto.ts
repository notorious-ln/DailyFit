import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class ActivateWorkoutDto {
  @Type(() => Number)
  @IsInt()
  templateId: number;

  @IsOptional()
  @IsBoolean()
  confirmReplace?: boolean;
}
