import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export const DECIDE_ACTIONS = ['accept', 'reject'] as const;
export type DecideAction = (typeof DECIDE_ACTIONS)[number];

export class DecideRecommendationDto {
  @IsIn(DECIDE_ACTIONS, {
    message: 'action должен быть accept или reject',
  })
  action: DecideAction;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedItems?: string[];
}
