import { Feeling, TemplateType } from '@prisma/client';
import { LlmClient } from './llm.client';
import { buildLlmPayload, LlmPayload } from './llm-payload';

const ENV_KEYS = [
  'CLOUD_ASSISTANT_ENABLED',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'LLM_TIMEOUT_MS',
] as const;

describe('LlmClient', () => {
  const payload: LlmPayload = buildLlmPayload({
    goal: 1,
    level: 2,
    limitationTags: ['спина'],
    freeNote: 'СЕКРЕТНАЯ_ПОМЕТКА_ПРОФИЛЯ',
    compliance: {
      period: 'day',
      from: '2026-10-30',
      to: '2026-10-30',
      workout_percent: 100,
      meal_percent: null,
      overall_percent: 100,
    },
    skipCount: 0,
    wellbeing: [{ date: '2026-10-30', feeling: Feeling.normal }],
    activePlanParameters: [
      {
        type: TemplateType.meal,
        title: 'Тарелка',
        level_place: '1/home',
        daily_calories: 1800,
        days_per_week: null,
      },
    ],
    userDayComments: [{ date: '2026-10-30', text: 'был голод к вечеру' }],
  });

  const previous = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    jest.restoreAllMocks();
  });

  it('is enabled when the cloud assistant is on, without an API key', () => {
    process.env.CLOUD_ASSISTANT_ENABLED = 'true';
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_BASE_URL;
    expect(new LlmClient().isEnabled()).toBe(true);

    process.env.CLOUD_ASSISTANT_ENABLED = 'false';
    expect(new LlmClient().isEnabled()).toBe(false);
  });

  it('sends the allowlisted summary to the local Ollama chat API', async () => {
    process.env.CLOUD_ASSISTANT_ENABLED = 'true';
    process.env.LLM_API_KEY = 'must-not-be-sent';
    process.env.LLM_BASE_URL = 'http://127.0.0.1:11434';
    process.env.LLM_MODEL = 'qwen2.5';
    process.env.LLM_TIMEOUT_MS = '1000';

    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            message: {
              role: 'assistant',
              content:
                'Получилось закрыть день. Расхождений с планом по отметкам нет.',
            },
          }),
      } as Response),
    );

    const text = await new LlmClient().complete(payload);

    expect(text).toContain('Получилось');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:11434/api/chat',
    );
    const init = fetchMock.mock.calls[0]?.[1];
    if (!init || typeof init === 'string' || typeof init.body !== 'string') {
      throw new Error('expected a JSON request body');
    }
    const body = JSON.parse(init.body) as {
      model: string;
      stream: boolean;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('qwen2.5');
    expect(body.stream).toBe(false);
    const userMessage = body.messages.find(
      (message) => message.role === 'user',
    );
    expect(userMessage?.content).toBe(JSON.stringify(payload));
    expect(JSON.stringify(body)).not.toContain('СЕКРЕТНАЯ_ПОМЕТКА_ПРОФИЛЯ');
    expect(JSON.stringify(init.headers)).not.toContain('must-not-be-sent');
    expect(JSON.stringify(init.headers)).not.toContain('Authorization');
  });
});
