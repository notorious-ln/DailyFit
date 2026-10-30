import { NotFoundException } from '@nestjs/common';
import { JournalEvent, Prisma, Template, TemplateType } from '@prisma/client';
import { CatalogService } from '../catalog/catalog.service';
import { AdminTemplatesService } from './admin-templates.service';
import { TemplateWriteDto, UpdateTemplateDto } from './dto/template-write.dto';

function template(overrides: Partial<Template> = {}): Template {
  return {
    id: 7,
    type: TemplateType.workout,
    title: 'Старт дома',
    levelPlace: '1/home',
    bodyJson: { days: [{ title: 'День A' }] },
    isVisible: true,
    ...overrides,
  };
}

function writeDto(overrides: Partial<TemplateWriteDto> = {}): TemplateWriteDto {
  return {
    type: TemplateType.meal,
    title: '  Рацион дома  ',
    level_place: '2/home',
    body_json: { meals: [{ name: 'Завтрак' }] },
    ...overrides,
  };
}

describe('AdminTemplatesService', () => {
  function setup() {
    const templateFindMany = jest.fn();
    const templateFindUnique = jest.fn();
    const templateCreate = jest.fn();
    const templateUpdate = jest.fn();
    const activePlanUpdate = jest.fn();
    const activePlanUpdateMany = jest.fn();
    const dayTaskUpdate = jest.fn();
    const dayTaskUpdateMany = jest.fn();
    const diaryNoteFindMany = jest.fn();

    const prisma = {
      template: {
        findMany: templateFindMany,
        findUnique: templateFindUnique,
        create: templateCreate,
        update: templateUpdate,
      },
      activePlan: {
        update: activePlanUpdate,
        updateMany: activePlanUpdateMany,
      },
      dayTask: {
        update: dayTaskUpdate,
        updateMany: dayTaskUpdateMany,
      },
      diaryNote: {
        findMany: diaryNoteFindMany,
      },
    };

    const journalRecord = jest.fn().mockResolvedValue(undefined);
    const service = new AdminTemplatesService(
      prisma as never,
      new CatalogService({} as never, {} as never),
      { record: journalRecord } as never,
    );

    return {
      service,
      journalRecord,
      templateFindMany,
      templateFindUnique,
      templateCreate,
      templateUpdate,
      activePlanUpdate,
      activePlanUpdateMany,
      dayTaskUpdate,
      dayTaskUpdateMany,
      diaryNoteFindMany,
    };
  }

  function expectUserDataUntouched(handles: ReturnType<typeof setup>): void {
    expect(handles.activePlanUpdate).not.toHaveBeenCalled();
    expect(handles.activePlanUpdateMany).not.toHaveBeenCalled();
    expect(handles.dayTaskUpdate).not.toHaveBeenCalled();
    expect(handles.dayTaskUpdateMany).not.toHaveBeenCalled();
    expect(handles.diaryNoteFindMany).not.toHaveBeenCalled();
  }

  it('lists visible and hidden templates', async () => {
    const hidden = template({ id: 2, isVisible: false, title: 'Скрытый' });
    const visible = template();
    const { service, templateFindMany } = setup();
    templateFindMany.mockResolvedValue([visible, hidden]);

    const items = await service.list();

    expect(items).toEqual([
      {
        id: 7,
        type: TemplateType.workout,
        title: 'Старт дома',
        level_place: '1/home',
        is_visible: true,
        description: null,
        days_per_week: 1,
        meals_count: null,
        body_json: { days: [{ title: 'День A' }] },
      },
      {
        id: 2,
        type: TemplateType.workout,
        title: 'Скрытый',
        level_place: '1/home',
        is_visible: false,
        description: null,
        days_per_week: 1,
        meals_count: null,
        body_json: { days: [{ title: 'День A' }] },
      },
    ]);
  });

  it('creates a template without rewriting active copies or reading diary notes', async () => {
    const created = template({
      id: 9,
      type: TemplateType.meal,
      title: 'Рацион дома',
      levelPlace: '2/home',
      bodyJson: { meals: [{ name: 'Завтрак' }] },
    });
    const handles = setup();
    handles.templateCreate.mockResolvedValue(created);

    const result = await handles.service.create(4, writeDto());

    expect(handles.templateCreate).toHaveBeenCalledWith({
      data: {
        type: TemplateType.meal,
        title: 'Рацион дома',
        levelPlace: '2/home',
        bodyJson: { meals: [{ name: 'Завтрак' }] },
        isVisible: true,
      },
    });
    expect(result.id).toBe(9);
    expect(result.is_visible).toBe(true);
    expect(handles.journalRecord).toHaveBeenCalledWith({
      userId: 4,
      event: JournalEvent.template_created,
      details: { template_id: 9 },
    });
    expect(JSON.stringify(handles.journalRecord.mock.calls)).not.toContain(
      'Завтрак',
    );
    expectUserDataUntouched(handles);
  });

  it('stores an explicitly hidden template on create', async () => {
    const handles = setup();
    handles.templateCreate.mockResolvedValue(
      template({ isVisible: false, title: 'Черновик' }),
    );

    await handles.service.create(
      4,
      writeDto({ is_visible: false, title: 'Черновик' }),
    );

    expect(handles.templateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ isVisible: false, title: 'Черновик' }),
    });
  });

  it('updates only the template row and leaves active copies untouched', async () => {
    const existing = template();
    const updated = template({
      type: TemplateType.meal,
      title: 'Рацион дома',
      levelPlace: '2/home',
      bodyJson: { meals: [{ name: 'Завтрак' }] },
    });
    const handles = setup();
    handles.templateFindUnique.mockResolvedValue(existing);
    handles.templateUpdate.mockResolvedValue(updated);

    const dto: UpdateTemplateDto = { ...writeDto(), id: 7 };
    const result = await handles.service.update(4, dto);

    expect(handles.templateUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        type: TemplateType.meal,
        title: 'Рацион дома',
        levelPlace: '2/home',
        bodyJson: { meals: [{ name: 'Завтрак' }] },
      },
    });
    expect(result.title).toBe('Рацион дома');
    expect(result.body_json).toEqual({ meals: [{ name: 'Завтрак' }] });
    expect(handles.journalRecord).toHaveBeenCalledWith({
      userId: 4,
      event: JournalEvent.template_updated,
      details: { template_id: 7 },
    });
    expectUserDataUntouched(handles);
  });

  it('can change visibility on update without touching copies', async () => {
    const handles = setup();
    handles.templateFindUnique.mockResolvedValue(template());
    handles.templateUpdate.mockResolvedValue(template({ isVisible: false }));

    const result = await handles.service.update(4, {
      ...writeDto(),
      id: 7,
      is_visible: false,
    });

    expect(handles.templateUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({ isVisible: false }),
    });
    expect(result.is_visible).toBe(false);
    expectUserDataUntouched(handles);
  });

  it('hides a template from the catalog and keeps active copies', async () => {
    const handles = setup();
    handles.templateFindUnique.mockResolvedValue(template());
    handles.templateUpdate.mockResolvedValue(template({ isVisible: false }));

    const result = await handles.service.hide(4, 7);

    expect(handles.templateUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { isVisible: false },
    });
    expect(result.is_visible).toBe(false);
    expect(handles.journalRecord).toHaveBeenCalledWith({
      userId: 4,
      event: JournalEvent.template_hidden,
      details: { template_id: 7 },
    });
    expectUserDataUntouched(handles);
  });

  it('returns 404 when the template is missing', async () => {
    const handles = setup();
    handles.templateFindUnique.mockResolvedValue(null);

    await expect(
      handles.service.update(4, { ...writeDto(), id: 99 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(handles.service.hide(4, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(handles.templateUpdate).not.toHaveBeenCalled();
    expectUserDataUntouched(handles);
  });

  it('returns 404 when the row disappears before save', async () => {
    const handles = setup();
    handles.templateFindUnique.mockResolvedValue(template());
    handles.templateUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await expect(handles.service.hide(4, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expectUserDataUntouched(handles);
  });
});
