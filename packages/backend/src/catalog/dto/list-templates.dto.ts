import { TemplateType, TrainingPlace } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional } from 'class-validator';

export class ListTemplatesDto {
  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  level?: number;

  @IsOptional()
  @IsEnum(TrainingPlace)
  place?: TrainingPlace;
}
