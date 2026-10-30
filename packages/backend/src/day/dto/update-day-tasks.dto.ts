import { TaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  ValidateNested,
} from 'class-validator';

export class UpdateDayTaskItemDto {
  @Type(() => Number)
  @IsInt()
  id: number;

  @IsEnum(TaskStatus)
  status: TaskStatus;
}

export class UpdateDayTasksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateDayTaskItemDto)
  tasks: UpdateDayTaskItemDto[];
}
