import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PublicUser } from '../auth.service';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: PublicUser }>();
    if (request.user?.role !== UserRole.admin) {
      throw new ForbiddenException({ message: 'Доступ запрещён' });
    }
    return true;
  }
}
