import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

export type ProfileResponse = {
  id: number;
  email: string;
  display_name: string | null;
  role: User['role'];
  goal: number | null;
  level: number | null;
  place: User['place'];
  workouts_per_week: number | null;
  gender: User['gender'];
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  limitation_tags: string[];
};

@Injectable()
export class ProfileService {
  constructor(private readonly usersService: UsersService) {}

  async get(userId: number): Promise<ProfileResponse> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException({ message: 'Пользователь не найден' });
    }
    return this.toProfile(user);
  }

  async update(userId: number, dto: UpdateProfileDto): Promise<ProfileResponse> {
    const user = await this.usersService.updateProfile(userId, {
      goal: dto.goal,
      level: dto.level,
      place: dto.place,
      workoutsPerWeek: dto.workouts_per_week,
      gender: dto.gender,
      age: dto.age,
      heightCm: dto.height_cm,
      weightKg: dto.weight_kg,
      limitationTags: dto.limitation_tags,
    });

    if (!user) {
      throw new NotFoundException({ message: 'Пользователь не найден' });
    }

    return this.toProfile(user);
  }

  toProfile(user: User): ProfileResponse {
    return {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      role: user.role,
      goal: user.goal,
      level: user.level,
      place: user.place,
      workouts_per_week: user.workoutsPerWeek,
      gender: user.gender,
      age: user.age,
      height_cm: user.heightCm,
      weight_kg: user.weightKg,
      limitation_tags: user.limitationTags,
    };
  }
}
