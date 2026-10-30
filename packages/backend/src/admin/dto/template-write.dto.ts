import { TemplateType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class TemplateWriteDto {
  @IsEnum(TemplateType, { message: 'type должен быть workout или meal' })
  type: TemplateType;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Укажите название шаблона' })
  title: string;

  @IsString()
  @Matches(/^\d+\/(home|gym)$/, {
    message: 'level_place должен быть в формате уровень/home или уровень/gym',
  })
  level_place: string;

  @IsObject({ message: 'body_json должен быть объектом' })
  body_json: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  is_visible?: boolean;
}

export class UpdateTemplateDto extends TemplateWriteDto {
  @Type(() => Number)
  @IsInt()
  id: number;
}
