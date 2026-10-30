import { Injectable, NotFoundException } from '@nestjs/common';
import { Template, TemplateType, TrainingPlace } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ListTemplatesDto } from './dto/list-templates.dto';

export type TemplateCard = {
  id: number;
  type: TemplateType;
  title: string;
  level_place: string;
  is_visible: boolean;
};

export type TemplateResponse = TemplateCard & {
  body_json: Record<string, unknown>;
};

export type TemplateListResponse = {
  items: TemplateCard[];
  hint: string | null;
};

const EMPTY_HINT =
  'Нет шаблонов под текущие условия. Попробуйте ослабить фильтры по уровню или месту.';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async list(
    userId: number,
    query: ListTemplatesDto,
  ): Promise<TemplateListResponse> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException({ message: 'Пользователь не найден' });
    }

    const level = query.level ?? user.level ?? undefined;
    const place = query.place ?? user.place ?? undefined;

    const templates = await this.prisma.template.findMany({
      where: {
        isVisible: true,
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: [{ type: 'asc' }, { id: 'asc' }],
    });

    const items = templates
      .filter((template) =>
        matchesProfile(template.levelPlace, level, place),
      )
      .map((template) => this.toCard(template));

    return {
      items,
      hint: items.length === 0 ? EMPTY_HINT : null,
    };
  }

  async getById(id: number): Promise<TemplateResponse> {
    const template = await this.prisma.template.findFirst({
      where: { id, isVisible: true },
    });

    if (!template) {
      throw new NotFoundException({ message: 'Шаблон не найден' });
    }

    return this.toTemplate(template);
  }

  toCard(template: Template): TemplateCard {
    return {
      id: template.id,
      type: template.type,
      title: template.title,
      level_place: template.levelPlace,
      is_visible: template.isVisible,
    };
  }

  toTemplate(template: Template): TemplateResponse {
    return {
      ...this.toCard(template),
      body_json: asObject(template.bodyJson),
    };
  }
}

/** level_place format: "{level}/{place}", e.g. "1/home", "2/gym" */
export function matchesProfile(
  levelPlace: string,
  level?: number,
  place?: TrainingPlace | null,
): boolean {
  const [rawLevel, rawPlace] = levelPlace.split('/');
  const templateLevel = Number.parseInt(rawLevel ?? '', 10);
  const templatePlace = rawPlace as TrainingPlace | undefined;

  if (level !== undefined && !Number.isNaN(templateLevel) && templateLevel !== level) {
    return false;
  }

  if (place && templatePlace && templatePlace !== place) {
    return false;
  }

  return true;
}

export function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
