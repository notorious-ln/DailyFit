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
import { AssistantService } from './assistant.service';
import { AnalyzeDto } from './dto/analyze.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  analyze(@CurrentUser() user: PublicUser, @Body() dto: AnalyzeDto) {
    return this.assistantService.analyze(user.id, dto);
  }
}
