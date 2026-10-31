import { TemplateType, TrainingPlace } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional } from 'class-validator';

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

  /** When true, do not filter by level (including profile default). */
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  any_level?: boolean;

  /** When true, do not filter by place (including profile default). */
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  any_place?: boolean;
}
