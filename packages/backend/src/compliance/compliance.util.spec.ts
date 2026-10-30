import { TaskStatus } from '@prisma/client';
import { compliancePercent } from './compliance.util';

describe('compliancePercent', () => {
  it('returns null for empty list', () => {
    expect(compliancePercent([])).toBeNull();
  });

  it('scores done=1, partial=0.5, skipped=0', () => {
    expect(
      compliancePercent([
        { status: TaskStatus.done },
        { status: TaskStatus.partial },
        { status: TaskStatus.skipped },
        { status: null },
      ]),
    ).toBe(37.5);
  });

  it('returns 100 when all done', () => {
    expect(
      compliancePercent([
        { status: TaskStatus.done },
        { status: TaskStatus.done },
      ]),
    ).toBe(100);
  });
});
