import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { PublicUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CatalogService } from './catalog.service';
import { ListTemplatesDto } from './dto/list-templates.dto';

@Controller('templates')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  list(@CurrentUser() user: PublicUser, @Query() query: ListTemplatesDto) {
    return this.catalogService.list(user.id, query);
  }

  @Get(':id')
  getById(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.getById(id);
  }
}
