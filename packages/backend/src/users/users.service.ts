import { Injectable } from '@nestjs/common';
import { Gender, Prisma, TrainingPlace, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  displayName?: string;
  role?: UserRole;
};

export type UpdateProfileInput = {
  goal: number;
  level: number;
  place?: TrainingPlace;
  workoutsPerWeek?: number;
  gender?: Gender | null;
  age?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  limitationTags?: string[];
  freeNote?: string | null;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: CreateUserInput): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        displayName: data.displayName,
        role: data.role ?? UserRole.user,
      },
    });
  }

  updateProfile(id: number, data: UpdateProfileInput): Promise<User | null> {
    return this.prisma.user
      .update({
        where: { id },
        data: {
          goal: data.goal,
          level: data.level,
          ...(data.place !== undefined ? { place: data.place } : {}),
          ...(data.workoutsPerWeek !== undefined
            ? { workoutsPerWeek: data.workoutsPerWeek }
            : {}),
          ...(data.gender !== undefined ? { gender: data.gender } : {}),
          ...(data.age !== undefined ? { age: data.age } : {}),
          ...(data.heightCm !== undefined ? { heightCm: data.heightCm } : {}),
          ...(data.weightKg !== undefined ? { weightKg: data.weightKg } : {}),
          ...(data.limitationTags !== undefined
            ? { limitationTags: data.limitationTags }
            : {}),
          ...(data.freeNote !== undefined ? { freeNote: data.freeNote } : {}),
        },
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          return null;
        }
        throw error;
      });
  }

  isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
