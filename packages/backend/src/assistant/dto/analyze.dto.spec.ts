import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnalyzeDto } from './analyze.dto';

describe('AnalyzeDto', () => {
  it('requires an explicit day or week request', async () => {
    const missing = plainToInstance(AnalyzeDto, {});
    const missingErrors = await validate(missing);
    expect(missingErrors.some((error) => error.property === 'period')).toBe(
      true,
    );

    const month = plainToInstance(AnalyzeDto, { period: 'month' });
    const monthErrors = await validate(month);
    expect(monthErrors.some((error) => error.property === 'period')).toBe(true);

    const day = plainToInstance(AnalyzeDto, {
      period: 'day',
      date: '2026-10-30',
    });
    expect(await validate(day)).toHaveLength(0);

    const week = plainToInstance(AnalyzeDto, { period: 'week' });
    expect(await validate(week)).toHaveLength(0);
  });
});
