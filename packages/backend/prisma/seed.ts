import { PrismaClient, TemplateType } from '@prisma/client';

const prisma = new PrismaClient();

const templates = [
  {
    type: TemplateType.workout,
    title: 'Старт дома: полное тело',
    levelPlace: '1/home',
    bodyJson: {
      description:
        'Базовый домашний план для новичков: 3 тренировочных дня с собственным весом.',
      days_per_week: 3,
      days: [
        {
          day_offset: 0,
          title: 'День A — ноги и корпус',
          description: 'Приседания, выпады, планка',
          exercises: [
            { name: 'Приседания', sets: 3, reps: 12 },
            { name: 'Выпады', sets: 3, reps: 10 },
            { name: 'Планка', sets: 3, duration_sec: 30 },
          ],
        },
        {
          day_offset: 1,
          title: 'День B — верх',
          description: 'Отжимания, тяга, плечи',
          exercises: [
            { name: 'Отжимания', sets: 3, reps: 8 },
            { name: 'Тяга в наклоне (бутылки)', sets: 3, reps: 12 },
            { name: 'Подъём рук в стороны', sets: 3, reps: 12 },
          ],
        },
        {
          day_offset: 2,
          title: 'День C — лёгкое кардио и мобилити',
          description: 'Ходьба на месте, растяжка',
          exercises: [
            { name: 'Марш на месте', sets: 1, duration_sec: 600 },
            { name: 'Растяжка всего тела', sets: 1, duration_sec: 600 },
          ],
        },
      ],
    },
  },
  {
    type: TemplateType.workout,
    title: 'Сила в зале: база',
    levelPlace: '1/gym',
    bodyJson: {
      description: 'Новичок в зале: базовые упражнения с тренажёрами и штангой.',
      days_per_week: 3,
      days: [
        {
          day_offset: 0,
          title: 'День A — ноги',
          exercises: [
            { name: 'Жим ногами', sets: 3, reps: 12 },
            { name: 'Разгибание ног', sets: 3, reps: 12 },
            { name: 'Сгибание ног', sets: 3, reps: 12 },
          ],
        },
        {
          day_offset: 1,
          title: 'День B — грудь и трицепс',
          exercises: [
            { name: 'Жим лёжа', sets: 3, reps: 8 },
            { name: 'Разведение гантелей', sets: 3, reps: 12 },
            { name: 'Разгибание на блоке', sets: 3, reps: 12 },
          ],
        },
        {
          day_offset: 2,
          title: 'День C — спина и бицепс',
          exercises: [
            { name: 'Тяга верхнего блока', sets: 3, reps: 10 },
            { name: 'Горизонтальная тяга', sets: 3, reps: 10 },
            { name: 'Подъём на бицепс', sets: 3, reps: 12 },
          ],
        },
      ],
    },
  },
  {
    type: TemplateType.workout,
    title: 'Домашний прогресс',
    levelPlace: '2/home',
    bodyJson: {
      description: 'Средний уровень дома: больше объёма и односторонние движения.',
      days_per_week: 4,
      days: [
        {
          day_offset: 0,
          title: 'Нижний акцент',
          exercises: [
            { name: 'Болгарские выпады', sets: 4, reps: 10 },
            { name: 'Ягодичный мост', sets: 4, reps: 15 },
          ],
        },
        {
          day_offset: 1,
          title: 'Верхний акцент',
          exercises: [
            { name: 'Отжимания с паузой', sets: 4, reps: 10 },
            { name: 'Обратные отжимания', sets: 3, reps: 12 },
          ],
        },
        {
          day_offset: 2,
          title: 'Корпус и устойчивость',
          exercises: [
            { name: 'Боковая планка', sets: 3, duration_sec: 40 },
            { name: 'Dead bug', sets: 3, reps: 12 },
          ],
        },
        {
          day_offset: 3,
          title: 'Круговая',
          exercises: [
            { name: 'Бёрпи', sets: 3, reps: 8 },
            { name: 'Приседания + жим руками', sets: 3, reps: 12 },
          ],
        },
      ],
    },
  },
  {
    type: TemplateType.workout,
    title: 'Зал: гипертрофия',
    levelPlace: '2/gym',
    bodyJson: {
      description: 'Сплит среднего уровня на силу и объём.',
      days_per_week: 4,
      days: [
        {
          day_offset: 0,
          title: 'Push',
          exercises: [
            { name: 'Жим гантелей', sets: 4, reps: 8 },
            { name: 'Жим над головой', sets: 3, reps: 10 },
          ],
        },
        {
          day_offset: 1,
          title: 'Pull',
          exercises: [
            { name: 'Тяга штанги', sets: 4, reps: 8 },
            { name: 'Подтягивания / тяга', sets: 3, reps: 8 },
          ],
        },
        {
          day_offset: 2,
          title: 'Legs',
          exercises: [
            { name: 'Присед', sets: 4, reps: 8 },
            { name: 'Румынская тяга', sets: 3, reps: 10 },
          ],
        },
        {
          day_offset: 3,
          title: 'Upper volume',
          exercises: [
            { name: 'Кроссовер', sets: 3, reps: 15 },
            { name: 'Face pull', sets: 3, reps: 15 },
          ],
        },
      ],
    },
  },
  {
    type: TemplateType.meal,
    title: 'Сбалансированное питание',
    levelPlace: '1/home',
    bodyJson: {
      description: 'Простой рацион для новичка: 3 приёма пищи и перекус.',
      meals: [
        { name: 'Завтрак', examples: ['Овсянка', 'Яйца', 'Фрукт'] },
        { name: 'Обед', examples: ['Курица', 'Крупа', 'Овощи'] },
        { name: 'Ужин', examples: ['Рыба', 'Салат', 'Творог'] },
        { name: 'Перекус', examples: ['Йогурт', 'Орехи'] },
      ],
    },
  },
  {
    type: TemplateType.meal,
    title: 'Лёгкий дефицит дома',
    levelPlace: '1/gym',
    bodyJson: {
      description: 'Рацион с контролем порций для снижения веса.',
      meals: [
        { name: 'Завтрак', examples: ['Творог 5%', 'Ягоды', 'Чай'] },
        { name: 'Обед', examples: ['Индейка', 'Гречка', 'Овощи'] },
        { name: 'Ужин', examples: ['Рыба на пару', 'Салат'] },
        { name: 'Перекус', examples: ['Яблоко', 'Кефир'] },
      ],
    },
  },
  {
    type: TemplateType.meal,
    title: 'Питание для зала',
    levelPlace: '2/gym',
    bodyJson: {
      description: 'Рацион с упором на белок для тренирующихся в зале.',
      meals: [
        { name: 'Завтрак', examples: ['Омлет', 'Тост', 'Протеин'] },
        { name: 'Обед', examples: ['Говядина', 'Рис', 'Овощи'] },
        { name: 'Ужин', examples: ['Индейка', 'Гречка', 'Салат'] },
        { name: 'Перекус', examples: ['Творог', 'Банан'] },
      ],
    },
  },
  {
    type: TemplateType.meal,
    title: 'Домашний набор',
    levelPlace: '2/home',
    bodyJson: {
      description: 'Калорийный рацион для набора при домашних тренировках.',
      meals: [
        { name: 'Завтрак', examples: ['Овсянка на молоке', 'Арахисовая паста', 'Банан'] },
        { name: 'Обед', examples: ['Паста', 'Курица', 'Сыр'] },
        { name: 'Ужин', examples: ['Рис', 'Фарш', 'Овощи'] },
        { name: 'Перекус', examples: ['Протеин', 'Орехи', 'Бутерброд'] },
      ],
    },
  },
];

async function main() {
  let created = 0;
  for (const template of templates) {
    const existing = await prisma.template.findFirst({
      where: { type: template.type, title: template.title },
    });
    if (existing) {
      continue;
    }
    await prisma.template.create({ data: template });
    created += 1;
  }
  console.log(`Seeded ${created} new templates (${templates.length} defined)`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
