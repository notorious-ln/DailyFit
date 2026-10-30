import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { PublicUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminTemplatesService } from './admin-templates.service';
import { TemplateWriteDto, UpdateTemplateDto } from './dto/template-write.dto';

@Controller('admin/templates')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminTemplatesController {
  constructor(private readonly adminTemplatesService: AdminTemplatesService) {}

  @Get()
  list() {
    return this.adminTemplatesService.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: PublicUser, @Body() dto: TemplateWriteDto) {
    return this.adminTemplatesService.create(user.id, dto);
  }

  @Put()
  update(@CurrentUser() user: PublicUser, @Body() dto: UpdateTemplateDto) {
    return this.adminTemplatesService.update(user.id, dto);
  }

  @Patch(':id/hide')
  hide(@CurrentUser() user: PublicUser, @Param('id', ParseIntPipe) id: number) {
    return this.adminTemplatesService.hide(user.id, id);
  }
}
