import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Template, TemplateType } from '@prisma/client';
import { CatalogService, TemplateResponse } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateWriteDto, UpdateTemplateDto } from './dto/template-write.dto';

@Injectable()
export class AdminTemplatesService {
  private readonly logger = new Logger(AdminTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async list(): Promise<TemplateResponse[]> {
    const templates = await this.prisma.template.findMany({
      orderBy: [{ type: 'asc' }, { id: 'asc' }],
    });
    return templates.map((template) => this.catalog.toTemplate(template));
  }

  async create(
    adminId: number,
    dto: TemplateWriteDto,
  ): Promise<TemplateResponse> {
    const created = await this.prisma.template.create({
      data: {
        ...this.fields(dto),
        isVisible: dto.is_visible ?? true,
      },
    });
    this.logger.log(`создание шаблона admin=${adminId} template=${created.id}`);
    return this.catalog.toTemplate(created);
  }

  async update(
    adminId: number,
    dto: UpdateTemplateDto,
  ): Promise<TemplateResponse> {
    await this.requireTemplate(dto.id);
    const updated = await this.save(dto.id, {
      ...this.fields(dto),
      ...(dto.is_visible !== undefined ? { isVisible: dto.is_visible } : {}),
    });
    this.logger.log(
      `изменение шаблона admin=${adminId} template=${updated.id}`,
    );
    return this.catalog.toTemplate(updated);
  }

  async hide(adminId: number, id: number): Promise<TemplateResponse> {
    await this.requireTemplate(id);
    const hidden = await this.save(id, { isVisible: false });
    this.logger.log(`скрытие шаблона admin=${adminId} template=${hidden.id}`);
    return this.catalog.toTemplate(hidden);
  }

  private fields(dto: TemplateWriteDto): {
    type: TemplateType;
    title: string;
    levelPlace: string;
    bodyJson: Prisma.InputJsonValue;
  } {
    const title = dto.title.trim();
    if (!title) {
      throw new BadRequestException({ message: 'Укажите название шаблона' });
    }
    return {
      type: dto.type,
      title,
      levelPlace: dto.level_place,
      bodyJson: dto.body_json as Prisma.InputJsonValue,
    };
  }

  private async requireTemplate(id: number): Promise<Template> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException({ message: 'Шаблон не найден' });
    }
    return template;
  }

  /** Меняет только строку шаблона. Копии в active_plans не обновляются. */
  private async save(
    id: number,
    data: Prisma.TemplateUpdateInput,
  ): Promise<Template> {
    try {
      return await this.prisma.template.update({ where: { id }, data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException({ message: 'Шаблон не найден' });
      }
      throw error;
    }
  }
}
