import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DayController } from './day.controller';
import { DayService } from './day.service';

@Module({
  imports: [AuthModule],
  controllers: [DayController],
  providers: [DayService],
  exports: [DayService],
})
export class DayModule {}
