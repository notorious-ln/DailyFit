import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export type PublicUser = {
  id: number;
  email: string;
  display_name: string | null;
  role: User['role'];
  goal: number | null;
  level: number | null;
};

export type AuthResponse = {
  token: string;
  user: PublicUser;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly bcryptRounds = 10;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException({ message: 'Email уже занят' });
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);

    let user: User;
    try {
      user = await this.usersService.create({
        email,
        passwordHash,
        displayName: dto.display_name,
      });
    } catch (error) {
      if (this.usersService.isUniqueConstraintError(error)) {
        throw new ConflictException({ message: 'Email уже занят' });
      }
      throw error;
    }

    this.logger.log(`регистрация userId=${user.id} email=${user.email}`);
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(email);
    const invalidCredentials = new UnauthorizedException({
      message: 'Неверный email или пароль',
    });

    if (!user) {
      throw invalidCredentials;
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw invalidCredentials;
    }

    this.logger.log(`вход userId=${user.id} email=${user.email}`);
    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: User): AuthResponse {
    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: this.toPublicUser(user),
    };
  }

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      role: user.role,
      goal: user.goal,
      level: user.level,
    };
  }
}
