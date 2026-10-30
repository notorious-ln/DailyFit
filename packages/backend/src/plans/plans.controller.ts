import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { PublicUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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
}
