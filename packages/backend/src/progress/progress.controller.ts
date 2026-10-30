import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { PublicUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WeekProgressQueryDto } from './dto/week-progress-query.dto';
import { ProgressService } from './progress.service';

@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('week')
  getWeekProgress(
    @CurrentUser() user: PublicUser,
    @Query() query: WeekProgressQueryDto,
  ) {
    return this.progressService.getWeekProgress(user.id, query);
  }
}
