import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './auth.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(dto.password, 10);
    const autoVerifyCompanyInDev =
      this.config.get<string>('AUTO_VERIFY_COMPANY') !== 'false' &&
      this.config.get<string>('NODE_ENV') !== 'production';
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        role: dto.role,
        companyName: dto.companyName,
        // In local dev, company accounts are auto-verified to unblock testing.
        verified:
          dto.role === 'PUBLIC' ||
          (dto.role === 'COMPANY' && autoVerifyCompanyInDev),
      },
    });

    return { message: 'Registered. Await verification if company/gov role.' };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.verified)
      throw new UnauthorizedException('Account not yet verified');

    const token = this.jwt.sign({ sub: user.id, role: user.role });
    return {
      access_token: token,
      role: user.role,
      companyName: user.companyName,
      email: user.email,
    };
  }

  async listPendingCompanies() {
    return this.prisma.user.findMany({
      where: { role: Role.COMPANY, verified: false },
      select: {
        id: true,
        email: true,
        companyName: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async verifyCompany(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { verified: true },
      select: {
        id: true,
        email: true,
        role: true,
        verified: true,
      },
    });
  }
}
