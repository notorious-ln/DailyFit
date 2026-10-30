import { Injectable, Logger } from '@nestjs/common';
import { LlmPayload } from './llm-payload';

const SYSTEM_PROMPT = [
  'Ты помощник дневника тренировок и питания.',
  'Объясни простым языком, что получилось и где факт разошёлся с планом.',
  'Опирайся только на переданную сводку.',
  'Не ставь диагноз и не обещай изменить вес к дате.',
  'Не давай медицинских советов.',
  'Ответ — 2–5 коротких предложений на русском.',
].join(' ');

@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);

  isEnabled(): boolean {
    return (
      process.env.CLOUD_ASSISTANT_ENABLED === 'true' &&
      Boolean(process.env.LLM_API_KEY) &&
      Boolean(process.env.LLM_BASE_URL)
    );
  }

  async complete(payload: LlmPayload): Promise<string> {
    const baseUrl = process.env.LLM_BASE_URL?.replace(/\/$/, '');
    const apiKey = process.env.LLM_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error('LLM is not configured');
    }

    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 8000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
          temperature: 0.3,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(payload) },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM HTTP ${response.status}`);
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('LLM empty content');
      }
      return content.trim();
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'error';
      this.logger.warn(`внешняя модель недоступна: ${reason}`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
