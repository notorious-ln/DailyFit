import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AssistantModule } from './assistant/assistant.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { DayModule } from './day/day.module';
import { DiaryModule } from './diary/diary.module';
import { JournalModule } from './journal/journal.module';
import { PlansModule } from './plans/plans.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { ProgressModule } from './progress/progress.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    JournalModule,
    UsersModule,
    AuthModule,
    ProfileModule,
    CatalogModule,
    AdminModule,
    PlansModule,
    DayModule,
    DiaryModule,
    ProgressModule,
    ReportsModule,
    AssistantModule,
    RecommendationsModule,
  ],
})
export class AppModule {}
