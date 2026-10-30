import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { PublicUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DiaryService } from './diary.service';
import { UpsertDiaryDto } from './dto/upsert-diary.dto';

@Controller('diary')
@UseGuards(JwtAuthGuard)
export class DiaryController {
  constructor(private readonly diaryService: DiaryService) {}

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
