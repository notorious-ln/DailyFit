import { classifyExternalCallError } from './external-call';

describe('classifyExternalCallError', () => {
  it('keeps only the failure class, not the request or response text', () => {
    const aborted = new Error('The operation was aborted');
    aborted.name = 'AbortError';
    expect(classifyExternalCallError(aborted)).toEqual({ reason: 'timeout' });
    expect(
      classifyExternalCallError({ name: 'AbortError', message: 'aborted' }),
    ).toEqual({ reason: 'timeout' });

    expect(classifyExternalCallError(new Error('LLM HTTP 503'))).toEqual({
      reason: 'http',
      http_status: 503,
    });
    expect(classifyExternalCallError(new Error('LLM empty content'))).toEqual({
      reason: 'empty',
    });

    const leaked = classifyExternalCallError(
      new Error(
        'failed payload {"user_day_comments":[{"text":"секретный текст"}]}',
      ),
    );
    expect(leaked).toEqual({ reason: 'unavailable' });
    expect(JSON.stringify(leaked)).not.toContain('секретный текст');
  });
});
