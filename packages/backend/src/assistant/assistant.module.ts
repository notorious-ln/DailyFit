import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { LlmClient } from './llm.client';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [AssistantController],
  providers: [AssistantService, LlmClient],
})
export class AssistantModule {}
