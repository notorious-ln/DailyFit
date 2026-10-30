import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminGuard } from './admin.guard';

function context(role?: UserRole): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: role ? { role } : undefined,
      }),
    }),
  } as ExecutionContext;
}

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('allows the admin role', () => {
    expect(guard.canActivate(context(UserRole.admin))).toBe(true);
  });

  it('forbids a regular user', () => {
    expect(() => guard.canActivate(context(UserRole.user))).toThrow(
      ForbiddenException,
    );
  });

  it('forbids a request without a user', () => {
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });
});
