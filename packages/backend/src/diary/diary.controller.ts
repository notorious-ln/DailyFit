import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { PublicUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DiaryService } from './diary.service';
import { UpsertDiaryDto } from './dto/upsert-diary.dto';
import { WeekDiaryQueryDto } from './dto/week-diary-query.dto';

@Controller('diary')
@UseGuards(JwtAuthGuard)
export class DiaryController {
  constructor(private readonly diaryService: DiaryService) {}

  @Get('week')
  getWeek(
    @CurrentUser() user: PublicUser,
    @Query() query: WeekDiaryQueryDto,
  ) {
    return this.diaryService.getWeek(user.id, query);
  }

  @Get(':date')
  getByDate(@CurrentUser() user: PublicUser, @Param('date') date: string) {
    return this.diaryService.getByDate(user.id, date);
  }

  @Put(':date')
  @HttpCode(HttpStatus.OK)
  upsert(
    @CurrentUser() user: PublicUser,
    @Param('date') date: string,
    @Body() dto: UpsertDiaryDto,
  ) {
    return this.diaryService.upsert(user.id, date, dto);
  }
}
