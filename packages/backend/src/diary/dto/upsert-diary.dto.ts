import { Feeling } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertDiaryDto {
  @IsEnum(Feeling)
  feeling: Feeling;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight_kg?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  user_comment?: string | null;
}
