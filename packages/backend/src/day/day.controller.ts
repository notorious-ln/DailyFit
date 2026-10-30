import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { PublicUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DayService } from './day.service';
import { UpdateDayTasksDto } from './dto/update-day-tasks.dto';

@Controller('day')
@UseGuards(JwtAuthGuard)
export class DayController {
  constructor(private readonly dayService: DayService) {}

  @Get(':date')
  getDay(@CurrentUser() user: PublicUser, @Param('date') date: string) {
    return this.dayService.getDay(user.id, date);
  }

  @Put(':date/tasks')
  @HttpCode(HttpStatus.OK)
  updateTasks(
    @CurrentUser() user: PublicUser,
    @Param('date') date: string,
    @Body() dto: UpdateDayTasksDto,
  ) {
    return this.dayService.updateTasks(user.id, date, dto);
  }
}
