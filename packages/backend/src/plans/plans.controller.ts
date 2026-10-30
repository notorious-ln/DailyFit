import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { PublicUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActivateMealDto } from './dto/activate-meal.dto';
import { ActivateWorkoutDto } from './dto/activate-workout.dto';
import { PlansService } from './plans.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post('activate-workout')
  @HttpCode(HttpStatus.OK)
  activateWorkout(
    @CurrentUser() user: PublicUser,
    @Body() dto: ActivateWorkoutDto,
  ) {
    return this.plansService.activateWorkout(user.id, dto);
  }

  @Post('activate-meal')
  async activateMeal(
    @CurrentUser() user: PublicUser,
    @Body() dto: ActivateMealDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.plansService.activateMeal(user.id, dto);
    if ('needs_manual_input' in result) {
      res.status(HttpStatus.ACCEPTED);
    } else {
      res.status(HttpStatus.OK);
    }
    return result;
  }
}
