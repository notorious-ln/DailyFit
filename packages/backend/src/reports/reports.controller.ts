import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { PublicUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PeriodReportQueryDto } from './dto/period-report-query.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('period')
  getPeriodReport(
    @CurrentUser() user: PublicUser,
    @Query() query: PeriodReportQueryDto,
  ) {
    return this.reportsService.getPeriodReport(user.id, query);
  }
}
