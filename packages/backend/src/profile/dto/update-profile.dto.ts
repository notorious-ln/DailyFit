import { Gender, TrainingPlace } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateProfileDto {
  @IsInt()
  goal: number;

  @IsInt()
  level: number;

  @IsOptional()
  @IsEnum(TrainingPlace)
  place?: TrainingPlace;

  @IsOptional()
  @IsInt()
  @Min(1)
  workouts_per_week?: number;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  age?: number | null;

  @IsOptional()
  @IsNumber()
  height_cm?: number | null;

  @IsOptional()
  @IsNumber()
  weight_kg?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  limitation_tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  free_note?: string | null;
}
