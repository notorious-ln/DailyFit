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

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen2.5';
const DEFAULT_TIMEOUT_MS = 60_000;

@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);

  isEnabled(): boolean {
    return process.env.CLOUD_ASSISTANT_ENABLED === 'true';
  }

  async complete(payload: LlmPayload): Promise<string> {
    const baseUrl = (
      process.env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL
    ).replace(/\/$/, '');
    const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          options: { temperature: 0.3 },
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
        message?: { content?: unknown };
      };
      const content = body.message?.content;
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
